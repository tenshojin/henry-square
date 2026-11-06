// 过场动画（v3.4）：人物只出现在视频里——本地 AI 按设定图生成（tools/anim），实时渲染只剩牌桌对局。
//  - 开场：intro（一镜到底：门打开、走进酒馆，停在第一个对手对面；Seedance 2.0 生成，tools/anim/finish_intro.py 处理）。开场页后面是它的第一帧（门关着）。
//  - 选对手：坐在对面的人播 idle_X（首尾接上的循环），隔一会儿插一段 act_X（摸胡子之类的小动作，首尾也是同一张关键帧）；
//    换人 = leave_X（起身离开，最后一帧是空椅子）+ arrive_Y（走过来坐下）。
//  - 开局：tilt_down_X（低头看向牌桌）。它的最后一帧就是实时渲染的牌桌（用同一机位的截图做的关键帧），播完换回实时画面；
//    回菜单反过来：实时画面停到同一机位，淡入 tilt_up_X 的第一帧，再抬头看向对面的人。
// 相邻两段共用同一张关键帧：接缝处下一段先在看不见的 <video> 里开始播，再淡入盖住上一段（和 tools/anim/finish_clips.py 拼预览片一样）。
// 视频是 AV1（打包时以 base64 内嵌）。浏览器放不了 AV1 时没有过场动画，整局都在实时的牌桌画面上进行。
import { assetJSON } from './assets.js';
import { waitForMedia, playMedia } from './media.js';
import { LITE } from './device.js';

const LIVE_FADE = 0.4; // 视频和实时画面互相切换的淡化时长（秒）
const IDLE_FADE = 0.3; // 从坐着的循环切出去：循环里人可能正偏着头，淡化得比普通接缝长一点
// 人物在视频里发出的声音：[秒, 方法, ...参数]（对着画面估的时间；离开往哪边走、从哪边进来决定声像）
const SIDE = { elder: 1, drinker: -1, dicer: 1, barmaid: -1 };
const LEAVE_SOUNDS = (s) => [[0.95, 'chairScrape', 0.55, 0, 0.11], [1.85, 'footstep', 0.25 * s, 0.05], [2.3, 'footstep', 0.5 * s, 0.045], [2.75, 'footstep', 0.7 * s, 0.035]];
const ARRIVE_SOUNDS = (s) => [[0.45, 'footstep', -0.7 * s, 0.035], [0.85, 'footstep', -0.45 * s, 0.045], [1.25, 'footstep', -0.2 * s, 0.05], [1.5, 'chairScrape', 0.5, 0, 0.1], [2.85, 'chairScrape', 0.35, 0, 0.08]];

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
// 视频真正画出一帧（不支持 requestVideoFrameCallback 的浏览器退回下一帧动画；最多等 0.15 秒）
const presented = (el) =>
  new Promise((r) => {
    if (el.requestVideoFrameCallback) el.requestVideoFrameCallback(() => r());
    else requestAnimationFrame(() => r());
    setTimeout(r, 150);
  });

class Cancelled extends Error {}

export class Cutscenes {
  static available() {
    const meta = assetJSON('cutscenes-meta');
    if (!meta) return null;
    const v = document.createElement('video');
    const site = location.protocol.startsWith('http');
    const h264 = site && v.canPlayType('video/mp4; codecs="avc1.4D401F"');
    // 手机在网站上放 H.264 小文件：几乎都有硬件解码，省电；放不了 AV1 的电脑也走这里
    if (LITE && h264) return { ...meta, remote: 'assets/cutscenes/h264/' };
    if (v.canPlayType(meta.codec)) return meta.external ? { ...meta, remote: 'assets/cutscenes/' } : meta;
    // 双击打开的本地文件没有这些小文件，放不了 AV1 就不放过场动画
    return h264 ? { ...meta, remote: 'assets/cutscenes/h264/' } : null;
  }

