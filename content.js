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

const DIMMED_OVERLAY_ID = 'fck-ad-overlay';

function addAdOverlay() {
  const isDimmedOverlayExists = document.getElementById(DIMMED_OVERLAY_ID);
  if (isDimmedOverlayExists) return;

  const videoPlayer = document.querySelector('.html5-video-player');
  if (!videoPlayer) return;

  const dimmedOverlay = document.createElement('div');
  dimmedOverlay.id = DIMMED_OVERLAY_ID;
  dimmedOverlay.className = 'fck-ad-overlay';
  videoPlayer.appendChild(dimmedOverlay);

  chrome.storage.local.get(['adTransparency', 'overlayColor'], (result) => {
    const transparency = result.adTransparency ?? 90;
    const color = result.overlayColor ?? 'black';
    updateOverlayStyle(transparency, color);
  });
}

function removeAdOverlay() {
  const dimmedOverlay = document.getElementById(DIMMED_OVERLAY_ID);
  if (dimmedOverlay) {
    dimmedOverlay.remove();
  }
}

function updateOverlayOpacity(transparency) {
  const dimmedOverlay = document.getElementById(DIMMED_OVERLAY_ID);
  if (dimmedOverlay) {
    chrome.storage.local.get(['overlayColor'], (result) => {
      const color = result.overlayColor ?? 'black';
      updateOverlayStyle(transparency, color);
    });
  }
}

function updateOverlayColor(color) {
  const dimmedOverlay = document.getElementById(DIMMED_OVERLAY_ID);
  if (dimmedOverlay) {
    chrome.storage.local.get(['adTransparency'], (result) => {
      const transparency = result.adTransparency ?? 90;
      updateOverlayStyle(transparency, color);
    });
  }
}

function updateOverlayStyle(transparency, color) {
  const dimmedOverlay = document.getElementById(DIMMED_OVERLAY_ID);
  if (dimmedOverlay) {
    // Converting user transparency (0-100) to CSS opacity (1-0)
    const opacity = (100 - transparency) / 100;
    const rgb = color === 'white' ? '255, 255, 255' : '0, 0, 0';
    dimmedOverlay.style.background = `rgba(${rgb}, ${opacity})`;
  }
}

function checkAndHandleAd() {
  const video = document.querySelector('video');
  if (!video) return;

  const sponsoredLabel = document.querySelector('.ytp-ad-player-overlay-layout__ad-info-container:not([style*="display: none"])'); // prettier-ignore
  const skipButton = document.querySelector('.ytp-skip-ad-button:not([style*="display: none"])');

  const isAdPlaying = sponsoredLabel || skipButton;

  if (isAdPlaying) {
    video.muted = true;
    addAdOverlay();
  } else {
    video.muted = false;
    removeAdOverlay();
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

  resetSkippingState();
  const throttledCheck = throttle(checkAndHandleAd, 16);

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

  removeAdOverlay();
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

    case 'updateTransparency':
      updateOverlayOpacity(request.transparency);
      break;

    case 'updateOverlayColor':
      updateOverlayColor(request.color);
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
