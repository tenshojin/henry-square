// 骰子数据：出目概率（出1~出6，单位%）、得分率、模糊提示、外观风格
// 概率来自用户提供的数据表；带*的普通骰子与普通骰子相同，不进入特殊骰子池。

export const NORMAL_ID = 'normal';

// style 字段由 render/diceFaces.js 解释
const S = (o) => o;

export const DICE = [
  {
    id: 'normal', zh: '普通骰子', en: 'Common Die',
    p: [16.7, 16.7, 16.7, 16.7, 16.7, 16.7], rate: 33.4,
    hintZh: '平平无奇的骨制骰子，每一面机会均等。', hintEn: 'A plain bone die. Every face is equally likely.',
    style: S({ base: 'bone', c1: '#ebe0c8', c2: '#c9b48e', pip: 'dot', pipColor: '#2a1d14', geo: { r: 0.13 }, mat: { roughness: 0.55 } }),
  },
  {
    id: 'loaded', zh: '灌铅骰子', en: 'Loaded Die',
    p: [66.7, 6.7, 6.7, 6.7, 6.7, 6.7], rate: 73.4,
    hintZh: '里面灌了铅，沉甸甸的——大概率出 1。', hintEn: 'Filled with lead and heavy in the hand. Very likely to land on 1.',
    style: S({ base: 'metal', c1: '#6a6e72', c2: '#3b3e42', pip: 'dot', pipColor: '#141414', special: { 1: 'bigdot' }, overlay: ['scratches'], geo: { r: 0.08 }, mat: { metalness: 0.85, roughness: 0.5 } }),
  },
  {
    id: 'pie', zh: '派骰子', en: 'Pie Die',
    p: [46.2, 7.7, 23.1, 23.1, 0, 0], rate: 46.2,
    hintZh: '像块烤得金黄的馅饼。常出 1，偶尔出 3 或 4，从不出 5 和 6。', hintEn: 'Looks like a golden baked pie. Often a 1, sometimes 3 or 4, never 5 or 6.',
    style: S({ base: 'pastry', c1: '#dca95a', c2: '#a5662a', pip: 'berry', pipColor: '#7a1530', overlay: ['crumbs'], geo: { r: 0.24 }, mat: { roughness: 0.85 } }),
  },
  {
    id: 'friar', zh: '修士的骰子', en: "Friar's Die",
    p: [40, 40, 5, 5, 5, 5], rate: 45.0,
    hintZh: '修道院里流出来的木骰子，多半出 1 或 2。', hintEn: 'A wooden die from a monastery. Mostly lands on 1 or 2.',
    style: S({ base: 'wood', c1: '#6e4b2e', c2: '#45301d', pip: 'cross', pipColor: '#ecdcb2', special: { 1: 'cross' }, geo: { r: 0.12 }, mat: { roughness: 0.7 } }),
  },
  {
    id: 'heaven', zh: '天国骰子', en: 'Heavenly Die',
    p: [36.8, 10.5, 10.5, 10.5, 10.5, 21.1], rate: 47.3,
    hintZh: '洁白如圣坛。偏爱 1；镶金的神圣 6 面也常出现（只能当 6 用）。', hintEn: 'White as an altar. Favours 1; its gilded holy 6 also shows often (it only counts as 6).',
    style: S({ base: 'marble', c1: '#f6f2ea', c2: '#cfc5b0', pip: 'dot', pipColor: '#b0832a', pipMetal: true, trim: '#c9a03c', special: { 6: 'holy6' }, geo: { r: 0.12, corners: 'gold' }, mat: { roughness: 0.3, clearcoat: 0.6 } }),
  },
  {
    id: 'fortune', zh: '好运骰子', en: 'Fortune Die',
    p: [33.3, 0, 5.6, 5.6, 33.3, 22.2], rate: 66.6,
    hintZh: '翠绿漆面配金色三叶草。常出 1 和 5，也爱出 6，从不出 2。', hintEn: 'Green lacquer with a golden clover. Often 1 or 5, likes 6 too, never 2.',
    style: S({ base: 'lacquer', c1: '#22643e', c2: '#123d25', pip: 'dot', pipColor: '#e6c766', pipMetal: true, trim: '#d4b25a', special: { 1: 'clover' }, geo: { r: 0.13 }, mat: { roughness: 0.25, clearcoat: 0.9 } }),
  },
  {
    id: 'aranka', zh: '阿兰卡的骰子', en: "Aranka's Die",
    p: [28.6, 4.8, 28.6, 4.8, 28.6, 4.8], rate: 57.2,
    hintZh: '画满小花的姑娘骰子，几乎只出奇数：1、3、5。', hintEn: "A maiden's die painted with flowers. Lands almost only on odd numbers: 1, 3, 5.",
    style: S({ base: 'painted', c1: '#f3e6d2', c2: '#d9c3a3', pip: 'dot', pipColor: '#b02b4a', trim: '#b02b4a', overlay: ['flowers'], geo: { r: 0.14 }, mat: { roughness: 0.45, clearcoat: 0.3 } }),
  },
  {
    id: 'tengri', zh: '腾格里骰子', en: "Tengri's Die",
    p: [28.6, 14.3, 14.3, 14.3, 14.3, 14.3], rate: 42.9,
    hintZh: '草原上供奉长生天的蓝骰子，稍微偏向 1。', hintEn: 'A sky-blue die of the steppe god. Slightly favours 1.',
    style: S({ base: 'lacquer', c1: '#2f64a6', c2: '#1b3c6b', pip: 'dot', pipColor: '#f0d27a', pipMetal: true, trim: '#e0c069', special: { 1: 'sun' }, overlay: ['runes'], geo: { r: 0.12 }, mat: { roughness: 0.3, clearcoat: 0.7 } }),
  },
  {
    id: 'lucky', zh: '幸运骰子', en: 'Lucky Die',
    p: [27.3, 4.6, 9.1, 13.6, 18.2, 27.3], rate: 45.5,
    hintZh: '刻着马蹄铁。点数越大越常见，1 也常出，2 很少。', hintEn: 'Carved with a horseshoe. Higher faces are more common, 1 shows often, 2 rarely.',
    style: S({ base: 'bone', c1: '#f0e7d3', c2: '#cdb894', pip: 'dot', pipColor: '#a3171d', special: { 1: 'horseshoe' }, geo: { r: 0.13 }, mat: { roughness: 0.5 } }),
  },
  {
    id: 'odd', zh: '奇数骰子', en: 'Odd Die',
    p: [26.7, 6.7, 26.7, 6.7, 26.7, 6.7], rate: 53.4,
    hintZh: '奇数面涂成了红色——它偏爱奇数。', hintEn: 'Its odd faces are painted red, and it favours odd numbers.',
    style: S({ base: 'bone', c1: '#ece4d1', c2: '#c8b48f', pip: 'dot', pipColor: '#231a12', pipColors: { 1: '#b3261e', 3: '#b3261e', 5: '#b3261e' }, faceTint: { 1: '#f0d0c4', 3: '#f0d0c4', 5: '#f0d0c4' }, geo: { r: 0.13 }, mat: { roughness: 0.5 } }),
  },
  {
    id: 'greaser', zh: '悲伤格雷泽的骰子', en: "Sad Greaser's Die",
    p: [26.1, 26.1, 4.4, 4.4, 26.1, 13.0], rate: 52.2,
    hintZh: '油乎乎、愁眉苦脸。常出 1、2、5，很少出 3 和 4。', hintEn: 'Greasy and gloomy. Often 1, 2 or 5; rarely 3 or 4.',
    style: S({ base: 'grime', c1: '#6e5a3c', c2: '#3d2f1d', pip: 'dot', pipColor: '#1a120a', special: { 1: 'sadface' }, geo: { r: 0.14 }, mat: { roughness: 0.3, clearcoat: 0.5 } }),
  },
  {
    id: 'pearl', zh: '粉色珍珠母骰子', en: 'Pink Mother-of-Pearl Die',
    p: [25, 8.3, 8.3, 8.3, 25, 25], rate: 50.0,
    hintZh: '珍珠母贝磨成，泛着虹彩。偏爱 1、5、6。', hintEn: 'Carved from shimmering nacre. Favours 1, 5 and 6.',
    style: S({ base: 'pearl', c1: '#f7d8e2', c2: '#e6b1c4', pip: 'dot', pipColor: '#7e3f58', geo: { r: 0.15 }, mat: { roughness: 0.22, clearcoat: 1, iridescence: 1, sheen: 0.6 } }),
  },
  {
    id: 'strip', zh: '脱衣骰子', en: 'Strip Die',
    p: [25, 12.5, 12.5, 12.5, 18.8, 18.8], rate: 43.8,
    hintZh: '镶着蕾丝花边的轻佻骰子，稍偏向 1，5 和 6 也不少。', hintEn: 'A cheeky die trimmed with lace. Leans a little toward 1, with 5 and 6 fairly common.',
    style: S({ base: 'bone', c1: '#f3d7c6', c2: '#d9ab93', pip: 'heart', pipColor: '#b0243a', special: { 1: 'heart' }, overlay: ['lace'], geo: { r: 0.15 }, mat: { roughness: 0.45, sheen: 0.4 } }),
  },
  {
    id: 'unbalanced', zh: '失衡骰子', en: 'Unbalanced Die',
    p: [25, 33.3, 8.3, 8.3, 16.7, 8.3], rate: 41.7,
    hintZh: '削得歪歪扭扭。最爱出 2，其次是 1。', hintEn: 'Whittled lopsided. Favours 2, then 1.',
    style: S({ base: 'wood', c1: '#9c7c54', c2: '#6c5034', pip: 'dot', pipColor: '#2b1c10', geo: { r: 0.12, distort: 0.075 }, mat: { roughness: 0.8 } }),
  },
  {
    id: 'cheater', zh: '谨慎骗子的骰子', en: "Cautious Cheater's Die",
    p: [23.8, 14.3, 9.5, 14.3, 23.8, 14.3], rate: 47.6,
    hintZh: '看上去和普通骰子一模一样，却不动声色地偏向 1 和 5。', hintEn: 'Looks just like a common die, yet quietly favours 1 and 5.',
    style: S({ base: 'bone', c1: '#e7dcc3', c2: '#c4ae86', pip: 'dot', pipColor: '#2a1d14', marks: [1, 5], overlay: ['scratches'], geo: { r: 0.13 }, mat: { roughness: 0.55 } }),
  },
  {
    id: 'lowroll', zh: '低出目骰子', en: 'Low-Roller Die',
    p: [22.2, 11.1, 11.1, 11.1, 11.1, 33.3], rate: 33.3,
    hintZh: '粗石凿成，名不副实：最常出 6，1 也时有出现。', hintEn: 'Hewn from rough stone, and misnamed: it rolls 6 most often, sometimes 1.',
    style: S({ base: 'stone', c1: '#8e8b84', c2: '#5c5a55', pip: 'dot', pipColor: '#1d1c1a', geo: { r: 0.1 }, mat: { roughness: 0.9 } }),
  },
  {
    id: 'holytrinity', zh: '圣三一骰子', en: 'Holy Trinity Die',
    p: [21.1, 26.3, 36.8, 5.3, 5.3, 5.3], rate: 26.4,
    hintZh: '青白大理石，三位一体纹章。偏爱 1、2、3，尤其是 3。', hintEn: 'Blue-white marble with a trinity knot. Favours 1, 2 and 3 — especially 3.',
    style: S({ base: 'marble', c1: '#eef1f6', c2: '#a9b4c9', pip: 'dot', pipColor: '#2a4a8a', trim: '#c9a03c', special: { 3: 'trinity3' }, geo: { r: 0.12, corners: 'silver' }, mat: { roughness: 0.3, clearcoat: 0.5 } }),
  },
  {
    id: 'lacquer', zh: '涂漆骰子', en: 'Lacquered Die',
    p: [20, 6.7, 6.7, 6.7, 40, 20], rate: 60.0,
    hintZh: '朱红大漆，光可鉴人。常出 5，1 和 6 也不少。', hintEn: 'Glossy vermilion lacquer. Often a 5; 1 and 6 are common too.',
    style: S({ base: 'lacquer', c1: '#a01c1c', c2: '#5e0d0d', pip: 'dot', pipColor: '#f0c75e', pipMetal: true, trim: '#1a0b0b', geo: { r: 0.13 }, mat: { roughness: 0.15, clearcoat: 1 } }),
  },
  {
    id: 'antiochus', zh: '圣安提阿克斯的骰子', en: "St. Antiochus' Die",
    p: [20, 6.7, 40, 6.7, 6.7, 20], rate: 26.7,
    hintZh: '银质圣物匣般的骰子。常出 3，1 和 6 也不少。', hintEn: 'Silver like a reliquary. Often a 3; 1 and 6 show up as well.',
    style: S({ base: 'metal', c1: '#cfd2d7', c2: '#8a8f97', pip: 'dot', pipColor: '#2a2420', special: { 1: 'halo' }, overlay: ['engrave'], geo: { r: 0.1, corners: 'gold' }, mat: { metalness: 0.9, roughness: 0.28 } }),
  },
  {
    id: 'trinity', zh: '三位一体骰子', en: 'Trinity Die',
    p: [18.2, 9.1, 36.4, 9.1, 18.2, 9.1], rate: 36.4,
    hintZh: '深色木头上嵌着三角纹。偏爱 3。', hintEn: 'Dark wood inlaid with triangles. Favours 3.',
    style: S({ base: 'darkwood', c1: '#4c301d', c2: '#2a190e', pip: 'tri', pipColor: '#e2c27a', pipMetal: true, trim: '#b8954f', special: { 3: 'tri3' }, geo: { r: 0.11 }, mat: { roughness: 0.6 } }),
  },
  {
    id: 'greasy', zh: '油滑骰子', en: 'Greasy Die',
    p: [17.7, 11.8, 17.7, 11.8, 17.7, 23.5], rate: 35.4,
    hintZh: '浸过油，摸着滑溜溜的。稍微偏向 6。', hintEn: 'Soaked in oil and slippery to the touch. Slightly favours 6.',
    style: S({ base: 'wood', c1: '#bb8c3e', c2: '#7b5822', pip: 'dot', pipColor: '#3a2610', overlay: ['smear'], geo: { r: 0.14 }, mat: { roughness: 0.12, clearcoat: 1 } }),
  },
  {
    id: 'devil', zh: '魔鬼骰子', en: "Devil's Die",
    p: [16.7, 16.7, 16.7, 16.7, 16.7, 16.7], rate: 33.4, joker: true,
    hintZh: '1 面是恶魔头像——万能面，可当任意点数，但必须与至少两枚其他骰子一起组成得分组合。', hintEn: "Its 1 is a devil's head — a wild face that becomes any number, but only in a scoring combo with at least two other dice.",
    style: S({ base: 'char', c1: '#1b1214', c2: '#2e1519', pip: 'dot', pipColor: '#d0221f', pipGlow: '#ff2a1a', special: { 1: 'devil' }, trim: '#5a0f0f', geo: { r: 0.12 }, mat: { roughness: 0.4, clearcoat: 0.6 } }),
  },
  {
    id: 'mathematician', zh: '数学家的骰子', en: "Mathematician's Die",
    p: [16.7, 20.8, 25.0, 29.2, 4.2, 4.2], rate: 20.9,
    hintZh: '写满算式的羊皮纸骰子。偏爱 2、3、4，很少出 5 和 6。', hintEn: 'Parchment covered in sums. Favours 2, 3, 4; rarely 5 or 6.',
    style: S({ base: 'parchment', c1: '#e9dab6', c2: '#c3ab7c', pip: 'num', pipColor: '#2b2118', overlay: ['formulas'], geo: { r: 0.1 }, mat: { roughness: 0.85 } }),
  },
  {
    id: 'calamity', zh: '灾厄骰子', en: 'Calamity Die',
    p: [14.3, 14.3, 14.3, 14.3, 14.3, 28.6], rate: 28.6,
    hintZh: '焦黑开裂，裂缝里还闪着余烬。稍微偏向 6。', hintEn: 'Charred and cracked, embers still glowing inside. Slightly favours 6.',
    style: S({ base: 'char', c1: '#1e1814', c2: '#352820', pip: 'dot', pipColor: '#cfc6ba', overlay: ['embers'], geo: { r: 0.11, distort: 0.02 }, mat: { roughness: 0.85 } }),
  },
  {
    id: 'iron', zh: '铁骰子', en: 'Iron Die',
    p: [14.3, 14.3, 14.3, 14.3, 14.3, 28.6], rate: 28.6,
    hintZh: '锻铁打成，四角铆钉，锈迹斑斑。稍微偏向 6。', hintEn: 'Forged iron with riveted corners and spots of rust. Slightly favours 6.',
    style: S({ base: 'metal', c1: '#56595c', c2: '#2f3133', pip: 'dot', pipColor: '#121212', overlay: ['rust'], geo: { r: 0.06, corners: 'iron' }, mat: { metalness: 0.85, roughness: 0.6 } }),
  },
  {
    id: 'lu', zh: '卢氏骰子', en: 'Lu Die',
    p: [14.3, 14.3, 14.3, 14.3, 14.3, 28.6], rate: 28.6,
    hintZh: '东方来的玉骰子，1 和 4 点染成朱红。稍微偏向 6。', hintEn: 'A jade die from the East, its 1 and 4 painted red. Slightly favours 6.',
    style: S({ base: 'jade', c1: '#6aa688', c2: '#2c6a4d', pip: 'dot', pipColor: '#f4f0e2', pipColors: { 1: '#c8262b', 4: '#c8262b' }, special: { 1: 'bigdot' }, geo: { r: 0.14 }, mat: { roughness: 0.2, clearcoat: 0.8 } }),
  },
  {
    id: 'king', zh: '国王骰子', en: "King's Die",
    p: [12.5, 18.8, 21.9, 25.0, 12.5, 9.4], rate: 25.0,
    hintZh: '纯金镶红宝石，1 面是王冠。偏爱中间的 3 和 4。', hintEn: 'Gold set with rubies, a crown on its 1. Favours the middle numbers, 3 and 4.',
    style: S({ base: 'gold', c1: '#e0b64e', c2: '#9a7022', pip: 'gem', pipColor: '#b3122a', special: { 1: 'crown' }, geo: { r: 0.1 }, mat: { metalness: 1, roughness: 0.28 } }),
  },
  {
    id: 'shoddy', zh: '蹩脚骰子', en: 'Shoddy Die',
    p: [10, 15, 10, 15, 35, 15], rate: 45.0,
    hintZh: '做工粗糙、坑坑洼洼。常出 5，很少出 1。', hintEn: 'Crudely cut and pitted. Often a 5, rarely a 1.',
    style: S({ base: 'wood', c1: '#a98c63', c2: '#776043', pip: 'crude', pipColor: '#2b1d12', overlay: ['chips'], geo: { r: 0.09, distort: 0.06 }, mat: { roughness: 0.92 } }),
  },
  {
    id: 'painter', zh: '画家骰子', en: "Painter's Die",
    p: [9.1, 27.3, 18.2, 18.2, 18.2, 9.1], rate: 27.3,
    hintZh: '溅满颜料的画家骰子。很少出 1 和 6，常出 2。', hintEn: 'Splattered with paint. Rarely 1 or 6, leans toward 2.',
    variants: ['#2a52be', '#2e8b3e', '#c0392b'],
    style: S({ base: 'bone', c1: '#efe8da', c2: '#cfc2a8', pip: 'dot', pipColor: '#2a52be', overlay: ['splatter'], geo: { r: 0.13 }, mat: { roughness: 0.5 } }),
  },
  {
    id: 'unlucky', zh: '倒霉骰子', en: 'Unlucky Die',
    p: [9.1, 27.3, 18.2, 18.2, 18.2, 9.1], rate: 27.3,
    hintZh: '布满裂纹的灰绿石骰。很少出 1 和 6。', hintEn: 'A cracked grey-green stone. Rarely lands on 1 or 6.',
    style: S({ base: 'stone', c1: '#7b8472', c2: '#4b5346', pip: 'dot', pipColor: '#1b1d19', overlay: ['cracks'], geo: { r: 0.11 }, mat: { roughness: 0.85 } }),
  },
  {
    id: 'even', zh: '偶数骰子', en: 'Even Die',
    p: [6.7, 26.7, 6.7, 26.7, 6.7, 26.7], rate: 13.4,
    hintZh: '偶数面描成了靛蓝——它偏爱偶数。', hintEn: 'Its even faces are inked indigo, and it favours even numbers.',
    style: S({ base: 'bone', c1: '#e6e9ec', c2: '#b9bfc6', pip: 'dot', pipColor: '#1e1e22', pipColors: { 2: '#2350a0', 4: '#2350a0', 6: '#2350a0' }, faceTint: { 2: '#cfd9ec', 4: '#cfd9ec', 6: '#cfd9ec' }, geo: { r: 0.13 }, mat: { roughness: 0.5 } }),
  },
  {
    id: 'grozav', zh: '格罗扎夫的幸运骰子', en: "Grozav's Lucky Die",
    p: [6.7, 66.7, 6.7, 6.7, 6.7, 6.7], rate: 13.4,
    hintZh: '铜铸的星纹骰子，大概率出 2。', hintEn: 'Cast copper with star pips. Very likely to land on 2.',
    style: S({ base: 'copper', c1: '#bd7a3c', c2: '#7a4a22', pip: 'star', pipColor: '#f6e6b4', pipMetal: true, geo: { r: 0.11 }, mat: { metalness: 0.95, roughness: 0.35 } }),
  },
  {
    id: 'grimy', zh: '污秽骰子', en: 'Grimy Die',
    p: [6.3, 31.3, 6.3, 6.3, 43.8, 6.3], rate: 50.1,
    hintZh: '沾满泥垢，叫人不想碰。常出 5 和 2。', hintEn: "So caked in grime you'd rather not touch it. Often 5 or 2.",
    style: S({ base: 'grime', c1: '#5f5439', c2: '#2c271a', pip: 'dot', pipColor: '#120e08', overlay: ['grime'], geo: { r: 0.12, distort: 0.02 }, mat: { roughness: 0.95 } }),
  },
  {
    id: 'charioteer', zh: '战车御者的骰子', en: "Charioteer's Die",
    p: [5.6, 27.8, 33.3, 11.1, 11.1, 11.1], rate: 16.7,
    hintZh: '青铜铸成，1 面刻着车轮。偏爱 2 和 3，很少出 1。', hintEn: 'Cast bronze, a wheel on its 1. Favours 2 and 3, rarely 1.',
    style: S({ base: 'bronze', c1: '#a87c40', c2: '#6a4b24', pip: 'dot', pipColor: '#24180c', special: { 1: 'wheel' }, overlay: ['engrave'], geo: { r: 0.1 }, mat: { metalness: 0.9, roughness: 0.38 } }),
  },
  {
    id: 'doom', zh: '厄运骰子', en: 'Doom Die',
    p: [4.6, 22.7, 22.7, 22.7, 22.7, 4.6], rate: 27.3,
    hintZh: '漆黑如夜，1 面是骷髅。很少出 1 和 6。', hintEn: 'Black as night, a skull on its 1. Rarely lands on 1 or 6.',
    style: S({ base: 'darkwood', c1: '#2b2a2e', c2: '#141416', pip: 'dot', pipColor: '#e8e2d4', special: { 1: 'skull' }, geo: { r: 0.12 }, mat: { roughness: 0.5 } }),
  },
];

