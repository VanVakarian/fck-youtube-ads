const tabsWithDebuggerAttached = new Set();

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attachDebugger(tabId) {
  if (tabsWithDebuggerAttached.has(tabId)) return;

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    tabsWithDebuggerAttached.add(tabId);
    return true;
  } catch (error) {
    if (error.message.includes('Already attached')) {
      tabsWithDebuggerAttached.add(tabId);
      return true;
    } else {
      console.error('Error attaching debugger:', error);
      return false;
    }
  }
}

async function detachDebugger(tabId) {
  if (!tabsWithDebuggerAttached.has(tabId)) return;

  try {
    await chrome.debugger.detach({ tabId });
  } catch (error) {
    console.error('Error detaching debugger:', error);
  } finally {
    tabsWithDebuggerAttached.delete(tabId);
  }
}

async function findSkipButtonCoordinates(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    function: () => {
      const skipButton = document.querySelector('.ytp-skip-ad-button:not([style*="display: none"])');
      if (skipButton) {
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

        return { x: xRandom, y: yRandom };
      }
      return null;
    },
  });

  return results?.[0]?.result;
}

async function simulateMouseClick(tabId, coordinates) {
  if (!coordinates || !tabsWithDebuggerAttached.has(tabId)) return false;

  try {
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      x: coordinates.x,
      y: coordinates.y,
    });

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

    return true;
  } catch (error) {
    console.error('Error simulating mouse click:', error);
    return false;
  }
}

async function notifyContentScript(tabId, isSuccess) {
  try {
    const message = isSuccess ? 'skipCompleted' : 'skipFailed';
    await chrome.tabs.sendMessage(tabId, { action: message });
  } catch (error) {
    console.error('Error notifying content script:', error);
  }
}

async function handleSkipButtonClick(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) {
      await notifyContentScript(tabId, false);
      return;
    }

    const debuggerAttached = await attachDebugger(tabId);
    if (!debuggerAttached) {
      await notifyContentScript(tabId, false);
      return;
    }

    // Adding random delay before click
    const CLICK_DELAY_MIN = 300;
    const CLICK_DELAY_MAX = 1000;
    const delayBeforeClickMs = Math.floor(Math.random() * (CLICK_DELAY_MAX - CLICK_DELAY_MIN + 1)) + CLICK_DELAY_MIN;
    await wait(delayBeforeClickMs);

    const coordinates = await findSkipButtonCoordinates(tabId);
    if (!coordinates) {
      await notifyContentScript(tabId, false);
      return;
    }

    const clickResult = await simulateMouseClick(tabId, coordinates);
    await notifyContentScript(tabId, clickResult);
  } catch (error) {
    console.error('Error handling skip button click:', error);
    await notifyContentScript(tabId, false);
  } finally {
    await detachDebugger(tabId);
  }
}

chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.action === 'clickSkipButton' && sender.tab?.id) {
    handleSkipButtonClick(sender.tab.id);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabsWithDebuggerAttached.delete(tabId);
});

chrome.debugger.onDetach.addListener(({ tabId }) => {
  tabsWithDebuggerAttached.delete(tabId);
});
