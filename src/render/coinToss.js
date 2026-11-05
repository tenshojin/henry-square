// 开局前掷币定先手：亚历山大格罗申从画面下方弹起，在眼前翻转、迎着吊灯一闪一闪，
// 砸进骰盘、弹起来、立着打转，越转越快后啪地躺平（这一段是真算出来的物理，见 coinPhysics.js）；
// 镜头推近看清朝上的面，看清结果后，金币一跳落到左侧中立区域（下一局开始或回菜单时收走）。
// 头像朝上 = 玩家先手，十字朝上 = 对手先手。
import * as THREE from 'three';
import { GAME_CAM, easeInOut } from './stage.js';
import { TABLE_Y } from './world.js';
import { makeGroschen, G_R, G_REST } from './groschen.js';
import { NEUTRAL_COIN_SPOT, TOSS_SCALE } from './coinLayout.js';
import { simulateCoinToss, COIN_FRAME, COIN_STRIDE } from './coinPhysics.js';

const TRAY_Y = TABLE_Y + 0.31; // 骰盘皮面
export { TOSS_SCALE };
const RADIUS = G_R * TOSS_SCALE;
const REST = G_REST * TOSS_SCALE;
// 掷币的物理参数：从画面下方弹起，约 1.5 秒后落到骰盘中间；木框是四面墙
export const TOSS = {
  R: RADIUS,
  half: REST,
  floor: TRAY_Y,
  rimTop: TABLE_Y + 1.1,
  walls: [[1, 0, -8], [-1, 0, -8], [0, 1, -5.3], [0, -1, -5.3]].map(([x, z, d]) => ({ n: new THREE.Vector3(x, 0, z), d })),
  start: new THREE.Vector3(0.6, 8.5, 12.0),
  land: new THREE.Vector3(0, TRAY_Y + 0.7, 1.2),
  T: 1.5,
  drag: 2.6, // 贴着皮面时转动衰减得多快
  maxT: 6.5,
  settleMin: 1.4, // 从落地到躺平，这个范围里看着最舒服
  settleMax: 2.5,
};
const HOP = 2.2; // 看完结果后金币跳到桌边的高度
const SPOT = new THREE.Vector3(0, 69, 20); // 吊灯（world.js 的聚光灯）
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

