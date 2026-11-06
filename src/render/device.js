// 手机和平板：内存、显存都紧，超了页面会被系统直接杀掉，所以少装东西、画质低一档。网址加 ?lite 可以在电脑上试
const ua = globalThis.navigator?.userAgent ?? '';
const touchMac = /Macintosh/.test(ua) && (globalThis.navigator?.maxTouchPoints ?? 0) > 1; // iPad 的 Safari 自称是 Mac
export const LITE = /Android|iPhone|iPad|iPod/i.test(ua) || touchMac || /[?&]lite\b/.test(globalThis.location?.search ?? '');
