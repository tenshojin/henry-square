// 界面层（DOM）：开场、菜单、命运之骰、对局 HUD、规则、图鉴、结算
import { i18n, VERSION } from '../i18n.js';
import { DICE_BY_ID, SPECIAL_DICE, NORMAL_ID, dieName, dieHint } from '../data/dice.js';
import { iconSVG } from './icon.js';
import { groschenIcons } from '../render/groschen.js';
import { bindHoldConfirm } from './holdConfirm.js';

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
// 金箔角花：转角一颗菱形，两条渐细的烫金线沿边伸出去，往里卷出两片叶子
const CORNER = `<svg viewBox="0 0 46 46" aria-hidden="true"><g fill="currentColor">
  <path d="M9 3.2 L14.8 9 L9 14.8 L3.2 9 Z"/>
  <path d="M15.5 8.1 H38 Q42.5 9 38 9.9 H15.5 Z"/><circle cx="42.6" cy="9" r="1.5"/>
  <path d="M8.1 15.5 V38 Q9 42.5 9.9 38 V15.5 Z"/><circle cx="9" cy="42.6" r="1.5"/>
  <path d="M13.2 13.2 C 18.6 12.4 23.4 15.2 24.6 20.6 C 21.4 18.6 17.6 17.9 14.6 19.1 C 15.9 16.8 15.3 14.9 13.2 13.2 Z"/>
  <path d="M13.2 13.2 C 12.4 18.6 15.2 23.4 20.6 24.6 C 18.6 21.4 17.9 17.6 19.1 14.6 C 16.8 15.9 14.9 15.3 13.2 13.2 Z"/>
  <circle cx="22.6" cy="22.6" r="1.7"/>
</g></svg>`;

// 横幅：一条羊皮纸飘带（中间一段 + 两端折到后面的燕尾）
function ribbonSVG() {
  return '<div class="ribbon" aria-hidden="true"><i class="tail l"></i><i class="tail r"></i><i class="band"></i></div>';
}

