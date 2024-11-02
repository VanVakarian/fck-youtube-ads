document.addEventListener('DOMContentLoaded', () => {
  const checkbox = document.getElementById('checkbox');

  chrome.storage.local.get(['isMonitoring'], (result) => {
    checkbox.checked = result.isMonitoring || false;
  });

  checkbox.addEventListener('change', () => {
    const isMonitoring = checkbox.checked;
    chrome.storage.local.set({ isMonitoring });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && /^https:\/\/www\.youtube\.com/.test(tabs[0].url)) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: isMonitoring ? 'start' : 'stop',
        });
      }
    });
  });
});
