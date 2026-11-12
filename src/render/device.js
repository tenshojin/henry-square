// 手机和平板：内存、显存都紧，超了页面会被系统直接杀掉，所以少装东西、画质低一档。网址加 ?lite 可以在电脑上试
const ua = globalThis.navigator?.userAgent ?? '';
const touchMac = /Macintosh/.test(ua) && (globalThis.navigator?.maxTouchPoints ?? 0) > 1; // iPad 的 Safari 自称是 Mac
export const LITE = /Android|iPhone|iPad|iPod/i.test(ua) || touchMac || /[?&]lite\b/.test(globalThis.location?.search ?? '');
// 主要靠手指点的设备：提示里说“点一下”不说“点击”，也不提键盘快捷键（电脑上接了触屏也还算电脑）
export const TOUCH = !!globalThis.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
// 网页版的模型只有牌桌（打包时裁好的）：酒馆别的部分都不在，壁炉的火、蜡烛也不用摆。离线的单文件才有整间酒馆
// 手机：打牌想一想屏幕就暗了、锁了，对局中别让它自己息屏（切走再回来要重新申请）
let wakeLock = null;
let wantAwake = false;
export async function keepAwake(on) {
  wantAwake = on;
  if (!LITE || !globalThis.navigator?.wakeLock) return;
  try {
    if (on && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
    }
  } catch (e) { /* 省电模式之类不给就算了 */ }
}
globalThis.document?.addEventListener('visibilitychange', () => { if (wantAwake && !document.hidden) keepAwake(true); });

export const TABLE_ONLY = LITE || !!globalThis.document?.querySelector?.('meta[name="table-only"]');
