// 角色实验台：只摆人物和简单灯光，用来检查建模（不进正式游戏）
// 网址参数：?view=full|heads|seated|back&who=dicer,drinker
import * as THREE from 'three';
import { createCharacter, seat, lifeUpdate, reach, lookAt } from '../../src/render/char.js';
import { CAST } from '../../src/render/patrons.js';

const qs = new URLSearchParams(location.search);
const view = qs.get('view') || 'full';
const who = (qs.get('who') || 'dicer,drinker,viking,barmaid').split(',');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.style.margin = '0';
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a2420');
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 2000);
scene.add(new THREE.HemisphereLight('#ffe4c8', '#3a2a20', 0.9));
const key = new THREE.DirectionalLight('#ffd0a0', 2.4);
key.position.set(60, 120, 120);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -150, right: 150, top: 150, bottom: -50, near: 10, far: 500 });
scene.add(key);
const rim = new THREE.DirectionalLight('#a0b8ff', 1.2);
rim.position.set(-80, 60, -100);
scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const chars = [];
const t0 = performance.now();
who.forEach((name, i) => {
  const ch = createCharacter({ ...CAST[name], hiRes: true });
  const x = (i - (who.length - 1) / 2) * 34;
  ch.root.position.set(x, 0, 0);
  if (view === 'back') ch.root.rotation.y = Math.PI;
  if (view === 'seated') {
    seat(ch, 22);
    const benchM = new THREE.Mesh(new THREE.BoxGeometry(22, 22, 12), new THREE.MeshStandardMaterial({ color: '#5a3c22' }));
    benchM.position.set(x, 11, -2);
    scene.add(benchM);
  }
  scene.add(ch.root);
  chars.push(ch);
});
window.__buildMs = Math.round(performance.now() - t0);
const target = new THREE.Vector3();
if (view === 'heads') {
  cam.position.set(0, 82, 70);
  target.set(0, 80, 0);
  cam.fov = 22;
} else if (view === 'seated') {
  cam.position.set(30, 70, 150);
  target.set(0, 40, 0);
} else {
  cam.position.set(0, 60, 230);
  target.set(0, 44, 0);
}
if (qs.get('cam')) {
  const c = qs.get('cam').split(',').map(Number);
  cam.position.set(c[0], c[1], c[2]);
  target.set(c[3], c[4], c[5]);
  if (c[6]) cam.fov = c[6];
}
cam.updateProjectionMatrix();
cam.lookAt(target);
const clock = new THREE.Clock();
let t = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  t += dt;
  for (const ch of chars) {
    if (view === 'seated') {
      const p = ch.root.position;
      reach(ch, 'R', new THREE.Vector3(p.x - 6, 38, 14), new THREE.Vector3(-1, -1, -0.4), 1);
      reach(ch, 'L', new THREE.Vector3(p.x + 6, 38, 14), new THREE.Vector3(1, -1, -0.4), 1);
      lookAt(ch, new THREE.Vector3(p.x, 30, 60), dt);
    }
    lifeUpdate(ch, dt, t);
  }
  renderer.render(scene, cam);
});
window.__ready = true;
window.__scene = scene;
window.__chars = chars;
