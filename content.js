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

function checkForAdAndSkipButton() {
  const sponsoredLabel = document.querySelector('div.ytp-ad-player-overlay-layout__ad-info-container:not([style*="display: none"])'); // prettier-ignore
  const skipButton = document.querySelector('.ytp-skip-ad-button:not([style*="display: none"])');

  if (sponsoredLabel && currentState === VIDEO_STATE.VIDEO) {
    muteVideo();
    currentState = VIDEO_STATE.AD;
    isSkipButtonCommandSent = false;
  } else if (!sponsoredLabel && currentState === VIDEO_STATE.AD) {
    unmuteVideo();
    currentState = VIDEO_STATE.VIDEO;
    isSkipButtonCommandSent = false;
  }

  if (currentState === VIDEO_STATE.AD && skipButton && !isSkipButtonCommandSent) {
    sendSkipButtonCommand();
  }
}

function startMonitoring() {
  if (!window.observer) {
    const observer = new MutationObserver(() => {
      checkForAdAndSkipButton();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    window.observer = observer;

    checkForAdAndSkipButton();
  }
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
  if (request.action === 'start') {
    startMonitoring();
  } else if (request.action === 'stop') {
    stopMonitoring();
  }
});
