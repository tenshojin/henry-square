// 游戏流程：开场动画、选对手、对局、回合、骰盅动画、玩家选择与 AI
import * as THREE from 'three';
import { DICE_BY_ID, NORMAL_ID, rollFace, randomSpecial, pickBestWeighted } from '../data/dice.js';
import { evaluateSelection, bestOfRoll } from './scoring.js';
import { decide } from './ai.js';
import { Die3D } from '../render/diceModel.js';
import { createCup } from '../render/cup.js';
import { CoinToss } from '../render/coinToss.js';
import { CoinField } from '../render/coinField.js';
import { TableFX } from '../render/fx.js';
import { G_R, G_REST, G_STEP, COIN_METALS } from '../render/groschen.js';
import { PURSES, COIN_STACKS, LOOSE_COINS, CANDLE, MUG, CUPS, CUP_R, CUP_TOP_Y, PURSE, NEUTRAL_COIN_SPOT, TOSS_SCALE } from '../render/coinLayout.js';
import { cupThrowSteps, makeCupPlan, cupPose, cupFlightCtrl, CUP_SCALE, DIE_CUP_SCALE, CUP_STRIDE } from '../render/physics.js';
import { TABLE_Y } from '../render/world.js';
import { easeInOut, easeIn } from '../render/stage.js';
import { i18n } from '../i18n.js';
import { allowsGameShortcut } from './input.js';
import { lineFor } from './lines.js';
import { profile, saveProfile, unlock, firstTime } from './profile.js';

// 难度对应的对手（过场动画里坐在对面的人）
export const OPPONENT_OF = { casual: 'barmaid', novice: 'drinker', regular: 'elder', king: 'dicer' };
// 开场片的时间点（秒）：门开始动、镜头跨过门槛、进屋后浮现标题
const DOOR_CREAK = 0.74;
const THRESHOLD = 6.9;
const TITLE_AT = 7.4;

export const TARGETS = { casual: 750, novice: 1500, regular: 3000, king: 8000 };
export const FIRST_DIFFICULTY = 'novice'; // 刚进酒馆时的难度：开场动画落到这个难度的对手对面（改了要重做开场片）
const ROW_Y = TABLE_Y + 0.5;
const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
// 桌上实心的东西：高度都换算成世界坐标
const worldSolid = (s) => ({ x: s.x, z: s.z, r: s.r, top: TABLE_Y + s.top });
export const TABLE_SOLIDS = [
  ...CUPS.map((c) => worldSolid({ ...c, r: CUP_R, top: CUP_TOP_Y })),
  worldSolid(MUG),
  worldSolid(CANDLE),
  ...PURSES.map((p) => worldSolid({ x: p.x, z: p.z, ...PURSE })),
  // 骰盘四个角的黄铜块
  ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => worldSolid({ x: sx * 8.45, z: sz * 5.75, r: 1.15, top: 1.46 })),
];
// 桌上原有的钱摞和散币：写进钱币的高度图
const coinTop = (n, metal) => TABLE_Y + (G_REST + n * G_STEP) * COIN_METALS[metal].size;
export const TABLE_COINS = [
  ...COIN_STACKS.map((s) => ({ x: s.x, z: s.z, r: G_R * COIN_METALS[s.metal].size + 0.14, top: coinTop(s.n, s.metal) })),
  ...LOOSE_COINS.map((s) => ({ x: s.x, z: s.z, r: G_R * COIN_METALS[s.metal].size + 0.02, top: TABLE_Y + 2 * G_REST * COIN_METALS[s.metal].size })),
];
export const CUP_ARC = 2.2; // 举骰盅时比直线多抬多高：离开桌边时越过盘角
// 跳过去的横向进度：起跳时先往上，落下前已经到位，像用手拿起来放下去，不会擦着盘边过去
export const hopAcross = (e) => {
  const u = Math.min(1, Math.max(0, (e - 0.07) / 0.8));
  return u * u * (3 - 2 * u);
};
class Cancelled extends Error {}