// 闪光：四角星 + 柔光
function glintTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,250,235,1)');
  r.addColorStop(0.12, 'rgba(255,236,200,0.55)');
  r.addColorStop(0.4, 'rgba(255,200,140,0.12)');
  r.addColorStop(1, 'rgba(255,200,140,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (const [w, len, a] of [[3.2, 62, 0], [2.2, 40, Math.PI / 4]]) {
    g.save();
    g.translate(64, 64);
    g.rotate(a);
    for (let k = 0; k < 2; k++) {
      const lg = g.createLinearGradient(-len, 0, len, 0);
      lg.addColorStop(0, 'rgba(255,240,210,0)');
      lg.addColorStop(0.5, 'rgba(255,250,240,0.95)');
      lg.addColorStop(1, 'rgba(255,240,210,0)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(-len, 0);
      g.quadraticCurveTo(0, -w, len, 0);
      g.quadraticCurveTo(0, w, -len, 0);
      g.fill();
      g.rotate(Math.PI / 2);
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CoinToss {
  constructor(stage, audio) {
    this.stage = stage;
    this.audio = audio;
    this.coin = makeGroschen({ seg: 160, metal: 'gold', scale: TOSS_SCALE });
    this.coin.name = 'first-player-gold-sovereign';
    this.coin.visible = false;
    stage.scene.add(this.coin);
    this.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, opacity: 0 }));
    this.glint.renderOrder = 20;
    this.glint.scale.setScalar(G_R * 3.2);
    this.glint.visible = false;
    stage.scene.add(this.glint);
    this.off = null;
    this.done = null;
  }

  // heads：头像朝上。onResult(heads) 在币躺平、镜头推近时调用（显示结果）。返回 false 表示中途被 stop() 打断
  play(heads, onResult) {
    this.stop();
    this.clear();
    const st = this.stage;
    const au = this.audio;
    const coin = this.coin;
    const qFace = new THREE.Quaternion().setFromAxisAngle(X, heads ? 0 : Math.PI);
    // 物理算好的这一段
    const sim = simulateCoinToss(TOSS);
    const F = sim.frames;
    const last = F.length / COIN_STRIDE - 1;
    const rest = new THREE.Vector3(F[last * COIN_STRIDE], F[last * COIN_STRIDE + 1], F[last * COIN_STRIDE + 2]);
    // 圆片是对称的：绕自身的轴转、翻个面都不影响轨迹。算好这一下，要的那面就朝上、头像也摆正
    const qFix = new THREE.Quaternion(F[last * COIN_STRIDE + 3], F[last * COIN_STRIDE + 4], F[last * COIN_STRIDE + 5], F[last * COIN_STRIDE + 6]).invert().multiply(qFace);
    const parked = new THREE.Vector3(NEUTRAL_COIN_SPOT.x, TABLE_Y + REST, NEUTRAL_COIN_SPOT.z);
    const camClose = rest.clone().add(new THREE.Vector3(0, 9.4, 6.3));
    const camPos = new THREE.Vector3();
    const look = new THREE.Vector3();
    const qs = [0, 0, 0, 0];
    const n = new THREE.Vector3();
    const toL = new THREE.Vector3();
    const toV = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const T_LAND = sim.tLand;
    const T_REST = sim.tEnd; // 躺平
    const T_PUSH = T_REST - 0.4; // 镜头开始推近
    const T_BACK = T_REST + 2.6;
    const T_PLACE = 1.2;
    const T_END = T_BACK + T_PLACE;
    let time = 0;
    let speed = 1;
    // 玩家点了「开始对局」：不等了，直接开始把币放到桌边，放得也快一点
    this.hurry = () => {
      time = Math.max(time, T_BACK);
      speed = 2.6;
    };
    let glint = 0;
    let glintCool = 0;
    const fired = { settle: false, result: false, placed: false };
    let ev = 0;
    coin.visible = true;
    coin.position.set(F[0], F[1], F[2]);
    coin.quaternion.set(F[3], F[4], F[5], F[6]).multiply(qFix);
    this.glint.visible = true;
    this.heads = heads;
    au.coinFlick();
    return new Promise((resolve) => {
      this.done = resolve;
      this.off = st.add((dt) => {
        time += dt * speed;
        const t = time;
        // ---------- 位置和朝向 ----------
        if (t < T_REST) {
          // 回放物理：飞、砸、弹、打转
          const u = Math.min(last - 1, t / COIN_FRAME);
          const i = Math.floor(u);
          const a = u - i;
          const A = i * COIN_STRIDE;
          const B = A + COIN_STRIDE;
          coin.position.set(F[A] + (F[B] - F[A]) * a, F[A + 1] + (F[B + 1] - F[A + 1]) * a, F[A + 2] + (F[B + 2] - F[A + 2]) * a);
          THREE.Quaternion.slerpFlat(qs, 0, F, A + 3, F, B + 3, a);
          coin.quaternion.set(qs[0], qs[1], qs[2], qs[3]).multiply(qFix);
          while (ev < sim.events.length && sim.events[ev].t <= t) {
            const e = sim.events[ev++];
            if (e.kind === 'rattle') au.coinRattle(Math.min(1, e.v / 28));
            else au.coinLand(Math.min(1, 0.2 + e.v / 26));
          }
        } else if (t < T_BACK) {
          coin.position.copy(rest);
          coin.quaternion.copy(qFace);
          if (!fired.settle) {
            fired.settle = true;
            au.coinSettle();
          }
        } else if (t < T_END) {
          // 轻轻一跳越过木框，落在桌边：不管结果如何都是同一个中立位置
          const u = (t - T_BACK) / T_PLACE;
          const e = easeInOut(u);
          coin.position.lerpVectors(rest, parked, e);
          coin.position.y += Math.sin(e * Math.PI) * HOP;
          coin.quaternion.setFromAxisAngle(Z, Math.sin(e * Math.PI) * 0.3).multiply(qFace);
        } else {
          coin.position.copy(parked);
          coin.quaternion.copy(qFace);
          if (!fired.placed) {
            fired.placed = true;
            au.coinClink(false, -0.6, 0.6);
            this.finish(true);
            return;
          }
        }
        if (t >= T_REST - 0.15 && !fired.result) {
          fired.result = true;
          onResult && onResult(heads);
        }
        // ---------- 镜头：躺平前推近，看清后拉回牌桌机位 ----------
        if (t >= T_PUSH) {
          const kIn = easeInOut(Math.min(1, (t - T_PUSH) / 1.0));
          const kOut = t > T_BACK ? easeInOut(Math.min(1, (t - T_BACK) / T_PLACE)) : 0;
          const k = kIn * (1 - kOut);
          st.camMode = 'free';
          st.gamePos(st.time, camPos).lerp(camClose, k * 0.85);
          st.camera.position.copy(camPos);
          look.copy(GAME_CAM.look).lerp(rest, k);
          // Keep the portrait close-up prominent, then restore the fitted table view.
          st.camera.fov = THREE.MathUtils.lerp(st.fovFor(GAME_CAM.fov), Math.min(65, st.fovFor(GAME_CAM.fov)), k);
          st.camera.updateProjectionMatrix();
          st.camera.lookAt(look);
        }
        // ---------- 闪光：币面正好把吊灯的光反射进镜头时亮一下 ----------
        n.set(0, 1, 0).applyQuaternion(coin.quaternion);
        toL.subVectors(SPOT, coin.position).normalize();
        toV.subVectors(st.camera.position, coin.position).normalize();
        // 星芒放在朝灯那一侧的币边上
        axis.copy(toL).addScaledVector(n, -toL.dot(n));
        if (axis.lengthSq() > 1e-6) axis.normalize();
        const spec = Math.abs(n.dot(toL.add(toV).normalize())) ** 40;
        glint = Math.max(spec, glint * Math.exp(-dt * 9));
        glintCool -= dt;
        if (spec > 0.6 && glintCool <= 0 && t < T_LAND) {
          glintCool = 0.25;
          au.coinGlint((coin.position.x / 12) * 0.5);
        }
        this.glint.position.copy(coin.position).addScaledVector(axis, RADIUS * 0.72).addScaledVector(toV, RADIUS * 0.3);
        const nearK = Math.min(1, Math.max(0, (st.camera.position.distanceTo(coin.position) - 5) / 5)); // 离镜头很近时星芒淡掉（币本身已经够亮）
        this.glint.material.opacity = Math.min(1, glint) * (t < T_REST ? 0.9 : 0.5) * nearK;
        this.glint.material.rotation = t * 0.8;
        // 大小按离镜头的距离算：画面上始终是一颗小星，不会在眼前变成一大团光
        const near = st.camera.position.distanceTo(coin.position);
        this.glint.scale.setScalar(near * (0.03 + 0.04 * glint));
      });
    });
  }

  hurry() {}

  finish(ok) {
    this.stage.camMode = 'game';
    if (this.off) this.off();
    this.off = null;
    this.glint.visible = false;
    this.glint.material.opacity = 0;
    const d = this.done;
    this.done = null;
    if (d) d(ok);
  }

  // 中途打断（回菜单）：镜头交还牌桌机位，币收走
  stop() {
    if (!this.off) return;
    this.stage.camMode = 'game';
    this.coin.visible = false;
    this.finish(false);
  }

  // 收走桌边的先手金币（下一局开始、回菜单时）
  clear() {
    this.coin.visible = false;
  }
}
