// 游戏图标：酒红盾牌 + 金边 + 象牙骰子（1·2·3 三面，红色的“幺”朝上）+ 金王冠
// 骰子按等轴测画：每个面先在 116×116 的方格里画好（圆角面 + 点），再用 matrix 贴到对应的菱形上
// 打包时用作浏览器标签图标；界面里的徽记也用它（idPrefix 防止同页多个实例的渐变 id 冲突）
export function iconSVG(idPrefix = 'hs') {
  const p = idPrefix;
  const face = (fill, pips) =>
    `<rect x="2.5" y="2.5" width="111" height="111" rx="12" fill="url(#${p}-${fill})"/>` +
    pips.map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('');
  const dark = '#2b1810';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
<radialGradient id="${p}-field" cx="50%" cy="36%" r="72%"><stop offset="0" stop-color="#a32d2a"/><stop offset="0.6" stop-color="#6e1518"/><stop offset="1" stop-color="#3a090b"/></radialGradient>
<linearGradient id="${p}-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8e39a"/><stop offset="0.45" stop-color="#d6a443"/><stop offset="1" stop-color="#875716"/></linearGradient>
<linearGradient id="${p}-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaea"/><stop offset="1" stop-color="#ead7b0"/></linearGradient>
<linearGradient id="${p}-left" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ead5a8"/><stop offset="1" stop-color="#c8aa76"/></linearGradient>
<linearGradient id="${p}-right" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfb17c"/><stop offset="1" stop-color="#9c7c4c"/></linearGradient>
<radialGradient id="${p}-pip" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#ec5048"/><stop offset="1" stop-color="#8a0f15"/></radialGradient>
</defs>
<path d="M96 50 H416 Q442 50 442 76 V232 C442 358 362 434 256 476 C150 434 70 358 70 232 V76 Q70 50 96 50 Z" fill="url(#${p}-gold)"/>
<path d="M106 70 H406 Q422 70 422 86 V232 C422 346 350 414 256 452 C162 414 90 346 90 232 V86 Q90 70 106 70 Z" fill="url(#${p}-field)"/>
<path d="M114 86 H398 V232 C398 336 334 398 256 432 C178 398 114 336 114 232 Z" fill="none" stroke="#e8bb5c" stroke-opacity="0.4" stroke-width="3"/>
<ellipse cx="256" cy="421" rx="78" ry="12" fill="#1a0406" opacity="0.38"/>
<polygon points="256,190 356.5,248 356.5,364 256,422 155.5,364 155.5,248" fill="#b18f63" stroke="#b18f63" stroke-width="12" stroke-linejoin="round"/>
<g transform="matrix(0.8660 -0.5 0.8660 0.5 155.5 248)">${face('top', [[58, 58, 21, `url(#${p}-pip)`]])}</g>
<g transform="matrix(0.8660 0.5 0 1 155.5 248)">${face('left', [[31, 31, 12, dark], [85, 85, 12, dark]])}</g>
<g transform="matrix(0.8660 -0.5 0 1 256 306)">${face('right', [[29, 29, 11, dark], [58, 58, 11, dark], [87, 87, 11, dark]])}</g>
<g stroke="#5e3a0c" stroke-width="4" stroke-linejoin="round">
<path d="M180 172 L170 110 L212 138 L256 94 L300 138 L342 110 L332 172 Z" fill="url(#${p}-gold)"/>
<rect x="174" y="164" width="164" height="22" rx="7" fill="url(#${p}-gold)"/>
<circle cx="169" cy="106" r="10" fill="#f8e39a"/><circle cx="256" cy="89" r="11" fill="#f8e39a"/><circle cx="343" cy="106" r="10" fill="#f8e39a"/>
</g>
<circle cx="256" cy="175" r="6.5" fill="#c4262e"/><circle cx="214" cy="175" r="4.5" fill="#2e6d9e"/><circle cx="298" cy="175" r="4.5" fill="#2e6d9e"/>
</svg>`;
}

export const ICON_DATA_URI = 'data:image/svg+xml,' + encodeURIComponent(iconSVG());
