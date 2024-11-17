class PopupManager {
  constructor() {
    this.toggle = document.getElementById('adBlockToggle');
    this.statusMessage = document.getElementById('statusMessage');
    this.container = document.querySelector('.popup-container');
    this.initializeState();
    this.setupEventListeners();
  }

  async initializeState() {
    try {
      // Add no-animation class before any state changes
      this.container.classList.add('no-animation');

      const { isMonitoring = false } = await chrome.storage.local.get(['isMonitoring']);
      this.updateInterface(isMonitoring);

      // Remove no-animation class after a brief delay
      setTimeout(() => {
        this.container.classList.remove('no-animation');
      }, 50);
    } catch (error) {
      console.error('Failed to initialize state:', error);
      this.updateInterface(false);
    }
  }

  setupEventListeners() {
    this.toggle.addEventListener('change', () => {
      const isMonitoring = this.toggle.checked;
      this.handleStateChange(isMonitoring);
    });
  }

  async handleStateChange(isMonitoring) {
    try {
      // Update interface first
      this.updateInterface(isMonitoring);

      // Then save state
      await chrome.storage.local.set({ isMonitoring });

      // Try to send message to YouTube tab if it exists
      try {
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
          url: ['*://*.youtube.com/*'],
        });

        if (tabs[0]?.id) {
          chrome.tabs
            .sendMessage(tabs[0].id, {
              action: isMonitoring ? 'start' : 'stop',
            })
            .catch((err) => {
              // Ignore message sending error as state is already saved
              console.log('Tab message failed, but state is saved:', err);
            });
        }
      } catch (tabError) {
        // Ignore tab errors as main state is already saved
        console.log('Tab operation failed, but state is saved:', tabError);
      }
    } catch (error) {
      console.error('Critical error while saving state:', error);
      // Revert interface only on critical errors
      this.updateInterface(!isMonitoring);
    }
  }

  updateInterface(isEnabled) {
    this.toggle.checked = isEnabled;
    this.statusMessage.textContent = isEnabled ? 'Ad Skipper is enabled' : 'Ad Skipper is disabled';
    this.statusMessage.className = isEnabled ? 'status-enabled' : 'status-disabled';
  }
}

// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});
