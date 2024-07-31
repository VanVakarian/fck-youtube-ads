function findAndClickSkipButton() {
  const button = document.querySelector('.ytp-skip-ad-button');
  if (button) button.click();
}

function startMonitoring() {
  if (!window.observer) {
    const lastInvocationTime = { value: 0 };

    const observer = new MutationObserver(() => {
      const currentTime = Date.now();
      if (currentTime - lastInvocationTime.value > 1000) {
        findAndClickSkipButton();
        lastInvocationTime.value = currentTime;
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.observer = observer;
  }
}

function stopMonitoring() {
  if (window.observer) {
    window.observer.disconnect();
    window.observer = null;
  }
}

chrome.storage.local.get(['isMonitoring'], (result) => {
  if (result.isMonitoring) {
    startMonitoring();
  }
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'start') {
    startMonitoring();
  } else if (request.action === 'stop') {
    stopMonitoring();
  }
});
