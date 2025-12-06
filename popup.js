class PopupManager {
  constructor() {
    this.toggle = document.getElementById('adBlockToggle');
    this.statusMessage = document.getElementById('statusMessage');
    this.container = document.querySelector('.popup-container');
    this.slider = document.getElementById('transparencySlider');
    this.sliderValue = document.getElementById('transparencyValue');
    this.colorButtons = document.querySelectorAll('.color-btn');

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

      const result = await chrome.storage.local.get(['isMonitoring', 'adTransparency', 'overlayColor']);
      const isMonitoring = result.isMonitoring ?? false;
      const transparency = result.adTransparency ?? 90;
      const overlayColor = result.overlayColor ?? 'black';

      this.updateInterface(isMonitoring);
      this.updateSlider(transparency);
      this.updateColorButtons(overlayColor);

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

    if (this.slider) {
      this.slider.addEventListener('input', (event) => {
        const transparency = parseInt(event.target.value, 10);
        this.updateSliderDisplay(transparency);
        this.sendTransparencyToTab(transparency);
      });

      this.slider.addEventListener('change', async (event) => {
        const transparency = parseInt(event.target.value, 10);
        await chrome.storage.local.set({ adTransparency: transparency });
      });
    }

    this.colorButtons.forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const color = event.target.dataset.color;
        this.updateColorButtons(color);
        this.sendColorToTab(color);
        await chrome.storage.local.set({ overlayColor: color });
      });
    });
  }

  updateSlider(transparency) {
    if (this.slider) {
      this.slider.value = transparency;
    }
    this.updateSliderDisplay(transparency);
  }

  updateSliderDisplay(transparency) {
    if (this.sliderValue) {
      this.sliderValue.textContent = `${transparency}%`;
    }
  }

  async sendTransparencyToTab(transparency) {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
        url: ['*://*.youtube.com/*'],
      });

      if (tabs[0]?.id) {
        await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateTransparency',
          transparency: transparency,
        });
      }
    } catch (err) {
      // Ignore errors when tab is not ready
    }
  }

  updateColorButtons(activeColor) {
    this.colorButtons.forEach((btn) => {
      if (btn.dataset.color === activeColor) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  async sendColorToTab(color) {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
        url: ['*://*.youtube.com/*'],
      });

      if (tabs[0]?.id) {
        await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateOverlayColor',
          color: color,
        });
      }
    } catch (err) {
      // Ignore errors when tab is not ready
    }
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