  constructor(stage, audio, meta, firstOpp) {
    this.stage = stage;
    this.audio = audio;
    this.meta = meta;
    this.xf = meta.xf / meta.fps; // 接缝交叉淡化的时长
    stage.videoAspect = meta.size[0] / meta.size[1];
    this.box = document.createElement('div');
    this.box.id = 'cine';
    this.box.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden';
    document.getElementById('app').after(this.box);
    this.vids = [0, 1].map(() => {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.preload = 'auto';
      v.disablePictureInPicture = true;
      v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:none';
      this.box.appendChild(v);
      return v;
    });
    this.z = 1;
    this.cur = null; // 正在显示的 <video>（null = 实时画面）
    this.urls = {};
    this.opp = firstOpp; // 现在坐在对面的人（开场的最后一段落在他对面）
    this.want = this.opp;
    this.swapping = null; // 正在播换人短片（Promise）
    this.lifting = null; // 正在播从牌桌抬头的那段（Promise）
    this.token = 0; // 跳过开场时加一，正在播的段落在下一个等待点退出
    this.events = [];
    this.onTime = null; // 开场时每帧回调（片段名, 播到第几秒），字幕和门外 / 门里的环境声跟着走
    const tick = () => {
      if (this.destroyed) return;
      this.tick();
      this.frameId = requestAnimationFrame(tick);
    };
    this.frameId = requestAnimationFrame(tick);
  }

  dispose() {
    if (this.destroyed) return;
    this.destroyed = true;
    ++this.token;
    clearTimeout(this.actTimer);
    cancelAnimationFrame(this.frameId);
    this.onTime = null;
    for (const v of this.vids) { v.pause(); v.removeAttribute('src'); v.load(); }
    for (const url of Object.values(this.urls)) url.then((u) => URL.revokeObjectURL(u)).catch(() => {});
    this.box.remove();
    this.stage.paused = false;
  }

  // 内嵌的视频（base64）→ Blob 地址；data: 地址交给浏览器原生解码，比 atob 快得多
  url(name) {
    if (this.meta.remote) return Promise.resolve(this.meta.remote + name + '.mp4');
    if (!this.urls[name]) {
      const el = document.getElementById('asset-cs-' + name);
      if (!el) return Promise.reject(new Error('missing cutscene ' + name));
      this.urls[name] = fetch('data:video/mp4;base64,' + el.textContent.trim())
        .then((r) => r.blob())
        .then((b) => {
          el.textContent = '';
          return URL.createObjectURL(b);
        });
    }
    return this.urls[name];
  }

  prepare(names) {
    return Promise.all(names.map((n) => this.url(n)));
  }

  spare() {
    return this.cur === this.vids[0] ? this.vids[1] : this.vids[0];
  }

  // 把某一段装进 <video>，停在第一帧（地址先准备好再动 <video>，两处同时装同一段时不会装错）
  async load(el, name) {
    const token = this.token;
    const src = await this.url(name);
    this.check(token);
    el.pause();
    el.loop = false;
    // 从网站下载的片段等久一点；手机不会主动下载视频，静音放一下才开始解码，出画面就停
    const remote = !!this.meta.remote;
    if (el.dataset.clip !== name) {
      el.dataset.clip = name;
      await waitForMedia(el, 'loadeddata', () => {
        el.src = src;
        if (remote) {
          el.load();
          el.play()?.catch(() => {});
        }
      }, remote ? 20000 : 8000);
      el.pause();
    }
    if (el.currentTime > 0) {
      await waitForMedia(el, 'seeked', () => { el.currentTime = 0; });
    }
    if (el.readyState < 2) await waitForMedia(el, 'loadeddata', null, remote ? 20000 : 8000);
    this.check(token);
  }

  fadeEl(el, to, sec) {
    el.style.transition = sec > 0 ? `opacity ${sec}s linear` : 'none';
    el.style.opacity = String(to);
    return new Promise((r) => setTimeout(r, sec * 1000 + 30));
  }

  check(token) {
    if (this.destroyed || token !== this.token) throw new Cancelled();
  }

  // 切到某一段：在另一个 <video> 里从头开始播，等它真正出画面后淡入、盖住当前画面，再把旧的停掉
  async cut(name, { fade = this.xf, loop = false, token = this.token } = {}) {
    const el = this.spare();
    await this.load(el, name);
    this.check(token);
    el.loop = loop;
    el.style.zIndex = ++this.z;
    await playMedia(el);
    await presented(el);
    this.check(token);
    const old = this.cur;
    this.cur = el;
    this.setEvents(name);
    await this.fadeEl(el, 1, fade);
    if (old && old !== el && this.cur === el) {
      old.pause();
      this.fadeEl(old, 0, 0);
    }
    this.check(token);
    return el;
  }

