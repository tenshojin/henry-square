// A decoder must never hold the whole game indefinitely.
// 浏览器不在后台标签页里加载视频：页面看不见时不计时，切回来再从头算，否则打开网址后切走，回来过场动画就全没了
export function waitForMedia(el, name, trigger, timeout = 8000, doc = globalThis.document) {
  return new Promise((resolve, reject) => {
    let timer = null;
    const cleanup = () => {
      clearTimeout(timer);
      doc?.removeEventListener('visibilitychange', arm);
      el.removeEventListener(name, done);
      el.removeEventListener('error', failed);
    };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error(`Video ${name} failed`)); };
    const arm = () => {
      clearTimeout(timer);
      timer = doc?.hidden ? null : setTimeout(() => { cleanup(); reject(new Error(`Video ${name} timed out`)); }, timeout);
    };
    arm();
    doc?.addEventListener('visibilitychange', arm);
    el.addEventListener(name, done);
    el.addEventListener('error', failed);
    try { trigger?.(); } catch (error) { cleanup(); reject(error); }
  });
}

export async function playMedia(el, timeout = 8000, doc = globalThis.document) {
  let timer = null;
  let arm;
  try {
    await Promise.race([
      el.play(),
      new Promise((_, reject) => {
        arm = () => {
          clearTimeout(timer);
          timer = doc?.hidden ? null : setTimeout(() => reject(new Error('Video play timed out')), timeout);
        };
        arm();
        doc?.addEventListener('visibilitychange', arm);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    doc?.removeEventListener('visibilitychange', arm);
  }
}
