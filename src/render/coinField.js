// 胜利撒钱（v5）：每一枚都有自己的物理——飞、撞桌子弹起来、有的立起来滚一段、打着转躺平、一枚枚摞成堆。
// 用一个实例化网格画，几百枚也不卡。
// 不穿模：桌上的东西分三类。
//   高度图：已经躺下的币和桌上原有的钱摞都记在一张网格里，新落下的币看整个币面下最高的地方，搭在别的币上时会斜靠着；
//   木框：币比框顶低的时候不能穿过去（框内的贴着内壁、框外的贴着外壁），落在框顶上会被拨到一边掉下去；
//   实心的东西（骰盅、酒杯、蜡烛、钱袋、骰子）：币碰到就被推开、弹开。
import * as THREE from 'three';
import { TABLE_Y } from './world.js';
import { groschenGeometry, groschenMaterials, G_R, G_H, G_REST, COIN_METALS } from './groschen.js';

const GRAVITY = 62; // 和骰子一样的慢动作重力
const CELL = 0.2; // 高度图的格子
const GX = -36;
const GZ = -28;
const NX = 360;
const NZ = 280;
const RIM_TOP = TABLE_Y + 1.1;
const FLOOR = TABLE_Y + 0.31;
const IN_X = 8;
const IN_Z = 5.3;
const OUT_X = 8.9;
const OUT_Z = 6.2;
const WAIT = 0;
const FLY = 1;
const ROLL = 2;
const WOBBLE = 3;
const REST = 4;
const GONE = 5;
const rand = (a, b) => a + Math.random() * (b - a);
const Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _n = new THREE.Vector3();
const _h = new THREE.Vector3();
const _a = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const TINT = Object.fromEntries(Object.entries(COIN_METALS).map(([k, v]) => [k, new THREE.Color(v.color)]));

// 桌面本身的高度：骰盘皮面、框顶、桌面
function baseHeight(x, z) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax < IN_X && az < IN_Z) return FLOOR;
  if (ax < OUT_X && az < OUT_Z) return RIM_TOP;
  return TABLE_Y;
}

