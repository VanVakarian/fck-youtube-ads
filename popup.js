class PopupManager {
  constructor() {
    this.toggle = document.getElementById('adBlockToggle');
    this.statusMessage = document.getElementById('statusMessage');
    this.container = document.querySelector('.popup-container');
    this.slider = document.getElementById('transparencySlider');
    this.sliderValue = document.getElementById('transparencyValue');
    this.colorButtons = document.querySelectorAll('.color-btn');
    this.debugToggle = document.getElementById('debugToggle');
    this.debugSize = document.getElementById('debugSize');
    this.debugDownloadButton = document.getElementById('debugDownload');
    this.debugClearButton = document.getElementById('debugClear');

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

      const result = await chrome.storage.local.get(['isMonitoring', 'adTransparency', 'overlayColor', DEBUG_FLAG_KEY]);
      const isMonitoring = result.isMonitoring ?? false;
      const transparency = result.adTransparency ?? 90;
      const overlayColor = result.overlayColor ?? 'black';

      this.updateInterface(isMonitoring);
      this.updateSlider(transparency);
      this.updateColorButtons(overlayColor);
      this.debugToggle.checked = result[DEBUG_FLAG_KEY] ?? false;
      this.refreshDebugSize();
      setInterval(() => this.refreshDebugSize(), 1000);

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

    this.debugToggle.addEventListener('change', (event) => {
      chrome.storage.local.set({ [DEBUG_FLAG_KEY]: event.target.checked });
    });

    this.debugDownloadButton.addEventListener('click', () => this.downloadDebugLog());

    this.debugClearButton.addEventListener('click', async () => {
      await clearDebugLog();
      await this.refreshDebugSize();
    });
  }

  async refreshDebugSize() {
    const bytes = await debugLogBytes();
    this.debugSize.textContent = `Log: ${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  // one JSON file, an entry per line so it can be read and grepped as text too
  async downloadDebugLog() {
    const [entries, settings] = await Promise.all([
      readDebugEntries(),
      chrome.storage.local.get(['isMonitoring', 'adTransparency', 'overlayColor']),
    ]);

    const report = {
      extensionVersion: chrome.runtime.getManifest().version,
      generatedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      settings,
      entryCount: entries.length,
      fields: 'at: epoch ms; t: ms since the context started (page: since navigation start); src: page:<id> | bg',
    };
    const text = [
      '{',
      `"report": ${JSON.stringify(report)},`,
      '"entries": [',
      entries.map((entry) => JSON.stringify(entry)).join(',\n'),
      ']',
      '}',
    ].join('\n');

    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `fck-youtube-ads-debug-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
