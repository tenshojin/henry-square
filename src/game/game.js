// 游戏流程：开场动画、选对手、对局、回合、骰盅动画、玩家选择与 AI
import * as THREE from 'three';
import { DICE_BY_ID, NORMAL_ID, rollFace, randomSpecial, pickBestWeighted } from '../data/dice.js';
import { evaluateSelection, bestOfRoll } from './scoring.js';
import { decide } from './ai.js';
import { Die3D } from '../render/diceModel.js';
import { createCup } from '../render/cup.js';
import { CoinToss } from '../render/coinToss.js';
import { coinShower } from '../render/coinShower.js';
import { groschenIcons, G_REST, G_STEP } from '../render/groschen.js';
import { simulateCupThrow, makeCupPlan, cupPose, CUP_SCALE, DIE_CUP_SCALE, CUP_STRIDE } from '../render/physics.js';
import { TABLE_Y } from '../render/world.js';
import { easeInOut, easeOut, easeIn, linear } from '../render/stage.js';
import { i18n } from '../i18n.js';

// 难度对应的对手（过场动画里坐在对面的人）
export const OPPONENT_OF = { casual: 'barmaid', novice: 'drinker', regular: 'elder', king: 'dicer' };
const DOOR_CREAK = 0.4; // 开场推门那段视频里门开始动的时间（秒）

