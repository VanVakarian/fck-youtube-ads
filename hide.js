// Applies the popup's hide rules to YouTube pages through one adopted stylesheet (nothing is added to the DOM).
//
// The rules are kept off while a page is being set up, because YouTube's ad-block check runs at
// `yt-page-data-updated` and hidden ad elements are what it reacts to. So: rules come off at `yt-navigate-start`,
// and go back on `hideDelaySec` after the script starts and after every `yt-page-data-updated`. Editing a rule
// while they are on applies at once; a new delay applies from the next page. The master switch is checked at
// render time, so switching it off clears the rules and switching it on applies them at once.

const hideSheet = new CSSStyleSheet();
let hideSettings = null;
let hideDelayTimer = null;
let hideRulesActive = false;
let hideBannerObserver = null;
let hideBannerShown = false;

function hideDeclaration(mode) {
  return mode === HideMode.Remove ? 'display: none !important' : `opacity: ${hideSettings.dimOpacity / 100} !important`;
}

function renderHideRules() {
  // the page may have replaced document.adoptedStyleSheets since the last render
  if (!document.adoptedStyleSheets.includes(hideSheet)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, hideSheet];
  }

  hideSheet.replaceSync('');
  if (!hideSettings.enabled) return;

  const rejected = [];
  for (const { selector, mode } of hideSettings.rules) {
    if (mode === HideMode.Off || !selector) continue;

    // insertRule takes exactly one rule, so a selector can't smuggle in another; a bad selector just throws
    try {
      hideSheet.insertRule(`${selector} { ${hideDeclaration(mode)}; }`, hideSheet.cssRules.length);
    } catch {
      rejected.push(selector);
    }
  }

  debugLog('hide', 'rules applied', { count: hideSheet.cssRules.length, rejected });
}

function clearHideRules() {
  clearTimeout(hideDelayTimer);
  hideRulesActive = false;
  hideSheet.replaceSync('');
  debugLog('hide', 'rules cleared');
}

function armHideRules() {
  clearHideRules();
  hideDelayTimer = setTimeout(() => {
    hideRulesActive = true;
    renderHideRules();
  }, hideSettings.delaySec * 1000);
  debugLog('hide', 'rules armed', { delaySec: hideSettings.delaySec });
}

async function onHideSettingsChanged(changes, area) {
  const keys = [HIDE_ENABLED_KEY, HIDE_RULES_KEY, HIDE_DELAY_KEY, HIDE_DIM_KEY];
  if (area !== 'local' || !keys.some((key) => key in changes)) return;

  hideSettings = await readHideSettings();
  if (hideRulesActive) renderHideRules();
}

// With the debug log on, records when YouTube's enforcement banner appears relative to the rules
onDebugChange((enabled) => {
  hideBannerObserver?.disconnect();
  hideBannerObserver = null;
  if (!enabled) return;

  hideBannerObserver = new MutationObserver(() => {
    const isShown = document.querySelector('ytd-enforcement-message-view-model') !== null;
    if (isShown === hideBannerShown) return;

    hideBannerShown = isShown;
    const message = isShown ? 'enforcement banner shown' : 'enforcement banner gone';
    debugLog('hide', message, { rulesActive: hideRulesActive });
  });
  hideBannerObserver.observe(document.documentElement, { childList: true, subtree: true });
});

readHideSettings().then((settings) => {
  hideSettings = settings;
  armHideRules();

  // capture on window: catches the event whether YouTube dispatches it on window, document or an element
  window.addEventListener('yt-navigate-start', clearHideRules, true);
  window.addEventListener('yt-page-data-updated', armHideRules, true);
  chrome.storage.onChanged.addListener(onHideSettingsChanged);
});
