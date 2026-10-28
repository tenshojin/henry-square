// AI 对手：根据难度选择留哪些骰子、何时收分
import { DICE_BY_ID, NORMAL_ID } from '../data/dice.js';
import { allKeeps, bestScoreOfMultiset, evaluateValues } from './scoring.js';

const HOT_BONUS = 350; // 全骰得分后重新投 6 颗的大致期望收益

const statsCache = new Map();
// 给定一组骰子类型，枚举所有结果：爆掉概率、未爆时的平均最高分、全骰得分概率
export function rollStats(types) {
  const key = types.slice().sort().join(',');
  if (statsCache.has(key)) return statsCache.get(key);
  let pBust = 0;
  let gain = 0;
  let pHot = 0;
  const n = types.length;
  const values = [];
  const rec = (i, prob, jokers) => {
    if (i === n) {
      const s = bestScoreOfMultiset(values, jokers);
      if (s === 0) pBust += prob;
      else {
        gain += prob * s;
        if (evaluateValues(values, jokers)) pHot += prob;
      }
      return;
    }
    const d = DICE_BY_ID[types[i]];
    for (let v = 1; v <= 6; v++) {
      const p = d.prob[v - 1];
      if (p <= 0) continue;
      if (d.joker && v === 1) {
        rec(i + 1, prob * p, jokers + 1);
      } else {
        values.push(v);
        rec(i + 1, prob * p, jokers);
        values.pop();
      }
    }
  };
  rec(0, 1, 0);
  const ok = 1 - pBust;
  const res = { pBust, gain: ok > 0 ? gain / ok : 0, pHot: ok > 0 ? pHot / ok : 0 };
  statsCache.set(key, res);
  return res;
}

function normalTypes(n) {
  return new Array(n).fill(NORMAL_ID);
}

// 继续投掷的一步期望（含全骰得分奖励）
function rollEV(turn, stats) {
  const g = stats.gain + stats.pHot * HOT_BONUS;
  return (1 - stats.pBust) * (turn + g);
}
function bankThreshold(stats) {
  const g = stats.gain + stats.pHot * HOT_BONUS;
  if (stats.pBust <= 0.0001) return Infinity;
  return ((1 - stats.pBust) * g) / stats.pBust;
}

/**
 * ctx: {
 *   dice: [{value, joker, type}]   本次投出的骰子
 *   allTypes: [type x6]           该玩家全部 6 颗骰子的类型（全骰得分时重投）
 *   turn, my, opp, target, difficulty
 * }
 * 返回 { mask, bank }
 */
export function decide(ctx) {
  const { dice, allTypes, turn, my, opp, target, difficulty } = ctx;
  const keeps = allKeeps(dice);
  if (!keeps.length) return null;

  const remainingTypes = (mask) => {
    const rem = [];
    dice.forEach((d, i) => { if (!(mask & (1 << i))) rem.push(d.type); });
    return rem.length ? rem : allTypes.slice();
  };
  const need = target - my;

  // 能直接赢就取最高分并收分
  const maxKeep = keeps.reduce((a, b) => (b.score > a.score || (b.score === a.score && b.count > a.count) ? b : a));
  if (turn + maxKeep.score >= need) return { mask: maxKeep.mask, bank: true };

  let chosen;
  if (difficulty === 'casual' || difficulty === 'novice') {
    chosen = maxKeep;
  } else {
    const useReal = difficulty === 'king';
    let bestV = -Infinity;
    for (const k of keeps) {
      const t2 = turn + k.score;
      const rem = remainingTypes(k.mask);
      const st = useReal ? rollStats(rem) : rollStats(normalTypes(rem.length));
      const v = Math.max(t2, rollEV(t2, st)) + k.score * 0.001; // 平局时偏向分高
      if (v > bestV) { bestV = v; chosen = k; }
    }
    // 常客偶尔“手快”，直接拿最高分
    if (difficulty === 'regular' && Math.random() < 0.2) chosen = maxKeep;
  }

  const t2 = turn + chosen.score;
  const rem = remainingTypes(chosen.mask);
  const n = rem.length;
  const hot = n === 6 && dice.length === popc(chosen.mask);

  let threshold;
  if (difficulty === 'casual') {
    threshold = 200 + Math.random() * 300;
    if (hot) threshold = Math.max(threshold, 500);
  } else if (difficulty === 'novice') {
    const T = { 1: 200, 2: 250, 3: 350, 4: 600, 5: 1200, 6: 2500 };
    threshold = T[n] * (0.85 + Math.random() * 0.3);
  } else {
    const st = difficulty === 'king' ? rollStats(rem) : rollStats(normalTypes(n));
    threshold = bankThreshold(st);
    if (difficulty === 'regular') threshold *= 0.9 + Math.random() * 0.2;
    // 局势调整
    const oppNeed = target - opp;
    if (oppNeed <= target * 0.15) {
      // 对手快赢了：要么一口气追上，要么尽量多拿
      threshold = Math.max(threshold, Math.min(need, need * 0.75 + 200));
    } else if (my - opp > target * 0.35) {
      threshold *= 0.8; // 大幅领先时保守
    } else if (opp - my > target * 0.35) {
      threshold *= 1.25; // 大幅落后时激进
    }
  }
  const bank = t2 >= threshold;
  return { mask: chosen.mask, bank };
}

function popc(m) {
  let c = 0;
  while (m) { c += m & 1; m >>= 1; }
  return c;
}
