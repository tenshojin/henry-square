// A decoder must never hold the whole game indefinitely.
export function waitForMedia(el, name, trigger, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      el.removeEventListener(name, done);
      el.removeEventListener('error', failed);
    };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error(`Video ${name} failed`)); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Video ${name} timed out`)); }, timeout);
    el.addEventListener(name, done);
    el.addEventListener('error', failed);
    try { trigger?.(); } catch (error) { cleanup(); reject(error); }
  });
}

export async function playMedia(el, timeout = 8000) {
  let timer;
  try {
    await Promise.race([
      el.play(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Video play timed out')), timeout); }),
    ]);
  } finally { clearTimeout(timer); }
}
