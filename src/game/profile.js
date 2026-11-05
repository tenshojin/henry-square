// 玩家档案：战绩、最好成绩、成就、新手提示看过没有。存在浏览器本地；存不了（隐私模式、file:// 受限）时只在这一次打开有效
const KEY = 'henry-tavern-profile';
const blank = () => ({
  wins: { casual: 0, novice: 0, regular: 0, king: 0 },
  losses: { casual: 0, novice: 0, regular: 0, king: 0 },
  streak: 0,
  bestStreak: 0,
  bestThrow: 0,
  bestTurn: 0,
  busts: 0,
  hots: 0,
  diceUsed: {},
  sips: 0,
  ach: {},
  tips: {},
  music: true,
  sound: true,
});

function load() {
  const p = blank();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) {
      for (const k of Object.keys(p)) if (raw[k] !== undefined) p[k] = typeof p[k] === 'object' ? { ...p[k], ...raw[k] } : raw[k];
    }
  } catch (e) {
    /* 读不到就当新玩家 */
  }
  return p;
}

export const profile = load();

export function saveProfile() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch (e) {
    /* 存不了也不影响玩 */
  }
}

// 成就：check(m, p)：m 是这一局的统计（game.js 的 matchStats），p 是档案。有的成就在对应事件发生时直接点亮
export const ACHIEVEMENTS = [
  { id: 'firstWin', emblem: 'mug' },
  { id: 'beatNovice', emblem: 'candle' },
  { id: 'beatRegular', emblem: 'sword' },
  { id: 'beatKing', emblem: 'crown' },
  { id: 'hotDice', emblem: 'star' },
  { id: 'bigThrow', emblem: 'die' },
  { id: 'greed', emblem: 'H' },
  { id: 'comeback', emblem: 'sword' },
  { id: 'streak3', emblem: 'star' },
  { id: 'collector', emblem: 'die' },
  { id: 'drunk', emblem: 'mug' },
  { id: 'darkness', emblem: 'candle' },
];

export function unlock(id) {
  if (profile.ach[id]) return false;
  profile.ach[id] = Date.now();
  saveProfile();
  return true;
}

// 新手提示：每条只看一次
export function firstTime(id) {
  if (profile.tips[id]) return false;
  profile.tips[id] = 1;
  saveProfile();
  return true;
}
