// One uninterrupted press is required. A click (including a synthetic keyboard
// click) cannot commit, and leaving the control/page always discards progress.
export const BANK_HOLD_MS = 900;

export function bindHoldConfirm(button, {
  confirm, canConfirm = () => true, onHolding = () => {},
  duration = BANK_HOLD_MS, win = window, doc = document,
  schedule = setTimeout, unschedule = clearTimeout,
}) {
  let press = null, timer = null, disposed = false;
  const listeners = [];
  const listen = (target, type, fn) => {
    target.addEventListener(type, fn);
    listeners.push(() => target.removeEventListener(type, fn));
  };
  const allowed = () => !disposed && !button.disabled && button.isConnected && !doc.hidden && canConfirm();
  const cancel = () => {
    if (timer !== null) unschedule(timer);
    timer = null;
    const previous = press;
    press = null;
    button.classList.remove('holding');
    onHolding(false);
    if (previous?.pointerId != null && button.hasPointerCapture?.(previous.pointerId)) button.releasePointerCapture(previous.pointerId);
  };
  const start = (source) => {
    if (press || !allowed()) return;
    press = source;
    button.classList.add('holding');
    onHolding(true);
    timer = schedule(() => {
      timer = null;
      if (!allowed()) { cancel(); return; }
      // Keep the press latched until release so repeat events cannot recommit.
      confirm();
    }, duration);
  };
  const startKey = (e) => {
    if (!['Enter', 'NumpadEnter', 'Space'].includes(e.code)) return;
    e.preventDefault();
    if (!e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey) start({ code: e.code, focused: doc.activeElement });
  };
  button.style.setProperty('--hold-duration', `${duration}ms`);
  listen(button, 'pointerdown', (e) => {
    if (e.button !== 0 || e.isPrimary === false || !allowed()) return;
    e.preventDefault();
    button.focus({ preventScroll: true });
    start({ pointerId: e.pointerId });
    if (press?.pointerId === e.pointerId) button.setPointerCapture?.(e.pointerId);
  });
  listen(button, 'pointermove', (e) => {
    if (press?.pointerId !== e.pointerId) return;
    const r = button.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) cancel();
  });
  listen(button, 'pointerleave', () => { if (press?.pointerId != null) cancel(); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    listen(win, type, (e) => { if (press?.pointerId === e.pointerId) cancel(); });
  }
  listen(button, 'keydown', (e) => {
    if (['Enter', 'NumpadEnter', 'Space'].includes(e.code)) { e.stopPropagation(); startKey(e); }
  });
  listen(win, 'keyup', (e) => {
    if (press?.code === e.code) { e.preventDefault(); cancel(); }
  });
  listen(button, 'click', (e) => { e.preventDefault(); e.stopPropagation(); });
  listen(button, 'contextmenu', (e) => e.preventDefault());
  listen(button, 'blur', cancel);
  listen(win, 'blur', cancel);
  listen(win, 'pagehide', cancel);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
  listen(doc, 'focusin', () => { if (press?.code && doc.activeElement !== press.focused) cancel(); });
  return {
    startKey, cancel,
    destroy() { if (disposed) return; disposed = true; cancel(); listeners.forEach(off => off()); },
  };
}
