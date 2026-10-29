// 游戏流程：开场动画、对局、回合、骰盅动画、玩家选择与 AI
import * as THREE from 'three';
import { DICE_BY_ID, NORMAL_ID, rollFace, randomSpecial, pickBestWeighted } from '../data/dice.js';
import { evaluateSelection, bestOfRoll } from './scoring.js';
import { decide } from './ai.js';
import { Die3D } from '../render/diceModel.js';
import { createCup } from '../render/cup.js';
import { simulateCupThrow, makeCupPlan, cupPose, CUP_SCALE, DIE_CUP_SCALE, CUP_STRIDE } from '../render/physics.js';
import { TABLE_Y } from '../render/world.js';
import { MENU_CAM, easeInOut, easeOut, easeIn, linear } from '../render/stage.js';
import { OPPONENT_OF } from '../render/people.js';
import { i18n } from '../i18n.js';

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
  skipIntro() {
    this.openDoor(1);
    this.audio.setInside(1);
    this.stage.camMode = 'menu';
  }

  openDoor(f) {
    if (this.tavern?.door) this.tavern.door.rotation.y = -1.5 * f;
  }

  // 开场：站在正门外 → 推开门 → 先看左边吧台、再看正面拱窗、右边壁炉 → 走到游戏桌前坐下，看着对面的对手
  // 先按时间把镜头轨迹采样成每秒 60 帧，再做两遍平滑（位置和朝向都平滑），保证不会突然急转
  buildIntroPath() {
    const g = MENU_CAM;
    const keys = [
      // 街上看招牌 → 门开了往里走 → 左看柜台、正看窗和旗、右看壁炉 → 落到桌前
      [0, [0, 46, 380], [0, 52, 147]],
      [1.4, [0, 46, 366], [0, 50, 147]],
      [3.8, [0, 44, 250], [0, 40, 100]],
      [5.8, [0, 42, 160], [-6, 36, 40]],
      [8.8, [-8, 46, 105], [-112, 34, -100]],
      [11.9, [2, 47, 86], [0, 46, -190]],
      [15.0, [16, 45, 70], [160, 36, -70]],
      [17.8, [8, 36, 68], [30, 18, -40]],
      [20.4, [g.pos.x, g.pos.y, g.pos.z], [g.look.x, g.look.y, g.look.z]],
      [21.4, [g.pos.x, g.pos.y, g.pos.z], [g.look.x, g.look.y, g.look.z]],
    ];
    const n = keys.length;
    const posCurve = new THREE.CatmullRomCurve3(keys.map((k) => new V3(...k[1])), false, 'centripetal');
    const lookCurve = new THREE.CatmullRomCurve3(keys.map((k) => new V3(...k[2])), false, 'centripetal');
    const T = keys[n - 1][0];
    const sampleAt = (curve, time) => {
      let i = 0;
      while (i < n - 2 && time >= keys[i + 1][0]) i++;
      const local = THREE.MathUtils.clamp((time - keys[i][0]) / (keys[i + 1][0] - keys[i][0]), 0, 1);
      return curve.getPoint((i + local) / (n - 1));
    };
    const count = Math.ceil(T * 60) + 1;
    const pos = [];
    const dir = [];
    for (let k = 0; k < count; k++) {
      const time = Math.min(T, k / 60);
      const p = sampleAt(posCurve, time);
      pos.push(p);
      dir.push(sampleAt(lookCurve, time).sub(p).normalize());
    }
    const smooth = (arr, R) =>
      arr.map((_, k) => {
        const acc = new V3();
        for (let j = -R; j <= R; j++) acc.add(arr[THREE.MathUtils.clamp(k + j, 0, arr.length - 1)]);
        return acc.multiplyScalar(1 / (2 * R + 1));
      });
    const sp = smooth(smooth(pos, 28), 28);
    const sd = smooth(smooth(dir, 40), 40).map((v) => v.normalize());
    // 最后一帧精确落在游戏机位
    sp[count - 1].copy(g.pos);
    sd[count - 1].copy(g.look).sub(g.pos).normalize();
    return { pos: sp, dir: sd, T };
  }

  async playIntro() {
    const st = this.stage;
    st.camMode = 'free';
    const path = this.buildIntroPath();
    const target = new V3();
    let t = 0;
    let skipped = false;
    let creaked = false;
    let capShown = false;
    let capHidden = false;
    const apply = (time) => {
      const f = Math.min(path.pos.length - 1, time * 60);
      const k0 = Math.floor(f);
      const k1 = Math.min(path.pos.length - 1, k0 + 1);
      const a = f - k0;
      st.camera.position.lerpVectors(path.pos[k0], path.pos[k1], a);
      target.lerpVectors(path.dir[k0], path.dir[k1], a).normalize().add(st.camera.position);
      st.camera.fov = THREE.MathUtils.lerp(56, MENU_CAM.fov + st.fovFix, easeInOut(THREE.MathUtils.clamp((time - (path.T - 4.5)) / 3.5, 0, 1)));
      st.camera.updateProjectionMatrix();
      st.camera.lookAt(target);
      // 推门
      const door = easeInOut(THREE.MathUtils.clamp((time - 0.9) / 2.2, 0, 1));
      this.openDoor(door);
      this.audio.setInside(door);
    };
    this.audio.setInside(0);
    apply(0);
    await new Promise((resolve) => {
      const off = st.add((dt) => {
        if (skipped) return;
        t += dt;
        apply(Math.min(t, path.T));
        if (!creaked && t > 0.85) {
          creaked = true;
          this.audio.doorCreak();
        }
        if (!capShown && t > 4.2) {
          capShown = true;
          this.ui.showIntroCaption(true);
        }
        if (!capHidden && t > 12.6) {
          capHidden = true;
          this.ui.showIntroCaption(false);
        }
        if (t >= path.T) {
          off();
          resolve();
        }
      });
      this.ui.showSkip(async () => {
        if (skipped) return;
        skipped = true;
        off();
        await this.ui.fade(true, 350);
        apply(path.T);
        this.ui.showIntroCaption(false);
        await this.ui.fade(false, 600);
        resolve();
      });
    });
    this.ui.hideIntro();
    st.camMode = 'menu';
  }

  // ---------- 菜单与开局 ----------
  showMenu() {
    this.ui.showToolbar(() => this.backToMenu());
    this.openMenu();
  }

  // 选对手的菜单：镜头看向对面；点难度卡片时对面就换人（原来的人起身离开，新的人走过来坐下）
  openMenu() {
    if (this.stage.camMode !== 'menu') this.stage.moveCam('menu', 1.8);
    this.ui.showMenu((diff) => this.startMatch(diff), this.difficulty, TARGETS, (diff) => this.setOpponent(diff));
  }

  setOpponent(diff, instant = false) {
    this.difficulty = diff;
    this.tavern?.crowd?.setOpponent(OPPONENT_OF[diff], instant);
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
    this.setOpponent(diff);
    this.target = TARGETS[diff];
    if (this.stage.camMode !== 'game') this.stage.moveCam('game', 1.7);
    const offers = Array.from({ length: 6 }, () => (Math.random() < 0.5 ? { typeId: randomSpecial(), variant: Math.floor(Math.random() * 3) } : null));
    const aiSpecial = this.makeAiDice(diff);
    const choices = await new Promise((res) => this.ui.showFate(offers, res));
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
      log: [],
    });
    await Promise.all(drops);
    try {
      await this.runMatch(id);
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

  async runMatch(id) {
    const t = i18n.t;
    // 对手还在走过来 / 坐下：等他坐稳再开始
    if (this.tavern?.crowd && !this.tavern.crowd.isReady()) {
      await this.tavern.crowd.whenReady();
      this.check(id);
    }
    let cur = Math.random() < 0.5 ? 0 : 1;
    this.ui.banner(cur === 0 ? t.firstYou : t.firstOpp, '', 'turn', 1600);
    this.audio.coins();
    await this.wait(2.0, id);
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
        this.tavern?.crowd?.react('bust');
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
        this.tavern?.crowd?.react('big');
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

  // 胜利时从天而降的金币
  coinShower() {
    const mat = new THREE.MeshStandardMaterial({ color: '#f2c860', metalness: 0.85, roughness: 0.3, envMapIntensity: 2.4, transparent: true });
    const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20);
    const coins = [];
    for (let i = 0; i < 46; i++) {
      const m = new THREE.Mesh(geo, mat);
      const x = rand(-7.2, 7.2);
      const z = rand(-4.6, 4.6);
      const y0 = rand(14, 30);
      m.position.set(x, y0, z);
      m.castShadow = true;
      this.scene.add(m);
      coins.push({ m, x, z, y0, spin: new V3(rand(-12, 12), rand(-4, 4), rand(-12, 12)), delay: rand(0, 1.2), done: false });
    }
    let time = 0;
    const off = this.stage.add((dt) => {
      time += dt;
      let all = true;
      for (const c of coins) {
        const tt = time - c.delay;
        if (tt < 0) {
          all = false;
          continue;
        }
        const y = c.y0 - 30 * tt * tt;
        if (y > 0.07) {
          all = false;
          c.m.position.y = y;
          c.m.rotation.x += c.spin.x * dt;
          c.m.rotation.y += c.spin.y * dt;
          c.m.rotation.z += c.spin.z * dt;
        } else if (!c.done) {
          c.done = true;
          c.m.position.y = 0.07;
          c.m.rotation.set(0, rand(0, 6), 0);
          if (Math.random() < 0.35) this.audio.ping({ freq: rand(2600, 4200), dur: 0.2, gain: 0.04, type: 'triangle' });
        }
      }
      if (time > 10) mat.opacity = Math.max(0, 1 - (time - 10));
      if (all && time > 11) {
        off();
        coins.forEach((c) => this.scene.remove(c.m));
        geo.dispose();
        mat.dispose();
      }
    });
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
