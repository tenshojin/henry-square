// 中英双语文本
const STR = {
  zh: {
    title: '亨利广场',
    titleSub: 'HENRY SQUARE',
    tagline: '所有，或者一无所有',
    enter: '推门而入',
    loading: '正在摆桌……',
    skip: '跳过 ›',
    langBtn: 'EN',
    chooseDiff: '挑选你的对手',
    start: '入座开局',
    rules: '计分规则',
    codex: '骰子图鉴',
    back: '返回',
    close: '合上',
    targetN: (n) => `先到 ${n} 分者胜`,
    diff: {
      casual: { name: '休闲', who: '忙里偷闲的女店员', desc: '端完这盘酒，陪你随手掷两把' },
      novice: { name: '新手', who: '贪杯的游侠', desc: '刚学会规矩，还算谨慎' },
      regular: { name: '酒馆常客', who: '白胡子老酒客', desc: '精于算计，从不手软' },
      king: { name: '斯卡利茨骰子王', who: '传说中的骰子王', desc: '据说从没输过一局' },
    },
    fateTitle: '命运之骰',
    fateSub: '每枚骰子都有一半机会被命运替换。逐一决定：换，还是不换？选定后直到本局结束都不会再变。',
    fateNone: '命运今晚没有眷顾你——六枚都是普通骰子。',
    slot: (i) => `第 ${i} 枚`,
    keepNormal: '保留普通',
    transform: '换成它',
    normalDie: '普通骰子',
    confirm: '就这么定了',
    oppDie: '对手的骰子',
    keySpace: '空格',
    keyEnter: '回车',
    target: '目标',
    you: '你',
    opponent: '对手',
    turnScore: '本回合',
    selected: '所选',
    invalid: '所选骰子无法全部计分',
    pickHint: '点击骰子挑出计分组合',
    roll: '掷骰',
    rollAgain: '留下并再掷',
    rollAll: '留下并重掷六枚',
    bank: '收分过手',
    yourTurn: '你的回合',
    oppTurn: '对手的回合',
    firstYou: '掷币定先手：你先来',
    firstOpp: '掷币定先手：对手先来',
    bust: '一无所获！',
    bustSub: '本回合分数全部作废',
    hot: '全骰得分！',
    hotSub: '六枚骰子全部收回，可以再掷',
    big: '好一手！',
    banked: (n) => `收下 ${n} 分`,
    oppKeeps: (n) => `对手留下 ${n} 分`,
    oppBanks: (n) => `对手收下 ${n} 分`,
    oppRolls: '对手继续掷骰……',
    thinking: '对手在盘算……',
    win: '你赢了！',
    lose: '你输了',
    winSub: '酒馆里的人都在为你举杯。',
    loseSub: '今晚的骰子不站在你这边。',
    again: '再来一局',
    menu: '回到菜单',
    music: '音乐',
    sound: '音效',
    on: '开',
    off: '关',
    log: '牌局记录',
    jokerNote: '恶魔面',
    rulesBody: [
      ['单个 1', '100'],
      ['单个 5', '50'],
      ['三个 1', '1000'],
      ['三个 2 / 3 / 4 / 5 / 6', '点数 × 100'],
      ['四个 / 五个 / 六个相同', '三个的分数 × 2 / × 4 / × 8'],
      ['小顺 1-2-3-4-5', '500'],
      ['大顺 2-3-4-5-6', '750'],
      ['全顺 1-2-3-4-5-6', '1500'],
    ],
    rulesText: [
      '轮流掷骰。每次掷出后，至少要挑出一组计分骰子放到一边，且挑出的每一枚都必须参与计分。',
      '组合只在同一次投掷内有效，不能和之前留下的骰子拼凑。',
      '之后可以「收分过手」把本回合分数存入总分，或用剩下的骰子「再掷」继续累积。',
      '如果一次投掷里没有任何计分骰子——一无所获，本回合累积的分数全部作废。',
      '六枚骰子全部计分后，可以把六枚全收回来继续掷。',
      '魔鬼骰子的恶魔面是万能面，可当任意点数，但必须和至少两枚其他骰子一起组成得分组合。',
      '天国骰子的神圣 6 面只能当作 6。',
      '先达到目标分数者获胜。',
    ],
    part: (p) => {
      if (p.k === 'single') return p.v === 1 ? '单1' : '单5';
      if (p.k === 'kind') return `${['', '', '', '三', '四', '五', '六'][p.n]}个${p.v}`;
      if (p.k === 'straightLow') return '小顺';
      if (p.k === 'straightHigh') return '大顺';
      if (p.k === 'straight6') return '全顺';
      return '';
    },
    codexHint: '把鼠标移到骰子上可以查看它的脾气。',
    dieOf: (name) => name,
    keptLabel: '已留',
    score: '分',
    who: (i) => (i === 0 ? '你' : '对手'),
    face: (v, joker) => (joker ? '魔' : String(v)),
    logRoll: (w, vals) => `${w}掷出 ${vals}`,
    logKeep: (w, desc, n) => `${w}留下 ${desc}（${n}）`,
    logBank: (w, n) => `${w}收下 ${n} 分`,
    logBust: (w) => `${w}一无所获`,
    logHot: (w) => `${w}全骰得分，重掷六枚`,
    jokerTip: '恶魔面：与至少两枚其他骰子同选时可当任意点数',
    faceNow: (v) => `当前点数：${v}`,
  },
  en: {
    title: 'Henry Square',
    titleSub: 'A TAVERN GAME OF DICE',
    tagline: 'All, or nothing.',
    enter: 'Step Inside',
    loading: 'Setting the table…',
    skip: 'Skip ›',
    langBtn: '中文',
    chooseDiff: 'Choose Your Opponent',
    start: 'Take a Seat',
    rules: 'Scoring',
    codex: 'Dice Codex',
    back: 'Back',
    close: 'Close',
    targetN: (n) => `First to ${n} wins`,
    diff: {
      casual: { name: 'Casual', who: 'The barmaid on her break', desc: 'Throws for fun between rounds of ale' },
      novice: { name: 'Novice', who: 'A thirsty ranger', desc: 'Knows the rules, plays it safe' },
      regular: { name: 'Tavern Regular', who: 'The white-bearded regular', desc: 'Calculating and merciless' },
      king: { name: 'Dice King of Skalitz', who: 'The legend himself', desc: 'Said never to have lost a game' },
    },
    fateTitle: 'Dice of Fate',
    fateSub: 'Each die has an even chance to be offered a special replacement. Decide one by one: swap it or keep it? Your choice holds until the game ends.',
    fateNone: 'Fate passed you by tonight — all six are common dice.',
    slot: (i) => `Die ${i}`,
    keepNormal: 'Keep',
    transform: 'Swap',
    normalDie: 'Common Die',
    confirm: 'So be it',
    oppDie: "Opponent's die",
    keySpace: 'Space',
    keyEnter: 'Enter',
    target: 'Target',
    you: 'You',
    opponent: 'Opponent',
    turnScore: 'This turn',
    selected: 'Selected',
    invalid: 'Every selected die must score',
    pickHint: 'Click dice to set aside a scoring combo',
    roll: 'Roll',
    rollAgain: 'Keep & Roll',
    rollAll: 'Keep & Roll all six',
    bank: 'Bank & Pass',
    yourTurn: 'Your Turn',
    oppTurn: "Opponent's Turn",
    firstYou: 'Coin toss: you go first',
    firstOpp: 'Coin toss: opponent goes first',
    bust: 'Bust!',
    bustSub: 'All points this turn are lost',
    hot: 'Hot Dice!',
    hotSub: 'All six dice come back — roll again',
    big: 'What a Throw!',
    banked: (n) => `Banked ${n}`,
    oppKeeps: (n) => `Opponent keeps ${n}`,
    oppBanks: (n) => `Opponent banks ${n}`,
    oppRolls: 'Opponent rolls again…',
    thinking: 'Opponent is thinking…',
    win: 'Victory!',
    lose: 'Defeat',
    winSub: 'The whole tavern raises a cup to you.',
    loseSub: 'The dice were not on your side tonight.',
    again: 'Play Again',
    menu: 'Main Menu',
    music: 'Music',
    sound: 'Sound',
    on: 'On',
    off: 'Off',
    log: 'Game Log',
    jokerNote: 'Devil face',
    rulesBody: [
      ['Single 1', '100'],
      ['Single 5', '50'],
      ['Three 1s', '1000'],
      ['Three 2s / 3s / 4s / 5s / 6s', 'face × 100'],
      ['Four / five / six of a kind', 'three-of-a-kind × 2 / × 4 / × 8'],
      ['Small straight 1-2-3-4-5', '500'],
      ['Large straight 2-3-4-5-6', '750'],
      ['Full straight 1-2-3-4-5-6', '1500'],
    ],
    rulesText: [
      'Players take turns. After each throw you must set aside at least one scoring combo, and every die you set aside must score.',
      'Combos only count within a single throw — you cannot combine them with dice kept earlier.',
      'Then either Bank your turn points into your total, or Roll the remaining dice to build them higher.',
      'If a throw contains no scoring dice at all, you bust and lose every point gathered that turn.',
      'If all six dice have scored, you may pick all six up and keep rolling.',
      "The Devil's Die face is wild: it can be any number, but only in a combo with at least two other dice.",
      "The Heavenly Die's holy 6 always counts as a 6.",
      'The first to reach the target score wins.',
    ],
    part: (p) => {
      if (p.k === 'single') return p.v === 1 ? 'single 1' : 'single 5';
      if (p.k === 'kind') return `${['', '', '', 'three', 'four', 'five', 'six'][p.n]} ${p.v}s`;
      if (p.k === 'straightLow') return 'small straight';
      if (p.k === 'straightHigh') return 'large straight';
      if (p.k === 'straight6') return 'full straight';
      return '';
    },
    codexHint: 'Hover over a die to learn its temper.',
    dieOf: (name) => name,
    keptLabel: 'Kept',
    score: 'pts',
    who: (i) => (i === 0 ? 'You' : 'Opponent'),
    face: (v, joker) => (joker ? 'D' : String(v)),
    logRoll: (w, vals) => `${w} rolled ${vals}`,
    logKeep: (w, desc, n) => `${w} kept ${desc} (${n})`,
    logBank: (w, n) => `${w} banked ${n}`,
    logBust: (w) => `${w} busted`,
    logHot: (w) => `${w}: hot dice, all six again`,
    jokerTip: 'Devil face: wild when chosen with at least two other dice',
    faceNow: (v) => `Showing: ${v}`,
  },
};

let lang = 'zh';
try {
  const saved = localStorage.getItem('tavern-dice-lang');
  if (saved === 'en' || saved === 'zh') lang = saved;
} catch (e) {
  /* 无法使用本地存储时用默认中文 */
}
const listeners = new Set();

export const VERSION = 'v3.2.1';

export const i18n = {
  get lang() {
    return lang;
  },
  get t() {
    return STR[lang];
  },
  set(l) {
    lang = l;
    try {
      localStorage.setItem('tavern-dice-lang', l);
    } catch (e) {
      /* ignore */
    }
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
    listeners.forEach((fn) => fn(l));
  },
  toggle() {
    this.set(lang === 'zh' ? 'en' : 'zh');
  },
  onChange(fn) {
    listeners.add(fn);
  },
};
