// 声音：环境（炉火、人声嘈杂、鲁特琴）、骰子碰撞、观众欢呼/吐槽（英语语音）
import VOICES from '../generated/voices.js';

function b64ToBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
const rand = (a, b) => a + Math.random() * (b - a);
const pickN = (arr, n) => {
  const a = arr.slice();
  const out = [];
  while (a.length && out.length < n) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]);
  return out;
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.musicOn = true;
    this.soundOn = true;
    this.clips = {};
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.4);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.55;
    this.reverb.connect(this.reverbOut).connect(this.master);
    const bus = (v, wet = 0, dest = this.master) => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(dest);
      if (wet > 0) {
        const s = ctx.createGain();
        s.gain.value = wet;
        g.connect(s).connect(this.reverb);
      }
      return g;
    };
    // 屋里的声音（嘈杂声、琴声）先经过一个低通：站在门外时闷闷的，推开门才清楚
    this.roomFilter = ctx.createBiquadFilter();
    this.roomFilter.type = 'lowpass';
    this.roomGain = ctx.createGain();
    this.roomFilter.connect(this.roomGain).connect(this.master);
    this.sfx = bus(0.9, 0.15);
    this.amb = bus(0.55, 0.4, this.roomFilter);
    this.music = bus(0.34, 0.3, this.roomFilter);
    this.voice = bus(1.0, 0.45);
    this.setInside(this.insideLevel ?? 1);
    this.noise = this.makeNoise(2);
    this.brown = this.makeBrown(4);
    // 解码语音
    const entries = Object.entries(VOICES);
    const decodeAll = Promise.all(
      entries.map(async ([k, b64]) => {
        try {
          this.clips[k] = await ctx.decodeAudioData(b64ToBuffer(b64));
        } catch (e) {
          /* 某段语音解码失败时忽略 */
        }
      })
    );
    await Promise.race([decodeAll, new Promise((r) => setTimeout(r, 5000))]);
    this.ready = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setSound(on) {
    this.soundOn = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.1);
  }
  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? 0.34 : 0, this.ctx.currentTime, 0.3);
  }
  // 0 = 站在门外，1 = 在屋里
  setInside(f) {
    this.insideLevel = f;
    if (!this.roomFilter) return;
    const t = this.ctx.currentTime;
    this.roomFilter.frequency.setTargetAtTime(380 * Math.pow(18000 / 380, f), t, 0.05);
    this.roomGain.gain.setTargetAtTime(0.35 + 0.65 * f, t, 0.05);
  }
  // 推开木门的吱呀声
  doorCreak() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const dur = 1.8;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(92, t0);
    o.frequency.linearRampToValueAtTime(128, t0 + 0.5);
    o.frequency.linearRampToValueAtTime(84, t0 + 1.2);
    o.frequency.linearRampToValueAtTime(104, t0 + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(700, t0);
    f.frequency.linearRampToValueAtTime(1300, t0 + 0.6);
    f.frequency.linearRampToValueAtTime(880, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    for (let t = t0 + 0.05; t < t0 + dur; t += 0.026 + Math.random() * 0.03) {
      g.gain.setValueAtTime(0.03 + Math.random() * 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.003, t + 0.022);
    }
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
    // 门闩
    this.burst({ freq: 900, q: 2, gain: 0.22, dur: 0.06 });
    this.ping({ freq: 160, dur: 0.08, gain: 0.12 });
  }

  makeImpulse(sec) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < ctx.sampleRate * 0.01 ? i / (ctx.sampleRate * 0.01) : 1);
      }
      // 早期反射
      for (let k = 0; k < 8; k++) {
        const p = Math.floor(rand(0.01, 0.09) * ctx.sampleRate);
        d[p] += rand(-0.6, 0.6);
      }
    }
    return buf;
  }
  makeNoise(sec) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  makeBrown(sec) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  // ---------- 基础发声 ----------
  burst({ t = 0, dur = 0.05, freq = 2000, q = 1, gain = 0.3, type = 'bandpass', dest = this.sfx, pan = 0, attack = 0.001 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + t;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rand(0.8, 1.2);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(dest);
    src.start(t0, rand(0, 1.5));
    src.stop(t0 + attack + dur + 0.05);
  }
  ping({ t = 0, freq = 3000, dur = 0.08, gain = 0.1, type = 'sine', dest = this.sfx, pan = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + t;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  playClip(name, { t = 0, rate = 1, gain = 1, pan = 0, dest = this.voice, lowpass = 0 } = {}) {
    const buf = this.clips[name];
    if (!buf || !this.ctx) return 0;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    let node = src;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      node.connect(f);
      node = f;
    }
    // 轻微“喊叫”质感：加一点高频提升
    const hs = ctx.createBiquadFilter();
    hs.type = 'peaking';
    hs.frequency.value = 2500;
    hs.gain.value = 3;
    node.connect(hs).connect(g).connect(p).connect(dest);
    src.start(ctx.currentTime + t);
    return buf.duration / rate;
  }

  // ---------- 骰子 ----------
  dieHit(strength, material = 'hard', kind = 'floor', pan = 0) {
    if (!this.ctx) return;
    const s = Math.min(1, strength / 14);
    const g = 0.05 + s * 0.4;
    if (kind === 'cup') {
      // 骰子撞在皮革骰盅里：闷一点的咔哒声
      this.burst({ freq: rand(900, 1600), q: 1.4, gain: g * 0.75, dur: 0.035, pan });
      this.ping({ freq: rand(250, 340), dur: 0.06, gain: g * 0.3, pan });
      return;
    }
    if (kind === 'die') {
      // 骰子互撞：清脆
      this.burst({ freq: rand(3000, 4500), q: 3, gain: g * 0.9, dur: 0.035, pan });
      this.ping({ freq: rand(2800, 4200), dur: 0.05, gain: g * 0.12, pan });
      return;
    }
    if (material === 'metal') {
      this.burst({ freq: rand(1800, 2600), q: 2, gain: g * 0.8, dur: 0.04, pan });
      this.ping({ freq: rand(2100, 2600), dur: 0.22, gain: g * 0.12, type: 'triangle', pan });
      this.ping({ freq: rand(3500, 4200), dur: 0.15, gain: g * 0.06, pan });
    } else if (material === 'wood') {
      this.burst({ freq: rand(700, 1100), q: 1.6, gain: g, dur: 0.05, pan });
      this.ping({ freq: rand(160, 220), dur: 0.06, gain: g * 0.4, pan });
    } else {
      this.burst({ freq: rand(1300, 2000), q: 1.8, gain: g, dur: 0.045, pan });
      this.ping({ freq: rand(170, 230), dur: 0.05, gain: g * 0.35, pan });
    }
    if (kind === 'wall') this.burst({ freq: 500, q: 1, gain: g * 0.5, dur: 0.08, pan });
  }
  rattle(duration = 0.9) {
    if (!this.ctx) return;
    const n = Math.floor(duration * 22);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * duration + rand(0, 0.03);
      this.burst({ t, freq: rand(1800, 3200), q: 2.5, gain: rand(0.05, 0.16), dur: 0.03 });
      if (i % 3 === 0) this.burst({ t, freq: rand(400, 650), q: 2, gain: 0.08, dur: 0.06 });
    }
  }
  dropInCup(i = 0) {
    this.burst({ t: i * 0.05, freq: rand(1500, 2400), q: 2, gain: 0.12, dur: 0.04 });
    this.burst({ t: i * 0.05, freq: 450, q: 2, gain: 0.06, dur: 0.08 });
  }
  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t0);
    f.frequency.exponentialRampToValueAtTime(2200, t0 + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t0);
    src.stop(t0 + 0.4);
  }
  place(i = 0) {
    this.burst({ t: i * 0.07, freq: rand(900, 1300), q: 2, gain: 0.18, dur: 0.04 });
    this.ping({ t: i * 0.07, freq: 190, dur: 0.05, gain: 0.08 });
  }
  // 木椅在地板上拖动：几段带共鸣的摩擦声（gain 随距离调小）
  chairScrape(dur = 0.6, pan = 0, gain = 0.12) {
    const n = Math.max(3, Math.round(dur / 0.07));
    for (let i = 0; i < n; i++) {
      const k = i / n;
      this.burst({ t: k * dur, freq: rand(380, 620) + 180 * Math.sin(k * 9), q: 4, gain: gain * (0.6 + 0.4 * Math.sin(Math.PI * k)), dur: 0.09, pan, attack: 0.02 });
    }
    this.ping({ t: dur * 0.9, freq: 120, dur: 0.08, gain: gain * 0.4, pan });
  }
  // 脚步：很轻的闷响，偶尔地板吱一声
  footstep(pan = 0, gain = 0.05) {
    this.burst({ freq: rand(140, 220), q: 1.2, gain, dur: 0.06, type: 'lowpass', pan, attack: 0.004 });
    if (Math.random() < 0.08) this.ping({ t: 0.03, freq: rand(500, 800), dur: 0.12, gain: gain * 0.25, type: 'triangle', pan });
  }
  click() {
    this.burst({ freq: 1400, q: 3, gain: 0.12, dur: 0.03 });
    this.ping({ freq: 260, dur: 0.04, gain: 0.05 });
  }
  hover() {
    this.burst({ freq: 2600, q: 4, gain: 0.03, dur: 0.02 });
  }
  select(on) {
    this.ping({ freq: on ? 880 : 660, dur: 0.09, gain: 0.05, type: 'triangle' });
    this.burst({ freq: 2200, q: 4, gain: 0.05, dur: 0.02 });
  }
  coins() {
    for (let i = 0; i < 9; i++) {
      const t = i * rand(0.04, 0.09);
      this.ping({ t, freq: rand(2600, 4200), dur: 0.25, gain: 0.05, type: 'triangle' });
      this.ping({ t, freq: rand(5200, 6800), dur: 0.12, gain: 0.02 });
      this.burst({ t, freq: 5000, q: 2, gain: 0.05, dur: 0.02 });
    }
  }
  sting(good = true) {
    // 鲁特琴短乐句
    if (!this.ctx) return;
    const notes = good ? [62, 66, 69, 74] : [62, 61, 57];
    notes.forEach((n, i) => this.pluck(n, i * 0.12, 0.35, this.sfx));
  }

  // ---------- 观众 ----------
  crowdRoar(dur = 2.6, level = 0.35) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    for (const [freq, q, lv] of [[700, 0.8, 1], [1600, 1.2, 0.6], [350, 1, 0.5]]) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(level * lv, t0 + 0.35);
      g.gain.setValueAtTime(level * lv, t0 + dur * 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      // 起伏
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rand(5, 9);
      const lg = ctx.createGain();
      lg.gain.value = level * lv * 0.3;
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(this.voice);
      src.start(t0);
      src.stop(t0 + dur + 0.1);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.1);
    }
  }
  claps(dur = 2.2, count = 40) {
    for (let i = 0; i < count; i++) {
      const t = rand(0.15, dur) * Math.pow(Math.random(), 0.6);
      this.burst({ t, freq: rand(1100, 2400), q: 1.2, gain: rand(0.05, 0.14), dur: 0.025, pan: rand(-0.8, 0.8), dest: this.voice });
    }
  }
  tableBang(n = 5) {
    for (let i = 0; i < n; i++) {
      const t = 0.2 + i * 0.28 + rand(-0.03, 0.03);
      this.ping({ t, freq: rand(70, 95), dur: 0.18, gain: 0.35, dest: this.voice, pan: rand(-0.5, 0.5) });
      this.burst({ t, freq: 300, q: 1, gain: 0.2, dur: 0.12, dest: this.voice, type: 'lowpass' });
    }
  }
  awww(dur = 1.6) {
    // 合成的一群人“哦——”的下滑声
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    for (let v = 0; v < 7; v++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const base = rand(140, 260);
      o.frequency.setValueAtTime(base * 1.12, t0);
      o.frequency.exponentialRampToValueAtTime(base * 0.78, t0 + dur);
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 520;
      f1.Q.value = 5;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 880;
      f2.Q.value = 6;
      const g = ctx.createGain();
      const st = t0 + rand(0, 0.15);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.05, st + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      const p = ctx.createStereoPanner();
      p.pan.value = rand(-0.7, 0.7);
      o.connect(f1).connect(g);
      o.connect(f2).connect(g);
      g.connect(p).connect(this.voice);
      o.start(st);
      o.stop(st + dur + 0.05);
    }
  }
  cheer(big = false) {
    if (!this.ctx) return;
    this.crowdRoar(big ? 3.2 : 2.6, big ? 0.45 : 0.35);
    this.claps(big ? 2.8 : 2.2, big ? 60 : 40);
    this.tableBang(big ? 7 : 5);
    const names = Object.keys(this.clips).filter((k) => k.startsWith('cheer_'));
    pickN(names, big ? 8 : 6).forEach((n, i) => {
      this.playClip(n, { t: rand(0, 0.9) + i * 0.08, rate: rand(0.9, 1.18), gain: rand(0.45, 0.85), pan: rand(-0.8, 0.8) });
    });
  }
  // 全骰得分时零星的掌声和叫好
  smallCheer() {
    if (!this.ctx) return;
    this.claps(1.4, 18);
    const names = Object.keys(this.clips).filter((k) => k.startsWith('cheer_'));
    pickN(names, 2).forEach((n, i) => {
      this.playClip(n, { t: 0.15 + i * 0.35, rate: rand(0.95, 1.12), gain: rand(0.35, 0.55), pan: rand(-0.7, 0.7) });
    });
  }
  groan() {
    if (!this.ctx) return;
    this.awww(1.8);
    const names = Object.keys(this.clips).filter((k) => k.startsWith('groan_'));
    pickN(names, 4).forEach((n, i) => {
      this.playClip(n, { t: 0.25 + i * rand(0.25, 0.45), rate: rand(0.9, 1.1), gain: rand(0.5, 0.8), pan: rand(-0.8, 0.8) });
    });
    if (Math.random() < 0.6) this.playClip('chat_10', { t: rand(0.9, 1.4), rate: rand(1.0, 1.15), gain: 0.35, pan: rand(-0.6, 0.6) });
  }
  winCrowd() {
    this.cheer(true);
    const names = Object.keys(this.clips).filter((k) => k.startsWith('win_'));
    names.forEach((n, i) => this.playClip(n, { t: 1.2 + i * 0.6, rate: rand(0.95, 1.05), gain: 0.8, pan: rand(-0.5, 0.5) }));
  }
  loseCrowd() {
    this.awww(1.5);
    const names = Object.keys(this.clips).filter((k) => k.startsWith('lose_'));
    names.forEach((n, i) => this.playClip(n, { t: 0.4 + i * 1.4, rate: 1, gain: 0.85, pan: rand(-0.5, 0.5) }));
  }

  // ---------- 环境 ----------
  startAmbience() {
    if (!this.ctx || this.ambStarted) return;
    this.ambStarted = true;
    const ctx = this.ctx;
    // 炉火低鸣
    const fire = ctx.createBufferSource();
    fire.buffer = this.brown;
    fire.loop = true;
    const ff = ctx.createBiquadFilter();
    ff.type = 'lowpass';
    ff.frequency.value = 380;
    const fg = ctx.createGain();
    fg.gain.value = 0.12;
    fire.connect(ff).connect(fg).connect(this.amb);
    fire.start();
    // 人声嘈杂底噪
    const mur = ctx.createBufferSource();
    mur.buffer = this.noise;
    mur.loop = true;
    const mf = ctx.createBiquadFilter();
    mf.type = 'bandpass';
    mf.frequency.value = 520;
    mf.Q.value = 0.6;
    const mg = ctx.createGain();
    mg.gain.value = 0.025;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.27;
    const lg = ctx.createGain();
    lg.gain.value = 0.01;
    lfo.connect(lg).connect(mg.gain);
    lfo.start();
    mur.connect(mf).connect(mg).connect(this.amb);
    mur.start();
    // 噼啪声
    const crackle = () => {
      const n = Math.random() < 0.3 ? 3 : 1;
      for (let i = 0; i < n; i++) this.burst({ t: i * rand(0.01, 0.04), freq: rand(1800, 5000), q: 1.5, gain: rand(0.02, 0.09), dur: rand(0.005, 0.02), dest: this.amb, pan: -0.3 });
      setTimeout(crackle, rand(60, 420));
    };
    crackle();
    // 远处闲聊
    const chats = Object.keys(this.clips).filter((k) => k.startsWith('chat_'));
    const chatter = () => {
      if (chats.length) {
        const n = chats[Math.floor(Math.random() * chats.length)];
        this.playClip(n, { rate: rand(0.86, 1.08), gain: rand(0.1, 0.2), pan: rand(-0.9, 0.9), dest: this.amb, lowpass: rand(1300, 2400) });
      }
      setTimeout(chatter, rand(1400, 4200));
    };
    setTimeout(chatter, 800);
    this.startMusic();
  }

  // ---------- 鲁特琴（Karplus-Strong 拨弦） ----------
  pluckBuffer(midi) {
    this.pluckCache = this.pluckCache || {};
    if (this.pluckCache[midi]) return this.pluckCache[midi];
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const len = Math.floor(sr * 2.2);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const period = Math.floor(sr / freq);
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[idx];
      const next = ring[(idx + 1) % period];
      const v = 0.4985 * (cur + next);
      ring[idx] = v;
      d[i] = cur * 0.6 + prev * 0.4;
      prev = cur;
      idx = (idx + 1) % period;
    }
    this.pluckCache[midi] = buf;
    return buf;
  }
  pluck(midi, t, gain = 0.3, dest = this.music) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.pluckBuffer(midi);
    const g = ctx.createGain();
    g.gain.value = gain;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3200;
    src.connect(f).connect(g).connect(dest);
    src.start(ctx.currentTime + t);
  }
  startMusic() {
    // D 多利亚调式，6/8 拍的小舞曲，随机组合乐句
    const scale = [62, 64, 65, 67, 69, 71, 72, 74, 76, 77];
    const bassPat = [[50, 57], [48, 55], [50, 57], [45, 52]];
    const beat = 0.24;
    let bar = 0;
    let note = 4;
    const ctx = this.ctx;
    let nextTime = ctx.currentTime + 0.5;
    const schedule = () => {
      while (nextTime < ctx.currentTime + 1.2) {
        const t = nextTime - ctx.currentTime;
        const bp = bassPat[bar % 4];
        this.pluck(bp[0], t, 0.32);
        this.pluck(bp[1], t + beat * 3, 0.22);
        // 旋律：每小节 6 个八分音符，按节奏型
        const rhythm = [[0, 2], [2, 1], [3, 2], [5, 1]];
        for (const [pos, len] of rhythm) {
          if (Math.random() < 0.12) continue;
          note = Math.max(0, Math.min(scale.length - 1, note + Math.round((Math.random() - 0.5) * 3.2)));
          if (bar % 8 === 7 && pos === 3) note = 0;
          this.pluck(scale[note], t + pos * beat, 0.24 + (pos === 0 ? 0.06 : 0));
          if (len === 2 && Math.random() < 0.35) this.pluck(scale[note] - 12, t + pos * beat, 0.08);
        }
        nextTime += beat * 6;
        bar++;
      }
      setTimeout(schedule, 300);
    };
    schedule();
  }
}
