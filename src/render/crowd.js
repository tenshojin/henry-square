// 酒馆里的人：摆位置、拿东西、每帧的动作（喝酒、掷骰、端托盘、聊天、看你）
import * as THREE from 'three';
import { createCharacter, seat, reach, lookAt, lifeUpdate, holdInHand } from './char.js';
import { CAST } from './patrons.js';
import { woodTankard, pewterTankard } from './props.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sm = (t) => t * t * (3 - 2 * t);
const tri = (t, a, b, c, d) => (t < a ? 0 : t < b ? sm((t - a) / (b - a)) : t < c ? 1 : t < d ? 1 - sm((t - c) / (d - c)) : 0);

/**
 * spots: { 名字: { cast?, pos:[x,z], ry, seat: 座高 | null(站着), tableY: 桌面高度（世界）, partner?, phase?, mug?, path? } }
 */
export function buildCrowd(scene, { FLOOR_Y, mats, updaters, spots, camera }) {
  const chars = {};
  for (const [name, sp] of Object.entries(spots)) {
    const P = { ...CAST[sp.cast || name], seated: sp.seat != null };
    const ch = createCharacter(P);
    ch.root.position.set(sp.pos[0], FLOOR_Y, sp.pos[1]);
    ch.root.rotation.y = sp.ry || 0;
    if (sp.seat != null) seat(ch, sp.seat);
    scene.add(ch.root);
    ch.root.updateMatrixWorld(true);
    ch.spot = sp;
    chars[name] = ch;
  }
  const look = V(0, 0, 0);
  const local = (ch, x, y, z) => V(x, y, z).applyMatrix4(ch.root.matrixWorld);
  const dir = (ch, x, y, z) => V(x, y, z).transformDirection(ch.root.matrixWorld);
  const headOf = (ch) => ch.root.position.clone().add(V(0, ch.seated ? 56 : 80, 0));

  // 举杯喝酒的通用动作：rest = 杯子放在桌上的位置（人物本地），c = 0..1 的周期相位
  const drinkPose = (ch, side, c, rest, { lean0 = 0.1, mouthY = 70 } = {}) => {
    const lift = tri(c, 0.45, 0.58, 0.8, 0.9);
    const tilt = tri(c, 0.55, 0.62, 0.78, 0.84);
    ch.state.lean = lean0 - lift * 0.08;
    ch.state.nod = -tilt * 0.36;
    const s = side === 'R' ? -1 : 1;
    const mouth = local(ch, s * 1.2, mouthY, 9.5 - lift * 1.2);
    reach(ch, side, local(ch, ...rest).lerp(mouth, lift), dir(ch, s * 10, -6, -6), 1);
    if (ch.held) ch.held.tilt = tilt;
    return { lift, tilt };
  };
  const mugInHand = (ch, side, mug) => {
    holdInHand(ch, side, mug);
    ch.held = { obj: mug, side, tilt: 0 };
    return mug;
  };
  // 手里的杯子：每帧直接摆正（杯口朝上、把手朝握着的那只手），喝的时候才朝嘴边倾斜。
  // 不跟着手腕的翻转走，否则手肘向外时杯子会歪向一边
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const ex = new THREE.Euler();
  const hp = V(0, 0, 0);
  const orientHeld = (ch) => {
    const h = ch.held;
    if (!h) return;
    const hb = ch.bones['hd' + h.side];
    hb.updateWorldMatrix(true, false);
    const s = h.side === 'R' ? -1 : 1;
    ex.set(-h.tilt * 1.35, ch.root.rotation.y + (s < 0 ? Math.PI : 0), 0, 'YXZ');
    qa.setFromEuler(ex);
    hb.getWorldQuaternion(qb);
    h.obj.quaternion.copy(qb.invert().multiply(qa));
    hp.setFromMatrixPosition(hb.matrixWorld).add(dir(ch, -s * 1.0, -1.6, 2.2));
    h.obj.position.copy(hb.worldToLocal(hp));
  };

  // ---------- 角色 1：对手，掷骰子的年轻人 ----------
  const dicer = chars.dicer;
  let cup = null;
  let cupRest = null;
  let cupW = 0;
  if (dicer) {
    const T = dicer.spot.tableY - FLOOR_Y;
    updaters.push((dt, t) => {
      const ch = dicer;
      ch.state.lean = 0.14 + Math.sin(t * 0.7) * 0.02;
      const laugh = tri((t * 0.11) % 1, 0.62, 0.66, 0.74, 0.8);
      ch.state.jaw = 0.12 + laugh * (0.5 + Math.sin(t * 18) * 0.25);
      ch.state.nod = -laugh * 0.18;
      ch.root.updateMatrixWorld(true);
      reach(ch, 'L', local(ch, 6, T + 2.2, 15.5), dir(ch, 12, -8, -8), 1);
      reach(ch, 'R', local(ch, -6.5, T + 2.2, 15), dir(ch, -12, -8, -8), 1);
      // 自己的骰盅一动，右手就握住盅身跟着摇、跟着倒
      if (cup) {
        const moving = cup.position.distanceTo(cupRest) > 0.15;
        cupW += ((moving ? 1 : 0) - cupW) * Math.min(1, dt * (moving ? 7 : 3));
        if (cupW > 0.01) {
          cup.updateMatrixWorld(true);
          reach(ch, 'R', V(0, 2.1, 1.95).applyMatrix4(cup.matrixWorld), V(-0.8, -0.6, -0.4), cupW);
        }
      }
      const glance = (t * 0.07) % 1;
      if (cup && cupW > 0.3) look.copy(cup.position);
      else if (glance > 0.55 && glance < 0.75) look.set(0, dicer.spot.tableY, 0);
      else look.copy(camera.position);
      lookAt(ch, look, dt, { speed: 3 });
      orientHeld(ch);
      lifeUpdate(ch, dt, t);
    });
  }

  // ---------- 角色 2：左前角举杯痛饮的中年汉子（金属酒杯） ----------
  const drinker = chars.drinker;
  if (drinker) {
    const T = drinker.spot.tableY - FLOOR_Y;
    mugInHand(drinker, 'R', pewterTankard(mats, 1.2));
    updaters.push((dt, t) => {
      const ch = drinker;
      ch.root.updateMatrixWorld(true);
      const { lift, tilt } = drinkPose(ch, 'R', (t * 0.105 + 0.3) % 1, [-4.5, T + 3.6, 17]);
      ch.state.jaw = tilt * 0.25;
      reach(ch, 'L', local(ch, 6, T + 2.2, 15), dir(ch, 12, -8, -8), 1);
      if (lift > 0.3) look.copy(local(ch, 0, 95, 40));
      else if (dicer && (t * 0.05) % 1 < 0.5) look.copy(headOf(dicer));
      else look.copy(camera.position);
      lookAt(ch, look, dt, { speed: 2.5 });
      orientHeld(ch);
      lifeUpdate(ch, dt, t);
    });
  }

  // ---------- 角色 3：右前角的白胡子老人，看牌局、抿一口酒、跟着笑 ----------
  const elder = chars.elder;
  if (elder) {
    const T = elder.spot.tableY - FLOOR_Y;
    mugInHand(elder, 'R', woodTankard(mats, 1.15));
    updaters.push((dt, t) => {
      const ch = elder;
      ch.root.updateMatrixWorld(true);
      const { tilt } = drinkPose(ch, 'R', (t * 0.07 + 0.65) % 1, [-5, T + 3.6, 17], { lean0: 0.2 });
      const laugh = tri((t * 0.11 + 0.02) % 1, 0.63, 0.67, 0.75, 0.81);
      ch.state.jaw = laugh * (0.45 + Math.sin(t * 15) * 0.2) + tilt * 0.2;
      ch.state.nod -= laugh * 0.15;
      reach(ch, 'L', local(ch, 7, T + 2.4, 16), dir(ch, 12, -8, -8), 1);
      look.set(0, elder.spot.tableY, 0);
      if (laugh > 0.3 && dicer) look.copy(headOf(dicer));
      lookAt(ch, look, dt, { speed: 2.2 });
      orientHeld(ch);
      lifeUpdate(ch, dt, t);
    });
  }

  // ---------- 角色 4：女招待，端着托盘在吧台和游戏桌之间来回，走到桌边停一下招呼 ----------
  const barmaid = chars.barmaid;
  if (barmaid && barmaid.spot.path) {
    const [A, Bp] = barmaid.spot.path;
    const tray = new THREE.Group();
    const board = new THREE.Mesh(new THREE.CylinderGeometry(6, 5.6, 0.7, 28), mats.top);
    tray.add(board);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(5.9, 0.35, 6, 28), mats.frame);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.4;
    tray.add(rim);
    for (const [x, z, k] of [[-2.4, 1.2, 0], [2.2, 1.6, 1], [0, -2.6, 0]]) {
      const m = k ? pewterTankard(mats, 1.05) : woodTankard(mats, 1.05);
      m.position.set(x, 0.35, z);
      m.rotation.y = x;
      tray.add(m);
    }
    tray.traverse((o) => o.isMesh && (o.castShadow = true));
    scene.add(tray);
    const ab = Bp.clone().sub(A);
    const len = ab.length();
    const yawAB = Math.atan2(ab.x, ab.z);
    const speed = 30;
    const legT = len / speed;
    const cycleLen = legT * 2 + 7; // 吧台边停 2.5 秒，桌边停 4.5 秒
    const handPos = V(0, 0, 0);
    const qYaw = new THREE.Quaternion();
    updaters.push((dt, t) => {
      const ch = barmaid;
      const u = (t + 3) % cycleLen;
      let p;
      let yaw;
      let moving = 1;
      if (u < 2.5) {
        p = A;
        yaw = yawAB + Math.PI;
        moving = 0;
      } else if (u < 2.5 + legT) {
        p = A.clone().addScaledVector(ab, (u - 2.5) / legT);
        yaw = yawAB;
      } else if (u < 7 + legT) {
        p = Bp;
        yaw = yawAB - 0.9; // 面向桌子
        moving = 0;
      } else {
        p = Bp.clone().addScaledVector(ab, -(u - 7 - legT) / legT);
        yaw = yawAB + Math.PI;
      }
      ch.root.position.set(p.x, FLOOR_Y, p.z);
      let d = yaw - ch.root.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      ch.root.rotation.y += d * Math.min(1, dt * 5);
      // 迈步：长裙里步子小
      const ph = t * 7;
      const b = ch.bones;
      b.thL.rotation.x = Math.sin(ph) * 0.24 * moving;
      b.thR.rotation.x = -Math.sin(ph) * 0.24 * moving;
      b.snL.rotation.x = Math.max(0, -Math.cos(ph)) * 0.35 * moving;
      b.snR.rotation.x = Math.max(0, Math.cos(ph)) * 0.35 * moving;
      b.hips.position.y = 46 + Math.abs(Math.cos(ph)) * 0.6 * moving;
      ch.root.updateMatrixWorld(true);
      // 左手托着托盘，右手扶着盘边
      reach(ch, 'L', local(ch, 3.5, 57, 13.5), dir(ch, 10, -6, -4), 1);
      reach(ch, 'R', local(ch, -4, 58.5, 16.5), dir(ch, -10, -6, -4), 1);
      ch.state.lean = 0.04;
      ch.bones.hdL.updateWorldMatrix(true, false);
      handPos.setFromMatrixPosition(ch.bones.hdL.matrixWorld);
      // 托盘始终水平，跟着人转向
      qYaw.setFromAxisAngle(V(0, 1, 0), ch.root.rotation.y);
      tray.quaternion.copy(qYaw);
      tray.position.copy(handPos).add(V(0, 1.4, 0)).addScaledVector(dir(ch, 0, 0, 1), 2.6);
      // 看路 / 看客人 / 看你
      if (moving) look.copy(local(ch, 0, 70, 60));
      else if ((t * 0.2) % 1 < 0.5 && dicer) look.copy(headOf(dicer));
      else look.copy(camera.position);
      lookAt(ch, look, dt, { speed: 2.5 });
      orientHeld(ch);
      lifeUpdate(ch, dt, t);
    });
  }

  // ---------- 后面几桌：聊天、喝酒、比划 ----------
  const chatter = (ch, phase, partner) => {
    const T = ch.spot.tableY - FLOOR_Y;
    const mug = ch.spot.mug ? mugInHand(ch, 'R', woodTankard(mats, 1.1)) : null;
    updaters.push((dt, t) => {
      ch.root.updateMatrixWorld(true);
      const talk = Math.max(0, Math.sin(t * 0.8 + phase * 9));
      if (mug) drinkPose(ch, 'R', (t * 0.09 + phase) % 1, [-5, T + 3.4, 16.5], { lean0: 0.12 });
      else {
        reach(ch, 'R', local(ch, -5.5, T + 2.3, 15.5), dir(ch, -10, -6, -6), 1);
        ch.state.lean = 0.12;
      }
      ch.state.jaw = talk * Math.max(0, Math.sin(t * 9 + phase)) * 0.3;
      const gx = Math.sin(t * 2.3 + phase) * 2.5 * talk;
      reach(ch, 'L', local(ch, 6 + gx, T + 2.3 + talk * 5, 15 - talk * 3), dir(ch, 12, -8, -8), 1);
      if (partner && chars[partner]) look.copy(headOf(chars[partner]));
      else look.copy(camera.position);
      lookAt(ch, look, dt, { speed: 2 });
      orientHeld(ch);
      lifeUpdate(ch, dt, t);
    });
  };
  for (const [name, ch] of Object.entries(chars)) {
    if (['dicer', 'drinker', 'elder', 'barmaid'].includes(name)) continue;
    chatter(ch, ch.spot.phase ?? Math.random(), ch.spot.partner);
  }

  return {
    chars,
    // 游戏把对手的骰盅交给这里：盅一离开桌面，对手的右手就握上去
    setOpponentCup(obj, rest) {
      cup = obj;
      cupRest = rest.clone();
    },
  };
}
