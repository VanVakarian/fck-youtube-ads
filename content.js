if (typeof window.intervalId === 'undefined') {
  window.intervalId = null;

  function findAndClickSkipButton() {
    const button = document.querySelector('.ytp-skip-ad-button');
    if (button) {
      button.click();
    }
  }

  function startMonitoring() {
    if (!window.intervalId) {
      window.intervalId = setInterval(findAndClickSkipButton, 1000);
    }
  }

  function stopMonitoring() {
    if (window.intervalId) {
      clearInterval(window.intervalId);
      window.intervalId = null;
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
}
