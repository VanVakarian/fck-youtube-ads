// The popup width is a per-machine preference, so it lives in localStorage, not chrome.storage: it can be read
// synchronously from the <head>, so the popup opens at its width with no jump, and it stays out of the
// exported settings (a width that suits one screen says nothing about another).

const POPUP_WIDTH_KEY = 'popupWidth';
const POPUP_WIDTH_MIN = 200;
const POPUP_WIDTH_MAX = 800; // Chrome's own cap on an extension popup
const POPUP_WIDTH_STEP = 100;
const POPUP_WIDTH_DEFAULT = 300;

// the stored width snapped to the nearest level and kept within the range
function readPopupWidth() {
  const stored = localStorage.getItem(POPUP_WIDTH_KEY);
  const width = stored === null ? POPUP_WIDTH_DEFAULT : Number(stored);
  if (!Number.isFinite(width)) return POPUP_WIDTH_DEFAULT;

  const snapped = Math.round(width / POPUP_WIDTH_STEP) * POPUP_WIDTH_STEP;
  return Math.min(Math.max(snapped, POPUP_WIDTH_MIN), POPUP_WIDTH_MAX);
}

function applyPopupWidth(width) {
  document.documentElement.style.setProperty('--popup-width', `${width}px`);
}

applyPopupWidth(readPopupWidth());
