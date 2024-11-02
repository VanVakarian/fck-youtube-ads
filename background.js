const debuggerAttached = new Map();

async function attachDebugger(tabId) {
  if (debuggerAttached.get(tabId)) return;

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    debuggerAttached.set(tabId, true);
  } catch (error) {
    if (error.message.includes('Already attached')) {
      debuggerAttached.set(tabId, true);
    } else {
      throw error;
    }
  }
}

async function detachDebugger(tabId) {
  if (!debuggerAttached.get(tabId)) return;

  try {
    await chrome.debugger.detach({ tabId });
    debuggerAttached.set(tabId, false);
  } catch (error) {}
}

async function findSkipButtonCoordinates(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    function: () => {
      const skipButton = document.querySelector('.ytp-skip-ad-button:not([style*="display: none"])');
      if (skipButton) {
        const rect = skipButton.getBoundingClientRect();
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        };
      }
      return null;
    },
  });

  return results?.[0]?.result;
}

async function simulateMouseClick(tabId, coords) {
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
      x: coords.x,
      y: coords.y,
    });
  }
}

async function handleSkipButtonClick(tabId) {
  try {
    await attachDebugger(tabId);

    const coords = await findSkipButtonCoordinates(tabId);
    if (coords) {
      await simulateMouseClick(tabId, coords);
    }

    await detachDebugger(tabId);
  } catch (error) {
    console.error('Skip button click error:', error);
    await detachDebugger(tabId);
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
  debuggerAttached.delete(tabId);
});