export const DICE_BY_ID = Object.fromEntries(DICE.map((d) => [d.id, d]));
export const SPECIAL_DICE = DICE.filter((d) => d.id !== NORMAL_ID);

// 归一化后的累积概率
for (const d of DICE) {
  const sum = d.p.reduce((a, b) => a + b, 0);
  d.prob = d.p.map((x) => x / sum);
  // 评估“好坏”用：得分率 + 万能面加成
  d.quality = d.rate + (d.joker ? 22 : 0);
}

export function rollFace(typeId, rnd = Math.random) {
  const prob = DICE_BY_ID[typeId].prob;
  let r = rnd();
  for (let i = 0; i < 6; i++) {
    r -= prob[i];
    if (r <= 0) return i + 1;
  }
  return 6;
}

export function randomSpecial(rnd = Math.random) {
  return SPECIAL_DICE[Math.floor(rnd() * SPECIAL_DICE.length)].id;
}

// 按质量加权、不放回抽取 n 个（骰子王用）
export function pickBestWeighted(n, rnd = Math.random) {
  const pool = SPECIAL_DICE.map((d) => ({ id: d.id, w: Math.pow(d.quality / 100, 6) }));
  const out = [];
  for (let k = 0; k < n && pool.length; k++) {
    const total = pool.reduce((a, b) => a + b.w, 0);
    let r = rnd() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    out.push(pool[idx].id);
    pool.splice(idx, 1);
  }
  return out;
}

export function dieName(typeId, lang) {
  const d = DICE_BY_ID[typeId];
  return lang === 'en' ? d.en : d.zh;
}
export function dieHint(typeId, lang) {
  const d = DICE_BY_ID[typeId];
  return lang === 'en' ? d.hintEn : d.hintZh;
}