  // 等当前这段播到只剩 left 秒（left = 0：播完，停在最后一帧）
  until(left, token = this.token) {
    const el = this.cur;
    return new Promise((resolve, reject) => {
      let lastTime = el?.currentTime;
      let progressAt = performance.now();
      let lastCheck = progressAt;
      const check = () => {
        if (this.destroyed || token !== this.token) return reject(new Cancelled());
        if (!el || el.ended || (el.duration && el.duration - el.currentTime <= left + 0.004)) return resolve();
        if (el.error) return reject(new Error('Video playback failed'));
        const now = performance.now();
        if (document.hidden || now - lastCheck > 2000 || el.currentTime !== lastTime) {
          lastTime = el.currentTime;
          progressAt = now;
        } else if (now - progressAt > 8000) return reject(new Error('Video playback stalled'));
        lastCheck = now;
        requestAnimationFrame(check);
      };
      check();
    });
  }

  // 播一段，在离结尾还剩一个接缝的时候返回（下一段从这里开始淡入）；同时把下一段先装进另一个 <video>
  async play(name, next, token = this.token, fade = this.xf) {
    await this.cut(name, { token, fade });
    if (next) await this.load(this.spare(), next);
    await this.until(this.xf, token);
  }

  setEvents(name) {
    const opp = name.replace(/^(leave|arrive)_/, '');
    this.events = name.startsWith('leave_') ? LEAVE_SOUNDS(SIDE[opp]) : name.startsWith('arrive_') ? ARRIVE_SOUNDS(SIDE[opp]) : [];
    this.events = this.events.map((e) => e.slice());
    this.evClip = name;
  }

  tick() {
    const el = this.cur;
    if (!el) return;
    if (el.paused) {
      // Safari 内核的循环视频放到头有时会停在第一帧：人就定住了，再放一下
      const now = performance.now();
      if (el.loop && !document.hidden && now > (this.nudgeAt || 0)) {
        this.nudgeAt = now + 600;
        el.play()?.catch(() => {});
      }
      return;
    }
    const t = el.currentTime;
    if (this.onTime) this.onTime(el.dataset.clip, t);
    if (el.dataset.clip !== this.evClip) return;
    while (this.events.length && this.events[0][0] <= t) {
      const [, k, ...args] = this.events.shift();
      if (typeof this.audio[k] === 'function') this.audio[k](...args);
    }
  }

  // ---------- 开场 ----------
  // 开场页后面先显示开场片的第一帧（门关着）；实时画面这时不用渲染
  async showIntroStill() {
    const el = this.vids[0];
    await this.load(el, 'intro');
    el.style.zIndex = ++this.z;
    this.fadeEl(el, 1, 0);
    this.cur = el;
    this.stage.paused = true;
  }

  // 播开场：门打开 → 走进酒馆落到第一个对手对面 → 他坐着的循环。被跳过时返回 false
  async intro(onTime) {
    const token = this.token;
    this.onTime = onTime;
    try {
      if (this.cur !== this.vids[0] || this.vids[0].dataset.clip !== 'intro') await this.showIntroStill();
      const el = this.cur;
      this.load(this.spare(), 'idle_' + this.opp).catch(() => {});
      await playMedia(el);
      await this.until(this.xf, token);
      await this.cut('idle_' + this.opp, { loop: true, token });
      this.scheduleAct();
      return true;
    } catch (e) {
      if (e instanceof Cancelled) return false;
      throw e;
    } finally {
      if (token === this.token) this.onTime = null;
    }
  }

  // ---------- 坐着的小动作 ----------
  // 对手坐在那里等你选的时候，隔一阵做个小动作，人不至于像个循环的画
  scheduleAct() {
    clearTimeout(this.actTimer);
    if (!this.meta.clips['act_' + this.opp]) return;
    this.actTimer = setTimeout(() => this.playAct(), 6500 + Math.random() * 7000);
  }

  stopAct() {
    clearTimeout(this.actTimer);
    if (this.acting) {
      this.acting = false;
      ++this.token;
    }
  }

