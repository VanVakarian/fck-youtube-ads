const tabsWithDebuggerAttached = new Map();

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attachDebugger(tabId) {
  if (tabsWithDebuggerAttached.get(tabId)) return;

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    tabsWithDebuggerAttached.set(tabId, true);
  } catch (error) {
    if (error.message.includes('Already attached')) {
      tabsWithDebuggerAttached.set(tabId, true);
    } else {
      throw error;
    }
  }
}

async function detachDebugger(tabId) {
  if (!tabsWithDebuggerAttached.get(tabId)) return;

  try {
    await chrome.debugger.detach({ tabId });
    tabsWithDebuggerAttached.set(tabId, false);
  } catch (error) {}
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
  const clickEvents = [
    {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
    },
    {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
    },
  ];

  for (const event of clickEvents) {
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      ...event,
      x: coordinates.x,
      y: coordinates.y,
    });

    if (event.type === 'mousePressed') {
      // simulating average human click duration
      const MOUSE_PRESS_MIN = 50;
      const MOUSE_PRESS_MAX = 150;
      const pressDuration = Math.floor(Math.random() * (MOUSE_PRESS_MAX - MOUSE_PRESS_MIN + 1)) + MOUSE_PRESS_MIN;
      await wait(pressDuration);
    }
  }
}

async function handleSkipButtonClick(tabId) {
  try {
    await attachDebugger(tabId);

    // Adding random delay before click
    const CLICK_DELAY_MIN = 200;
    const CLICK_DELAY_MAX = 1000;
    const delayMs = Math.floor(Math.random() * (CLICK_DELAY_MAX - CLICK_DELAY_MIN + 1)) + CLICK_DELAY_MIN;
    await wait(delayMs);

    const coordinates = await findSkipButtonCoordinates(tabId);
    if (!coordinates) return;

    await simulateMouseClick(tabId, coordinates);

    await detachDebugger(tabId);
  } catch (error) {
    console.error('Skip button click error:', error);
  }
}

chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.action === 'clickSkipButton') {
    const tab = sender.tab;
    if (!tab?.id) return;
    handleSkipButtonClick(tab.id);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabsWithDebuggerAttached.delete(tabId);
});
