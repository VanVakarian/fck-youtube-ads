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

function setDelayedExec(func, delayMs) {
  setTimeout(() => func(), delayMs);
}

const VIDEO_STATE = {
  VIDEO: 'VIDEO',
  AD: 'AD',
};

let currentState = VIDEO_STATE.VIDEO;
let isSkipButtonCommandSent = false;
let lastAdDetectedTime = 0;

function muteVideo() {
  const video = document.querySelector('video');
  if (video && !video.muted) {
    video.muted = true;
  }
}

function unmuteVideo() {
  const video = document.querySelector('video');
  if (video && video.muted) {
    video.muted = false;
  }
}

function sendSkipButtonCommand() {
  if (!isSkipButtonCommandSent) {
    chrome.runtime.sendMessage({ action: 'clickSkipButton' });
    isSkipButtonCommandSent = true;
  }
}

async function handleAd() {
  const sponsoredLabel = document.querySelector('.ytp-ad-player-overlay-layout__ad-info-container:not([style*="display: none"])'); // prettier-ignore
  const skipButton = document.querySelector('.ytp-skip-ad-button:not([style*="display: none"])');
  const now = Date.now();

  if (!sponsoredLabel && !skipButton) {
    if (currentState === VIDEO_STATE.AD) {
      unmuteVideo();
      setDelayedExec(unmuteVideo, 200);
      currentState = VIDEO_STATE.VIDEO;
      isSkipButtonCommandSent = false;
      lastAdDetectedTime = 0;
    }
    return;
  }

  if (sponsoredLabel) {
    if (now - lastAdDetectedTime > 2000 || lastAdDetectedTime === 0) {
      currentState = VIDEO_STATE.AD;
      isSkipButtonCommandSent = false;
      lastAdDetectedTime = now;
      muteVideo();
      setDelayedExec(muteVideo, 200);
    }
  }

  if (currentState === VIDEO_STATE.AD && skipButton && !isSkipButtonCommandSent) {
    sendSkipButtonCommand();
    // setTimeout(() => (isSkipButtonCommandSent = false), 1000);
  }
}

function startMonitoring() {
  if (window.observer) return;

  const throttledHandleAd = throttle(handleAd, 100);
  const observer = new MutationObserver(throttledHandleAd);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class'],
  });
  window.observer = observer;
}

function stopMonitoring() {
  if (window.observer) {
    window.observer.disconnect();
    window.observer = null;
  }
  currentState = VIDEO_STATE.VIDEO;
  isSkipButtonCommandSent = false;
  lastAdDetectedTime = 0;
  unmuteVideo();
}

chrome.storage.local.get(['isMonitoring'], (result) => {
  if (result.isMonitoring) {
    startMonitoring();
  }
});

chrome.runtime.onMessage.addListener((request) => {
  switch (request.action) {
    case 'start':
      startMonitoring();
      break;

    case 'stop':
      stopMonitoring();
      break;

    case 'skipButtonClickFailed':
      isSkipButtonCommandSent = false;
      break;

    default:
      console.error('Unknown action:', request.action);
  }
});
