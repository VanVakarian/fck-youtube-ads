chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && /^https:\/\/www\.youtube\.com/.test(tab.url)) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js'],
    });
  }
});

const debuggerAttached = new Map();

chrome.runtime.onMessage.addListener(async (request, sender) => {
  if (request.action === 'clickSkipButton') {
    const tab = sender.tab;
    if (!tab || !tab.id) return;

    try {
      if (!debuggerAttached.get(tab.id)) {
        try {
          await chrome.debugger.attach({ tabId: tab.id }, '1.3');
          debuggerAttached.set(tab.id, true);
        } catch (attachError) {
          if (attachError.message.includes('Already attached')) {
            debuggerAttached.set(tab.id, true);
          } else {
            throw attachError;
          }
        }
      }

      const skipButtonCoords = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
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

      if (skipButtonCoords?.[0]?.result) {
        const coords = skipButtonCoords[0].result;

        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: coords.x,
          y: coords.y,
          button: 'left',
          clickCount: 1,
        });

        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: coords.x,
          y: coords.y,
          button: 'left',
          clickCount: 1,
        });
      }

      if (debuggerAttached.get(tab.id)) {
        await chrome.debugger.detach({ tabId: tab.id });
        debuggerAttached.set(tab.id, false);
      }
    } catch (error) {
      console.error('Debug click error:', error);
      if (debuggerAttached.get(tab.id)) {
        try {
          await chrome.debugger.detach({ tabId: tab.id });
        } catch (e) {}
        debuggerAttached.set(tab.id, false);
      }
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  debuggerAttached.delete(tabId);
});
