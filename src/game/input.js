// Native buttons own Enter/Space. Global game shortcuts must never leak through dialogs.
export function allowsGameShortcut(event, { visible, modalOpen, mode }) {
  if (!visible || modalOpen || !['roll', 'choose'].includes(mode)) return false;
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return false;
  if (mode === 'choose' && /^[1-6]$/.test(event.key) && event.target?.closest?.('[data-pick]')) return true;
  return !event.target?.closest?.('button, input, textarea, select, a, [contenteditable="true"], [role="dialog"]');
}
