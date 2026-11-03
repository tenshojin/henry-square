// A local, reproducible visual review page. Production HTML is never modified.
// Uses the real UI and coin effects; only suppresses cutscenes, pauses match
// progression after dealing, and optionally keeps score text visible for capture.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let html = fs.readFileSync(path.join(root, '亨利酒馆.html'), 'utf8');
html = html.replace(/<script type="application\/json" id="asset-cutscenes-meta">[\s\S]*?<\/script>/, '');
const review = `<style>
  #animation-review{position:fixed;bottom:6px;right:6px;z-index:200;display:flex;gap:5px;flex-wrap:wrap;width:260px;max-width:96vw;padding:8px;border:1px solid #8e7449;border-radius:12px;background:#18130fee;color:#efdec2;font:12px Georgia,serif}
  #animation-review button{background:#48301f;color:#f4dfb5;border:1px solid #ac8552;border-radius:8px;padding:7px;font-size:12px}
  #animation-review p{width:100%;margin:0 0 4px;font-size:11px}
</style><script>
const readyReview = setInterval(() => {
  const g = window.__game;
  if (!g) return;
  clearInterval(readyReview);
  g.ui.hideSplash();
  g.ui.showToolbar(() => g.backToMenu());
  g.runMatch = async () => {};
  const bar = document.createElement('aside');
  bar.id = 'animation-review';
  bar.innerHTML = '<p>视觉验收副本 · 回合暂停 · 勾选时仅延长分数停留</p><label><input id="review-hold" type="checkbox" checked>延长停留</label>';
  const add = (name, fn) => {
    const b = document.createElement('button'); b.textContent = name;
    b.onclick = async () => { try { await fn(); } catch (error) { console.error(error); } };
    bar.append(b);
  };
  add('摆桌与掷币', async () => {
    await g.audio.init();
    g.audio.resume();
    g.ui.hideOver();
    g.ui.hideHud();
    g.stopCoins?.();
    const started = g.startMatch('casual');
    g.ui.closeFate(Array(6).fill(false));
    await started;
  });
  const moment = (kind, score, player) => {
    g.ui.scoreMoment(kind, score, player);
    if (document.getElementById('review-hold').checked) clearTimeout(g.ui.bannerTimer);
  };
  add('你 · 1000 分', () => moment('high', 1000, 0));
  add('对手 · 8000 分', () => moment('high', 8000, 1));
  add('你 · 0 分', () => moment('bust', 0, 0));
  add('胜利撒金币', async () => {
    if (!g.players) return;
    g.players[0].score = 1000;
    g.ui.updateHud({ players:g.players, mode:null });
    await g.finish(true, g.matchId);
  });
  add('语言 / Language', () => g.ui.toolbar.querySelector('[title="Language"]')?.click());
  document.body.append(bar);
}, 100);
</script>`;
html = html.replace('</body>', review + '</body>');
fs.mkdirSync(path.join(root, '.qa'), { recursive: true });
fs.writeFileSync(path.join(root, '.qa', 'animation-review.html'), html);
console.log('Created .qa/animation-review.html');
