import { evaluateSelection, bestOfRoll, evaluateValues } from '../src/game/scoring.js';
import { rollStats, decide } from '../src/game/ai.js';
import { DICE, rollFace } from '../src/data/dice.js';
const D = (arr) => arr.map(v => (v === 'D' ? { value: 1, joker: true, type: 'devil' } : { value: v, joker: false, type: 'normal' }));
const cases = [
  [[1], 100], [[5], 50], [[1,5], 150], [[2], null], [[1,1,1], 1000], [[2,2,2], 200], [[2,2,2,2], 400], [[2,2,2,2,2,2], 1600],
  [[1,1,1,1], 2000], [[1,2,3,4,5], 500], [[2,3,4,5,6], 750], [[1,2,3,4,5,6], 1500], [[1,2,3,4,5,5], 550], [[2,3,4,5,6,1], 1500],
  [[1,1,5,5,3], null], [['D',5,5], 500], [['D',2,3], null], [['D',5], null], [['D'], null], [['D',2,3,4,5], 750], [['D','D',1], 1000], [['D',1,5], 250],
  [[5,5,5,1,1,1], 1500],
];
let fail = 0;
for (const [vals, exp] of cases) {
  const r = evaluateSelection(D(vals));
  const got = r ? r.score : null;
  if (got !== exp) { fail++; console.log('FAIL', vals, 'got', got, 'exp', exp); }
}
console.log('scoring cases:', cases.length, 'fail:', fail);
console.log('bust [2,3,4,6,6,2]:', bestOfRoll(D([2,3,4,6,6,2])));
console.log('best [1,5,2,2,3,4]:', bestOfRoll(D([1,5,2,2,3,4])).score);
for (let n = 1; n <= 6; n++) { const s = rollStats(new Array(n).fill('normal')); console.log('normal', n, 'pBust', s.pBust.toFixed(3), 'gain', s.gain.toFixed(0), 'pHot', s.pHot.toFixed(3)); }
console.log('loaded x6', rollStats(new Array(6).fill('loaded')));
let t0 = Date.now(); rollStats(['loaded','devil','pie','king','odd','even']); console.log('mixed 6 ms', Date.now() - t0);
// sampling check
const cnt = [0,0,0,0,0,0]; for (let i = 0; i < 60000; i++) cnt[rollFace('pie') - 1]++; console.log('pie freq', cnt.map(c => (c/600).toFixed(1)));
// AI decisions
for (const diff of ['casual','novice','regular','king']) {
  const d = decide({ dice: D([1,5,2,2,3,4]), allTypes: new Array(6).fill('normal'), turn: 0, my: 0, opp: 0, target: 3000, difficulty: diff });
  console.log(diff, 'keep mask', d.mask.toString(2), 'bank', d.bank);
}
console.log('dice count', DICE.length);
for (const diff of ['casual','novice','regular','king']) {
  const d = decide({ dice: D([1,5,2,2,3,6]), allTypes: new Array(6).fill('normal'), turn: 0, my: 0, opp: 0, target: 3000, difficulty: diff });
  console.log('B', diff, 'keep mask', d.mask.toString(2), 'bank', d.bank);
}
// simulate many turns for avg score per difficulty with normal dice
import { bestOfRoll as B } from '../src/game/scoring.js';
function simTurn(diff, types) {
  let avail = types.slice(), turn = 0;
  for (let k = 0; k < 50; k++) {
    const dice = avail.map(t => { const v = rollFace(t); return { value: v, joker: t === 'devil' && v === 1, type: t }; });
    if (!B(dice)) return 0;
    const d = decide({ dice, allTypes: types, turn, my: 0, opp: 0, target: 100000, difficulty: diff });
    const sel = dice.filter((_, i) => d.mask & (1 << i));
    turn += evaluateSelection(sel).score;
    avail = dice.filter((_, i) => !(d.mask & (1 << i))).map(x => x.type);
    if (!avail.length) avail = types.slice();
    if (d.bank) return turn;
  }
  return turn;
}
for (const diff of ['casual','novice','regular','king']) {
  let s = 0; const N = 3000; for (let i = 0; i < N; i++) s += simTurn(diff, new Array(6).fill('normal'));
  console.log('avg turn', diff, (s / N).toFixed(0));
}
let s2 = 0; for (let i = 0; i < 2000; i++) s2 += simTurn('king', ['loaded','fortune','lacquer','aranka','normal','normal']); console.log('king w/ good dice', (s2/2000).toFixed(0));
