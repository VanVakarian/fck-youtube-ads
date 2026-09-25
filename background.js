importScripts('diagnostics.js');
setDebugSource('bg');
debugLog('bg', 'service worker started');

const tabsWithDebuggerAttached = new Set();

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attachDebugger(tabId) {
  if (tabsWithDebuggerAttached.has(tabId)) {
    debugLog('skip', 'debugger already tracked as attached, attach skipped', { tabId });
    return;
  }

  const startedAt = Date.now();
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    tabsWithDebuggerAttached.add(tabId);
    debugLog('skip', 'debugger attached', { tabId, ms: Date.now() - startedAt });
    return true;
  } catch (error) {
    if (error.message.includes('Already attached')) {
      tabsWithDebuggerAttached.add(tabId);
      debugLog('skip', 'debugger was already attached by someone else', { tabId });
      return true;
    } else {
      console.error('Error attaching debugger:', error);
      debugLog('skip', `debugger attach failed: ${error.message}`, { tabId });
      return false;
    }
  }
}

async function detachDebugger(tabId) {
  if (!tabsWithDebuggerAttached.has(tabId)) return;

  try {
    await chrome.debugger.detach({ tabId });
    debugLog('skip', 'debugger detached', { tabId });
  } catch (error) {
    console.error('Error detaching debugger:', error);
    debugLog('skip', `debugger detach failed: ${error.message}`, { tabId });
  } finally {
    tabsWithDebuggerAttached.delete(tabId);
  }
}

// { coordinates, info }: where to click (null when there is no button to click) and, for the debug log,
// everything the page said about the button at that moment
async function findSkipButtonCoordinates(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    function: () => {
      const describe = (el) => {
        if (!el) return null;
        return `${el.localName}${el.id ? `#${el.id}` : ''}.${[...el.classList].join('.')}`;
      };
      const viewport = { inner: `${innerWidth}x${innerHeight}`, dpr: devicePixelRatio };

      const skipButton = document.querySelector('.ytp-skip-ad-button:not([style*="display: none"])');
      if (!skipButton) {
        // a button that is in the DOM but filtered out by the selector above (hidden some other way) shows here
        const filtered = document.querySelector('.ytp-skip-ad-button');
        const info = { viewport, filteredButton: describe(filtered), style: filtered?.getAttribute('style') };
        return { coordinates: null, info };
      }

      const buttonRect = skipButton.getBoundingClientRect();

      // defining a border inside a button, where not to click
      const padding = 5;
      const xMin = buttonRect.left + padding;
      const xMax = buttonRect.right - padding;
      const yMin = buttonRect.top + padding;
      const yMax = buttonRect.bottom - padding;

      // choosing a random point within a button, excluding a border
      const xRandom = Math.floor(Math.random() * (xMax - xMin + 1)) + xMin;
      const yRandom = Math.floor(Math.random() * (yMax - yMin + 1)) + yMin;

      const style = getComputedStyle(skipButton);
      const hit = document.elementFromPoint(xRandom, yRandom);
      const { left, top, width, height } = buttonRect;
      const info = {
        viewport,
        button: describe(skipButton),
        rect: `${Math.round(left)},${Math.round(top)} ${Math.round(width)}x${Math.round(height)}`,
        bounds: { xMin, xMax, yMin, yMax },
        degenerate: xMax < xMin || yMax < yMin,
        inlineStyle: skipButton.getAttribute('style'),
        css: `${style.display}/${style.visibility}/${style.opacity}`,
        visible: skipButton.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
        click: `${xRandom},${yRandom}`,
        hit: describe(hit),
        hitIsButton: hit ? skipButton.contains(hit) : false,
      };

      return { coordinates: { x: xRandom, y: yRandom }, info };
    },
  });

  return results?.[0]?.result ?? { coordinates: null, info: null };
}

async function simulateMouseClick(tabId, coordinates) {
  if (!coordinates || !tabsWithDebuggerAttached.has(tabId)) {
    const debuggerTracked = tabsWithDebuggerAttached.has(tabId);
    debugLog('skip', 'click not attempted', { tabId, coordinates, debuggerTracked });
    return false;
  }

  try {
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      x: coordinates.x,
      y: coordinates.y,
    });
    debugLog('skip', 'mousePressed sent', { tabId, ...coordinates });

    // simulating average human click duration
    const MOUSE_PRESS_MIN = 50;
    const MOUSE_PRESS_MAX = 150;
    const pressDuration = Math.floor(Math.random() * (MOUSE_PRESS_MAX - MOUSE_PRESS_MIN)) + MOUSE_PRESS_MIN;
    await wait(pressDuration);

    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
      x: coordinates.x,
      y: coordinates.y,
    });
    debugLog('skip', 'mouseReleased sent', { tabId, pressDuration });

    return true;
  } catch (error) {
    console.error('Error simulating mouse click:', error);
    debugLog('skip', `mouse click failed: ${error.message}`, { tabId });
    return false;
  }
}