export const TARGETS = { casual: 750, novice: 1500, regular: 3000, king: 8000 };
const ROW_Y = TABLE_Y + 0.5;
const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);

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
    this.difficulty = 'regular';

    this.cupRest = [new V3(11.6, TABLE_Y, 7.4), new V3(-11.6, TABLE_Y, -7.4)];
    this.cups = [createCup({ leather: '#5a2416', seed: 9 }), createCup({ leather: '#2e2418', seed: 19 })];
    this.cups.forEach((c, i) => {
      c.scale.setScalar(CUP_SCALE);
      c.position.copy(this.cupRest[i]);
      c.rotation.y = i === 0 ? -0.4 : 0.4;
      this.scene.add(c);
    });

    stage.add((dt, t) => {
      for (const d of this.dice) d.update(dt, t);
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
      if (die && !this.ui.modal.classList.contains('show')) {
        if (die.owner === 1) {
          this.ui.showTipPlain(t.oppDie, e.clientX, e.clientY, t.faceNow(die.value));
        } else {
          const extra = [t.faceNow(t.face(die.value, die.isJoker))];
          if (die.isJoker) extra.push(t.jokerTip);
          this.ui.showTip(die.typeId, e.clientX, e.clientY, extra.join('<br>'));
        }
      } else if (hoverDie) this.ui.hideTip();
      // 可选骰子的悬停光圈
      if (hoverDie && hoverDie !== die && !hoverDie.selected) hoverDie.ringTarget = 0;
      if (die && this.selectable && this.selectable.includes(die) && !die.selected) die.ringTarget = 0.35;
      hoverDie = die;
      canvas.style.cursor = die && this.selectable && this.selectable.includes(die) ? 'pointer' : 'default';
    });
    canvas.addEventListener('pointerleave', () => this.ui.hideTip());
    canvas.addEventListener('click', (e) => {
      if (!this.selectable) return;
      const hit = this.stage.pick(this.selectable.map((d) => d.mesh), e.clientX, e.clientY);
      const die = hit ? hit.object.userData.die : null;
      if (die && this.onDieClick) this.onDieClick(die);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.ui.hudState || this.ui.hud.classList.contains('hidden')) return;
      const s = this.ui.hudState;
      if (e.code === 'Space') {
        e.preventDefault();
        if (s.mode === 'roll' && s.onRoll) s.onRoll();
        else if (s.mode === 'choose' && s.selection?.valid && s.onKeepRoll) s.onKeepRoll();
      } else if (e.code === 'Enter') {
        if (s.mode === 'choose' && s.selection?.valid && s.onBank) s.onBank();
      }
    });
  }

  // ---------- 开场动画 ----------
  // 推门 → 走进酒馆、停在老人对面（视频），标题字幕在走进门之后浮现；右下角可跳过。浏览器放不了视频时直接到牌桌
  async playIntro() {
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
      if (clip === 'intro_a') {
        if (!creaked && t > DOOR_CREAK) {
          creaked = true;
          a.doorCreak();
        }
        a.setInside(THREE.MathUtils.clamp((t - DOOR_CREAK) / 2.4, 0, 1));
      } else {
        a.setInside(1);
        if (!cap && t > 1.2) {
          cap = true;
          this.ui.showIntroCaption(true);
        }
      }
    });
    const skipped = new Promise((resolve) =>
      this.ui.showSkip(async () => {
        await this.ui.fade(true, 350);
        await cs.jumpTo(OPPONENT_OF[this.difficulty]);
        a.setInside(1);
        this.ui.showIntroCaption(false);
        await this.ui.fade(false, 600);
        resolve(false);
      })
    );
    // 视频盖着时实时画面暂停，stage.wait 不走，用定时器
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    if (await Promise.race([done, skipped])) {
      // 落到老人对面之后字幕再停一会儿，先淡出，菜单再从下面升起来
      this.ui.hideSkip();
      if (!cap) this.ui.showIntroCaption(true);
      await sleep(1600);
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
    if (this.cutscenes) await this.cutscenes.jumpTo(OPPONENT_OF[this.difficulty]);
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
    if (this.cutscenes) this.cutscenes.swapTo(OPPONENT_OF[diff]);
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
    await cs.toTable(() => {
      this.camEaseId = (this.camEaseId || 0) + 1;
      st.wobble = 0;
      st.fovFixK = 0;
      st.camMode = 'game';
    });
    this.easeLiveCam(1, 1.6);
  }

  // 回菜单：实时画面的镜头先停到和视频第一帧一样，再淡入“从牌桌抬头看向对面”的视频
  async leaveTable() {
    const cs = this.cutscenes;
    if (!cs) {
      this.stopCoins?.(true);
      return;
    }
    if (!this.atTable) return;
    this.atTable = false;
    await this.easeLiveCam(0, 0.3);
    await cs.fromTable();
    // 胜利撒下的钱等抬头的视频盖住画面后再收走（视频淡入时它们跟着淡掉，视频第一帧的桌上没有它们）
    this.stopCoins?.();
  }

  backToMenu() {
    if (!this.players) return;
    this.cancelMatch();
    this.ui.hideHud();
    this.ui.overEl.classList.remove('show');
    this.ui.overEl.classList.add('hidden');
    this.clearDice();
    this.players = null;
    this.openMenu();
  }

  cancelMatch() {
    this.matchId++;
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
    this.toss?.clear(); // 掷币后留在先手那摞钱上的那枚
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
    const id = this.matchId;
    this.clearDice();
    // 上一局胜利撒下的钱：桌面还看得见就缩小消失，被视频盖着就直接收走
    this.stopCoins?.(this.atTable);
    this.setOpponent(diff);
    this.target = TARGETS[diff];
    const entering = this.enterTable();
    const offers = Array.from({ length: 6 }, () => (Math.random() < 0.5 ? { typeId: randomSpecial(), variant: Math.floor(Math.random() * 3) } : null));
    const aiSpecial = this.makeAiDice(diff);
    const choices = await new Promise((res) => this.ui.showFate(offers, res));
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
    // 掷币定先手（头像朝上你先、十字朝上对手先），币最后落在先手那摞钱上
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
              d.group.position.y = p.y + 6 * (1 - k);
            }, easeIn).then(() => this.audio.place(0))
          )
        );
      });
    });
    this.ui.showHud({
      players: this.players,
      difficulty: diff,
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
    const t = i18n.t;
    if (!this.toss) this.toss = new CoinToss(this.stage, this.audio, this.tavern.stacks);
    const heads = Math.random() < 0.5;
    this.ui.banner(t.tossTitle, t.tossRule, 'toss', 2200);
    const ok = await this.toss.play(heads, () => {
      const icons = groschenIcons();
      this.ui.banner(heads ? t.tossHeads : t.tossCross, heads ? t.firstYouShort : t.firstOppShort, 'toss-result ' + (heads ? 'you' : 'opp'), 2400, heads ? icons.heads : icons.cross);
    });
    if (!ok || id !== this.matchId) return null;
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
    this.ui.banner(pi === 0 ? t().yourTurn : t().oppTurn, '', pi === 0 ? 'turn' : 'turn-opp', 1100);
    await this.wait(1.1, id);

    for (;;) {
      if (pi === 0 && needPress) {
        await new Promise((res, rej) => {
          this.cancelWait = rej;
          this.ui.updateHud({ mode: 'roll', selection: null, status: null, onRoll: () => res() });
        });
        this.cancelWait = null;
        this.check(id);
        this.ui.updateHud({ mode: null, onRoll: null });
      } else {
        this.ui.updateHud({ status: null, selection: null });
        await this.wait(pi === 0 ? 0.15 : 0.45, id);
      }

      await this.throwDice(P, pool, id);
      const rolled = pool.map((d) => ({ value: d.value, joker: d.isJoker, type: d.typeId }));
      const vals = rolled.map((r) => [r.value, r.joker]);
      this.log((tt) => tt.logRoll(tt.who(pi), vals.map(([v, j]) => tt.face(v, j)).join('\u2002')));
      this.ui.renderHud();
      const best = bestOfRoll(rolled);
      if (!best) {
        this.audio.groan();
        this.audio.sting(false);
        this.ui.banner(t().bust, t().bustSub, 'bust', 2200);
        this.log((tt) => tt.logBust(tt.who(pi)));
        this.turn = 0;
        this.ui.updateHud({ turnScore: 0 });
        await this.wait(2.4, id);
        await this.moveToRow(P, pool, id);
        return 'next';
      }
      if (best.score >= 1000) {
        this.audio.cheer(best.score >= 2000);
        this.ui.banner(t().big, `${best.score}`, 'big', 1700);
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
        this.log((tt) => tt.logHot(tt.who(pi)));
        pool = P.dice.slice();
        P.kept = 0;
        await this.wait(1.2, id);
      }
    }
  }

  humanChoose(P, pool, id) {
    const t = i18n.t;
    pool.forEach((d) => {
      d.selected = false;
      d.ringTarget = 0;
    });
    this.selectable = pool;
    const state = () => {
      const sel = pool.filter((d) => d.selected);
      const ev = sel.length ? evaluateSelection(sel.map((d) => ({ value: d.value, joker: d.isJoker }))) : null;
      const parts = ev ? ev.parts : [];
      return { count: sel.length, valid: !!ev, score: ev ? ev.score : 0, desc: (tt) => parts.map(tt.part).join(' + '), all: !!ev && sel.length === pool.length };
    };
    return new Promise((res, rej) => {
      this.cancelWait = rej;
      const done = (bank) => {
        const s = state();
        if (!s.valid) return;
        let mask = 0;
        pool.forEach((d, i) => {
          if (d.selected) mask |= 1 << i;
        });
        this.selectable = null;
        this.onDieClick = null;
        this.cancelWait = null;
        pool.forEach((d) => (d.ringTarget = 0));
        res({ mask, bank });
      };
      const refresh = () => this.ui.updateHud({ mode: 'choose', selection: state(), turnScore: this.turn, onKeepRoll: () => done(false), onBank: () => done(true) });
      this.onDieClick = (die) => {
        die.selected = !die.selected;
        die.ringTarget = die.selected ? 1 : 0;
        this.audio.select(die.selected);
        refresh();
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
    await this.wait(0.9, id);
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
      return this.stage.wait(k * 0.07).then(() =>
        this.stage.tween(0.5, (e) => {
          d.group.position.lerpVectors(p0, target, e);
          d.group.position.y += Math.sin(e * Math.PI) * 2.4;
          d.group.quaternion.slerpQuaternions(q0, q1, e);
        }, easeInOut).then(() => this.audio.place(0))
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
    // 点数由概率表决定，轨迹由物理决定（离线算好再回放）
    const values = pool.map((d) => rollFace(d.typeId));
    const sim = simulateCupThrow(pool.length, plan);
    await this.stage.tween(0.5, (e) => {
      cup.position.lerpVectors(rest, pose0.pos, e);
      cup.position.y += Math.sin(e * Math.PI) * 1.2;
      cup.quaternion.slerpQuaternions(restQ, pose0.quat, e);
    }, easeInOut);
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
        ctrl: p0.clone().lerp(p1, 0.5).add(new V3(0, 4.5, 0)),
        q0,
        q1: new THREE.Quaternion(A[o + 3], A[o + 4], A[o + 5], A[o + 6]),
        t1: plan.spawnT[i],
      };
    });
    await this.playCup(pool, sim, plan, flights, cup, rest, restQ);
    this.check(id);
  }

  playCup(pool, sim, plan, flights, cup, rest, restQ) {
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
      const qa = [0, 0, 0, 0];
      const off = this.stage.add((dt) => {
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

  // 胜利时从天而降的格罗申：难度越高撒得越多（src/render/coinShower.js）
  coinShower() {
    this.stopCoins?.();
    const count = { casual: 90, novice: 160, regular: 260, king: 420 }[this.difficulty] || 160;
    // 落在钱摞上就停在摞顶（掷币那枚还在上面的话再高一枚）
    const marker = this.toss?.coin.visible ? this.toss.coin.position : null;
    const stacks = (this.tavern?.stacks || []).map((st) => {
      const top = st.position.y + st.userData.top - G_REST;
      const onTop = marker && Math.hypot(marker.x - st.position.x, marker.z - st.position.z) < 0.5;
      return { x: st.position.x, z: st.position.z, top: onTop ? top + G_STEP : top };
    });
    const dice = this.dice.filter((d) => d.group.visible).map((d) => ({ x: d.group.position.x, z: d.group.position.z, top: d.group.position.y + 0.5 }));
    // 骰盅、锡酒杯、钱袋那里不撒
    const avoid = [...this.cupRest.map((p) => ({ x: p.x, z: p.z, r: 2.4 })), { x: 17.6, z: -3.9, r: 2.2 }, { x: -12.4, z: 13.2, r: 1.8 }, { x: 12.4, z: -13.4, r: 1.8 }];
    const sh = coinShower(this.stage, this.audio, { count, dice, stacks, avoid });
    const stop = (animated) => {
      sh.stop(animated);
      if (this.stopCoins === stop) this.stopCoins = null;
    };
    this.stopCoins = stop;
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
    this.ui.banner(humanWon ? t.win : t.lose, '', humanWon ? 'big' : 'bust', 2200);
    await this.wait(2.6, id);
    const scores = this.players.map((p) => p.score);
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
      }
    );
  }
}
