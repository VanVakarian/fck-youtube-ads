class PopupManager {
  constructor() {
    this.toggle = document.getElementById('adBlockToggle');
    this.statusMessage = document.getElementById('statusMessage');
    this.container = document.querySelector('.popup-container');

    if (!this.toggle || !this.statusMessage || !this.container) {
      console.error('Required elements not found');
      return;
    }

    this.initializeState();
    this.setupEventListeners();
  }

  async initializeState() {
    try {
      if (this.container) {
        this.container.classList.add('no-animation');
      }

      const result = await chrome.storage.local.get(['isMonitoring']);
      const isMonitoring = result.isMonitoring ?? false;

      this.updateInterface(isMonitoring);

      setTimeout(() => {
        if (this.container) {
          this.container.classList.remove('no-animation');
        }
      }, 50);
    } catch (error) {
      console.error('Initialization error:', error);
      this.updateInterface(false);
    }
  }

  setupEventListeners() {
    if (!this.toggle) return;

    this.toggle.addEventListener('change', async (event) => {
      const isChecked = event.target.checked;
      await this.handleStateChange(isChecked);
    });
  }

  async handleStateChange(isMonitoring) {
    try {
      await chrome.storage.local.set({ isMonitoring });
      this.updateInterface(isMonitoring);
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
        url: ['*://*.youtube.com/*'],
      });

      if (tabs[0]?.id) {
        try {
          await chrome.tabs.sendMessage(tabs[0].id, {
            action: isMonitoring ? 'start' : 'stop',
          });
        } catch (err) {
          console.error('Error sending message to tab:', err);
        }
      }
    } catch (error) {
      console.error('Critical error while saving state:', error);
      this.updateInterface(!isMonitoring);
    }
  }

  updateInterface(isEnabled) {
    if (!this.toggle || !this.statusMessage) return;

    this.toggle.checked = isEnabled;
    this.statusMessage.textContent = isEnabled ? 'Ad Skipper is enabled' : 'Ad Skipper is disabled';
    this.statusMessage.className = isEnabled ? 'status-enabled' : 'status-disabled';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});