async function notifyContentScript(tabId, isSuccess) {
  try {
    const message = isSuccess ? 'skipCompleted' : 'skipFailed';
    await chrome.tabs.sendMessage(tabId, { action: message });
    debugLog('skip', `content script notified: ${message}`, { tabId });
  } catch (error) {
    console.error('Error notifying content script:', error);
    debugLog('skip', `notifying content script failed: ${error.message}`, { tabId });
  }
}

// the tab as the browser sees it — a tab that isn't the active one, or a window that has no focus, is
// exactly the kind of thing a click on that tab's page behaves differently under
async function describeTab(tab) {
  try {
    const { focused } = await chrome.windows.get(tab.windowId);
    return { active: tab.active, status: tab.status, discarded: tab.discarded, windowFocused: focused, url: tab.url };
  } catch (error) {
    return { active: tab.active, status: tab.status, error: error.message };
  }
}

async function handleSkipButtonClick(tabId, pageId) {
  const startedAt = Date.now();
  const log = (msg, data) => debugLog('skip', msg, { tabId, pageId, after: Date.now() - startedAt, ...data });

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) {
      log('tab not found');
      await notifyContentScript(tabId, false);
      return;
    }
    if (isDebugEnabled()) log('click requested', { tab: await describeTab(tab) });

    const debuggerAttached = await attachDebugger(tabId);
    if (!debuggerAttached) {
      log('no debugger, giving up');
      await notifyContentScript(tabId, false);
      return;
    }

    // Adding random delay before click
    const CLICK_DELAY_MIN = 300;
    const CLICK_DELAY_MAX = 1000;
    const delayBeforeClickMs = Math.floor(Math.random() * (CLICK_DELAY_MAX - CLICK_DELAY_MIN + 1)) + CLICK_DELAY_MIN;
    log('waiting before click', { delayBeforeClickMs });
    await wait(delayBeforeClickMs);

    const { coordinates, info } = await findSkipButtonCoordinates(tabId);
    log(coordinates ? 'button found' : 'no button to click', info);
    if (!coordinates) {
      await notifyContentScript(tabId, false);
      return;
    }

    const clickResult = await simulateMouseClick(tabId, coordinates);
    log('click finished', { clickResult });
    await notifyContentScript(tabId, clickResult);
  } catch (error) {
    console.error('Error handling skip button click:', error);
    log(`handling failed: ${error.message}`);
    await notifyContentScript(tabId, false);
  } finally {
    await detachDebugger(tabId);
    log('handling done');
    await flushDebugLog();
  }
}

chrome.runtime.onMessage.addListener((request, sender) => {
  const { pageId } = request;
  debugLog('bg', `message ${request.action}`, { tabId: sender.tab?.id, frameId: sender.frameId, pageId });

  if (request.action === 'clickSkipButton' && sender.tab?.id) {
    handleSkipButtonClick(sender.tab.id, request.pageId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabsWithDebuggerAttached.delete(tabId);
  debugLog('tab', 'removed', { tabId });
});

chrome.debugger.onDetach.addListener(({ tabId }, reason) => {
  tabsWithDebuggerAttached.delete(tabId);
  debugLog('skip', 'debugger onDetach event', { tabId, reason });
});

// Tab lifecycle for the debug log only: how a YouTube tab came to be (opened from another tab, in the
// background or not) and which tab the user is looking at. Urls only come through for YouTube tabs.
const isYoutubeUrl = (url) => Boolean(url?.startsWith('https://www.youtube.com/'));

chrome.tabs.onCreated.addListener((tab) => {
  const url = tab.pendingUrl ?? tab.url;
  if (!isYoutubeUrl(url)) return;
  debugLog('tab', 'created', { tabId: tab.id, opener: tab.openerTabId, active: tab.active, url });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isYoutubeUrl(tab.url) || !(changeInfo.status || changeInfo.url)) return;
  debugLog('tab', 'updated', { tabId, status: changeInfo.status, url: changeInfo.url, active: tab.active });
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  debugLog('tab', 'activated', { tabId, windowId });
});