  async playAct() {
    const opp = this.opp;
    const idle = 'idle_' + opp;
    if (this.swapping || this.lifting || !this.cur || !this.cur.loop || this.cur.dataset.clip !== idle || document.hidden) return this.scheduleAct();
    const token = this.token;
    this.acting = true;
    try {
      // 循环的首尾和小动作的首尾是同一张关键帧：等循环转回到那一帧再接，淡化里不会有重影
      await this.load(this.spare(), 'act_' + opp);
      await this.until(this.xf + 0.03, token);
      await this.play('act_' + opp, idle, token);
      await this.cut(idle, { loop: true, token });
      this.acting = false;
      this.scheduleAct();
    } catch (e) {
      if (e instanceof Cancelled) return;
      // 小动作放不了不是大事：跳过这一次，人继续坐着，别把过场动画全关了
      console.warn('Idle gesture skipped.', e);
      this.acting = false;
      if (this.cur?.dataset.clip !== idle) await this.cut(idle, { loop: true, token }).catch((err) => { if (!(err instanceof Cancelled)) this.onError?.(err); });
      this.scheduleAct();
    }
  }

  // 跳过开场：直接到某人坐着的循环（调用方先把画面淡出到黑）
  async jumpTo(opp) {
    this.stopAct();
    ++this.token;
    this.onTime = null;
    this.events = [];
    for (const v of this.vids) v.pause();
    await this.cut('idle_' + opp, { fade: 0, loop: true });
    for (const v of this.vids) if (v !== this.cur) this.fadeEl(v, 0, 0);
    this.opp = this.want = opp;
    this.scheduleAct();
  }

  // ---------- 选对手 ----------
  // 点了另一个对手：原来的人起身离开（最后一帧是空椅子），新的人走过来坐下，接着坐着的循环。
  // 播的过程中又点了别人：空椅子那一下直接换成最后点的那个人
  swapTo(opp) {
    this.want = opp;
    if (this.want !== this.opp) this.stopAct();
    if (!this.swapping && this.want !== this.opp) this.swapping = this.runSwaps().catch((e) => this.onError?.(e)).finally(() => (this.swapping = null));
  }

  async runSwaps() {
    await this.lifting;
    const token = this.token;
    try {
      while (this.want !== this.opp) {
        await this.play('leave_' + this.opp, 'arrive_' + this.want, token, IDLE_FADE);
        const y = this.want;
        this.opp = y;
        await this.play('arrive_' + y, 'idle_' + y, token);
        if (this.want !== y) continue;
        await this.cut('idle_' + y, { loop: true, token });
        this.scheduleAct();
      }
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
    }
  }

  // ---------- 牌桌 ----------
  // 开局：等换人播完，低头看向牌桌；最后一帧停住后，实时画面在下面渲染出同一个画面，视频淡出。
  // beforeLive()：实时画面开始渲染之前调用（把镜头摆回牌桌机位、先不呼吸、视角和视频一样）
  async toTable(beforeLive) {
    await this.lifting;
    while (this.swapping) await this.swapping;
    this.stopAct();
    const token = this.token;
    await this.cut('tilt_down_' + this.opp, { token, fade: IDLE_FADE });
    await this.until(0, token);
    beforeLive();
    this.stage.paused = false;
    await nextFrame();
    await nextFrame();
    const el = this.cur;
    await this.fadeEl(el, 0, LIVE_FADE);
    el.pause();
    if (this.cur === el) this.cur = null;
  }

  // 回菜单：实时画面（调用方已让它停在牌桌机位）上淡入抬头那段的第一帧，播完接坐着的循环。
  // 抬头没播完时点了别的对手 / 又开局，等它播完再接着来
  fromTable() {
    this.lifting = this.lift().finally(() => (this.lifting = null));
    return this.lifting;
  }

  async lift() {
    const token = this.token;
    const opp = this.opp;
    const el = this.spare();
    await this.load(el, 'tilt_up_' + opp);
    el.style.zIndex = ++this.z;
    await this.fadeEl(el, 1, LIVE_FADE);
    this.cur = el;
    this.stage.paused = true;
    this.setEvents(el.dataset.clip);
    await playMedia(el);
    await this.load(this.spare(), 'idle_' + opp);
    await this.until(this.xf, token);
    await this.cut('idle_' + opp, { loop: true, token });
    this.scheduleAct();
  }
}
