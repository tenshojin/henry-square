// 界面层（DOM）：开场、菜单、命运之骰、对局 HUD、规则、图鉴、结算
import { i18n, VERSION } from '../i18n.js';
import { DICE_BY_ID, SPECIAL_DICE, NORMAL_ID, dieName, dieHint } from '../data/dice.js';
import { iconSVG } from './icon.js';

const ICONS = {
  music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="18" r="3" fill="currentColor"/><circle cx="17" cy="16" r="3" fill="currentColor"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  scroll: '<svg viewBox="0 0 24 24"><path d="M6 3h11a3 3 0 0 1 0 6h-1v9a3 3 0 0 1-3 3H6a3 3 0 0 1 0-6h1V6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 8h4M10 12h4" stroke="currentColor" stroke-width="2"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};

// 单色纹样（48×48），用于难度图标与火漆印
const EMBLEMS = {
  H: '<text x="24" y="39" text-anchor="middle" font-size="42" fill="currentColor">H</text>',
  crown: '<path d="M7 35 L5 14 L16 23 L24 9 L32 23 L43 14 L41 35 Z" fill="currentColor"/><rect x="7" y="37" width="34" height="4" rx="1" fill="currentColor"/>',
  die: '<rect x="8" y="8" width="32" height="32" rx="6" fill="none" stroke="currentColor" stroke-width="3.4"/><circle cx="16.5" cy="16.5" r="3" fill="currentColor"/><circle cx="31.5" cy="16.5" r="3" fill="currentColor"/><circle cx="24" cy="24" r="3" fill="currentColor"/><circle cx="16.5" cy="31.5" r="3" fill="currentColor"/><circle cx="31.5" cy="31.5" r="3" fill="currentColor"/>',
  mug: '<path d="M10 12h22v26a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" fill="currentColor"/><path d="M32 18h4a5 5 0 0 1 0 10h-4" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M8 11c1-5 7-6 10-4 3-3 9-2 11 1 4-1 7 2 5 5H8z" fill="currentColor" opacity=".55"/>',
  candle: '<path d="M24 3c4 6 5 9 0 14-5-5-4-8 0-14z" fill="currentColor"/><rect x="18" y="19" width="12" height="19" rx="2" fill="currentColor"/><path d="M9 40h30l-3 5H12z" fill="currentColor"/>',
  sword: '<path d="M38 4h6v6L24 30l-6-6z" fill="currentColor"/><path d="M10 26l12 12-3 3-4-4-6 6-3-3 6-6-4-4z" fill="currentColor"/>',
  star: '<path d="M24 5l5.6 12.4 13.4 1.4-10 9.2 2.9 13.2L24 34.6 12.1 41.2 15 28 5 18.8l13.4-1.4z" fill="currentColor"/>',
};
const DIFF_EMBLEM = { casual: 'mug', novice: 'candle', regular: 'sword', king: 'crown' };
const DIFF_LEVEL = { casual: 1, novice: 2, regular: 3, king: 4 };

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

// 不规则的火漆外形
function blobPath(seed) {
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const n = 18;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 43 + (rnd() - 0.5) * 6 + (rnd() < 0.18 ? 3.5 : 0);
    pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
  }
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  let d = `M${mid(pts[n - 1], pts[0]).map((v) => v.toFixed(1)).join(' ')}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    d += ` Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return d + 'Z';
}
export function sealSVG(color = 'red', emblem = 'H', seed = 3) {
  const e = EMBLEMS[emblem] || EMBLEMS.H;
  return `<svg class="seal" viewBox="0 0 100 100" aria-hidden="true">
    <path d="${blobPath(seed)}" fill="url(#wax-${color})"/>
    <circle cx="50" cy="50" r="31" fill="url(#wax-${color}-in)"/>
    <circle cx="50" cy="50" r="31" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="2.5"/>
    <circle cx="50" cy="50" r="27.5" fill="none" stroke="rgba(255,230,200,.18)" stroke-width="1.2"/>
    <g color="rgba(30,0,0,.45)" transform="translate(28 28.5) scale(.9)">${e}</g>
    <g color="rgba(255,225,200,.32)" transform="translate(26.6 27) scale(.9)">${e}</g>
  </svg>`;
}
function flourishSVG() {
  return `<svg class="flourish" viewBox="0 0 320 26" aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-linecap="round">
      <path d="M160 13 C 142 2, 120 2, 106 11 C 98 17, 88 17, 84 11 C 81 6, 86 2, 91 5" stroke-width="1.8"/>
      <path d="M160 13 C 178 2, 200 2, 214 11 C 222 17, 232 17, 236 11 C 239 6, 234 2, 229 5" stroke-width="1.8"/>
      <path d="M106 11 C 80 20, 50 15, 16 13" stroke-width="1.2"/>
      <path d="M214 11 C 240 20, 270 15, 304 13" stroke-width="1.2"/>
      <path d="M128 18 C 136 24, 148 24, 154 19" stroke-width="1.1"/>
      <path d="M192 18 C 184 24, 172 24, 166 19" stroke-width="1.1"/>
    </g>
    <path d="M160 5 L166 13 L160 21 L154 13 Z" fill="currentColor"/>
    <circle cx="145" cy="13" r="1.8" fill="currentColor"/><circle cx="175" cy="13" r="1.8" fill="currentColor"/>
  </svg>`;
}
// 哥特花饰角：金色细线勾的卷草 + 小三叶
const CORNER = `<svg viewBox="0 0 46 46" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round">
  <path d="M3 30 V9 Q3 3 9 3 H30" stroke-width="1.3"/>
  <path d="M7 34 V12 Q7 7 12 7 H34" stroke-width="0.6" opacity=".7"/>
  <path d="M12 12 C 18 12, 22 16, 20 21 C 18 25, 13 23, 14 19 C 15 16, 19 17, 18.5 19.5" stroke-width="1"/>
  <path d="M3 30 C 3 36, 6 40, 10 42" stroke-width="0.8" opacity=".8"/>
  <path d="M30 3 C 36 3, 40 6, 42 10" stroke-width="0.8" opacity=".8"/>
</g><path d="M3 3 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0" fill="currentColor"/>
<path d="M24 3 l2.2 -2.2 2.2 2.2 -2.2 2.2z M3 24 l2.2 -2.2 2.2 2.2 -2.2 2.2z" fill="currentColor"/></svg>`;

