function throttle(func, limitMs) {
  let lastRun = 0;
  return function () {
    const now = Date.now();
    if (now - lastRun >= limitMs) {
      func();
      lastRun = now;
    }
  };
}

const ENOUGH_TIME_TO_SKIP = 2000;

let isSkippingInProcess = false;
let skipRetryTimeout = null;

function resetSkippingState() {
  isSkippingInProcess = false;
  if (skipRetryTimeout) {
    clearTimeout(skipRetryTimeout);
    skipRetryTimeout = null;
  }
}

function checkAndHandleAd() {
  const video = document.querySelector('video');
  if (!video) return;

  const sponsoredLabel = document.querySelector('.ytp-ad-player-overlay-layout__ad-info-container:not([style*="display: none"])'); // prettier-ignore
  const skipButton = document.querySelector('.ytp-skip-ad-button:not([style*="display: none"])');

  if (sponsoredLabel) {
    video.muted = true;
  } else {
    video.muted = false;
  }

  if (skipButton && !isSkippingInProcess) {
    isSkippingInProcess = true;
    chrome.runtime.sendMessage({ action: 'clickSkipButton' });

    skipRetryTimeout = setTimeout(() => {
      resetSkippingState();
    }, ENOUGH_TIME_TO_SKIP);
  }
}

function startMonitoring() {
  if (window.adObserver) return;

  resetSkippingState(); // Сбрасываем состояние при старте
  const throttledCheck = throttle(checkAndHandleAd, 100);

  const observer = new MutationObserver(throttledCheck);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class'],
  });

  window.adObserver = observer;
  checkAndHandleAd();
}

function stopMonitoring() {
  if (window.adObserver) {
    window.adObserver.disconnect();
    window.adObserver = null;
  }

  const video = document.querySelector('video');
  if (video) video.muted = false;

  resetSkippingState();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'start':
      startMonitoring();
      break;

    case 'stop':
      stopMonitoring();
      break;

    case 'skipCompleted':
      resetSkippingState();
      break;

    case 'skipFailed':
      resetSkippingState();
      break;

    default:
      console.error('Unknown action:', request.action);
  }
});

chrome.storage.local.get(['isMonitoring'], (result) => {
  if (result.isMonitoring) {
    startMonitoring();
  }
});
