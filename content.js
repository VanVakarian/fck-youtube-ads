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
  if (!sponsoredLabel && !skipButton) return;

  if (sponsoredLabel && currentState === VIDEO_STATE.VIDEO) {
    muteVideo();
    setDelayedExec(muteVideo, 100); // in case of failing to mute try again
    setDelayedExec(muteVideo, 300);
    currentState = VIDEO_STATE.AD;
    isSkipButtonCommandSent = false;
  } else if (!sponsoredLabel && currentState === VIDEO_STATE.AD) {
    unmuteVideo();
    setDelayedExec(unmuteVideo, 100); // in case of failing to unmute try again
    setDelayedExec(unmuteVideo, 300);
    currentState = VIDEO_STATE.VIDEO;
    isSkipButtonCommandSent = false;
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