function materialClass(typeId) {
  const b = DICE_BY_ID[typeId].style.base;
  if (['metal', 'gold', 'copper', 'bronze'].includes(b)) return 'metal';
  if (['wood', 'darkwood', 'pastry', 'char', 'grime', 'parchment'].includes(b)) return 'wood';
  return 'hard';
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Game {
  constructor(stage, ui, audio) {
    this.stage = stage;
    this.ui = ui;
    this.audio = audio;
    this.scene = stage.scene;
    this.matchId = 0;
    this.dice = [];
    this.players = null;
    this.selectable = null;
    this.difficulty = FIRST_DIFFICULTY;
    ui.onModalChange = (open) => { stage.interactionPaused = open; };

    this.fx = new TableFX(stage);
    this.cupRest = [new V3(11.6, TABLE_Y, 7.4), new V3(-11.6, TABLE_Y, -7.4)];
    this.field = new CoinField(stage, audio, { solids: TABLE_SOLIDS, statics: TABLE_COINS });
    this.cups = [createCup({ leather: '#5a2416', seed: 9 }), createCup({ leather: '#2e2418', seed: 19 })];
    this.cups.forEach((c, i) => {
      c.scale.setScalar(CUP_SCALE);
      c.position.copy(this.cupRest[i]);
      c.rotation.y = i === 0 ? -0.4 : 0.4;
      this.scene.add(c);
    });

    stage.add((dt, t) => {
      for (const d of this.dice) d.update(dt, t);
      this.updateTime();
    });
    this.bindInput();
  }

  // ---------- 输入 ----------
  bindInput() {
    const canvas = this.stage.renderer.domElement;
    let hoverDie = null;
    canvas.addEventListener('pointermove', (e) => {
      const vis = this.dice.filter((d) => d.group.visible).map((d) => d.mesh);
      const hit = vis.length ? this.stage.pick(vis, e.clientX, e.clientY) : null;
      const die = hit ? hit.object.userData.die : null;
      const t = i18n.t;
      if (die && !this.ui.modalOpen) {
        if (die.owner === 1) {
          this.ui.showTipPlain(t.oppDie, e.clientX, e.clientY, t.faceNow(die.value));
        } else {
          const extra = [t.faceNow(t.face(die.value, die.isJoker))];
          if (die.isJoker) extra.push(t.jokerTip);
          this.ui.showTip(die.typeId, e.clientX, e.clientY, extra.join('<br>'));
        }
      } else if (hoverDie) this.ui.hideTip();
      // 可选骰子的悬停光圈
      if (hoverDie && hoverDie !== die && !hoverDie.selected) hoverDie.ringTarget = hoverDie.hint || 0;
      if (die && this.selectable && this.selectable.includes(die) && !die.selected) die.ringTarget = 0.35;
      hoverDie = die;
      canvas.style.cursor = die && this.selectable && this.selectable.includes(die) ? 'pointer' : 'default';
    });
    canvas.addEventListener('pointerleave', () => this.ui.hideTip());
    canvas.addEventListener('click', (e) => {
      if (!this.selectable || this.ui.modalOpen) return;
      const hit = this.stage.pick(this.selectable.map((d) => d.mesh), e.clientX, e.clientY);
      const die = hit ? hit.object.userData.die : null;
      if (die && this.onDieClick) this.onDieClick(die);
    });
    // 对手回合：按住空格或按住桌面，时间走快一点
    canvas.addEventListener('pointerdown', () => { this.held = true; });
    for (const type of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(type, () => { this.held = false; });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') this.held = false; });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') this.held = true;
      const s = this.ui.hudState;
      if (!s || !allowsGameShortcut(e, { visible: !this.ui.hud.classList.contains('hidden'), modalOpen: this.ui.modalOpen, mode: s.mode })) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (s.mode === 'roll' && s.onRoll) s.onRoll();
        else if (s.mode === 'choose' && s.selection?.valid && s.onKeepRoll) s.onKeepRoll();
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (s.mode === 'choose' && s.selection?.valid) this.ui.bankHold?.startKey(e);
      } else if (e.code === 'KeyA' && s.mode === 'choose') {
        e.preventDefault();
        s.onPickBest?.();
      } else if (/^[1-6]$/.test(e.key) && s.mode === 'choose') {
        e.preventDefault();
        s.onPickDie?.(Number(e.key) - 1);
        this.ui.hud.querySelector(`[data-pick="${Number(e.key) - 1}"]`)?.focus({ preventScroll: true });
      }
    });
  }

  // 对手说句话
  say(event, chance = 1) {
    if (Math.random() < chance) this.ui.bark?.(lineFor(OPPONENT_OF[this.difficulty], event, i18n.lang));
  }

  award(id) {
    if (unlock(id)) this.ui.toast?.(id);
  }

  tip(id, text) {
    if (firstTime(id)) this.ui.coach?.(text);
  }

  updateTime() {
    const s = this.ui.hudState;
    const waiting = this.players && s && s.current === 1 && !s.mode && !this.ui.modalOpen && !this.ui.hud.classList.contains('hidden');
    this.stage.timeTarget = this.held && waiting ? 2.6 : 1;
  }

  // ---------- 开场动画 ----------
  // 推门 → 走进酒馆、停在第一个对手对面（视频），标题字幕在走进门之后浮现；右下角可跳过。浏览器放不了视频时直接到牌桌
  disableCutscenes(error) {
    console.warn('Cinematics unavailable; continuing at the table.', error);
    this.cutscenes?.dispose();
    this.cutscenes = null;
    this.stage.paused = false;
    this.stage.camMode = 'game';
    this.stage.fovFixK = 1;
    this.stage.wobble = 1;
    this.audio.setInside(1);
  }

  async playIntro() {
    try { await this.playIntroSequence(); }
    catch (error) {
      this.disableCutscenes(error);
      this.ui.hideSkip();
      this.ui.hideIntro();
      await this.ui.fade(false, 200);
    }
  }

  async playIntroSequence() {
    const cs = this.cutscenes;
    const a = this.audio;
    if (!cs) {
      a.setInside(1);
      return;
    }
    let creaked = false;
    let cap = false;
    a.setInside(0);
    const done = cs.intro((clip, t) => {
      if (clip !== 'intro') return;
      if (!creaked && t > DOOR_CREAK) {
        creaked = true;
        a.doorCreak();
      }
      a.setInside(THREE.MathUtils.clamp((t - DOOR_CREAK) / (THRESHOLD - DOOR_CREAK), 0, 1));
      if (!cap && t > TITLE_AT) {
        cap = true;
        this.ui.showIntroCaption(true);
      }
    });
    const skipped = new Promise((resolve) =>
      this.ui.showSkip(async () => {
        await this.ui.fade(true, 350);
        try { await cs.jumpTo(OPPONENT_OF[this.difficulty]); }
        catch (error) { this.disableCutscenes(error); }
        a.setInside(1);
        this.ui.showIntroCaption(false);
        await this.ui.fade(false, 600);
        resolve(false);
      })
    );
    // 视频盖着时实时画面暂停，stage.wait 不走，用定时器
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    if (await Promise.race([done, skipped])) {
      // 落到第一个对手对面之后字幕再停一会儿，先淡出，菜单再从下面升起来
      this.ui.hideSkip();
      if (!cap) this.ui.showIntroCaption(true);
      await sleep(1000);
      this.ui.hideIntro();
      await sleep(1100);
    } else {
      await skipped;
      this.ui.hideIntro();
    }
    a.setInside(1);
  }

  // ?nointro：直接到选对手（自测用）
  async skipIntro() {
    this.audio.setInside(1);
    if (this.cutscenes) {
      try { await this.cutscenes.jumpTo(OPPONENT_OF[this.difficulty]); }
      catch (error) { this.disableCutscenes(error); }
    }
  }

  // ---------- 菜单与开局 ----------
  showMenu() {
    this.ui.showToolbar(() => this.backToMenu());
    this.openMenu();
  }

  // 选对手的菜单是贴在画面下方的一条，上面露出对面坐着的人；点难度卡片，原来的人起身离开、新的人走过来坐下（过场动画）。
  // 从牌桌回来时先抬头看向对面
  openMenu() {
    this.ui.showMenu((diff) => this.startMatch(diff), this.difficulty, TARGETS, (diff) => this.setOpponent(diff));
    return this.leaveTable();
  }

  setOpponent(diff) {
    this.difficulty = diff;
    const swap = () => this.cutscenes?.swapTo(OPPONENT_OF[this.difficulty]);
    if (this.tableTransition) this.tableTransition.then(swap);
    else swap();
  }

  queueTableTransition(action) {
    const job = (this.tableTransition || Promise.resolve()).then(action);
    this.tableTransition = job;
    const clear = () => { if (this.tableTransition === job) this.tableTransition = null; };
    job.then(clear, clear);
    return job;
  }

  // 实时画面镜头的呼吸和窄屏视角：k = 0 时和视频的机位、视角完全一样（切换的那一下用），1 时恢复正常
  easeLiveCam(to, dur) {
    const st = this.stage;
    const id = (this.camEaseId = (this.camEaseId || 0) + 1);
    const w0 = st.wobble;
    const f0 = st.fovFixK;
    return st.tween(dur, (k) => {
      if (id !== this.camEaseId) return;
      st.wobble = w0 + (to - w0) * k;
      st.fovFixK = f0 + (to - f0) * k;
    });
  }

  // 开局：低头看向牌桌（视频），它的最后一帧就是实时的牌桌画面；换回实时渲染后镜头再慢慢开始呼吸
  async enterTable() {
    const cs = this.cutscenes;
    if (!cs || this.atTable) return;
    this.atTable = true;
    const st = this.stage;
    return this.queueTableTransition(async () => {
      if (cs !== this.cutscenes) return;
      try {
        await cs.toTable(() => {
          this.camEaseId = (this.camEaseId || 0) + 1;
          st.wobble = 0;
          st.fovFixK = 0;
          st.camMode = 'game';
        });
      } catch (error) { this.disableCutscenes(error); }
      this.easeLiveCam(1, 1.6);
    });
  }

  // 回菜单：实时画面的镜头先停到和视频第一帧一样，再淡入“从牌桌抬头看向对面”的视频
  async leaveTable() {
    const cs = this.cutscenes;
    if (!cs) {
      this.clearCoins(true);
      return;
    }
    if (!this.atTable) return;
    this.atTable = false;
    return this.queueTableTransition(async () => {
      if (cs !== this.cutscenes) return;
      await this.easeLiveCam(0, 0.3);
      try { await cs.fromTable(); }
      catch (error) { this.disableCutscenes(error); }
      // Remove victory coins after the video covers the table.
      this.clearCoins();
    });
  }

  backToMenu() {
    if (!this.starting && !this.players && !this.ui.fateResolve && !this.ui.tossResolve) return;
    this.cancelMatch();
    this.ui.hideHud();
    this.ui.hideOver();
    this.ui.overEl.classList.remove('show');
    this.ui.overEl.classList.add('hidden');
    this.clearDice();
    this.players = null;
    this.openMenu();
  }

  cancelMatch() {
    this.matchId++;
    this.starting = false;
    this.ui.closeFate();
    this.ui.endToss();
    if (this.cancelWait) this.cancelWait(new Cancelled());
    this.cancelWait = null;
    this.selectable = null;
    this.toss?.stop();
    this.cups.forEach((c, i) => {
      c.position.copy(this.cupRest[i]);
      c.rotation.set(0, i === 0 ? -0.4 : 0.4, 0);
    });
  }

  clearDice() {
    for (const d of this.dice) {
      this.scene.remove(d.group);
      this.scene.remove(d.ring);
      d.ring.geometry.dispose();
      d.ring.material.dispose();
    }
    this.dice = [];
    this.toss?.clear(); // 桌边的先手金币
  }

  // 收走桌上的钱（赌注堆、钱堆、胜利撒下来的）：桌面还看得见就缩小消失，被视频盖着就直接收走
  clearCoins(animated = false) {
    this.field.dice = [];
    this.field.statics = TABLE_COINS;
    this.field.clear(animated);
  }

  makeAiDice(diff) {
    const v = () => Math.floor(Math.random() * 3);
    if (diff === 'casual') return [];
    if (diff === 'novice') return Math.random() < 0.65 ? [{ typeId: randomSpecial(), variant: v() }] : [];
    if (diff === 'regular') {
      const n = Math.random() < 0.5 ? 2 : 3;
      const out = [];
      while (out.length < n) {
        const id = randomSpecial();
        if (!out.some((o) => o.typeId === id)) out.push({ typeId: id, variant: v() });
      }
      return out;
    }
    const n = 4 + Math.floor(Math.random() * 3);
    return pickBestWeighted(n).map((id) => ({ typeId: id, variant: v() }));
  }

  rowPos(pi, slot) {
    return pi === 0 ? new V3(-10.6, ROW_Y, 4.15 - slot * 1.38) : new V3(10.6, ROW_Y, -2.75 + slot * 1.38);
  }

  async startMatch(diff) {
    this.cancelMatch();
    this.starting = true;
    const id = this.matchId;
    this.clearDice();
    this.clearCoins(this.atTable);
    this.setOpponent(diff);
    this.target = TARGETS[diff];
    const entering = this.enterTable();
    const offers = Array.from({ length: 6 }, () => (Math.random() < 0.5 ? { typeId: randomSpecial(), variant: Math.floor(Math.random() * 3) } : null));
    const aiSpecial = this.makeAiDice(diff);
    const choices = await new Promise((res) => this.ui.showFate(offers, res));
    if (!choices || id !== this.matchId) return;
    // 镜头还没落到牌桌上（过场动画还在播）就等它播完，骰子再落下来
    await entering;
    if (id !== this.matchId) return;
    const human = offers.map((o, i) => (o && choices[i] ? o : { typeId: NORMAL_ID, variant: 0 }));
    const ai = shuffle([...aiSpecial, ...Array.from({ length: 6 - aiSpecial.length }, () => ({ typeId: NORMAL_ID, variant: 0 }))]);
    this.players = [human, ai].map((list, pi) => ({
      idx: pi,
      types: list.map((d) => d.typeId),
      variants: list.map((d) => d.variant || 0),
      dice: list.map((d) => new Die3D(d.typeId, d.variant || 0)),
      score: 0,
      kept: 0,
    }));
    this.starting = false;
    this.stats = { best: 0, busts: 0, hots: 0, turns: 0, trailed: false };
    for (const ty of this.players[0].types) if (ty !== NORMAL_ID) profile.diceUsed[ty] = 1;
    if (Object.keys(profile.diceUsed).length >= 10) this.award('collector');
    saveProfile();
    // 掷币定先手，币最后平放在左侧中立区域
    const first = await this.tossCoin(id);
    if (first === null) return;
    // 骰子落到桌上
    const drops = [];
    this.players.forEach((P, pi) => {
      P.dice.forEach((d, i) => {
        d.owner = pi;
        d.setRest(rollFace(d.typeId), rand(-0.15, 0.15));
        const p = this.rowPos(pi, i);
        d.group.position.set(p.x, p.y + 6, p.z);
        d.ringY = TABLE_Y + 0.02;
        this.scene.add(d.group);
        this.scene.add(d.ring);
        this.dice.push(d);
        drops.push(
          this.stage.wait(0.08 * i + pi * 0.3).then(() =>
            this.stage.tween(0.45, (k) => {
              if (id !== this.matchId) return;
              d.group.position.y = p.y + 6 * (1 - k);
            }, easeIn).then(() => { if (id === this.matchId) this.audio.place(0); })
          )
        );
      });
    });
    this.ui.showHud({
      players: this.players,
      difficulty: diff,
      opp: OPPONENT_OF[diff],
      target: this.target,
      current: -1,
      turnScore: 0,
      mode: null,
      selection: null,
      status: null,
      first,
      log: [(tt) => tt.tossLog(first === 0)],
    });
    await Promise.all(drops);
    // 骰子还在往下落时就回了菜单：不再弹“谁先手”
    if (id !== this.matchId) return;
    const hour = new Date().getHours();
    this.say(hour < 5 && Math.random() < 0.6 ? 'late' : 'start');
    try {
      await this.runMatch(id, first);
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
    }
  }

  check(id) {
    if (id !== this.matchId) throw new Cancelled();
  }
  async wait(s, id) {
    await this.stage.wait(s);
    this.check(id);
  }
  log(fn) {
    const s = this.ui.hudState;
    s.log = [...(s.log || []), fn].slice(-12);
  }

  // 掷币定先手：返回先手是谁（0 玩家、1 对手）；中途回了菜单返回 null
  async tossCoin(id) {
    if (!this.toss) this.toss = new CoinToss(this.stage, this.audio);
    const heads = Math.random() < 0.5;
    const acknowledged = this.ui.beginToss();
    const played = this.toss.play(heads, () => this.ui.revealToss(heads));
    // 结果一出来就能点「开始对局」：点了金币快进到桌边，不用等它慢慢放好
    acknowledged.then((go) => go && this.toss.hurry());
    const ok = await played;
    if (!ok || id !== this.matchId) return null;
    if (!await acknowledged || id !== this.matchId) return null;
    return heads ? 0 : 1;
  }

  async runMatch(id, first) {
    let cur = first;
    await this.wait(0.4, id);
    for (;;) {
      const r = await this.playTurn(cur, id);
      if (r === 'win') {
        await this.finish(cur === 0, id);
        return;
      }
      cur = 1 - cur;
    }
  }

  async playTurn(pi, id) {
    const P = this.players[pi];
    const O = this.players[1 - pi];
    const t = () => i18n.t;
    this.turn = 0;
    P.kept = 0;
    let pool = P.dice.slice();
    let needPress = true;
    this.ui.updateHud({ current: pi, turnScore: 0, mode: null, selection: null, status: null });
    this.ui.banner(pi === 0 ? t().yourTurn : t().oppTurn, '', pi === 0 ? 'turn' : 'turn-opp', 900);
    if (this.stats) this.stats.turns++;
    if (pi === 1) this.tip('speed', t().tipSpeed);
    await this.wait(0.85, id);

    for (;;) {
      if (pi === 0 && needPress) {
        await this.waitForRoll();
        this.cancelWait = null;
        this.check(id);
        this.ui.updateHud({ mode: null, onRoll: null });
      } else {
        this.ui.updateHud({ status: null, selection: null });
        await this.wait(pi === 0 ? 0.15 : 0.45, id);
      }

      if (pi === 0 && this.tavern && !this.tavern.candle.lit) this.award('darkness');
      await this.throwDice(P, pool, id);
      const rolled = pool.map((d) => ({ value: d.value, joker: d.isJoker, type: d.typeId }));
      const vals = rolled.map((r) => [r.value, r.joker]);
      this.log((tt) => tt.logRoll(tt.who(pi), vals.map(([v, j]) => tt.face(v, j)).join('\u2002')));
      this.ui.renderHud();
      const best = bestOfRoll(rolled);
      if (pi === 0 && best) this.noteThrow(best.score);
      this.throwEgg(rolled, pool);
      if (best) this.revealFx(pool, best.mask);
      if (!best) {
        if (pi === 0) {
          profile.busts++;
          if (this.stats) this.stats.busts++;
          if (this.turn >= 1000) this.award('greed');
          this.tip('bust', t().tipBust);
        }
        this.say(pi === 0 ? 'youBust' : 'oppBust', 0.75);
        this.audio.groan();
        this.audio.sting(false);
        this.ui.scoreMoment('bust', 0, pi);
        this.bustFx(pool);
        this.log((tt) => tt.logBust(tt.who(pi)));
        this.turn = 0;
        this.ui.updateHud({ turnScore: 0 });
        await this.wait(2.4, id);
        await this.moveToRow(P, pool, id);
        return 'next';
      }
      if (best.score >= 1000) {
        this.audio.cheer(best.score >= 2000);
        this.ui.scoreMoment('high', best.score, pi);
        this.fx?.motes(0, 0, best.score >= 2000 ? 70 : 38);
        this.say(pi === 0 ? 'youBig' : 'oppBig', 0.85);
        await this.wait(1.9, id);
      }

      const choice = pi === 0 ? await this.humanChoose(P, pool, id) : await this.aiChoose(P, O, pool, id);
      const keptDice = pool.filter((_, i) => choice.mask & (1 << i));
      const ev = evaluateSelection(keptDice.map((d) => ({ value: d.value, joker: d.isJoker })));
      this.turn += ev.score;
      this.popAt(keptDice, '+' + ev.score);
      const parts = ev.parts;
      this.log((tt) => tt.logKeep(tt.who(pi), parts.map(tt.part).join(' + '), ev.score));
      this.ui.updateHud({ turnScore: this.turn, mode: null, selection: null });
      keptDice.forEach((d) => (d.selected = false));
      await this.moveToRow(P, keptDice, id);
      pool = pool.filter((d) => !keptDice.includes(d));

      if (choice.bank) {
        P.score += this.turn;
        const n = this.turn;
        this.audio.coins();
        if (pi === 0) {
          profile.bestTurn = Math.max(profile.bestTurn, n);
          saveProfile();
          if (n >= 1000) this.say('youBank', 0.6);
        } else if (this.stats && P.score >= this.target * 0.4 && O.score <= P.score / 2) this.stats.trailed = true;
        this.ui.updateHud({ near: [0, 1].filter((i) => this.players[i].score >= this.target * 0.8) });
        this.ui.banner(t().banked(n), '', '', 1400);
        this.log((tt) => tt.logBank(tt.who(pi), n));
        this.turn = 0;
        this.ui.updateHud({ turnScore: 0 });
        if (P.score >= this.target) return 'win';
        await this.wait(1.1, id);
        await this.moveToRow(P, pool, id);
        return 'next';
      }
      needPress = false;
      if (pool.length === 0) {
        this.ui.banner(t().hot, t().hotSub, 'hot', 1600);
        this.audio.sting(true);
        this.audio.smallCheer();
        this.hotFx(P);
        if (pi === 0) {
          profile.hots++;
          if (this.stats) this.stats.hots++;
          this.award('hotDice');
          this.tip('hot', t().tipHot);
        }
        this.say(pi === 0 ? 'youHot' : 'oppHot', 0.85);
        this.log((tt) => tt.logHot(tt.who(pi)));
        pool = P.dice.slice();
        P.kept = 0;
        await this.wait(1.2, id);
      }
    }
  }

  // 等玩家按「掷骰」：想太久对手会催
  async waitForRoll() {
    const timer = setTimeout(() => this.say('slow'), 26000);
    try {
      await new Promise((res, rej) => {
        this.cancelWait = rej;
        this.ui.updateHud({ mode: 'roll', selection: null, status: null, onRoll: () => res() });
      });
    } finally {
      clearTimeout(timer);
    }
  }

  // 记一下这一掷的分
  noteThrow(score) {
    if (this.stats) this.stats.best = Math.max(this.stats.best, score);
    if (score > profile.bestThrow) {
      profile.bestThrow = score;
      saveProfile();
    }
    if (score >= 2000) this.award('bigThrow');
  }

  // 掷出特别的点数：三个以上的 6 蜡烛发绿，1 到 6 的全顺来一段琴；魔鬼骰子的恶魔面冒红烟，天国骰子的神圣 6 落金屑
  throwEgg(rolled, pool) {
    const n = (v) => rolled.filter((r) => r.value === v && !r.joker).length;
    if (this.fx) {
      for (const d of pool) {
        const p = d.group.position;
        if (d.isJoker) this.fx.smoke(p.x, p.y + 0.5, p.z, 9, [0.5, 0.09, 0.06]);
        else if (d.typeId === 'heaven' && d.value === 6) this.fx.motes(p.x, p.z, 16, 0.9);
      }
    }
    if (n(6) >= 3) {
      if (this.tavern) this.tavern.candle.devil = 1;
      this.audio.devil?.();
    } else if (rolled.length === 6 && [1, 2, 3, 4, 5, 6].every((v) => n(v) === 1)) this.audio.fanfare?.();
  }

  humanChoose(P, pool, id) {
    let inspectedDie = null;
    const t = i18n.t;
    // 休闲和新手：能计分的骰子带一圈淡淡的光
    const easy = this.difficulty === 'casual' || this.difficulty === 'novice';
    const best = bestOfRoll(pool.map((d) => ({ value: d.value, joker: d.isJoker, type: d.typeId })));
    pool.forEach((d, i) => {
      d.selected = false;
      d.hint = easy && best && best.mask & (1 << i) ? 0.26 : 0;
      d.ringTarget = d.hint;
    });
    this.selectable = pool;
    this.tip('pick', easy ? t.tipPick : t.tipPickHard);
    const state = () => {
      const sel = pool.filter((d) => d.selected);
      const ev = sel.length ? evaluateSelection(sel.map((d) => ({ value: d.value, joker: d.isJoker }))) : null;
      const parts = ev ? ev.parts : [];
      return { count: sel.length, valid: !!ev, score: ev ? ev.score : 0, desc: (tt) => parts.map(tt.part).join(' + '), all: !!ev && sel.length === pool.length };
    };
    return new Promise((res, rej) => {
      this.cancelWait = rej;
      let settled = false;
      const done = (bank) => {
        const s = state();
        if (settled || !s.valid) return;
        settled = true;
        let mask = 0;
        pool.forEach((d, i) => {
          if (d.selected) mask |= 1 << i;
        });
        this.selectable = null;
        this.onDieClick = null;
        this.cancelWait = null;
        this.ui.hideCoach?.();
        pool.forEach((d) => {
          d.ringTarget = 0;
          d.hint = 0;
        });
        this.ui.updateHud({ mode: null, selection: null, diceChoices: null, inspectedDie: null });
        res({ mask, bank });
      };
      const refresh = () => this.ui.updateHud({ mode: 'choose', selection: state(), turnScore: this.turn,
        diceChoices: pool.map((d) => ({ typeId: d.typeId, variant: d.variant, value: d.value, joker: d.isJoker, selected: d.selected })),
        inspectedDie,
        onPickDie: (i) => { if (this.selectable && pool[i]) this.onDieClick?.(pool[i]); },
        onPickBest: () => {
          if (!this.selectable || !best) return;
          pool.forEach((d, i) => {
            d.selected = !!(best.mask & (1 << i));
            d.ringTarget = d.selected ? 1 : d.hint;
          });
          this.audio.select(true);
          refresh();
        },
        onKeepRoll: () => done(false), onBank: () => done(true) });
      this.onDieClick = (die) => {
        inspectedDie = pool.indexOf(die);
        die.selected = !die.selected;
        die.ringTarget = die.selected ? 1 : die.hint || 0;
        this.audio.select(die.selected);
        refresh();
        if (state().valid) this.tip('bank', t.tipBank);
      };
      refresh();
    });
  }

  async aiChoose(P, O, pool, id) {
    const t = () => i18n.t;
    this.ui.updateHud({ status: (tt) => tt.thinking });
    await this.wait(rand(0.7, 1.3), id);
    const rolled = pool.map((d) => ({ value: d.value, joker: d.isJoker, type: d.typeId }));
    const dec = decide({ dice: rolled, allTypes: P.types, turn: this.turn, my: P.score, opp: O.score, target: this.target, difficulty: this.difficulty });
    const chosen = pool.filter((_, i) => dec.mask & (1 << i));
    for (const d of chosen) {
      d.selected = true;
      d.ringTarget = 1;
      this.audio.select(true);
      await this.wait(0.26, id);
    }
    const ev = evaluateSelection(chosen.map((d) => ({ value: d.value, joker: d.isJoker })));
    const parts = ev.parts;
    this.ui.updateHud({ status: null, selection: { count: chosen.length, valid: true, score: ev.score, desc: (tt) => parts.map(tt.part).join(' + ') } });
    await this.wait(0.65, id);
    chosen.forEach((d) => (d.ringTarget = 0));
    const total = this.turn + ev.score;
    this.ui.updateHud({ selection: null, status: dec.bank ? (tt) => tt.oppBanks(total) : (tt) => tt.oppRolls });
    return dec;
  }

  // ---------- 动画 ----------
  async moveToRow(P, dice, id) {
    const jobs = dice.map((d, k) => {
      const slot = P.kept++;
      const target = this.rowPos(P.idx, slot);
      d.bakeOrientation();
      const p0 = d.group.position.clone();
      const q0 = d.group.quaternion.clone();
      const q1 = d.restQuaternion(d.value, rand(-0.08, 0.08));
      d.ringY = TABLE_Y + 0.02;
      // 飞得越远抛得越高，隔着半张桌子也能越过盘边
      const hop = 2.4 + p0.distanceTo(target) * 0.1;
      return this.stage.wait(k * 0.07).then(() =>
        this.stage.tween(0.5, (e) => {
          if (id !== this.matchId) return;
          d.group.position.lerpVectors(p0, target, hopAcross(e));
          d.group.position.y = p0.y + (target.y - p0.y) * e + Math.sin(e * Math.PI) * hop;
          d.group.quaternion.slerpQuaternions(q0, q1, e);
        }, easeInOut).then(() => { if (id === this.matchId) this.audio.place(0); })
      );
    });
    await Promise.all(jobs);
    this.check(id);
  }

  // 掷骰：举起空骰盅 → 骰子一颗颗落进去 → 在盅里翻滚（看得见）→ 倒进骰盘 → 骰盅放回
  async throwDice(P, pool, id) {
    const pi = P.idx;
    const s = pi === 0 ? 1 : -1;
    const cup = this.cups[pi];
    const rest = this.cupRest[pi];
    const restQ = cup.quaternion.clone();
    this.ui.hideTip();
    const plan = makeCupPlan({ base: new V3(rand(0.4, 3.4) * s, 6.2, 3.0 * s), side: s, n: pool.length });
    const pose0 = cupPose(plan, 0);
    // 点数由概率表决定，轨迹由物理决定（离线算好再回放）；模拟和举起骰盅同时进行，按时间片跑，画面不卡
    const values = pool.map((d) => rollFace(d.typeId));
    const simulating = this.simulate(pool.length, plan);
    await this.stage.tween(0.5, (e) => {
      if (id !== this.matchId) return;
      // 拿起来时先离开桌面再过去，一条弧线
      cup.position.lerpVectors(rest, pose0.pos, hopAcross(e));
      cup.position.y = rest.y + (pose0.pos.y - rest.y) * e + Math.sin(e * Math.PI) * CUP_ARC;
      cup.quaternion.slerpQuaternions(restQ, pose0.quat, e);
    }, easeInOut);
    const sim = await simulating;
    this.check(id);
    const flights = pool.map((d, i) => {
      d.selected = false;
      d.ringY = 0.02;
      // 换上新的内层偏移，同时调整外层，让外观在起飞瞬间不跳变
      d.bakeOrientation();
      const look = d.group.quaternion.clone();
      d.setOffsetForTarget(sim.tops[i], values[i]);
      const q0 = look.multiply(d.mesh.quaternion.clone().invert());
      d.group.quaternion.copy(q0);
      const A = sim.frames[Math.min(sim.spawnFrames[i], sim.frames.length - 1)];
      const o = i * CUP_STRIDE;
      const p1 = new V3(A[o], A[o + 1], A[o + 2]);
      const p0 = d.group.position.clone();
      return {
        p0,
        p1,
        ctrl: cupFlightCtrl(p0, p1, plan.base),
        q0,
        q1: new THREE.Quaternion(A[o + 3], A[o + 4], A[o + 5], A[o + 6]),
        t1: plan.spawnT[i],
      };
    });
    await this.playCup(pool, sim, plan, flights, cup, rest, restQ, id);
    this.check(id);
  }

  async simulate(n, plan) {
    const steps = cupThrowSteps(n, plan);
    for (;;) {
      const t0 = performance.now();
      do {
        const s = steps.next();
        if (s.done) return s.value;
      } while (performance.now() - t0 < 10);
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  playCup(pool, sim, plan, flights, cup, rest, restQ, id) {
    const FLY = 0.45;
    const BACK = 0.8;
    const frames = sim.frames;
    const n = pool.length;
    const impacts = sim.impacts.slice().sort((a, b) => a.f - b.f);
    const mats = pool.map((d) => materialClass(d.typeId));
    const awayPose = cupPose(plan, plan.tAway1);
    const pose = { pos: new V3(), quat: new THREE.Quaternion() };
    const pa = new V3();
    const pb = new V3();
    return new Promise((resolve) => {
      let time = -FLY;
      let ii = 0;
      let whooshed = false;
      let cupDown = false;
      const qa = [0, 0, 0, 0];
      const off = this.stage.add((dt) => {
        if (id !== this.matchId) { off(); resolve(); return; }
        time += dt;
        // 骰盅
        if (time < plan.tAway1) {
          cupPose(plan, Math.max(0, time), pose);
          cup.position.copy(pose.pos);
          cup.quaternion.copy(pose.quat);
        } else {
          const u = Math.min(1, (time - plan.tAway1) / BACK);
          const e = easeInOut(u);
          cup.position.lerpVectors(awayPose.pos, rest, e);
          cup.position.y += Math.sin(u * Math.PI) * 2;
          cup.quaternion.slerpQuaternions(awayPose.quat, restQ, e);
          if (u >= 1 && !cupDown) {
            cupDown = true;
            this.audio.cupDown(THREE.MathUtils.clamp(rest.x / 16, -0.9, 0.9));
          }
        }
        if (!whooshed && time >= plan.tShake1) {
          whooshed = true;
          this.audio.whoosh();
        }
        // 骰子：先飞进骰盅，落入后交给物理回放
        const fp = Math.max(0, time) * 60;
        const f0 = Math.min(frames.length - 1, Math.floor(fp));
        const f1 = Math.min(frames.length - 1, f0 + 1);
        const a = Math.min(1, fp - f0);
        const A = frames[f0];
        const B = frames[f1];
        for (let i = 0; i < n; i++) {
          const g = pool[i].group;
          const fl = flights[i];
          if (time < fl.t1) {
            const e = easeInOut(THREE.MathUtils.clamp((time - (fl.t1 - FLY)) / FLY, 0, 1));
            pa.copy(fl.p0).lerp(fl.ctrl, e);
            pb.copy(fl.ctrl).lerp(fl.p1, e);
            g.position.copy(pa.lerp(pb, e));
            g.quaternion.slerpQuaternions(fl.q0, fl.q1, e);
            // 飞向盅口的路上逐渐缩小，进盅时正好是物理里的小骰子
            g.scale.setScalar(THREE.MathUtils.lerp(1, DIE_CUP_SCALE, e));
            continue;
          }
          const o = i * CUP_STRIDE;
          g.position.set(A[o] + (B[o] - A[o]) * a, A[o + 1] + (B[o + 1] - A[o + 1]) * a, A[o + 2] + (B[o + 2] - A[o + 2]) * a);
          THREE.Quaternion.slerpFlat(qa, 0, A, o + 3, B, o + 3, a);
          g.quaternion.set(qa[0], qa[1], qa[2], qa[3]);
          g.scale.setScalar(A[o + 7] + (B[o + 7] - A[o + 7]) * a);
        }
        while (ii < impacts.length && impacts[ii].f <= f0 && time >= 0) {
          const im = impacts[ii++];
          this.audio.dieHit(im.v, mats[im.i], im.kind, THREE.MathUtils.clamp(A[im.i * CUP_STRIDE] / 12, -0.9, 0.9));
        }
        if (f0 >= frames.length - 1 && time >= plan.tAway1 + BACK) {
          off();
          cup.position.copy(rest);
          cup.quaternion.copy(restQ);
          resolve();
        }
      });
    });
  }

  // 在一组骰子上方飘出得分
  popAt(dice, text) {
    if (!dice.length) return;
    const c = new V3();
    dice.forEach((d) => c.add(d.group.position));
    c.multiplyScalar(1 / dice.length);
    c.y += 1.4;
    c.project(this.stage.camera);
    this.ui.popScore(text, (c.x + 1) * 0.5 * window.innerWidth, (1 - c.y) * 0.5 * window.innerHeight);
  }

  // 骰子停稳：能计分的挨个亮一下，音一个比一个高，一眼就看到这一把有什么
  revealFx(pool, mask) {
    if (!this.field) return;
    let k = 0;
    pool.forEach((d, i) => {
      if (!(mask & (1 << i))) return;
      const n = k++;
      this.stage.wait(n * 0.07).then(() => {
        d.flash = 0.95;
        this.audio.chime(n);
      });
    });
  }

  // 爆骰：掷出来的骰子冒一缕烟，蜡烛也抖一下
  bustFx(pool) {
    if (!this.field) return;
    for (const d of pool) this.fx.smoke(d.group.position.x, d.group.position.y + 0.5, d.group.position.z, 5);
    if (this.tavern) this.tavern.candle.gust = 1;
  }

  // 全骰得分：火星子从每颗骰子上飘起来，蜡烛的火苗蹿一下
  hotFx(P) {
    if (!this.field) return;
    this.audio.whumpf();
    for (const d of P.dice) this.fx.embers(d.group.position.x, d.group.position.y, d.group.position.z, 12, 0.6);
    if (this.tavern) this.tavern.candle.gust = -1;
  }

  // 胜利时从天而降的格罗申：难度越高撒得越多
  coinShower() {
    const count = { casual: 90, novice: 160, regular: 260, king: 420 }[this.difficulty] || 160;
    // 桌边那枚先手金币也算钱摞；骰子是实心的，币碰到被推开
    const parked = this.toss?.coin.visible ? [{ x: NEUTRAL_COIN_SPOT.x, z: NEUTRAL_COIN_SPOT.z, r: G_R * TOSS_SCALE + 0.03, top: TABLE_Y + 2 * G_REST * TOSS_SCALE }] : [];
    this.field.statics = [...TABLE_COINS, ...parked];
    this.field.restamp();
    this.field.dice = this.dice.filter((d) => d.group.visible).map((d) => ({ x: d.group.position.x, z: d.group.position.z, top: d.group.position.y + 0.9 }));
    this.field.shower(count);
  }

  // ---------- 结算 ----------
  async finish(humanWon, id) {
    const t = i18n.t;
    this.ui.updateHud({ mode: null, selection: null, status: null });
    if (humanWon) {
      this.audio.winCrowd();
      this.coinShower();
    } else this.audio.loseCrowd();
    this.audio.sting(humanWon);
    this.say(humanWon ? 'lose' : 'win');
    this.ui.banner(humanWon ? t.win : t.lose, '', humanWon ? 'big' : 'bust', 2200);
    this.recordResult(humanWon);
    await this.wait(2.6, id);
    const scores = this.players.map((p) => p.score);
    const m = this.stats;
    const summary = [(tt) => tt.sumTurns(m.turns), (tt) => tt.sumBest(m.best), (tt) => tt.sumBusts(m.busts)];
    if (m.hots) summary.push((tt) => tt.sumHots(m.hots));
    this.ui.showGameOver(
      humanWon,
      scores,
      () => {
        this.ui.hideHud();
        this.clearDice();
        this.players = null;
        this.startMatch(this.difficulty);
      },
      () => {
        this.ui.hideHud();
        this.clearDice();
        this.players = null;
        this.openMenu();
      },
      summary
    );
  }

  recordResult(humanWon) {
    const d = this.difficulty;
    if (humanWon) {
      profile.wins[d]++;
      profile.streak++;
      profile.bestStreak = Math.max(profile.bestStreak, profile.streak);
      this.award('firstWin');
      if (d === 'novice') this.award('beatNovice');
      if (d === 'regular') this.award('beatRegular');
      if (d === 'king') this.award('beatKing');
      if (this.stats?.trailed) this.award('comeback');
      if (profile.streak >= 3) this.award('streak3');
    } else {
      profile.losses[d]++;
      profile.streak = 0;
    }
    saveProfile();
  }
}