export class UI {
  constructor(root, audio) {
    this.root = root;
    this.audio = audio;
    this.thumbs = {};
    this.rerender = new Set();
    this.build();
    this.modalOpen = false;
    window.addEventListener('keydown', (e) => {
      if (!this.modalOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); this.closeModal(); }
      if (e.key === 'Tab') {
        const controls = [...this.modal.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    });
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
    this.tossEl = el('div', 'toss-screen hidden');
    this.live = el('div', 'sr-only');
    this.live.setAttribute('role', 'status');
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('aria-atomic', 'true');
    this.popLayer = el('div', 'pop-layer');
    this.fader = el('div', 'fader');
    for (const e of [this.splash, this.introCap, this.skipBtn, this.hud, this.popLayer, this.bannerEl, this.menuEl, this.fateEl, this.overEl, this.tossEl, this.modal, this.toolbar, this.fader, this.tip, this.live]) r.appendChild(e);
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
  hideSkip() {
    this.skipBtn.classList.add('hidden');
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
        b.setAttribute('aria-label', title);
        if (icon === 'music' || icon === 'sound') b.setAttribute('aria-pressed', String(active));
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
      if (this.hudState && !this.hud.classList.contains('hidden')) mk('≡', t.log, () => this.showLog());
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
  // 菜单是贴在画面下方的一条：上面露出对面座位，点哪个对手，那个人就走过来坐下
  showMenu(onStart, current = 'regular', targets = {}, onSelect = null) {
    let sel = current;
    const render = () => {
      const t = this.t();
      const m = this.menuEl;
      m.innerHTML = '';
      const brand = el('div', 'menu-brand', `<div class="eyebrow">${t.menuKicker}</div><h1 class="title">${t.title}</h1><div class="subtitle">${t.titleSub}</div>`);
      m.appendChild(brand);
      const card = el('div', 'menu-card');
      card.appendChild(el('div', 'menu-heading', `<span class="eyebrow">${t.chooseDiff}</span><span class="menu-version">${VERSION}</span>`));
      const grid = el('div', 'diff-grid');
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', t.chooseDiff);
      const details = el('div', 'opponent-info');
      const refreshDetails = () => {
        const info = t.diff[sel];
        details.innerHTML = `<div class="opponent-name">${info.who}</div><div class="opponent-desc">${info.desc}</div><div class="opponent-target">${t.targetN(targets[sel])}</div>`;
      };
      for (const d of ['casual', 'novice', 'regular', 'king']) {
        const info = t.diff[d];
        const lv = DIFF_LEVEL[d];
        const pips = [1, 2, 3, 4].map((i) => `<i class="${i <= lv ? 'on' : ''}">◆</i>`).join('');
        const c = el('button', 'diff' + (d === sel ? ' sel' : '') + ' d-' + d);
        c.setAttribute('aria-pressed', String(d === sel));
        c.innerHTML = `<div class="diff-icon"><svg viewBox="0 0 48 48">${EMBLEMS[DIFF_EMBLEM[d]]}</svg></div>
          <div class="diff-text"><div class="diff-name">${info.name}</div><div class="diff-meta"><span class="pips" aria-hidden="true">${pips}</span><span>${targets[d]} ${t.score}</span></div></div>`;
        c.onclick = () => {
          if (sel === d) return;
          sel = d;
          this.audio.select(true);
          grid.querySelectorAll('.diff').forEach((x) => {
            x.classList.toggle('sel', x === c);
            x.setAttribute('aria-pressed', String(x === c));
          });
          refreshDetails();
          if (onSelect) onSelect(d);
        };
        grid.appendChild(c);
      }
      card.appendChild(grid);
      const row = el('div', 'menu-footer');
      refreshDetails();
      row.appendChild(details);
      row.appendChild(this.btn(t.start, 'primary big', () => {
        this.hideMenu();
        onStart(sel);
      }));
      card.appendChild(row);
      m.appendChild(card);
    };
    this.menuRender = render;
    this.rerender.add(render);
    render();
    this.root.classList.add('menu-open');
    this.menuEl.classList.remove('hidden');
    requestAnimationFrame(() => this.menuEl.classList.add('show'));
  }
  hideMenu() {
    this.rerender.delete(this.menuRender);
    this.root.classList.remove('menu-open');
    this.menuEl.classList.remove('show');
    setTimeout(() => this.menuEl.classList.add('hidden'), 400);
  }

  // ---------- 命运之骰 ----------
  // offers: [{typeId, variant} | null] x6
  showFate(offers, onConfirm) {
    const choice = offers.map(() => false);
    let active = Math.max(0, offers.findIndex(Boolean));
    this.fateResolve = onConfirm;
    const render = () => {
      const t = this.t();
      const f = this.fateEl;
      f.innerHTML = '';
      const card = el('div', 'paper fate-card');
      card.appendChild(el('div', 'eyebrow', t.fateKicker));
      card.appendChild(el('h2', 'title small', t.fateTitle));
      card.appendChild(el('p', 'fate-sub', t.fateSub));
      if (!offers.some(Boolean)) card.appendChild(el('p', 'fate-none', t.fateNone));
      const row = el('div', 'fate-row');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', t.yourDice);
      offers.forEach((o, i) => {
        const selected = o && choice[i];
        const typeId = selected ? o.typeId : NORMAL_ID;
        const slot = el('button', `slot${o ? ' swappable' : ''}${active === i ? ' active' : ''}${selected ? ' chosen' : ''}`,
          `<span class="slot-label">${t.slot(i + 1)}</span>${o ? '<i class="swap-star" aria-hidden="true">✦</i>' : ''}<span class="slot-die"><img src="${this.thumb(typeId, selected ? o.variant : 0)}" alt=""></span><span class="slot-name">${dieName(typeId, i18n.lang)}</span><span class="slot-status">${selected ? '✓ ' + t.equipped : o ? t.swapAvailable : t.commonOnly}</span>`);
        slot.setAttribute('aria-pressed', String(active === i));
        slot.dataset.slot = i;
        slot.onclick = () => { active = i; this.audio.select(false); render(); this.fateEl.querySelector(`[data-slot="${i}"]`)?.focus({ preventScroll: true }); };
        row.appendChild(slot);
      });
      card.appendChild(row);
      const detail = el('div', 'fate-detail');
      const offer = offers[active];
      detail.appendChild(el('div', 'fate-detail-heading', `<span>${t.slot(active + 1)}</span><strong>${offer ? t.chooseDie : t.commonOnly}</strong>`));
      const options = el('div', 'fate-options');
      const option = (typeId, variant, special) => {
        const selected = choice[active] === special;
        const b = el('button', `fate-option${selected ? ' selected' : ''}`, `<img src="${this.thumb(typeId, variant)}" alt=""><span><strong>${dieName(typeId, i18n.lang)}</strong><span class="option-hint">${dieHint(typeId, i18n.lang)}</span><span class="option-state">${selected ? '✓ ' + t.equipped : t.transform}</span></span>`);
        b.setAttribute('aria-pressed', String(selected));
        b.dataset.option = special ? 'special' : 'normal';
        b.onclick = () => { choice[active] = special; this.audio.select(special); render(); this.fateEl.querySelector(`[data-option="${special ? 'special' : 'normal'}"]`)?.focus({ preventScroll: true }); };
        return b;
      };
      options.appendChild(option(NORMAL_ID, 0, false));
      if (offer) options.appendChild(option(offer.typeId, offer.variant, true));
      detail.appendChild(options);
      card.appendChild(detail);
      const act = el('div', 'fate-footer');
      act.appendChild(el('p', 'fate-summary', t.fateSummary(choice.filter(Boolean).length)));
      act.appendChild(this.btn(t.confirm, 'primary big', () => {
        this.closeFate(choice.slice());
      }));
      card.appendChild(act);
      f.appendChild(card);
    };
    this.fateRender = render;
    this.rerender.add(render);
    render();
    this.fateEl.classList.remove('hidden');
    requestAnimationFrame(() => this.fateEl.classList.add('show'));
  }

  closeFate(choice = null) {
    this.rerender.delete(this.fateRender);
    this.fateEl.classList.remove('show');
    this.fateEl.classList.add('hidden');
    const done = this.fateResolve;
    this.fateResolve = null;
    done?.(choice);
  }

  beginToss() {
    this.tossHeads = null;
    this.tossReady = false;
    this.tossRender = () => {
      const t = this.t(), heads = this.tossHeads, result = heads !== null;
      this.tossEl.classList.toggle('has-result', result);
      this.tossEl.innerHTML = `<div class="toss-heading" aria-hidden="${result}"><div class="eyebrow">${t.tossKicker}</div><h2>${t.tossTitle}</h2></div>`;
      const footer = el('div', `toss-footer${result ? ' result' : ''}`);
      if (result) {
        footer.innerHTML = `<div class="toss-face">${heads ? t.tossHeads : t.tossCross}</div><h2 class="toss-winner">${heads ? t.firstYouShort : t.firstOppShort}</h2>`;
        const b = this.btn(t.beginRound, 'primary big', () => this.endToss(true));
        b.disabled = !this.tossReady;
        footer.appendChild(b);
      } else footer.innerHTML = `<div class="toss-rules"><span><img src="${groschenIcons().heads}" alt=""><b>${t.tossHeads}</b>${t.firstYouShort}</span><span><img src="${groschenIcons().cross}" alt=""><b>${t.tossCross}</b>${t.firstOppShort}</span></div>`;
      this.tossEl.appendChild(footer);
    };
    this.rerender.add(this.tossRender);
    this.tossRender();
    this.tossEl.classList.remove('hidden');
    this.root.classList.add('toss-open');
    return new Promise((resolve) => { this.tossResolve = resolve; });
  }
  revealToss(heads) {
    this.tossHeads = heads;
    this.tossRender?.();
    this.live.textContent = heads ? this.t().firstYouShort : this.t().firstOppShort;
  }
  readyToss() {
    this.tossReady = true;
    this.tossRender?.();
    this.tossEl.querySelector('button')?.focus({ preventScroll: true });
  }
  endToss(ok = false) {
    this.rerender.delete(this.tossRender);
    this.tossEl.classList.add('hidden');
    this.root.classList.remove('toss-open');
    const done = this.tossResolve;
    this.tossResolve = null;
    done?.(ok);
  }

  // ---------- 对局 HUD ----------
  showHud(state) {
    this.hudState = state;
    const render = () => this.renderHud();
    this.hudRender = render;
    this.rerender.add(render);
    this.hud.classList.remove('hidden');
    this.root.classList.add('playing');
    this.toolbarRender();
    render();
  }
  hideHud() {
    this.bankHold?.destroy();
    this.bankHold = null;
    this.rerender.delete(this.hudRender);
    this.hud.classList.add('hidden');
    this.root.classList.remove('playing');
    this.toolbarRender();
    clearTimeout(this.bannerTimer);
    this.bannerEl.innerHTML = '';
    this.popLayer.innerHTML = '';
  }
  renderHud() {
    this.bankHold?.destroy();
    this.bankHold = null;
    const s = this.hudState;
    if (!s) return;
    const t = this.t();
    const h = this.hud;
    h.innerHTML = '';
    const panel = (p, idx) => {
      const isAI = idx === 1;
      const pe = el('div', `panel vellum ${isAI ? 'right' : 'left'}${s.current === idx ? ' active' : ''}`);
      pe.insertAdjacentHTML('beforeend', isAI ? sealSVG('green', DIFF_EMBLEM[s.difficulty], 41) : sealSVG('red', 'H', 40));
      if (s.current === idx) pe.insertAdjacentHTML('beforeend', '<i class="p-mark"></i>');
      // 掷币定先手的提醒：先手一方的牌子上一枚小格罗申（玩家先手是头像那面，对手先手是十字那面）
      if (s.first === idx) pe.insertAdjacentHTML('beforeend', `<div class="p-first" title="${t.tossLog(idx === 0)}"><img src="${groschenIcons()[idx === 0 ? 'heads' : 'cross']}" alt=""><span>${t.firstBadge}</span></div>`);
      const name = isAI ? `${t.opponent} · ${t.diff[s.difficulty].name}` : t.you;
      const sub = isAI ? t.diff[s.difficulty].who : t.targetN(s.target);
      pe.insertAdjacentHTML('beforeend', `<div class="p-head"><span class="p-name">${name}</span><span class="p-sub">${sub}</span></div>
        <div class="p-score"><b>${p.score}</b><span>/ ${s.target}</span></div>
        <div class="p-bar"><i style="width:${Math.min(100, (p.score / s.target) * 100)}%"></i></div>`);
      if (!isAI) {
        const dice = el('div', 'p-dice');
        p.types.forEach((ty, i) => {
          const d = el('button', 'p-die' + (ty !== NORMAL_ID ? ' special' : ''), `<img src="${this.thumb(ty, p.variants[i])}" alt="">`);
          d.setAttribute('aria-label', dieName(ty, i18n.lang));
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
    const info = el('div', 'turn-info vellum');
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
    if (s.mode === 'choose' && s.diceChoices) {
      const detail = el('div', 'pick-detail');
      detail.setAttribute('role', 'status');
      detail.setAttribute('aria-live', 'polite');
      detail.setAttribute('aria-atomic', 'true');
      const inspect = (index) => {
        const d = s.diceChoices?.[index];
        detail.innerHTML = d
          ? `<img src="${this.thumb(d.typeId, d.variant)}" alt=""><span><small>${t.slot(index + 1)}</small><strong>${dieName(d.typeId, i18n.lang)}</strong></span>`
          : `<span class="pick-name-hint">${t.pickNameHint}</span>`;
      };
      inspect(s.inspectedDie);
      bottom.appendChild(detail);
      const picks = el('div', 'dice-picks');
      picks.setAttribute('role', 'group');
      picks.setAttribute('aria-label', t.pickHint);
      s.diceChoices.forEach((d, i) => {
        const b = el('button', `die-pick${d.selected ? ' selected' : ''}`, `<span class="pick-index">${i + 1}</span><b>${t.face(d.value, d.joker)}</b>`);
        b.setAttribute('aria-label', `${t.slot(i + 1)} · ${dieName(d.typeId, i18n.lang)} · ${t.faceNow(t.face(d.value, d.joker))}`);
        b.setAttribute('aria-pressed', String(d.selected));
        b.dataset.pick = i;
        // A rerender under a stationary mouse must not overwrite keyboard selection.
        b.addEventListener('pointermove', () => inspect(i));
        b.addEventListener('focus', () => inspect(i));
        b.addEventListener('mouseleave', () => inspect(s.inspectedDie));
        b.addEventListener('keydown', (e) => {
          if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.stopPropagation(); this.bankHold?.startKey(e); }
        });
        b.onclick = () => { s.onPickDie?.(i); this.hud.querySelector(`[data-pick="${i}"]`)?.focus({ preventScroll: true }); };
        picks.appendChild(b);
      });
      bottom.appendChild(picks);
    }
    const actions = el('div', 'actions');
    if (s.mode === 'roll') {
      actions.appendChild(this.btn(`${t.roll}<span class="key">${t.keySpace}</span>`, 'primary big', () => s.onRoll && s.onRoll()));
    } else if (s.mode === 'choose') {
      const valid = s.selection && s.selection.valid;
      const allSel = valid && s.selection.all;
      const b1 = this.btn(`${allSel ? t.rollAll : t.rollAgain}<span class="key">${t.keySpace}</span>`, 'primary', () => s.onKeepRoll && s.onKeepRoll());
      b1.disabled = !valid;
      const bankLabel = valid ? `${t.holdBank} <b>${s.turnScore + s.selection.score}</b>` : t.holdBank;
      const b2 = el('button', 'btn gold bank-hold', `<span>${bankLabel}<small class="hold-hint">${t.holdHint}<span class="key">${t.keyEnter}</span></small></span>`);
      b2.disabled = !valid;
      b2.setAttribute('aria-keyshortcuts', 'Enter');
      this.bankHold = bindHoldConfirm(b2, {
        canConfirm: () => !this.modalOpen && !this.hud.classList.contains('hidden') && this.hudState.mode === 'choose' && this.hudState.selection?.valid,
        onHolding: (holding) => { b2.querySelector('.hold-hint').firstChild.textContent = holding ? t.holdingHint : t.holdHint; },
        confirm: () => { this.audio.click(); s.onBank?.(); },
      });
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

  // icon：飘带上方显示的小图（掷币结果那一面）
  banner(text, sub = '', kind = '', dur = 1800, icon = '') {
    this.live.textContent = [text, sub].filter(Boolean).join(' · ');
    const b = el('div', 'banner-inner ' + kind, `${ribbonSVG()}${icon ? `<img class="b-coin" src="${icon}" alt="">` : ''}<div class="b-text">${text}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`);
    this.showBanner(b, dur, /\btoss/.test(kind));
  }

  // A brief illuminated score, with a wax impression for a lost turn.
  scoreMoment(kind, score, player) {
    const t = this.t(), bust = kind === 'bust';
    const title = bust ? t.bust : t.big;
    const context = bust ? t.scoreBust(t.who(player)) : t.scoreRoll(t.who(player));
    const number = score.toLocaleString(i18n.lang === 'zh' ? 'zh-CN' : 'en-US');
    this.live.textContent = `${context} · ${title} · ${number} ${t.scoreUnit}${bust ? ' · ' + t.bustSub : ''}`;
    const sparks = Array.from({ length: bust ? 7 : 14 }, (_, i) => {
      const angle = i * 2.39996;
      const x = Math.cos(angle) * (64 + (i % 4) * 18);
      const y = bust ? 18 + i * 7 : -24 - (i % 5) * 17;
      return `<i style="--sx:${x.toFixed(1)}px;--sy:${y}px;--sd:${i * 28}ms;--sr:${i * 37}deg"></i>`;
    }).join('');
    const b = el('div', `banner-inner score-moment score-${bust ? 'bust' : 'high'}`, `
      <div class="score-aura" aria-hidden="true"></div>
      <div class="score-dust" aria-hidden="true">${sparks}</div>
      <div class="score-heading">${title}</div>
      <div class="score-value"><b>${number}</b><span>${t.scoreUnit}</span></div>
      ${flourishSVG()}
      <div class="score-context">${context}</div>
      ${bust ? `<div class="score-caption">${t.bustSub}</div>` : ''}`);
    this.showBanner(b, 2200);
  }

  showBanner(b, dur, low = false) {
    this.bannerEl.innerHTML = '';
    this.bannerEl.classList.toggle('low', low);
    this.bannerEl.classList.toggle('score-announcement', b.classList.contains('score-moment'));
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
    const focused = () => { const r = node.getBoundingClientRect(); this.showTip(typeId, r.left, r.bottom); };
    node.addEventListener('focus', focused);
    node.addEventListener('blur', () => this.hideTip());
    node.addEventListener('click', focused);
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
    this.tip.style.transform = `translate(${Math.max(8, px)}px, ${Math.max(8, py)}px)`;
  }
  hideTip() {
    this.tip.classList.add('hidden');
  }

  // ---------- 规则 / 图鉴 ----------
  openModal(build, wide = false) {
    this.bankHold?.cancel();
    if (!this.modalOpen) this.returnFocus = document.activeElement;
    this.modalOpen = true;
    this.onModalChange?.(true);
    this.hideTip();
    for (const item of [this.hud, this.menuEl, this.fateEl, this.overEl, this.toolbar, this.tossEl]) item.inert = true;
    const render = () => {
      this.modal.innerHTML = '';
      const card = el('div', 'paper modal-card' + (wide ? ' wide' : ''));
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', 'modal-title');
      const body = el('div', 'modal-body');
      build(card, body);
      const title = card.querySelector('h2');
      if (title) title.id = 'modal-title';
      card.appendChild(body);
      const close = this.btn(this.t().close, '', () => this.closeModal());
      close.classList.add('close');
      card.appendChild(close);
      this.modal.appendChild(card);
      requestAnimationFrame(() => close.focus({ preventScroll: true }));
    };
    if (this.modalRender) this.rerender.delete(this.modalRender);
    this.modalRender = render;
    this.rerender.add(render);
    render();
    // 刚关掉一个、马上又打开另一个：取消上一个的“稍后隐藏”
    clearTimeout(this.modalHideTimer);
    this.modal.classList.remove('hidden');
    requestAnimationFrame(() => this.modal.classList.add('show'));
    this.modal.onclick = (e) => {
      if (e.target === this.modal) this.closeModal();
    };
  }
  closeModal() {
    this.modalOpen = false;
    this.onModalChange?.(false);
    for (const item of [this.hud, this.menuEl, this.fateEl, this.overEl, this.toolbar, this.tossEl]) item.inert = false;
    this.rerender.delete(this.modalRender);
    this.modal.classList.remove('show');
    clearTimeout(this.modalHideTimer);
    this.modalHideTimer = setTimeout(() => this.modal.classList.add('hidden'), 300);
    this.hideTip();
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
  }
  showLog() {
    this.openModal((card, body) => {
      card.appendChild(el('h2', 'title small', this.t().log));
      for (const line of this.hudState?.log || []) body.appendChild(el('p', 'history-line', typeof line === 'function' ? line(this.t()) : line));
    });
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
    clearTimeout(this.overHideTimer);
    if (this.overRender) this.rerender.delete(this.overRender);
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
    this.overRender = render;
    this.rerender.add(render);
    render();
    this.overEl.classList.remove('hidden');
    requestAnimationFrame(() => this.overEl.classList.add('show'));
  }
  hideOver(render = this.overRender) {
    this.rerender.delete(render);
    this.overRender = null;
    this.overEl.classList.remove('show');
    clearTimeout(this.overHideTimer);
    this.overHideTimer = setTimeout(() => this.overEl.classList.add('hidden'), 400);
  }
}
