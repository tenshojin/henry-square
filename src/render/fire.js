// 火焰（壁炉与蜡烛）、火星粒子、浮尘
import * as THREE from 'three';
import { makeCanvas } from './canvasTex.js';

const NOISE = /* glsl */ `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export function makeFireMaterial(seed = 0, intensity = 2.2) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uInt: { value: intensity } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uSeed; uniform float uInt; varying vec2 vUv;
      ${NOISE}
      void main(){
        vec2 uv = vUv;
        float n = fbm(vec2(uv.x * 3.2 + uSeed, uv.y * 2.4 - uTime * 1.7));
        float n2 = fbm(vec2(uv.x * 6.0 - uSeed, uv.y * 4.0 - uTime * 2.6));
        float width = abs(uv.x - 0.5) * (1.5 + uv.y * 2.2);
        float shape = 1.0 - smoothstep(0.0, 0.55, width + (n2 - 0.5) * 0.25);
        float f = shape * (n * 1.45 + 0.15 - uv.y * 1.05);
        f = smoothstep(0.08, 0.7, f);
        f *= smoothstep(0.0, 0.08, uv.y);
        vec3 col = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.62, 0.18), smoothstep(0.15, 0.7, f));
        col = mix(col, vec3(1.0, 0.93, 0.68), smoothstep(0.7, 1.0, f));
        gl_FragColor = vec4(col * f * uInt, f);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function makeCandleFlameMaterial(seed = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uSeed; varying vec2 vUv;
      void main(){
        vec2 p = vUv - vec2(0.5, 0.28);
        float sway = sin(uTime * 7.0 + uSeed) * 0.04 + sin(uTime * 13.0 + uSeed * 2.0) * 0.02;
        p.x -= sway * max(p.y, 0.0) * 2.0;
        p.x *= 2.4;
        float d = length(vec2(p.x, p.y * (p.y > 0.0 ? 0.42 : 1.3)));
        float f = smoothstep(0.32, 0.0, d);
        vec3 col = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.85, 0.45), smoothstep(0.1, 0.6, f));
        col = mix(col, vec3(1.0, 0.98, 0.9), smoothstep(0.6, 0.95, f));
        float blue = smoothstep(0.12, 0.0, length(vec2(p.x, (p.y + 0.06) * 2.2))) * 0.5;
        col = mix(col, vec3(0.3, 0.45, 1.0), blue * (1.0 - smoothstep(0.0, 0.1, p.y + 0.02)));
        gl_FragColor = vec4(col * f * 2.6, f);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// 壁炉火：几片交叉的火焰面 + 余烬粒子
export function createHearthFire(width = 26, height = 22) {
  const group = new THREE.Group();
  const mats = [];
  const planes = [];
  for (let i = 0; i < 5; i++) {
    const m = makeFireMaterial(i * 3.7, 1.8 + (i % 2) * 0.6);
    mats.push(m);
    const w = width * (0.55 + Math.random() * 0.3);
    const h = height * (0.7 + Math.random() * 0.35);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    pl.position.set((i - 2) * width * 0.12, h / 2, (i % 2) * 1.5 - 0.75);
    pl.rotation.y = (i - 2) * 0.35;
    pl.renderOrder = 5;
    group.add(pl);
    planes.push(pl);
  }
  // 余烬
  const N = 140;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const vel = [];
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * width * 0.6;
    pos[i * 3 + 1] = Math.random() * height * 2;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
    vel.push(4 + Math.random() * 8);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const emb = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ff8a30', size: 0.7, map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(emb);
  group.userData.update = (dt, t, camera) => {
    mats.forEach((m) => (m.uniforms.uTime.value = t));
    const p = geo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      p[i * 3 + 1] += vel[i] * dt;
      p[i * 3] += Math.sin(t * 2 + i) * dt * 2;
      if (p[i * 3 + 1] > height * 2.6) {
        p[i * 3 + 1] = Math.random() * 3;
        p[i * 3] = (Math.random() - 0.5) * width * 0.6;
      }
    }
    geo.attributes.position.needsUpdate = true;
  };
  return group;
}

export function createCandle({ height = 3, radius = 0.45, color = '#efe2c0', seed = 0, flameScale = 1 } = {}) {
  const group = new THREE.Group();
  const wax = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.92, radius, height, 20),
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, transmission: 0, sheen: 0.4, sheenColor: new THREE.Color('#ffd9a0') })
  );
  wax.position.y = height / 2;
  wax.castShadow = true;
  group.add(wax);
  // 蜡泪
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2;
    const drip = new THREE.Mesh(new THREE.CapsuleGeometry(radius * 0.13, height * (0.15 + Math.random() * 0.25), 4, 8), wax.material);
    drip.position.set(Math.cos(a) * radius * 0.95, height * (0.75 - Math.random() * 0.2), Math.sin(a) * radius * 0.95);
    group.add(drip);
  }
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 6), new THREE.MeshBasicMaterial({ color: '#1a1008' }));
  wick.position.y = height + 0.15;
  group.add(wick);
  const mat = makeCandleFlameMaterial(seed);
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(1.1 * flameScale, 2.2 * flameScale), mat);
  flame.position.y = height + 0.15 + 0.75 * flameScale;
  flame.renderOrder = 6;
  group.add(flame);
  group.userData.flame = flame;
  group.userData.flameTop = new THREE.Vector3(0, height + 0.9 * flameScale, 0);
  group.userData.update = (dt, t, camera) => {
    mat.uniforms.uTime.value = t;
    const wp = flame.getWorldPosition(_v);
    flame.rotation.y = Math.atan2(camera.position.x - wp.x, camera.position.z - wp.z) - group.rotation.y;
    flame.scale.y = 1 + Math.sin(t * 11 + seed) * 0.05;
  };
  return group;
}
const _v = new THREE.Vector3();

let dotTex = null;
export function softDot() {
  if (dotTex) return dotTex;
  const c = makeCanvas(64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

export function createDust(bounds, count = 500) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
    pos[i * 3 + 1] = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
    pos[i * 3 + 2] = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
    ph[i] = Math.random() * 100;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffd9a0', size: 0.55, map: softDot(), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.userData.update = (dt, t, cam) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      p[i * 3] += Math.sin(t * 0.2 + ph[i]) * dt * 0.6;
      p[i * 3 + 1] += Math.sin(t * 0.13 + ph[i] * 1.3) * dt * 0.4 + dt * 0.15;
      p[i * 3 + 2] += Math.cos(t * 0.17 + ph[i]) * dt * 0.6;
      if (p[i * 3 + 1] > bounds.maxY) p[i * 3 + 1] = bounds.minY;
      if (cam) {
        const dx = p[i * 3] - cam.position.x;
        const dy = p[i * 3 + 1] - cam.position.y;
        const dz = p[i * 3 + 2] - cam.position.z;
        if (dx * dx + dy * dy + dz * dz < 196) p[i * 3 + 1] = bounds.minY + Math.random() * 6;
      }
    }
    geo.attributes.position.needsUpdate = true;
  };
  return pts;
}
