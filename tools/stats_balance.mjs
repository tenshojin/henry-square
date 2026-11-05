// 难度平衡：用一个“会玩的普通玩家”（常客的策略、六枚普通骰子）和各档对手打很多局，看胜率和回合数
import { decide } from '../src/game/ai.js';
import { bestOfRoll } from '../src/game/scoring.js';
import { DICE_BY_ID, NORMAL_ID, rollFace, randomSpecial, pickBestWeighted } from '../src/data/dice.js';
import { TARGETS } from '../src/game/game.js';
globalThis.window ??= { innerWidth: 1280, innerHeight: 720 };

const aiDice = (diff) => {
  if (diff === 'casual') return [];
  if (diff === 'novice') return Math.random() < 0.65 ? [randomSpecial()] : [];
  if (diff === 'regular') {
    const n = Math.random() < 0.5 ? 2 : 3;
    const out = [];
    while (out.length < n) {
      const id = randomSpecial();
      if (!out.includes(id)) out.push(id);
    }
    return out;
  }
  return pickBestWeighted(4 + Math.floor(Math.random() * 3));
};

function turn(types, my, opp, target, difficulty) {
  let t = 0;
  let pool = types.slice();
  for (;;) {
    const dice = pool.map((type) => {
      const value = rollFace(type);
      return { value, joker: !!DICE_BY_ID[type].joker && value === 1, type };
    });
    if (!bestOfRoll(dice)) return 0;
    const d = decide({ dice, allTypes: types, turn: t, my, opp, target, difficulty });
    const kept = dice.filter((_, i) => d.mask & (1 << i));
    const b = bestOfRoll(kept);
    t += b ? b.score : 0;
    if (d.bank) return t;
    pool = dice.filter((_, i) => !(d.mask & (1 << i))).map((x) => x.type);
    if (!pool.length) pool = types.slice();
  }
}

const N = Number(process.argv[2] || 1500);
for (const diff of ['casual', 'novice', 'regular', 'king']) {
  let wins = 0;
  let turns = 0;
  for (let g = 0; g < N; g++) {
    const mine = Array.from({ length: Number(process.argv[3] || 0) }, () => randomSpecial());
    const you = [...mine, ...new Array(6 - mine.length).fill(NORMAL_ID)];
    const sp = aiDice(diff);
    const ai = [...sp, ...new Array(6 - sp.length).fill(NORMAL_ID)];
    const target = TARGETS[diff];
    const score = [0, 0];
    let cur = g % 2;
    for (;;) {
      turns++;
      score[cur] += turn(cur === 0 ? you : ai, score[cur], score[1 - cur], target, cur === 0 ? 'regular' : diff);
      if (score[cur] >= target) break;
      cur = 1 - cur;
    }
    if (cur === 0) wins++;
  }
  console.log(diff.padEnd(8), 'target', String(TARGETS[diff]).padStart(5), '普通玩家胜率', ((wins / N) * 100).toFixed(1) + '%', '平均每人回合', (turns / N / 2).toFixed(1));
}
