import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { allowsGameShortcut } from '../src/game/input.js';
import { waitForMedia, playMedia } from '../src/render/media.js';
import { Stage, GAME_CAM } from '../src/render/stage.js';
import { COIN_STACKS, LOOSE_COINS, NEUTRAL_COIN_SPOT, TOSS_SCALE } from '../src/render/coinLayout.js';
import { G_R, COIN_METALS } from '../src/render/groschen.js';
import { Game } from '../src/game/game.js';

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

test('the neutral coin clears the tray, dice rows, cups and money piles', () => {
  const marker = NEUTRAL_COIN_SPOT;
  const radius = G_R * TOSS_SCALE * 1.03;
  assert.ok(Math.abs(marker.x) - radius > 8.9, 'marker overlaps tray');
  for (const item of [...COIN_STACKS, ...LOOSE_COINS]) {
    assert.ok(Math.hypot(marker.x - item.x, marker.z - item.z) > radius + G_R * COIN_METALS[item.metal].size + .1, 'marker overlaps another coin');
  }
  for (let slot = 0; slot < 6; slot++) {
    assert.ok(Math.hypot(marker.x + 10.6, marker.z - (4.15 - slot * 1.38)) > radius + Math.SQRT1_2 + 1.4, 'marker must have a visible gap beside waiting dice');
  }
  for (const [x, z] of [[11.6, 7.4], [-11.6, -7.4]]) {
    assert.ok(Math.hypot(marker.x - x, marker.z - z) > radius + 2.4, 'marker overlaps a cup');
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
test('portrait projection keeps dice rows and the neutral coin inside the viewport', () => {
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
    for (const wobble of [-.25, .25]) {
      c.position.x = wobble;
      c.lookAt(GAME_CAM.look);
      c.updateMatrixWorld();
      for (let i = 0; i < 32; i++) {
        const angle = i * Math.PI / 16, radius = G_R * TOSS_SCALE * 1.03;
        const p = new THREE.Vector3(NEUTRAL_COIN_SPOT.x + Math.cos(angle) * radius, -.2, NEUTRAL_COIN_SPOT.z + Math.sin(angle) * radius).project(c);
        assert.ok(Math.abs(p.x) < .94, `${w}x${h}: neutral coin lacks viewport margin at ${p.x}`);
      }
    }
  }
});

test('both players get the correct score moment at bust, 1000 and 2000, without changing scoring', async () => {
  for (const pi of [0, 1]) for (const [values, score, kind] of [
    [[2, 3, 4, 6, 2, 3], 0, 'bust'],
    [[6, 6, 6], 600, null],
    [[1, 1, 1], 1000, 'high'],
    [[1, 1, 1, 1], 2000, 'high'],
  ]) {
    const moments = [], sounds = [], delays = [];
    const dice = values.map(value => ({ value, typeId: 'normal', isJoker: false }));
    const players = [0, 1].map(idx => ({ idx, score: 0, kept: 0, dice: idx === pi ? dice : [] }));
    const choice = async () => ({ mask: (1 << dice.length) - 1, bank: true });
    const game = Object.assign(Object.create(Game.prototype), {
      players, target: 99999,
      ui: { banner() {}, renderHud() {}, updateHud: p => p.onRoll?.(), scoreMoment: (...args) => moments.push(args) },
      audio: { groan: () => sounds.push('groan'), sting() {}, cheer: big => sounds.push(big ? 'big-cheer' : 'cheer'), coins() {} },
      wait: async s => delays.push(s), throwDice: async () => {}, moveToRow: async () => {},
      humanChoose: choice, aiChoose: choice, check() {}, log() {}, popAt() {},
    });
    assert.equal(await game.playTurn(pi, 1), 'next');
    assert.equal(players[pi].score, score);
    assert.deepEqual(moments, kind ? [[kind, score, pi]] : []);
    assert.deepEqual(sounds, kind === 'bust' ? ['groan'] : score >= 2000 ? ['big-cheer'] : score >= 1000 ? ['cheer'] : []);
    if (kind === 'high') assert.ok(delays.includes(1.9), 'AI must leave time to read the score before banking');
    assert.equal(game.turn, 0);
  }
});
