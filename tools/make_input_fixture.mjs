// Local input review: real fate UI, selection, scoring and hold controls.
// Offers and throws are fixed, movement is immediate, and AI play is paused.
// Generated under .qa and never included in the published game.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let html = fs.readFileSync(path.join(root, '亨利酒馆.html'), 'utf8');
html = html.replace(/<script type="application\/json" id="asset-cutscenes-meta">[\s\S]*?<\/script>/, '');
const review = `<style>
#input-review{position:fixed;top:2px;left:50%;transform:translateX(-50%);z-index:200;max-width:95vw;padding:4px 9px;border:1px solid #8e7449;border-radius:10px;background:#18130fee;color:#efdec2;font:11px Georgia,serif;text-align:center}
#input-review button{background:#48301f;color:#f4dfb5;border:1px solid #ac8552;border-radius:5px;padding:5px;font-size:11px}
</style><script>
const readyInputReview = setInterval(() => {
  const g = window.__game;
  if (!g) return;
  clearInterval(readyInputReview);
  g.ui.hideSplash();
  g.stage.camMode = 'game';
  g.stage.tween = async (duration, fn) => { fn(1, 1); };
  g.ui.showToolbar(() => g.backToMenu());
  const bar = document.createElement('aside');
  bar.id = 'input-review';
  bar.innerHTML = '<button>重置验收</button> <span>输入验收副本 · 固定骰面 · 不进入对手回合</span>';
  document.body.append(bar);
  const fate = g.ui.showFate.bind(g.ui);
  g.ui.showFate = (offers, done) => {
    offers.splice(0, 6, {typeId:'loaded',variant:0}, null, {typeId:'devil',variant:0}, null, {typeId:'friar',variant:0}, null);
    return fate(offers, done);
  };
  g.tossCoin = async () => 0;
  g.throwDice = async (player, pool) => {
    pool.forEach((die, i) => {
      die.setRest([1,5,2,3,4,6][i]);
      die.group.position.set(-4 + (i % 3) * 4, .55, -2 + Math.floor(i / 3) * 4);
      die.group.visible = true;
    });
  };
  g.runMatch = async id => {
    await g.playTurn(0, id);
    bar.querySelector('span').textContent = '已完成真实收分：' + g.players[0].score;
  };
  bar.querySelector('button').onclick = async () => {
    try {
      await g.audio.init(); g.audio.resume();
      g.ui.hideHud(); g.ui.hideOver();
      bar.querySelector('span').textContent = '输入验收副本 · 固定骰面 · 不进入对手回合';
      await g.startMatch('casual');
    } catch (e) { if (e.constructor.name !== 'Cancelled') console.error(e); }
  };
}, 100);
</script>`;
html = html.replace('</body>', review + '</body>');
fs.mkdirSync(path.join(root, '.qa'), { recursive: true });
fs.writeFileSync(path.join(root, '.qa', 'input-review.html'), html);
console.log('Created .qa/input-review.html');
