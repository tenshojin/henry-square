// Native buttons own Enter/Space. Global game shortcuts must never leak through dialogs.
export function allowsGameShortcut(event, { visible, modalOpen, mode }) {
  if (!visible || modalOpen || !['roll', 'choose'].includes(mode)) return false;
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return false;
  // 点数按钮只负责选骰：焦点留在它上面时，数字键照常选，空格仍是“留下并再掷”，不能变成再点一下按钮把骰子取消
  if (mode === 'choose' && (/^[1-6]$/.test(event.key) || event.code === 'Space' || event.code === 'KeyA') && event.target?.closest?.('[data-pick]')) return true;
  return !event.target?.closest?.('button, input, textarea, select, a, [contenteditable="true"], [role="dialog"]');
}
