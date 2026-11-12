// 多语言自检：node tools/test_i18n.mjs
// 1. 中、英、日三种语言的键一一对应（嵌套的对手、成就、规则表也要对上），每个带参数的文字代进数字都能出完整的一句
// 2. 33 种骰子、4 个对手的每种台词三种语言都有
// 3. 日文里只用日本的汉字（JIS 第一、第二水准；混进简体字就会报出来），中文里只用简体字（GB2312）
// 4. 中日文句子里不用半角标点（, . ! ? : ;），英文里不用直引号当撇号
import assert from 'node:assert/strict';
import { i18n, LANGS, BOOT } from '../src/i18n.js';
import { DICE, dieName, dieHint } from '../src/data/dice.js';
import { lineFor } from '../src/game/lines.js';
import { JA } from '../src/lang/ja.js';

const ids = LANGS.map((l) => l.id);
assert.deepEqual(ids, ['zh', 'en', 'ja']);
const T = Object.fromEntries(ids.map((l) => { i18n.set(l, false); return [l, i18n.t]; }));

// 把一个值能显示出来的文字都收集起来（函数代入几组参数）
const samples = [[0, 0], [1, 2], [2, 1], [6, 12], [1250, 3]];
const parts = [{ k: 'single', v: 1 }, { k: 'single', v: 5 }, { k: 'kind', v: 3, n: 4 }, { k: 'kind', v: 1, n: 3 }, { k: 'straightLow' }, { k: 'straightHigh' }, { k: 'straight6' }];
function texts(v, key, out) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => texts(x, key, out));
  else if (typeof v === 'function') {
    const args = key === 'part' ? parts.map((p) => [p]) : key === 'face' ? [[3, false], [1, true]] : /^log/.test(key) ? [['X', '1 2 3', 150]] : key === 'who' ? [[0], [1]] : key === 'dieOf' ? [['X']] : key === 'tossLog' ? [[true], [false]] : samples;
    for (const a of args) {
      const s = v(...a);
      assert.equal(typeof s, 'string', `${key}(${a}) 应该返回文字`);
      assert.ok(s.length > 0 || key === 'part', `${key}(${a}) 是空的`);
      out.push(s);
    }
  } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) texts(x, k, out);
  return out;
}

// 1. 结构一致
function shape(v) {
  if (typeof v === 'function') return 'fn' + v.length;
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k])]));
  return typeof v;
}
for (const l of ['en', 'ja']) {
  const a = Object.keys(T.zh).sort(), b = Object.keys(T[l]).sort();
  assert.deepEqual(b.filter((k) => !a.includes(k)), [], `${l} 多出来的键`);
  assert.deepEqual(a.filter((k) => !b.includes(k)), [], `${l} 缺的键`);
  for (const k of a) {
    // 规则说明的条数可以不同；其余（对手、成就、得分表）形状要一样
    if (k === 'rulesText') { assert.ok(Array.isArray(T[l][k]) && T[l][k].length >= 6); continue; }
    assert.deepEqual(shape(T[l][k]), shape(T.zh[k]), `${l}.${k} 的结构和中文不一样`);
  }
}
const all = Object.fromEntries(ids.map((l) => [l, texts(T[l], '', [])]));
for (const l of ids) for (const s of all[l]) assert.ok(!/undefined|NaN|\[object|null/.test(s), `${l}: ${s}`);

// 2. 骰子、台词
assert.deepEqual(Object.keys(JA.dice).sort(), DICE.map((d) => d.id).sort(), '日文骰子和骰子表对不上');
for (const d of DICE) for (const l of ids) {
  assert.ok(dieName(d.id, l)?.length > 1, `${l} ${d.id} 没有名字`);
  assert.ok(dieHint(d.id, l)?.length > 4, `${l} ${d.id} 没有说明`);
  all[l].push(dieName(d.id, l), dieHint(d.id, l));
}
const events = ['start', 'oppBig', 'oppBust', 'oppHot', 'youBig', 'youBust', 'youHot', 'youBank', 'win', 'lose', 'slow', 'poke', 'late'];
for (const opp of ['barmaid', 'drinker', 'elder', 'dicer']) {
  for (const ev of events) for (const l of ids) {
    const seen = new Set();
    for (let i = 0; i < 60; i++) seen.add(lineFor(opp, ev, l));
    assert.ok(![...seen].includes(''), `${opp}.${ev} 缺 ${l}`);
    all[l].push(...seen);
  }
  assert.deepEqual(Object.keys(JA.lines[opp]).sort(), [...events].sort(), `日文 ${opp} 的台词种类不全`);
}
for (const l of ids) all[l].push(BOOT[l].title, BOOT[l].text, BOOT[l].doc);

// 3. 字符集：日文只用日本汉字，中文只用简体字
const jis = new Set();
const sjis = new TextDecoder('shift_jis', { fatal: true });
for (let a = 0x81; a <= 0xfc; a++) {
  if (a > 0x9f && a < 0xe0) continue;
  for (let b = 0x40; b <= 0xfc; b++) {
    if (b === 0x7f) continue;
    try { jis.add(sjis.decode(new Uint8Array([a, b]))); } catch (e) { /* 空位 */ }
  }
}
const gb = new Set();
const gbk = new TextDecoder('gbk', { fatal: true });
for (let a = 0xa1; a <= 0xf7; a++) for (let b = 0xa1; b <= 0xfe; b++) {
  try { gb.add(gbk.decode(new Uint8Array([a, b]))); } catch (e) { /* 空位 */ }
}
const han = /[㐀-鿿]/;
// 不在 GB2312 里、但中文里确实要用的字
const zhExtra = new Set([...'斯']);
const bad = { ja: new Set(), zh: new Set() };
for (const s of all.ja) for (const c of s) if ((han.test(c) || /[぀-ヿ]/.test(c)) && !jis.has(c)) bad.ja.add(c);
for (const s of all.zh) for (const c of s) if (han.test(c) && !gb.has(c) && !zhExtra.has(c)) bad.zh.add(c);
for (const s of all.zh) for (const c of s) if (/[぀-ヿ]/.test(c)) bad.zh.add(c);
assert.deepEqual([...bad.ja], [], '日文里混进了不是日本汉字的字（多半是简体字）');
assert.deepEqual([...bad.zh], [], '中文里混进了繁体字、日本汉字或假名');

// 4. 标点：中日文字后面跟半角标点、英文用直引号当撇号
const cjk = '[\\u3040-\\u30ff\\u3400-\\u9fff]';
for (const l of ['zh', 'ja']) for (const s of all[l]) {
  assert.ok(!new RegExp(cjk + '[,.!?:;]').test(s) && !new RegExp('[,!?:;]' + cjk).test(s), `${l} 半角标点：${s}`);
  assert.ok(!/\.\.\./.test(s), `${l} 用 “…” 不用三个句点：${s}`);
}
for (const s of all.en) {
  assert.ok(!/[A-Za-z]'([A-Za-z]|\s|$)/.test(s), `英文撇号要用 ’：${s}`);
  assert.ok(!/ {2}|\s[,.!?;:]/.test(s), `英文多余空格：${s}`);
  assert.ok(!/[぀-ヿ㐀-鿿]/.test(s), `英文里有中日文：${s}`);
}
for (const s of all.ja) assert.ok(!/[㐀-鿿぀-ヿ][！？]\S/.test(s.replace(/[！？][」』）…—！？]/g, '')) || /[！？]　/.test(s), `日文 ！？ 后面接着写要空一格（全角）：${s}`);

console.log(`i18n ok: ${ids.map((l) => `${l} ${all[l].length}`).join(', ')} 条文字`);
