function muteVideo() {
  const video = document.querySelector('video');
  if (video) {
    if (!video.muted) {
      video.muted = true;
    }
  } else {
    console.log('Video element not found');
  }
}

function unmuteVideo() {
  const video = document.querySelector('video');
  if (video) {
    if (video.muted) {
      video.muted = false;
    }
  } else {
    console.log('Video element not found');
  }
}

function checkForAdAndMute() {
  const sponsoredLabel = document.querySelector(
    'div.ytp-ad-player-overlay-layout__ad-info-container:not([style*="display: none"])'
  );
  if (sponsoredLabel) {
    muteVideo();
  } else {
    unmuteVideo();
  }
}

function startMonitoring() {
  if (!window.observer) {
    const lastInvocationTime = { value: 0 };
    const observer = new MutationObserver(() => {
      const currentTime = Date.now();
      if (currentTime - lastInvocationTime.value > 100) {
        checkForAdAndMute();
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
