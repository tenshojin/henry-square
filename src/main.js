// 入口：加载场景 → 开场页 → 开场动画 → 菜单
import { Stage } from './render/stage.js';
import { buildWorld } from './render/world.js';
import { buildPeople } from './render/people.js';
import { createThumbnailer, Die3D } from './render/diceModel.js';
import { AudioEngine } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { Game } from './game/game.js';
import { DICE } from './data/dice.js';
import { i18n } from './i18n.js';
import THUMBS from './generated/thumbs.js';

// 让出一帧给界面刷新；后台标签页里 rAF 会被暂停，所以用定时器兜底
const nextFrame = () =>
  new Promise((r) => {
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        r();
      }
    };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 60);
  });

async function main() {
  const mark = (k) => (window.__loadTimes = window.__loadTimes || []).push([k, Math.round(performance.now())]);
  i18n.set(i18n.lang);
  const audio = new AudioEngine();
  const ui = new UI(document.getElementById('ui'), audio);
  let entered = false;
  let onEnter = null;
  ui.showSplash(() => onEnter && onEnter());
  await nextFrame();

  const stage = new Stage(document.getElementById('app'));
  stage.paused = true; // 着色器编译完之前先不渲染，避免主线程卡住
  stage.camera.position.set(0, 46, 380);
  stage.camera.lookAt(0, 52, 147);
  mark('stage');
  ui.setLoading(0.1);
  await nextFrame();
  // 酒馆（Blender 建模 + 烘焙光照）和四个人物都是内嵌的模型文件，异步解码
  const tav = await buildWorld(stage.scene, stage.renderer, { camera: stage.camera });
  tav.updaters.forEach((fn) => stage.add(fn));
  ui.setLoading(0.2);
  const people = await buildPeople(stage.scene, tav, { audio });
  people.updaters.forEach((fn) => stage.add(fn));
  tav.crowd = people;
  const game = new Game(stage, ui, audio);
  game.tavern = tav;
  // 默认难度对应的对手直接坐在对面
  game.setOpponent(game.difficulty, true);
  // 对手的骰盅在动时，坐在对面的人眼睛跟着它；任何一个盅在动时，桌边的人不去拿酒杯
  people.setOpponentCup(game.cups[1], game.cupRest[1]);
  people.setCups(game.cups, game.cupRest);
  mark('tavern');
  ui.setLoading(0.3);
  await nextFrame();

  // 场景和骰子的着色器在显卡驱动里并行编译
  const warm = new Die3D('heaven');
  warm.group.position.set(0, -200, 0);
  stage.scene.add(warm.group);
  stage.scene.add(warm.ring);
  warm.ring.visible = true;
  const compiling = stage.renderer.compileAsync(stage.scene, stage.camera).then(() => {
    stage.scene.remove(warm.group);
    stage.scene.remove(warm.ring);
  });

  // 骰子缩略图（UI 用）：优先使用打包时预先生成的图片
  const entries = [];
  for (const d of DICE) {
    if (d.variants) d.variants.forEach((_, v) => entries.push({ key: `${d.id}:${v}`, typeId: d.id, variant: v }));
    else entries.push({ key: d.id, typeId: d.id });
  }
  const prebuilt = location.search.includes('rethumb') ? {} : THUMBS.images || {};
  if (entries.every((e) => prebuilt[e.key])) {
    Object.assign(ui.thumbs, prebuilt);
  } else {
    const thumbnailer = createThumbnailer();
    for (let i = 0; i < entries.length; i += 4) {
      Object.assign(ui.thumbs, thumbnailer.render(entries.slice(i, i + 4)));
      ui.setLoading(0.3 + 0.55 * Math.min(1, (i + 4) / entries.length));
      await nextFrame();
    }
    thumbnailer.dispose();
  }
  ui.thumbs.painter = ui.thumbs['painter:0'];
  mark('thumbs');
  ui.setLoading(0.9);
  await compiling;
  stage.paused = false;
  mark('compile');
  ui.setLoading(1);
  ui.setLoaded();
  window.__game = game;

  onEnter = async () => {
    if (entered) return;
    entered = true;
    // 音频在后台解码，不阻塞画面
    audio.init().then(() => {
      audio.resume();
      audio.startAmbience();
    });
    ui.hideSplash();
    if (location.search.includes('nointro')) game.skipIntro();
    else await game.playIntro();
    game.showMenu();
  };
}

main().catch((e) => {
  console.error(e);
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#f0d8a8;background:#140a05;font:18px Georgia,serif;padding:30px;text-align:center;z-index:999';
  div.textContent = '启动失败 / Failed to start: ' + (e && e.message ? e.message : e);
  document.body.appendChild(div);
});
