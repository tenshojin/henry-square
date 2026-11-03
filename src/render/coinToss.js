// 开局前掷币定先手（v3.4）：亚历山大格罗申从画面下方弹起，在眼前翻转、迎着吊灯一闪一闪，
// 落进骰盘中央弹一下、立着越转越快（欧拉盘）后啪地躺平；镜头推近看清朝上的面，
// 然后金币平放到先手一侧的空桌面上，整局提醒谁先手（下一局开始或回菜单时收走）。
// 头像朝上 = 玩家先手，十字朝上 = 对手先手。
import * as THREE from 'three';
import { GAME_CAM, easeInOut } from './stage.js';
import { TABLE_Y } from './world.js';
import { makeGroschen, G_R, G_REST } from './groschen.js';
import { FIRST_PLAYER_SPOTS } from './coinLayout.js';

const TRAY_Y = TABLE_Y + 0.31; // 骰盘皮面
export const TOSS_SCALE = 2.6;
const RADIUS = G_R * TOSS_SCALE;
const REST = G_REST * TOSS_SCALE;
const S = new THREE.Vector3(0.6, 8.5, 12.0);
const A = new THREE.Vector3(0.25, 13.5, 6.5);
const T_UP = 0.5; // 上升
const T_DOWN = 1.0; // 下落
const SPIN = 5; // 空中翻几圈
const TILT = 0.45; // 落下时币面和桌面的夹角（弧度），接着立着打转
const ANG0 = 1.1; // 弹起时币已经斜着（平躺着进画面会正好把吊灯反射进镜头，离镜头近，泛光成一大团）
const L = new THREE.Vector3(0, TRAY_Y + RADIUS * Math.sin(TILT) + REST * Math.cos(TILT), 1.55);
const WOBBLE = 1.25; // 立着打转多久
const HOP = 0.24; // 落下后弹起一下
const SLIDE = 0.3; // 落下后往前滑
const SPOT = new THREE.Vector3(0, 69, 20); // 吊灯（world.js 的聚光灯）
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

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
    const target = heads ? 0 : Math.PI; // 平躺时绕 X 轴转了多少
    const qFace = new THREE.Quaternion().setFromAxisAngle(X, target);
    const spinEnd = SPIN * Math.PI * 2 + target + TILT;
    const yaw0 = (Math.random() - 0.5) * 0.5;
    const spot = FIRST_PLAYER_SPOTS[heads ? 0 : 1];
    const top = new THREE.Vector3(spot.x, TABLE_Y + REST, spot.z);
    const landSpeed = 4.4; // 落下瞬间往前（-Z）的速度，滑一小段
    const rest = new THREE.Vector3(L.x, TRAY_Y + REST, L.z - (landSpeed * SLIDE) / 2);
    const camClose = rest.clone().add(new THREE.Vector3(0, 9.4, 6.3));
    const camPos = new THREE.Vector3();
    const look = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const qa = new THREE.Quaternion();
    const n = new THREE.Vector3();
    const toL = new THREE.Vector3();
    const toV = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const T_FLY = T_UP + T_DOWN;
    const T_REST = T_FLY + WOBBLE; // 躺平
    const T_PUSH = T_FLY + WOBBLE - 0.4; // 镜头开始推近
    const T_BACK = T_REST + 2.6;
    const T_END = T_BACK + 0.85;
    let time = 0;
    let phi = 0;
    let half = 0;
    let glint = 0;
    let glintCool = 0;
    const fired = { land: false, hop: false, settle: false, result: false, stack: false };
    coin.visible = true;
    coin.position.copy(S);
    coin.quaternion.identity();
    this.glint.visible = true;
    this.heads = heads;
    au.coinFlick();
    return new Promise((resolve) => {
      this.done = resolve;
      this.off = st.add((dt) => {
        time += dt;
        const t = time;
        // ---------- 位置和朝向 ----------
        if (t < T_FLY) {
          // 起点 → 最高点 → 落点各走一段直线：上升减速、下落加速，在最高点相接。
          // 下落这段大致顺着视线往远处落，画面上币一直往下走、越来越小（不会先往上飘）
          if (t < T_UP) coin.position.lerpVectors(S, A, 1 - (1 - t / T_UP) ** 2);
          else coin.position.lerpVectors(A, L, ((t - T_UP) / T_DOWN) ** 2);
          // 绕 X 轴翻（翻转轴随时间轻轻偏一点，不那么机械）
          const ang = ANG0 + (spinEnd - ANG0) * (t / T_FLY);
          qa.setFromAxisAngle(Y, yaw0 * (1 - t / T_FLY));
          q.setFromAxisAngle(X, ang);
          coin.quaternion.copy(qa).multiply(q);
        } else if (t < T_REST) {
          // 落下：弹一下、往前滑一点、立着打转越转越快，最后躺平
          const tl = t - T_FLY;
          const s = tl / WOBBLE;
          const alpha = TILT * (1 - s) ** 1.5;
          const rate = Math.min(14, 2.2 / Math.sqrt(Math.max(alpha / TILT, 0.02)));
          phi += rate * Math.PI * 2 * dt;
          if (Math.floor(phi / Math.PI) > half) {
            half = Math.floor(phi / Math.PI);
            if (tl > HOP) au.coinRattle(rate / 14);
          }
          qa.setFromAxisAngle(axis.set(Math.cos(phi), 0, -Math.sin(phi)), alpha);
          coin.quaternion.copy(qa).multiply(qFace);
          const hop = tl < HOP ? 0.5 * Math.sin((Math.PI * tl) / HOP) : 0;
          const sl = Math.min(tl, SLIDE);
          coin.position.set(L.x, TRAY_Y + RADIUS * Math.sin(alpha) + REST * Math.cos(alpha) + hop, L.z - landSpeed * (sl - (sl * sl) / (2 * SLIDE)));
          if (!fired.land) {
            fired.land = true;
            au.coinLand(1);
          }
          if (!fired.hop && tl >= HOP) {
            fired.hop = true;
            au.coinLand(0.45);
          }
        } else if (t < T_BACK) {
          coin.position.copy(rest);
          coin.quaternion.copy(qFace);
          if (!fired.settle) {
            fired.settle = true;
            au.coinSettle();
          }
        } else if (t < T_END) {
          // Place the coin flat beside the winner's purse; never balance it on a smaller stack.
          const k = easeInOut((t - T_BACK) / (T_END - T_BACK));
          coin.position.lerpVectors(rest, top, k);
          coin.position.y += 3.2 * Math.sin(Math.PI * k);
          const dir = toL.subVectors(top, rest).setY(0).normalize();
          const ax = n.crossVectors(Y, dir).normalize();
          qa.setFromAxisAngle(ax, Math.PI * 2 * k);
          coin.quaternion.copy(qa).multiply(qFace);
        } else {
          coin.position.copy(top);
          coin.quaternion.copy(qFace);
          if (!fired.stack) {
            fired.stack = true;
            au.coinClink(true);
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
          const kOut = t > T_BACK ? easeInOut(Math.min(1, (t - T_BACK) / 0.9)) : 0;
          const k = kIn * (1 - kOut);
          st.camMode = 'free';
          st.gamePos(st.time, camPos).lerp(camClose, k * 0.85);
          st.camera.position.copy(camPos);
          look.copy(GAME_CAM.look).lerp(rest, k);
          // Keep the portrait close-up prominent, then restore the fitted table view.
          st.camera.fov = THREE.MathUtils.lerp(st.fovFor(GAME_CAM.fov), Math.min(65, st.fovFor(GAME_CAM.fov)), k);
          st.camera.updateProjectionMatrix();
          st.camera.lookAt(look);
          if (t > T_BACK + 0.9) st.camMode = 'game';
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
        if (spec > 0.6 && glintCool <= 0 && t < T_FLY) {
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
