import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { allowsGameShortcut } from '../src/game/input.js';
import { waitForMedia, playMedia } from '../src/render/media.js';
import { Stage, GAME_CAM } from '../src/render/stage.js';
import { COIN_STACKS, LOOSE_COINS, FIRST_PLAYER_SPOTS } from '../src/render/coinLayout.js';
import { G_R, COIN_METALS } from '../src/render/groschen.js';

test('game shortcuts require an active turn and cannot leak through controls or dialogs', () => {
  const state = { visible: true, modalOpen: false, mode: 'choose' };
  assert.equal(allowsGameShortcut({}, state), true);
  for (const patch of [{ modalOpen: true }, { visible: false }, { mode: null }]) {
    assert.equal(allowsGameShortcut({}, { ...state, ...patch }), false);
  }
  for (const field of ['repeat', 'defaultPrevented', 'altKey', 'ctrlKey', 'metaKey']) {
    assert.equal(allowsGameShortcut({ [field]: true }, state), false);
  }
  assert.equal(allowsGameShortcut({ target: { closest: () => ({}) } }, state), false);
  assert.equal(allowsGameShortcut({ key: '3', target: { closest: (s) => s === '[data-pick]' ? {} : null } }, state), true);
});

class Media extends EventTarget {
  listeners = 0;
  addEventListener(...args) { this.listeners++; return super.addEventListener(...args); }
  removeEventListener(...args) { this.listeners--; return super.removeEventListener(...args); }
}
test('media listeners are registered before synchronous load/seek completion', async () => {
  const el = new Media();
  await waitForMedia(el, 'seeked', () => el.dispatchEvent(new Event('seeked')), 20);
  assert.equal(el.listeners, 0);
});
test('decoder errors, stalled loads and synchronous exceptions settle and clean listeners', async () => {
  const el = new Media();
  await assert.rejects(waitForMedia(el, 'loadeddata', () => el.dispatchEvent(new Event('error')), 20), /failed/);
  assert.equal(el.listeners, 0);
  await assert.rejects(waitForMedia(el, 'loadeddata', null, 10), /timed out/);
  assert.equal(el.listeners, 0);
  await assert.rejects(waitForMedia(el, 'seeked', () => { throw new Error('bad seek'); }, 20), /bad seek/);
  assert.equal(el.listeners, 0);
});

test('play rejection and a never-settling play promise cannot stall entry', async () => {
  await playMedia({ play: () => Promise.resolve() }, 10);
  await assert.rejects(playMedia({ play: () => Promise.reject(new Error('blocked')) }, 10), /blocked/);
  await assert.rejects(playMedia({ play: () => new Promise(() => {}) }, 10), /timed out/);
});

test('the large first-player marker has bare tabletop around it on both sides', () => {
  for (const marker of FIRST_PLAYER_SPOTS) {
    const radius = G_R * 2.6;
    assert.ok(Math.abs(marker.z) - radius > 6.2, 'marker overlaps tray');
    for (const item of [...COIN_STACKS, ...LOOSE_COINS]) {
      assert.ok(Math.hypot(marker.x - item.x, marker.z - item.z) > radius + G_R * COIN_METALS[item.metal].size + .1, 'marker overlaps another coin');
    }
  }
  assert.deepEqual([...new Set(COIN_STACKS.map((s) => s.metal))].sort(), ['copper', 'gold', 'silver']);
});

function stageFixture(width, height) {
  globalThis.window = { innerWidth: width, innerHeight: height, devicePixelRatio: 2 };
  let ratio = 2;
  const stage = Object.assign(Object.create(Stage.prototype), {
    camera: new THREE.PerspectiveCamera(42, width / height, .3, 1500),
    pixelRatioCap: 2, fovFixK: 1, videoAspect: 16 / 9,
    renderer: { getPixelRatio: () => ratio, setPixelRatio: (v) => { ratio = v; }, setSize() {} },
    composer: { setPixelRatio() {}, setSize() {} },
    quality: { level: 2, frames: 0, acc: 0 }, time: 5, bloom: { enabled: true },
  });
  stage.resize();
  return stage;
}
test('adaptive quality remains lowered after resize on a high-DPR display', () => {
  const stage = stageFixture(390, 844);
  for (let i = 0; i < 180; i++) stage.watchQuality(1 / 20);
  assert.equal(stage.bloom.enabled, false);
  assert.equal(stage.renderer.getPixelRatio(), 1);
  stage.resize();
  assert.equal(stage.renderer.getPixelRatio(), 1);
});
test('portrait projection keeps both dice rows inside the viewport', () => {
  for (const [w, h] of [[320, 568], [390, 844], [768, 1024], [1440, 900]]) {
    const stage = stageFixture(w, h);
    const c = stage.camera;
    c.fov = stage.fovFor(GAME_CAM.fov);
    c.position.copy(GAME_CAM.pos);
    c.lookAt(GAME_CAM.look);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    for (const x of [-11.1, 11.1]) for (const z of [-3.5, 4.8]) {
      const p = new THREE.Vector3(x, 0.5, z).project(c);
      assert.ok(Math.abs(p.x) < 1, `${w}x${h}: side row clipped at ${p.x}`);
    }
  }
});