// 横幅：一条半透明暗带，上下两道金线从中间向两边展开，中间各一颗小菱形
const RIBBON = {};
function ribbonSVG() {
  return '<div class="ribbon" aria-hidden="true"><i class="band"></i><i class="line t"></i><i class="line b"></i><i class="gem t"></i><i class="gem b"></i></div>';
}

export class UI {
  constructor(root, audio) {
    this.root = root;
    this.audio = audio;
    this.thumbs = {};
    this.rerender = new Set();
    this.build();
    i18n.onChange(() => {
      this.rerender.forEach((fn) => fn());
    });
  }

  t() {
    return i18n.t;
  }

  thumb(typeId, variant = 0) {
    const d = DICE_BY_ID[typeId];
    const key = d.variants ? `${typeId}:${variant % d.variants.length}` : typeId;
    return this.thumbs[key] || '';
  }

  btn(label, cls = '', onClick) {
    const b = el('button', 'btn ' + cls, `<span>${label}</span>`);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (b.disabled) return;
      this.audio.click();
      onClick && onClick(e);
    });
    b.addEventListener('mouseenter', () => !b.disabled && this.audio.hover());
    return b;
  }

  ornate(card) {
    for (const c of ['tl', 'tr', 'bl', 'br']) card.appendChild(el('i', 'orn ' + c, CORNER));
  }

  build() {
    const r = this.root;
    this.splash = el('div', 'splash');
    this.introCap = el('div', 'intro-cap hidden');
    this.skipBtn = el('button', 'skip hidden');
    this.menuEl = el('div', 'overlay menu hidden');
    this.fateEl = el('div', 'overlay fate hidden');
    this.hud = el('div', 'hud hidden');
    this.modal = el('div', 'overlay modal hidden');
    this.overEl = el('div', 'overlay over hidden');
    this.tip = el('div', 'tip hidden');
    this.toolbar = el('div', 'toolbar hidden');
    this.bannerEl = el('div', 'banner');
    this.popLayer = el('div', 'pop-layer');
    this.fader = el('div', 'fader');
    for (const e of [this.splash, this.introCap, this.skipBtn, this.hud, this.popLayer, this.bannerEl, this.menuEl, this.fateEl, this.overEl, this.modal, this.toolbar, this.fader, this.tip]) r.appendChild(e);
    this.buildToolbar();
  }

  fade(on, ms = 450) {
    this.fader.style.transitionDuration = ms + 'ms';
    this.fader.classList.toggle('on', on);
    return new Promise((res) => setTimeout(res, ms));
  }

  // ---------- 开场 ----------
  showSplash(onEnter) {
    const render = () => {
      const t = this.t();
      this.splash.innerHTML = '';
      // 只有第一次显示时逐行浮现；加载完成、切换语言时重绘不再重播
      const box = el('div', 'splash-box' + (this.splashShown ? '' : ' enter'));
      this.splashShown = true;
      box.appendChild(el('div', 'emblem', iconSVG('sp')));
      box.appendChild(el('h1', 'title', t.title));
      box.appendChild(el('div', 'subtitle', t.titleSub));
      box.insertAdjacentHTML('beforeend', flourishSVG());
      box.appendChild(el('p', 'tagline', t.tagline));
      this.loadingEl = el('div', 'loading', `<div class="bar"><i style="width:${(this.loadP || 0) * 100}%"></i></div><span>${t.loading}</span>`);
      box.appendChild(this.loadingEl);
      this.enterBtn = this.btn(t.enter, 'primary big', () => onEnter());
      this.enterBtn.disabled = !this.loaded;
      this.enterBtn.classList.toggle('hidden', !this.loaded);
      box.appendChild(this.enterBtn);
      const embers = el('div', 'embers');
      for (let i = 0; i < 16; i++) {
        const e = el('i');
        const d = 7 + ((i * 37) % 9);
        e.style.cssText = `left:${(i * 61) % 100}%;animation-duration:${d}s;animation-delay:-${((i * 2.3) % d).toFixed(1)}s;--dx:${((i * 53) % 90) - 45}px`;
        embers.appendChild(e);
      }
      this.splash.appendChild(embers);
      const lang = el('button', 'lang-chip', t.langBtn);
      lang.onclick = () => i18n.toggle();
      this.splash.appendChild(lang);
      this.splash.appendChild(box);
      this.splash.appendChild(el('div', 'version', VERSION));
      if (this.loaded) this.loadingEl.classList.add('hidden');
    };
    this.splashRender = render;
    this.rerender.add(render);
    render();
  }
  setLoading(p) {
    this.loadP = p;
    const bar = this.loadingEl?.querySelector('i');
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
  }
  setLoaded() {
    this.loaded = true;
    this.splashRender && this.splashRender();
  }
  hideSplash() {
    this.rerender.delete(this.splashRender);
    this.splash.classList.add('fade-out');
    setTimeout(() => this.splash.classList.add('hidden'), 1200);
  }

  showIntroCaption(show) {
    const t = this.t();
    this.introCap.innerHTML = `<div class="cap-title">${t.title}</div><div class="cap-sub">${t.titleSub}</div><div class="cap-line">${t.tagline}</div>`;
    this.introCap.classList.toggle('hidden', false);
    this.introCap.classList.toggle('show', show);
  }
  showSkip(onSkip) {
    this.skipBtn.textContent = this.t().skip;
    this.skipBtn.classList.remove('hidden');
    this.skipBtn.onclick = () => {
      this.audio.click();
      onSkip();
    };
  }
  hideIntro() {
    this.skipBtn.classList.add('hidden');
    this.introCap.classList.remove('show');
    setTimeout(() => this.introCap.classList.add('hidden'), 1500);
  }

  // ---------- 工具栏 ----------
  buildToolbar() {
    const render = () => {
      const t = this.t();
      const tb = this.toolbar;
      tb.innerHTML = '';
      const mk = (icon, title, fn, active = true) => {
        const b = el('button', 'tool' + (active ? '' : ' off'), ICONS[icon] || icon);
        b.title = title;
        b.onclick = (e) => {
          e.stopPropagation();
          this.audio.click();
          fn();
        };
        tb.appendChild(b);
        return b;
      };
      if (this.onMenuRequest) mk('menu', t.menu, () => this.onMenuRequest());
      mk('scroll', t.rules, () => this.showRules());
      mk('book', t.codex, () => this.showCodex());
      const lb = mk(`<b>${t.langBtn}</b>`, 'Language', () => i18n.toggle());
      lb.classList.add('lang');
      mk('music', t.music, () => {
        this.audio.setMusic(!this.audio.musicOn);
        render();
      }, this.audio.musicOn);
      mk('sound', t.sound, () => {
        this.audio.setSound(!this.audio.soundOn);
        render();
      }, this.audio.soundOn);
    };
    this.toolbarRender = render;
    this.rerender.add(render);
    render();
  }
  showToolbar(onMenu) {
    this.onMenuRequest = onMenu;
    this.toolbarRender();
    this.toolbar.classList.remove('hidden');
  }

  // ---------- 菜单（卷轴） ----------
  showMenu(onStart, current = 'regular', targets = {}) {
    let sel = current;
    const render = () => {
      const t = this.t();
      const m = this.menuEl;
      m.innerHTML = '';
      const card = el('div', 'paper menu-card');
      this.ornate(card);
      const head = el('div', 'menu-head');
      head.appendChild(el('div', 'emblem', iconSVG('mn')));
      head.appendChild(el('h1', 'title small', t.title));
      card.appendChild(head);
      card.appendChild(el('div', 'subtitle', t.titleSub));
      card.insertAdjacentHTML('beforeend', flourishSVG());
      card.appendChild(el('h3', 'section', t.chooseDiff));
      const grid = el('div', 'diff-grid');
      for (const d of ['casual', 'novice', 'regular', 'king']) {
        const info = t.diff[d];
        const lv = DIFF_LEVEL[d];
        const pips = [1, 2, 3, 4].map((i) => `<i class="${i <= lv ? 'on' : ''}">◆</i>`).join('');
        const c = el('button', 'diff' + (d === sel ? ' sel' : '') + ' d-' + d);
        c.innerHTML = `<div class="diff-icon"><svg viewBox="0 0 48 48">${EMBLEMS[DIFF_EMBLEM[d]]}</svg></div>
          <div class="diff-text"><div class="diff-name">${info.name}</div><div class="diff-who">${info.who}</div>
          <div class="diff-desc">${info.desc}</div>
          <div class="diff-meta"><span class="pips">${pips}</span><span>${t.target} ${targets[d] ?? ''}</span></div></div>
          ${sealSVG('red', 'die', 20 + lv)}`;
        c.onclick = () => {
          if (sel === d) return;
          sel = d;
          this.audio.select(true);
          grid.querySelectorAll('.diff').forEach((x) => x.classList.toggle('sel', x === c));
        };
        grid.appendChild(c);
      }
      card.appendChild(grid);
      const row = el('div', 'menu-actions');
      row.appendChild(this.btn(t.rules, '', () => this.showRules()));
      row.appendChild(this.btn(t.start, 'primary big', () => {
        this.hideMenu();
        onStart(sel);
      }));
      row.appendChild(this.btn(t.codex, '', () => this.showCodex()));
      card.appendChild(row);
      card.appendChild(el('div', 'menu-version', VERSION));
      m.appendChild(card);
    };
    this.menuRender = render;
    this.rerender.add(render);
    render();
    this.menuEl.classList.remove('hidden');
    requestAnimationFrame(() => this.menuEl.classList.add('show'));
  }
  hideMenu() {
    this.rerender.delete(this.menuRender);
    this.menuEl.classList.remove('show');
    setTimeout(() => this.menuEl.classList.add('hidden'), 400);
  }

  // ---------- 命运之骰 ----------
  // offers: [{typeId, variant} | null] x6
  showFate(offers, onConfirm) {
    const choice = offers.map(() => false);
    let first = true;
    const render = () => {
      const t = this.t();
      const f = this.fateEl;
      f.innerHTML = '';
      const card = el('div', 'paper fate-card');
      this.ornate(card);
      card.appendChild(el('h2', 'title small', t.fateTitle));
      card.insertAdjacentHTML('beforeend', flourishSVG());
      card.appendChild(el('p', 'fate-sub', t.fateSub));
      if (!offers.some(Boolean)) card.appendChild(el('p', 'fate-none', t.fateNone));
      const row = el('div', 'fate-row');
      offers.forEach((o, i) => {
        const slot = el('div', 'slot' + (o ? ' offered' : ''));
        if (first) slot.style.animationDelay = `${0.08 + i * 0.1}s`;
        else slot.style.animation = 'none';
        slot.appendChild(el('div', 'slot-label', t.slot(i + 1)));
        const img = el('div', 'slot-die', `<img src="${this.thumb(NORMAL_ID)}" alt="">`);
        slot.appendChild(img);
        if (o) {
          slot.appendChild(el('div', 'slot-name', dieName(o.typeId, i18n.lang)));
          slot.appendChild(el('div', 'slot-hint', dieHint(o.typeId, i18n.lang)));
          const seg = el('div', 'seg');
          const a = el('button', '', t.keepNormal);
          const b = el('button', '', t.transform);
          const mini = el('div', 'slot-offer', `<img src="${this.thumb(o.typeId, o.variant)}" alt="">`);
          slot.appendChild(mini);
          const apply = (animate) => {
            const on = choice[i];
            slot.classList.toggle('chosen', on);
            a.classList.toggle('on', !on);
            b.classList.toggle('on', on);
            img.querySelector('img').src = on ? this.thumb(o.typeId, o.variant) : this.thumb(NORMAL_ID);
            mini.classList.toggle('hidden', on);
            const old = slot.querySelector('.seal');
            if (old) old.remove();
            if (on) {
              slot.insertAdjacentHTML('beforeend', sealSVG('gold', 'star', 30 + i));
              if (!animate) slot.querySelector('.seal').style.animation = 'none';
            }
          };
          a.onclick = () => {
            if (!choice[i]) return;
            choice[i] = false;
            this.audio.select(false);
            apply(true);
          };
          b.onclick = () => {
            if (choice[i]) return;
            choice[i] = true;
            this.audio.select(true);
            apply(true);
          };
          seg.appendChild(a);
          seg.appendChild(b);
          slot.appendChild(seg);
          apply(false);
        } else {
          slot.appendChild(el('div', 'slot-name dim', t.normalDie));
        }
        row.appendChild(slot);
      });
      card.appendChild(row);
      const act = el('div', 'menu-actions');
      act.appendChild(this.btn(t.confirm, 'primary big', () => {
        this.rerender.delete(render);
        this.fateEl.classList.remove('show');
        setTimeout(() => this.fateEl.classList.add('hidden'), 400);
        onConfirm(choice.slice());
      }));
      card.appendChild(act);
      f.appendChild(card);
      first = false;
    };
    this.rerender.add(render);
    render();
    this.fateEl.classList.remove('hidden');
    requestAnimationFrame(() => this.fateEl.classList.add('show'));
  }

  // ---------- 对局 HUD ----------
  showHud(state) {
    this.hudState = state;
    const render = () => this.renderHud();
    this.hudRender = render;
    this.rerender.add(render);
    this.hud.classList.remove('hidden');
    render();
  }
  hideHud() {
    this.rerender.delete(this.hudRender);
    this.hud.classList.add('hidden');
    this.bannerEl.innerHTML = '';
    this.popLayer.innerHTML = '';
  }
  renderHud() {
    const s = this.hudState;
    if (!s) return;
    const t = this.t();
    const h = this.hud;
    h.innerHTML = '';
    const panel = (p, idx) => {
      const isAI = idx === 1;
      const pe = el('div', `panel paper small ${isAI ? 'right' : 'left'}${s.current === idx ? ' active' : ''}`);
      pe.insertAdjacentHTML('beforeend', isAI ? sealSVG('green', DIFF_EMBLEM[s.difficulty], 41) : sealSVG('red', 'H', 40));
      const name = isAI ? `${t.opponent} · ${t.diff[s.difficulty].name}` : t.you;
      const sub = isAI ? t.diff[s.difficulty].who : t.targetN(s.target);
      pe.insertAdjacentHTML('beforeend', `<div class="p-head"><span class="p-name">${name}</span><span class="p-sub">${sub}</span></div>
        <div class="p-score"><b>${p.score}</b><span>/ ${s.target}</span></div>
        <div class="p-bar"><i style="width:${Math.min(100, (p.score / s.target) * 100)}%"></i></div>`);
      if (!isAI) {
        const dice = el('div', 'p-dice');
        p.types.forEach((ty, i) => {
          const d = el('div', 'p-die' + (ty !== NORMAL_ID ? ' special' : ''), `<img src="${this.thumb(ty, p.variants[i])}" alt="">`);
          this.attachTip(d, ty);
          dice.appendChild(d);
        });
        pe.appendChild(dice);
      }
      return pe;
    };
    h.appendChild(panel(s.players[0], 0));
    h.appendChild(panel(s.players[1], 1));
    // 回合信息与按钮
    const bottom = el('div', 'bottom');
    const info = el('div', 'turn-info paper small');
    const curName = s.current === 0 ? t.you : s.current === 1 ? t.opponent : '';
    let selLine = '';
    if (s.selection) {
      const desc = typeof s.selection.desc === 'function' ? s.selection.desc(t) : s.selection.desc || '';
      if (s.selection.valid) selLine = `<div class="sel ok">${t.selected} <b>+${s.selection.score}</b> <em>${desc}</em></div>`;
      else if (s.selection.count > 0) selLine = `<div class="sel bad">${t.invalid}</div>`;
      else selLine = `<div class="sel hint">${t.pickHint}</div>`;
    } else if (s.status) selLine = `<div class="sel hint">${typeof s.status === 'function' ? s.status(t) : s.status}</div>`;
    info.insertAdjacentHTML('beforeend', `<div class="ti-row"><span class="ti-who">${curName}</span><span class="ti-label">${t.turnScore}</span><b class="ti-score">${s.turnScore}</b></div>${selLine}`);
    bottom.appendChild(info);
    const actions = el('div', 'actions');
    if (s.mode === 'roll') {
      actions.appendChild(this.btn(`${t.roll}<span class="key">${t.keySpace}</span>`, 'primary big', () => s.onRoll && s.onRoll()));
    } else if (s.mode === 'choose') {
      const valid = s.selection && s.selection.valid;
      const allSel = valid && s.selection.all;
      const b1 = this.btn(`${allSel ? t.rollAll : t.rollAgain}<span class="key">${t.keySpace}</span>`, 'primary', () => s.onKeepRoll && s.onKeepRoll());
      b1.disabled = !valid;
      const b2 = this.btn(`${t.bank}<span class="key">${t.keyEnter}</span>`, 'gold', () => s.onBank && s.onBank());
      b2.disabled = !valid;
      actions.appendChild(b1);
      actions.appendChild(b2);
    }
    bottom.appendChild(actions);
    h.appendChild(bottom);
    // 记录
    const log = el('div', 'log');
    (s.log || []).slice(-6).forEach((line, i, arr) => {
      log.appendChild(el('div', 'log-line' + (i === arr.length - 1 ? ' last' : ''), typeof line === 'function' ? line(t) : line));
    });
    h.appendChild(log);
  }
  updateHud(patch) {
    Object.assign(this.hudState, patch);
    this.renderHud();
  }

  banner(text, sub = '', kind = '', dur = 1800) {
    const b = el('div', 'banner-inner ' + kind, `${ribbonSVG(kind)}<div class="b-text">${text}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`);
    this.bannerEl.innerHTML = '';
    this.bannerEl.appendChild(b);
    requestAnimationFrame(() => b.classList.add('show'));
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      b.classList.remove('show');
      b.classList.add('out');
    }, dur);
  }

  // 在屏幕坐标处飘出得分
  popScore(text, x, y) {
    const p = el('div', 'pop', text);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    this.popLayer.appendChild(p);
    setTimeout(() => p.remove(), 1600);
  }

  // ---------- 悬浮提示 ----------
  attachTip(node, typeId) {
    node.addEventListener('mouseenter', (e) => this.showTip(typeId, e.clientX, e.clientY));
    node.addEventListener('mousemove', (e) => this.moveTip(e.clientX, e.clientY));
    node.addEventListener('mouseleave', () => this.hideTip());
  }
  showTip(typeId, x, y, extra = '') {
    const d = DICE_BY_ID[typeId];
    this.tip.innerHTML = `<div class="tip-name">${dieName(typeId, i18n.lang)}</div><div class="tip-hint">${dieHint(typeId, i18n.lang)}</div>${extra ? `<div class="tip-extra">${extra}</div>` : ''}`;
    this.tip.classList.toggle('special', d.id !== NORMAL_ID);
    this.tip.classList.remove('hidden');
    this.moveTip(x, y);
  }
  // 对手的骰子只显示点数，不透露是什么骰子
  showTipPlain(title, x, y, extra = '') {
    this.tip.innerHTML = `<div class="tip-name">${title}</div>${extra ? `<div class="tip-extra">${extra}</div>` : ''}`;
    this.tip.classList.remove('special');
    this.tip.classList.remove('hidden');
    this.moveTip(x, y);
  }
  moveTip(x, y) {
    const w = this.tip.offsetWidth;
    const h = this.tip.offsetHeight;
    let px = x + 18;
    let py = y + 18;
    if (px + w > window.innerWidth - 8) px = x - w - 14;
    if (py + h > window.innerHeight - 8) py = y - h - 14;
    this.tip.style.transform = `translate(${px}px, ${py}px)`;
  }
  hideTip() {
    this.tip.classList.add('hidden');
  }

  // ---------- 规则 / 图鉴 ----------
  openModal(build, wide = false) {
    const render = () => {
      this.modal.innerHTML = '';
      const card = el('div', 'paper modal-card' + (wide ? ' wide' : ''));
      this.ornate(card);
      const body = el('div', 'modal-body');
      build(card, body);
      card.appendChild(body);
      const close = this.btn(this.t().close, '', () => this.closeModal());
      close.classList.add('close');
      card.appendChild(close);
      this.modal.appendChild(card);
    };
    this.modalRender = render;
    this.rerender.add(render);
    render();
    this.modal.classList.remove('hidden');
    requestAnimationFrame(() => this.modal.classList.add('show'));
    this.modal.onclick = (e) => {
      if (e.target === this.modal) this.closeModal();
    };
  }
  closeModal() {
    this.rerender.delete(this.modalRender);
    this.modal.classList.remove('show');
    setTimeout(() => this.modal.classList.add('hidden'), 300);
    this.hideTip();
  }
  showRules() {
    this.openModal((card, body) => {
      const t = this.t();
      card.appendChild(el('h2', 'title small', t.rules));
      card.insertAdjacentHTML('beforeend', flourishSVG());
      const tbl = el('table', 'score-table');
      tbl.innerHTML = t.rulesBody.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
      body.appendChild(tbl);
      const ul = el('ul', 'rules-list');
      ul.innerHTML = t.rulesText.map((x) => `<li>${x}</li>`).join('');
      body.appendChild(ul);
    });
  }
  showCodex() {
    this.openModal((card, body) => {
      const t = this.t();
      card.appendChild(el('h2', 'title small', t.codex));
      card.insertAdjacentHTML('beforeend', flourishSVG());
      const grid = el('div', 'codex-grid');
      for (const d of [DICE_BY_ID[NORMAL_ID], ...SPECIAL_DICE]) {
        grid.appendChild(el('div', 'codex-item', `<img src="${this.thumb(d.id)}" alt=""><div><div class="cx-name">${dieName(d.id, i18n.lang)}</div><div class="cx-hint">${dieHint(d.id, i18n.lang)}</div></div>`));
      }
      body.appendChild(grid);
    }, true);
  }

  // ---------- 结算（卷轴） ----------
  showGameOver(win, scores, onAgain, onMenu) {
    const render = () => {
      const t = this.t();
      const o = this.overEl;
      o.innerHTML = '';
      const card = el('div', 'paper over-card ' + (win ? 'win' : 'lose'));
      this.ornate(card);
      card.insertAdjacentHTML('beforeend', win ? sealSVG('gold', 'crown', 5) : sealSVG('green', 'mug', 6));
      card.appendChild(el('h1', 'title', win ? t.win : t.lose));
      card.insertAdjacentHTML('beforeend', flourishSVG());
      card.appendChild(el('p', 'tagline', win ? t.winSub : t.loseSub));
      card.appendChild(el('div', 'final', `<div><span>${t.you}</span><b>${scores[0]}</b></div><div class="vs">:</div><div><span>${t.opponent}</span><b>${scores[1]}</b></div>`));
      const row = el('div', 'menu-actions');
      row.appendChild(this.btn(t.menu, '', () => {
        this.hideOver(render);
        onMenu();
      }));
      row.appendChild(this.btn(t.again, 'primary big', () => {
        this.hideOver(render);
        onAgain();
      }));
      card.appendChild(row);
      o.appendChild(card);
    };
    this.rerender.add(render);
    render();
    this.overEl.classList.remove('hidden');
    requestAnimationFrame(() => this.overEl.classList.add('show'));
  }
  hideOver(render) {
    this.rerender.delete(render);
    this.overEl.classList.remove('show');
    setTimeout(() => this.overEl.classList.add('hidden'), 400);
  }
}
