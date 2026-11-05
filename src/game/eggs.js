// 桌上的小彩蛋：蜡烛能吹灭、酒杯能喝（喝多了镜头会晃）、钱堆能拨弄（动对手的钱他会说话）、绕着火苗飞的小飞蛾、
// 敲键盘 henry 掌柜的撒赏钱。都不影响对局，只有鼠标移上去时光标变成手，留给想到处点点的人。
import * as THREE from 'three';
import { easeInOut, linear } from '../render/stage.js';
import { profile, saveProfile } from './profile.js';

const SIPS = 6; // 喝几口见底
const DRAIN = 3.5; // 酒面从满到见底降多少（杯子内壁往下收得不多，降到这里酒面还贴不到杯壁）
const _v = new THREE.Vector3();

function screenPos(stage, p) {
  _v.copy(p).project(stage.camera);
  return { x: (_v.x + 1) * 0.5 * window.innerWidth, y: (1 - _v.y) * 0.5 * window.innerHeight, z: _v.z };
}

export function bindEasterEggs(game) {
  const { stage, ui, audio, tavern } = game;
  const canvas = stage.renderer.domElement;
  const candle = tavern.candle;
  const mug = tavern.mug;
  const mugHome = mug.position.clone();
  const mugTop = mugHome.clone().add(new THREE.Vector3(0, 1.6, 0));
  const liquid = mug.getObjectByName('mug_pewter_2');
  let busy = false;
  let sips = 0;

  const targets = () => {
    const list = [];
    if (!ui.modalOpen && game.stage.camMode === 'game') {
      list.push({ kind: 'candle', at: candle.top, r: 30 });
      list.push({ kind: 'mug', at: mugTop, r: 46 });
      for (const s of tavern.stacks) list.push({ kind: 'stack', at: s.position, stack: s, r: 28 });
    }
    return list;
  };
  const hit = (e) => {
    for (const t of targets()) {
      const p = screenPos(stage, t.at);
      if (Math.abs(p.z) < 1 && Math.hypot(p.x - e.clientX, p.y - e.clientY) < t.r) return t;
    }
    return null;
  };
  const inPlay = () => game.atTable || !game.cutscenes;

  const blow = () => {
    if (candle.lit) {
      candle.lit = false;
      audio.puff();
      game.fx.smoke(candle.top.x, candle.top.y - 0.2, candle.top.z, 12);
    } else {
      candle.lit = true;
      audio.coinGlint(-0.3);
      game.fx.sparks(candle.top.x, candle.top.y - 0.3, candle.top.z, 0.4);
    }
  };

  const drink = async () => {
    if (busy) return;
    if (sips >= SIPS) {
      audio.place(0);
      return;
    }
    busy = true;
    const q0 = mug.quaternion.clone();
    const q1 = q0.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.85));
    const lift = new THREE.Vector3(-2, 6.5, 3);
    await stage.tween(0.45, (e) => {
      mug.position.lerpVectors(mugHome, mugHome.clone().add(lift), e);
      mug.quaternion.slerpQuaternions(q0, q1, e);
    }, easeInOut);
    audio.gulp();
    // 杯子举着看不见杯里：这一口的酒面这时候降下去，放回桌上就看得出来
    if (liquid) {
      liquid.position.y = (-(sips + 1) / SIPS) * (DRAIN / mug.scale.y);
      if (sips + 1 >= SIPS) liquid.material.color.multiplyScalar(0.3); // 只剩杯底一点渣
    }
    await stage.wait(0.7);
    await stage.tween(0.4, (e) => {
      mug.position.lerpVectors(mugHome.clone().add(lift), mugHome, e);
      mug.quaternion.slerpQuaternions(q1, q0, e);
    }, easeInOut);
    busy = false;
    sips++;
    stage.tipsy = Math.min(1, (stage.tipsy || 0) + 0.26);
    profile.sips++;
    saveProfile();
    if (sips >= SIPS) game.award('drunk');
  };

  // 拨一下钱堆：最上面那枚跳起来翻个面落回去
  const poke = async (s) => {
    const c = s.children[s.children.length - 1];
    if (!c || c.userData.poked) return;
    c.userData.poked = true;
    const y0 = c.position.y;
    const q0 = c.quaternion.clone();
    const qa = new THREE.Quaternion();
    const axis = new THREE.Vector3(1, 0, 0);
    audio.coinFlick();
    await stage.tween(0.5, (k) => {
      c.position.y = y0 + 4 * k * (1 - k) * 2.4;
      c.quaternion.copy(q0).multiply(qa.setFromAxisAngle(axis, k * Math.PI * 3));
    }, linear);
    c.position.y = y0;
    c.quaternion.copy(q0).multiply(qa.setFromAxisAngle(axis, Math.PI));
    c.userData.poked = false;
    audio.coinClink(true, THREE.MathUtils.clamp(s.position.x / 16, -0.9, 0.9), 0.9);
    if (s.position.z < 0 && Math.random() < 0.7) game.say('poke');
  };

  canvas.addEventListener('pointermove', (e) => {
    if (inPlay() && !game.selectable && hit(e)) canvas.style.cursor = 'pointer';
  });
  canvas.addEventListener('click', (e) => {
    if (!inPlay()) return;
    const t = hit(e);
    if (!t) return;
    if (t.kind === 'candle') blow();
    else if (t.kind === 'mug') drink();
    else poke(t.stack);
  });

  // 敲 henry：掌柜的撒一把赏钱
  let typed = '';
  window.addEventListener('keydown', (e) => {
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-5);
    if (typed === 'henry' && game.players) {
      typed = '';
      game.field.shower(36);
      audio.smallCheer();
    }
  });

  // 醉意慢慢退；飞蛾绕着火苗转
  const moth = buildMoth();
  stage.scene.add(moth);
  stage.add((dt, t) => {
    stage.tipsy = Math.max(0, (stage.tipsy || 0) - dt * 0.012);
    moth.visible = candle.level > 0.5;
    const r = 1.05 + Math.sin(t * 0.7) * 0.42 + Math.sin(t * 2.3) * 0.16;
    const a = t * 2.1 + Math.sin(t * 1.3) * 1.2;
    moth.position.set(candle.top.x + Math.cos(a) * r, candle.top.y + 0.1 + Math.sin(t * 1.7) * 0.5, candle.top.z + Math.sin(a) * r * 0.8);
    moth.rotation.y = -a;
    const flap = Math.sin(t * 46) * 0.9;
    moth.userData.l.rotation.z = flap;
    moth.userData.r.rotation.z = -flap;
  });
}

function buildMoth() {
  const g = new THREE.Group();
  const shape = new THREE.BufferGeometry();
  shape.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.055, 0, 0, -0.055, 0.13, 0, -0.02], 3));
  shape.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: '#5a4230', side: THREE.DoubleSide });
  const l = new THREE.Mesh(shape, mat);
  const r = new THREE.Mesh(shape, mat);
  r.scale.x = -1;
  g.add(l, r);
  g.userData.l = l;
  g.userData.r = r;
  g.userData.noAO = true;
  return g;
}