export class CoinField {
  // solids：[{x, z, r, top}] 实心的东西；statics：[{x, z, r, top}] 桌上原有的钱摞、散币（写进高度图）
  constructor(stage, audio, { capacity = 620, solids = [], statics = [] } = {}) {
    this.stage = stage;
    this.audio = audio;
    this.capacity = capacity;
    this.solids = solids;
    this.statics = statics;
    this.mesh = new THREE.InstancedMesh(groschenGeometry(32, 2), groschenMaterials('plain'), capacity);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, HIDDEN);
      this.mesh.setColorAt(i, TINT.gold);
    }
    this.mesh.visible = false;
    this.mesh.count = 0; // 只画用到的那些（币的 id 从小往大发）
    stage.scene.add(this.mesh);
    this.coins = [];
    this.free = Array.from({ length: capacity }, (_, i) => capacity - 1 - i);
    this.grid = new Float32Array(NX * NZ).fill(-99);
    this.dice = []; // [{x, z, top}]：桌上的骰子（币碰到被推开）
    this.time = 0;
    this.lastClink = 0;
    this.off = null;
    this.restamp();
  }

  // ---------- 高度图 ----------
  stampDisc(x, z, r, top) {
    const i0 = Math.max(0, Math.floor((x - r - GX) / CELL));
    const i1 = Math.min(NX - 1, Math.ceil((x + r - GX) / CELL));
    const j0 = Math.max(0, Math.floor((z - r - GZ) / CELL));
    const j1 = Math.min(NZ - 1, Math.ceil((z + r - GZ) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = GX + (i + 0.5) * CELL - x;
        const cz = GZ + (j + 0.5) * CELL - z;
        if (cx * cx + cz * cz <= r * r) {
          const k = j * NX + i;
          if (top > this.grid[k]) this.grid[k] = top;
        }
      }
    }
  }

  restamp() {
    this.grid.fill(-99);
    for (const s of this.statics) this.stampDisc(s.x, s.z, s.r, s.top);
    for (const c of this.coins) if ((c.phase === REST || c.phase === WOBBLE) && c.shrink === undefined) this.stampRest(c);
  }


  heightAt(x, z) {
    const i = Math.floor((x - GX) / CELL);
    const j = Math.floor((z - GZ) / CELL);
    const g = i >= 0 && j >= 0 && i < NX && j < NZ ? this.grid[j * NX + i] : -99;
    return Math.max(g, baseHeight(x, z));
  }

  // 币面下最高的地方：{y 高度, dx, dz 离币心的偏移}
  footprint(x, z, r) {
    let y = -99;
    let dx = 0;
    let dz = 0;
    const steps = Math.ceil(r / CELL);
    for (let a = -steps; a <= steps; a++) {
      for (let b = -steps; b <= steps; b++) {
        const ox = a * CELL;
        const oz = b * CELL;
        if (ox * ox + oz * oz > r * r) continue;
        const h = this.heightAt(x + ox, z + oz);
        // 一样高的地方取最靠近币心的（放平时不算斜）
        if (h > y + 1e-4 || (Math.abs(h - y) <= 1e-4 && ox * ox + oz * oz < dx * dx + dz * dz)) {
          y = h;
          dx = ox;
          dz = oz;
        }
      }
    }
    return { y, dx, dz };
  }

  // ---------- 碰到东西 ----------
  // 木框：币比框顶低的时候不能穿过去。返回是否碰到
  hitRim(c, r) {
    const p = c.p;
    if (p.y - r * 0.2 >= RIM_TOP) return false;
    const ax = Math.abs(p.x);
    const az = Math.abs(p.z);
    if (ax < IN_X && az < IN_Z) {
      let hit = false;
      if (ax > IN_X - r) {
        p.x = Math.sign(p.x) * (IN_X - r);
        c.v.x *= -0.4;
        hit = true;
      }
      if (az > IN_Z - r) {
        p.z = Math.sign(p.z) * (IN_Z - r);
        c.v.z *= -0.4;
        hit = true;
      }
      return hit;
    }
    if (ax < OUT_X + r && az < OUT_Z + r) {
      // 在框外贴着外壁：往离得近的一边推出去
      if (OUT_X + r - ax < OUT_Z + r - az) {
        p.x = Math.sign(p.x || 1) * (OUT_X + r);
        c.v.x = Math.abs(c.v.x) * 0.4 * Math.sign(p.x);
      } else {
        p.z = Math.sign(p.z || 1) * (OUT_Z + r);
        c.v.z = Math.abs(c.v.z) * 0.4 * Math.sign(p.z);
      }
      return true;
    }
    return false;
  }

  // 实心的东西：币比它低就推开
  hitSolids(c, r) {
    let hit = false;
    const y = c.p.y;
    const push = (s, sr, top) => {
      if (y - r * 0.2 > top) return;
      const dx = c.p.x - s.x;
      const dz = c.p.z - s.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const min = sr + r;
      if (d >= min) return;
      const nx = dx / d;
      const nz = dz / d;
      c.p.x = s.x + nx * min;
      c.p.z = s.z + nz * min;
      const vn = c.v.x * nx + c.v.z * nz;
      if (vn < 0) {
        c.v.x -= 1.4 * vn * nx;
        c.v.z -= 1.4 * vn * nz;
      }
      hit = true;
    };
    for (const s of this.solids) push(s, s.r, s.top);
    for (const d of this.dice) push(d, 0.74, d.top);
    return hit;
  }

  blocked(x, z, r = G_R) {
    return this.solids.some((a) => Math.hypot(x - a.x, z - a.z) < a.r + r) || this.dice.some((d) => Math.hypot(x - d.x, z - d.z) < 0.74 + r);
  }

  wake() {
    this.mesh.visible = true;
    if (!this.off) this.off = this.stage.add((dt) => this.update(dt));
  }

  // spec：{x, y, z, vx, vy, vz, delay, drag（空气阻力）, metal}
  launch(spec) {
    if (!this.free.length) {
      // 满了：回收最早躺下的一枚
      const old = this.coins.find((c) => c.phase === REST);
      if (!old) return null;
      this.release(old);
    }
    const id = this.free.pop();
    this.mesh.count = Math.max(this.mesh.count, id + 1);
    const metal = spec.metal || 'gold';
    const c = {
      id,
      p: new THREE.Vector3(spec.x, spec.y, spec.z),
      v: new THREE.Vector3(spec.vx || 0, spec.vy || 0, spec.vz || 0),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3))),
      w: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(8, 22)),
      phase: WAIT,
      delay: spec.delay || 0,
      drag: spec.drag || 0,
      s: 1,
      size: COIN_METALS[metal].size,
      metal,
      bounces: 0,
    };
    this.mesh.setColorAt(id, TINT[metal]);
    this.mesh.instanceColor.needsUpdate = true;
    this.coins.push(c);
    this.wake();
    return c;
  }



  // 收走：缩小消失；scatter：先炸开一下（爆骰时赌注飞了）
  // 收走：一枚接一枚缩小消失
  fade() {
    this.coins.forEach((c, i) => {
      c.shrink = i * 0.012;
      c.shrinkT = 0;
    });
    this.wake();
  }

  // 胜利：从天而降。落点是画面里看得见的桌面范围，中间密一些；空气阻力让币飘着落，不像子弹
  shower(count) {
    const spot = () => {
      for (let n = 0; n < 20; n++) {
        const near = Math.random() < 0.6;
        const z = near ? THREE.MathUtils.clamp(1 + rand(-1, 1) * rand(0, 1) * 9, -12.5, 10.5) : rand(-12.5, 10.5);
        const hw = 13 + (10.5 - z) * 0.45;
        const x = near ? rand(-1, 1) * rand(0, 1) * hw : rand(-hw, hw);
        if (!this.blocked(x, z)) return [x, z];
      }
      return [rand(-6, 6), rand(-4, 4)];
    };
    const span = 1.2 + count / 300; // 多少秒内撒完
    for (let i = 0; i < count; i++) {
      const [x, z] = spot();
      const vx = rand(-3.5, 3.5);
      const vz = rand(-3.5, 3.5);
      this.launch({ x: x - vx * 0.5, y: rand(24, 40), z: z - vz * 0.5, vx, vy: -rand(0, 8), vz, delay: span * Math.random() ** 1.4, drag: 1 });
    }
    this.audio.coins();
  }

  release(c) {
    this.mesh.setMatrixAt(c.id, HIDDEN);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.free.push(c.id);
    c.phase = GONE;
    this.coins.splice(this.coins.indexOf(c), 1);
  }

  clear(animated = false) {
    if (animated) {
      this.fade();
      this.restamp();
      return;
    }
    for (const c of [...this.coins]) this.release(c);
    this.mesh.visible = false;
    this.mesh.count = 0;
    this.free.sort((a, b) => b - a);
    this.restamp();
  }

  clink(onCoin, x, v, c) {
    if (this.time - this.lastClink < 0.03) return;
    this.lastClink = this.time;
    this.audio.coinClink(onCoin, THREE.MathUtils.clamp(x / 16, -0.9, 0.9), Math.min(1.15, 0.45 + v / 34));
  }

  startRoll(c) {
    c.phase = ROLL;
    c.t = 0;
    c.q0 = c.q.clone();
    c.head = Math.atan2(c.v.x, c.v.z) + rand(-0.3, 0.3);
    c.speed = Math.min(15, Math.hypot(c.v.x, c.v.z) * 1.1 + rand(0, 2.5));
    c.lean = rand(-0.14, 0.14);
    c.leanRate = (c.lean >= 0 ? 1 : -1) * rand(0.1, 0.34);
    c.spin = rand(0, 6.3);
  }

  // 算好躺下的位置（斜靠在高的东西上），接下来打着转倒到这个姿势
  startWobble(c, alpha, dur) {
    const R = G_R * c.size;
    c.phase = WOBBLE;
    c.t = 0;
    c.dur = dur;
    c.a0 = Math.max(0.05, alpha);
    c.phi = rand(0, 6.3);
    c.half = 0;
    c.q0 = c.q.clone();
    c.qFace = new THREE.Quaternion().setFromAxisAngle(Y, rand(0, 6.3));
    if (Math.random() < 0.5) c.qFace.multiply(_q.setFromAxisAngle(_ax.set(1, 0, 0), Math.PI));
    // 先算出会躺在哪个高度，按这个高度再查一次有没有碰到东西，碰到就挪开重算
    const y0 = c.p.y;
    for (let k = 0; k < 4; k++) {
      this.restPose(c, R);
      c.p.y = c.groundY + G_REST * c.size;
      const moved = [this.hitRim(c, R), this.hitSolids(c, R)].some(Boolean);
      c.p.y = y0;
      if (!moved) break;
    }
    _n.set(-c.tx * Math.sin(c.tilt), Math.cos(c.tilt), -c.tz * Math.sin(c.tilt));
    c.qLean = new THREE.Quaternion().setFromUnitVectors(Y, _n);
    // 马上占住位置：同时落下来的币不会和它叠在一起
    this.stampRest(c);
  }

  // 这枚币躺下时的高度和倾斜
  restPose(c, R) {
    const f = this.footprint(c.p.x, c.p.z, R + 0.05);
    const d = Math.hypot(f.dx, f.dz);
    c.tilt = 0;
    c.tx = 0;
    c.tz = 0;
    c.groundY = f.y;
    if (d > CELL) {
      // 高的东西只垫着币的一边：以它为支点往低处斜下去。斜多少要看币面下每一格，不能压进任何东西
      const hx = f.dx / d;
      const hz = f.dz / d;
      let slope = Math.tan(0.4);
      const steps = Math.ceil(R / CELL);
      for (let a = -steps; a <= steps; a++) {
        for (let b = -steps; b <= steps; b++) {
          const ox = a * CELL;
          const oz = b * CELL;
          if (ox * ox + oz * oz > R * R) continue;
          const s = ox * hx + oz * hz;
          if (s >= d - 0.01) continue;
          slope = Math.min(slope, (f.y - this.heightAt(c.p.x + ox, c.p.z + oz)) / (d - s));
        }
      }
      if (slope > 0.02) {
        c.tilt = Math.atan(slope);
        c.tx = hx;
        c.tz = hz;
        c.groundY = f.y - d * slope + slope * CELL * 0.6; // 高度图是一格一格的，斜着放要多留一点
      }
    }
  }

  // 躺平：把币面写进高度图
  stampRest(c) {
    const R = G_R * c.size + 0.06;
    const top = G_H * (1 + 0.17) * c.size;
    const tt = Math.tan(c.tilt || 0);
    const i0 = Math.max(0, Math.floor((c.p.x - R - GX) / CELL));
    const i1 = Math.min(NX - 1, Math.ceil((c.p.x + R - GX) / CELL));
    const j0 = Math.max(0, Math.floor((c.p.z - R - GZ) / CELL));
    const j1 = Math.min(NZ - 1, Math.ceil((c.p.z + R - GZ) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = GX + (i + 0.5) * CELL - c.p.x;
        const dz = GZ + (j + 0.5) * CELL - c.p.z;
        if (dx * dx + dz * dz > R * R) continue;
        const k = j * NX + i;
        const h = c.groundY + top + (dx * c.tx + dz * c.tz) * tt;
        if (h > this.grid[k]) this.grid[k] = h;
      }
    }
  }

  settle(c) {
    const rest = G_REST * c.size;
    c.q.copy(c.qLean).multiply(c.qFace);
    c.p.y = c.groundY + rest * Math.cos(c.tilt);
    c.phase = REST;
    this.clink(c.groundY > TABLE_Y + 0.4, c.p.x, 2.5, c);
  }

  update(dt) {
    this.time += dt;
    const g = GRAVITY;
    let moving = false;
    let any = false;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (c.shrink !== undefined) {
        c.shrink -= dt;
        if (c.shrink <= 0) {
          c.shrinkT += dt / 0.3;
          c.s = Math.max(0, 1 - c.shrinkT);
          if (c.s <= 0) {
            this.release(c);
            continue;
          }
        }
        moving = true;
      }
      if (c.phase === REST && c.shrink === undefined) continue;
      any = true;
      if (c.phase === WAIT) {
        moving = true;
        c.delay -= dt;
        if (c.delay > 0) continue;
        c.phase = FLY;
      }
      const R = G_R * c.size;
      const rest = G_REST * c.size;
      if (c.phase === FLY) {
        moving = true;
        c.v.y -= g * dt;
        if (c.drag) c.v.multiplyScalar(1 - Math.min(0.5, c.drag * dt));
        c.p.addScaledVector(c.v, dt);
        const wl = c.w.length();
        if (wl > 0) c.q.premultiply(_q.setFromAxisAngle(_ax.copy(c.w).divideScalar(wl), wl * dt));
        if (c.p.y < TABLE_Y + 7) {
          if (c.shrink === undefined) {
            if (this.hitRim(c, R) || this.hitSolids(c, R)) this.clink(false, c.p.x, 6, c);
          }
          if (c.v.y < 0) {
            const f = this.footprint(c.p.x, c.p.z, R * 0.8);
            const ny = Math.abs(_n.set(0, 1, 0).applyQuaternion(c.q).y);
            const low = R * Math.sqrt(Math.max(0, 1 - ny * ny)) + rest * ny; // 币最低点离币心多远
            if (c.p.y - low <= f.y) {
              const hit = -c.v.y;
              const onCoin = f.y > baseHeight(c.p.x, c.p.z) + 0.01;
              const onRim = !onCoin && f.y === RIM_TOP;
              c.p.y = f.y + low;
              this.clink(onCoin, c.p.x, hit, c);
              if (onRim && c.bounces < 6) {
                // 落在木框顶上：站不住，往一边掉下去
                c.bounces++;
                const inward = Math.random() < 0.5 ? -1 : 1;
                const toX = OUT_X - Math.abs(c.p.x) < OUT_Z - Math.abs(c.p.z);
                c.v.set(toX ? Math.sign(c.p.x) * inward * 7 : c.v.x * 0.4, Math.max(5, hit * 0.25), toX ? c.v.z * 0.4 : Math.sign(c.p.z) * inward * 7);
              } else if (hit > 7 && c.bounces < 3) {
                // 边先着地：弹起来，翻得更乱
                c.bounces++;
                const e = onCoin ? 0.28 : f.y <= FLOOR + 0.01 && f.y > TABLE_Y ? 0.2 : 0.34;
                c.v.set(c.v.x * 0.55 + rand(-1, 1), hit * e * (0.75 + 0.5 * (1 - ny)), c.v.z * 0.55 + rand(-1, 1));
                c.w.multiplyScalar(0.62);
                c.w.x += rand(-7, 7) * (1 - ny);
                c.w.z += rand(-7, 7) * (1 - ny);
              } else if (Math.hypot(c.v.x, c.v.z) > 2.6 && ny < 0.62 && !onCoin && Math.random() < 0.45) {
                this.startRoll(c);
              } else {
                this.startWobble(c, Math.acos(Math.min(1, ny)), rand(0.2, 0.55));
              }
            }
          }
        }
      } else if (c.phase === ROLL) {
        // 立着滚：越滚越慢、越歪，往歪的那边拐弯
        moving = true;
        c.t += dt;
        c.speed -= (2.2 + c.speed * 0.3) * dt;
        c.lean += c.leanRate * dt * (1 + 3.5 / (0.6 + c.speed));
        c.head += c.lean * 1.9 * dt * Math.min(1, c.speed / 3);
        const nx = c.p.x + Math.sin(c.head) * c.speed * dt;
        const nz = c.p.z + Math.cos(c.head) * c.speed * dt;
        const ahead = 0.32; // 立着的币只有一条边碰桌子，看前面一小段
        const here = this.heightAt(c.p.x, c.p.z);
        const next = this.heightAt(nx + Math.sin(c.head) * R * ahead, nz + Math.cos(c.head) * R * ahead);
        const hitsRim = (Math.abs(nx) < IN_X) !== (Math.abs(c.p.x) < IN_X) || (Math.abs(nz) < IN_Z) !== (Math.abs(c.p.z) < IN_Z);
        if (next > here + 0.12 || hitsRim || this.blocked(nx, nz, 0.2) || Math.abs(nx) > 26 || nz < -20 || nz > 15) {
          // 撞到盘边、骰盅、钱堆：弹开，掉点速度
          c.head += Math.PI * rand(0.7, 1.3);
          c.speed *= 0.5;
          this.clink(false, c.p.x, 4, c);
        } else {
          c.p.x = nx;
          c.p.z = nz;
        }
        c.spin += (c.speed / R) * dt;
        const cl = Math.cos(c.lean);
        c.p.y = this.heightAt(c.p.x, c.p.z) + R * cl + rest * Math.abs(Math.sin(c.lean));
        _h.set(Math.sin(c.head), 0, Math.cos(c.head));
        _a.crossVectors(Y, _h);
        _n.copy(_a).multiplyScalar(cl).addScaledVector(Y, Math.sin(c.lean)); // 币的法线：横着的轴往上歪 lean
        _a.crossVectors(_n, _h);
        _m.makeBasis(_a, _n, _h);
        _q.setFromRotationMatrix(_m).multiply(_q2.setFromAxisAngle(Y, c.spin));
        c.q.slerpQuaternions(c.q0, _q, Math.min(1, c.t / 0.07));
        if (c.speed < 0.9 || Math.abs(c.lean) > 0.62) this.startWobble(c, Math.PI / 2 - Math.abs(c.lean), rand(0.5, 1.05));
      } else if (c.phase === WOBBLE) {
        // 欧拉盘：倒下去的时候越转越快，声音越来越密，最后啪地躺平
        moving = true;
        c.t += dt;
        const s = Math.min(1, c.t / c.dur);
        const al = c.a0 * (1 - s) ** 1.5;
        const rate = Math.min(13, 2 / Math.sqrt(Math.max(al / 1.4, 0.015)));
        c.phi += rate * 6.283 * dt;
        if (c.a0 > 0.35 && Math.floor(c.phi / Math.PI) > c.half) {
          c.half = Math.floor(c.phi / Math.PI);
          if (this.time - this.lastClink > 0.05) {
            this.lastClink = this.time;
            this.audio.coinRattle(rate / 13, THREE.MathUtils.clamp(c.p.x / 16, -0.9, 0.9));
          }
        }
        _q.setFromAxisAngle(_ax.set(Math.cos(c.phi), 0, -Math.sin(c.phi)), al).multiply(c.qLean).multiply(c.qFace);
        c.q.slerpQuaternions(c.q0, _q, Math.min(1, c.t / 0.06));
        c.p.y = c.groundY + R * Math.sin(al) + rest * Math.cos(al);
        if (s >= 1) this.settle(c);
      }
      this.mesh.setMatrixAt(c.id, _m.compose(c.p, c.q, _s.setScalar(c.s * c.size)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!moving && !any && this.off) {
      // 全部停住后不再每帧更新
      this.off();
      this.off = null;
    }
  }
}
