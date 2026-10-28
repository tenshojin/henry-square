// 计分规则（传统 Farkle 式）
// 单个1=100，单个5=50；三个相同：1→1000，其余→点数×100；每多一个相同，分数翻倍
// 小顺1-5=500，大顺2-6=750，全顺1-6=1500
// 选中的每一颗骰子都必须参与计分。魔鬼骰子的恶魔面（出1）为万能面，需与至少2颗其他骰子同选。

const BASE3 = [0, 1000, 200, 300, 400, 500, 600];
const memo = new Map();

// c: 长度7的计数数组（下标1..6），返回 {score, parts} 或 null（有骰子无法计分）
function bestCounts(c) {
  const key = c.join(',');
  if (memo.has(key)) return memo.get(key);
  let total = 0;
  for (let v = 1; v <= 6; v++) total += c[v];
  let res = null;
  if (total === 0) {
    res = { score: 0, parts: [] };
  } else {
    const consider = (gain, part, next) => {
      const r = bestCounts(next);
      if (!r) return;
      const s = gain + r.score;
      if (!res || s > res.score) res = { score: s, parts: [part, ...r.parts] };
    };
    const has = (vals) => vals.every((v) => c[v] >= 1);
    const minus = (vals) => {
      const n = c.slice();
      for (const v of vals) n[v]--;
      return n;
    };
    if (has([1, 2, 3, 4, 5, 6])) consider(1500, { k: 'straight6', s: 1500 }, minus([1, 2, 3, 4, 5, 6]));
    if (has([1, 2, 3, 4, 5])) consider(500, { k: 'straightLow', s: 500 }, minus([1, 2, 3, 4, 5]));
    if (has([2, 3, 4, 5, 6])) consider(750, { k: 'straightHigh', s: 750 }, minus([2, 3, 4, 5, 6]));
    for (let v = 1; v <= 6; v++) {
      for (let n = 3; n <= c[v]; n++) {
        const s = BASE3[v] * Math.pow(2, n - 3);
        const next = c.slice();
        next[v] -= n;
        consider(s, { k: 'kind', v, n, s }, next);
      }
    }
    if (c[1] >= 1) consider(100, { k: 'single', v: 1, s: 100 }, minus([1]));
    if (c[5] >= 1) consider(50, { k: 'single', v: 5, s: 50 }, minus([5]));
  }
  memo.set(key, res);
  return res;
}

// 万能面的取值组合（可重复组合）
function multisets(k) {
  const out = [];
  const rec = (start, acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let v = start; v <= 6; v++) { acc.push(v); rec(v, acc); acc.pop(); }
  };
  rec(1, []);
  return out;
}
const multisetCache = [];
function jokerAssignments(k) {
  if (!multisetCache[k]) multisetCache[k] = multisets(k);
  return multisetCache[k];
}

const evalMemo = new Map();
// values: 非万能面的点数数组；jokers: 万能面数量
export function evaluateValues(values, jokers = 0) {
  const total = values.length + jokers;
  if (total === 0) return null;
  if (jokers > 0 && total < 3) return null;
  const sorted = values.slice().sort();
  const key = sorted.join('') + '|' + jokers;
  if (evalMemo.has(key)) return evalMemo.get(key);
  const base = [0, 0, 0, 0, 0, 0, 0];
  for (const v of values) base[v]++;
  let best = null;
  if (jokers === 0) {
    best = bestCounts(base);
  } else {
    for (const asg of jokerAssignments(jokers)) {
      const c = base.slice();
      for (const v of asg) c[v]++;
      const r = bestCounts(c);
      if (r && (!best || r.score > best.score)) best = { score: r.score, parts: r.parts, joker: asg };
    }
  }
  if (best && best.score <= 0) best = null;
  evalMemo.set(key, best);
  return best;
}

// dice: [{value, joker}]（joker = 魔鬼骰子的恶魔面）
export function evaluateSelection(dice) {
  const vals = [];
  let j = 0;
  for (const d of dice) {
    if (d.joker) j++;
    else vals.push(d.value);
  }
  return evaluateValues(vals, j);
}

// 返回整把投掷里的最高分组合 {score, mask, parts}，无则 null（爆掉）
export function bestOfRoll(dice) {
  const n = dice.length;
  let best = null;
  for (let mask = 1; mask < 1 << n; mask++) {
    const sel = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sel.push(dice[i]);
    const r = evaluateSelection(sel);
    if (r && (!best || r.score > best.score || (r.score === best.score && popcount(mask) < popcount(best.mask)))) {
      best = { score: r.score, mask, parts: r.parts };
    }
  }
  return best;
}

// 所有合法的留骰组合
export function allKeeps(dice) {
  const n = dice.length;
  const out = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    const sel = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sel.push(dice[i]);
    const r = evaluateSelection(sel);
    if (r) out.push({ mask, score: r.score, count: sel.length, parts: r.parts });
  }
  return out;
}

export function popcount(m) {
  let c = 0;
  while (m) { c += m & 1; m >>= 1; }
  return c;
}

// 仅按点数多重集计算“这把最多能得多少”，供 AI 概率枚举使用
const rollBestMemo = new Map();
export function bestScoreOfMultiset(values, jokers) {
  const sorted = values.slice().sort();
  const key = sorted.join('') + '|' + jokers;
  if (rollBestMemo.has(key)) return rollBestMemo.get(key);
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const v of values) c[v]++;
  let best = 0;
  // 枚举子多重集
  const rec = (v, picked, pickedCount) => {
    if (v > 6) {
      for (let j = 0; j <= jokers; j++) {
        if (pickedCount + j === 0) continue;
        const r = evaluateValues(picked, j);
        if (r && r.score > best) best = r.score;
      }
      return;
    }
    for (let k = 0; k <= c[v]; k++) {
      for (let t = 0; t < k; t++) picked.push(v);
      rec(v + 1, picked, pickedCount + k);
      for (let t = 0; t < k; t++) picked.pop();
    }
  };
  rec(1, [], 0);
  rollBestMemo.set(key, best);
  return best;
}

export function describeParts(parts, t) {
  return parts.map((p) => t.part(p)).join(' + ');
}
