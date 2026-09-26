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
    this.hideDelaySlider = document.getElementById('hideDelaySlider');
    this.hideDelayValue = document.getElementById('hideDelayValue');
    this.hideDimSlider = document.getElementById('hideDimSlider');
    this.hideDimValue = document.getElementById('hideDimValue');
    this.ruleList = document.getElementById('ruleList');
    this.ruleTemplate = document.getElementById('ruleTemplate');
    this.addRuleButton = document.getElementById('addRule');
    this.hideRules = [];
    this.skipperBody = document.getElementById('skipperBody');
    this.hideToggle = document.getElementById('hideToggle');
    this.hideBody = document.getElementById('hideBody');
    this.settingsExportButton = document.getElementById('settingsExport');
    this.settingsImportButton = document.getElementById('settingsImport');
    this.settingsImportFile = document.getElementById('settingsImportFile');
    this.transferStatus = document.getElementById('transferStatus');

    if (!this.toggle || !this.statusMessage || !this.container) {
      console.error('Required elements not found');
      return;
    }

    this.initializeState();
    this.setupEventListeners();
    this.setupPopupWidth();
  }

  // applied on release, not while dragging: the slider itself resizes with the popup, which would fight the pointer
  setupPopupWidth() {
    const slider = document.getElementById('popupWidthSlider');
    const valueLabel = document.getElementById('popupWidthValue');

    slider.min = POPUP_WIDTH_MIN;
    slider.max = POPUP_WIDTH_MAX;
    slider.step = POPUP_WIDTH_STEP;
    slider.value = readPopupWidth();
    valueLabel.textContent = `${slider.value} px`;

    slider.addEventListener('input', () => {
      valueLabel.textContent = `${slider.value} px`;
    });

    slider.addEventListener('change', () => {
      localStorage.setItem(POPUP_WIDTH_KEY, slider.value);
      applyPopupWidth(readPopupWidth());
    });
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

      const hide = await readHideSettings();
      this.updateHideInterface(hide.enabled);
      this.hideRules = hide.rules;
      this.hideDelaySlider.value = hide.delaySec;
      this.hideDelayValue.textContent = `${hide.delaySec} s`;
      this.hideDimSlider.value = hide.dimOpacity;
      this.hideDimValue.textContent = `${hide.dimOpacity}%`;
      this.renderRules();

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

    this.hideToggle.addEventListener('change', (event) => {
      this.updateHideInterface(event.target.checked);
      chrome.storage.local.set({ [HIDE_ENABLED_KEY]: event.target.checked });
    });

    this.setupHideSlider(this.hideDelaySlider, this.hideDelayValue, HIDE_DELAY_KEY, ' s');
    this.setupHideSlider(this.hideDimSlider, this.hideDimValue, HIDE_DIM_KEY, '%');

    this.addRuleButton.addEventListener('click', () => {
      this.hideRules.push({ selector: '', mode: HideMode.Remove });
      this.renderRules();

      const inputs = this.ruleList.querySelectorAll('.rule-selector');
      inputs[inputs.length - 1].focus();
    });

    this.settingsExportButton.addEventListener('click', () => this.exportSettingsFile());
    this.settingsImportButton.addEventListener('click', () => this.settingsImportFile.click());
    this.settingsImportFile.addEventListener('change', async () => {
      await this.importSettingsFile(this.settingsImportFile.files?.[0]);
      this.settingsImportFile.value = ''; // so picking the same file again still fires "change"
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

  updateHideInterface(isEnabled) {
    this.hideToggle.checked = isEnabled;
    this.hideBody.disabled = !isEnabled;
    this.addRuleButton.disabled = !isEnabled;
  }

  setupHideSlider(slider, valueLabel, storageKey, unit) {
    slider.addEventListener('input', () => {
      valueLabel.textContent = `${slider.value}${unit}`;
    });

    slider.addEventListener('change', () => {
      chrome.storage.local.set({ [storageKey]: parseInt(slider.value, 10) });
    });
  }

  saveHideRules() {
    return chrome.storage.local.set({ [HIDE_RULES_KEY]: this.hideRules });
  }

  // querySelector accepts selector lists and :has(), like the stylesheet rule the selector ends up in
  isValidSelector(selector) {
    try {
      document.createDocumentFragment().querySelector(selector);
      return true;
    } catch {
      return false;
    }
  }

  renderRules() {
    this.ruleList.replaceChildren(...this.hideRules.map((rule) => this.createRuleItem(rule)));
  }

  createRuleItem(rule) {
    const item = this.ruleTemplate.content.firstElementChild.cloneNode(true);
    const selectorInput = item.querySelector('.rule-selector');
    const segments = item.querySelectorAll('.segment');

    selectorInput.value = rule.selector;
    this.setupRuleName(item, rule);

    // saved on change (blur / Enter), not per keystroke: half-typed selectors must not reach the page
    selectorInput.addEventListener('input', () => {
      selectorInput.classList.toggle('invalid', !this.isValidSelector(selectorInput.value));
    });
    selectorInput.addEventListener('change', () => {
      rule.selector = selectorInput.value.trim();
      this.saveHideRules();
    });

    segments.forEach((segment) => {
      segment.addEventListener('click', (event) => {
        const changed = event.shiftKey ? this.hideRules : [rule];
        changed.forEach((changedRule) => (changedRule.mode = segment.dataset.mode));
        this.showRuleModes();
        this.saveHideRules();
      });
    });
    this.showRuleMode(item, rule);

    item.querySelector('.rule-delete').addEventListener('click', () => {
      this.hideRules.splice(this.hideRules.indexOf(rule), 1);
      this.renderRules();
      this.saveHideRules();
    });

    return item;
  }

  showRuleMode(item, rule) {
    item.querySelectorAll('.segment').forEach((segment) => {
      segment.classList.toggle('active', segment.dataset.mode === rule.mode);
    });
  }

  // the rows are in the order of hideRules
  showRuleModes() {
    [...this.ruleList.children].forEach((item, index) => this.showRuleMode(item, this.hideRules[index]));
  }

  // the name is text; a click on it swaps the line for an input with a Save button
  setupRuleName(item, rule) {
    const label = item.querySelector('.rule-label');
    const view = item.querySelector('.rule-view');
    const rename = item.querySelector('.rule-rename');
    const nameInput = item.querySelector('.rule-name');
    const saveButton = item.querySelector('.rule-save');

    const showName = () => {
      label.textContent = rule.label || 'Add name';
      label.classList.toggle('empty', !rule.label);
    };
    const setRenaming = (isRenaming) => {
      view.hidden = isRenaming;
      rename.hidden = !isRenaming;
    };

    label.addEventListener('click', () => {
      nameInput.value = rule.label ?? '';
      setRenaming(true);
      nameInput.focus();
    });

    saveButton.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (name) {
        rule.label = name;
      } else {
        delete rule.label;
      }
      showName();
      setRenaming(false);
      this.saveHideRules();
    });

    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') saveButton.click();
    });

    showName();
  }

  async refreshDebugSize() {
    const bytes = await debugLogBytes();
    this.debugSize.textContent = `Log: ${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  // one JSON file, an entry per line so it can be read and grepped as text too
  async downloadDebugLog() {
    const [entries, settings, hideSettings] = await Promise.all([
      readDebugEntries(),
      chrome.storage.local.get(['isMonitoring', 'adTransparency', 'overlayColor']),
      readHideSettings(),
    ]);

    const report = {
      extensionVersion: chrome.runtime.getManifest().version,
      generatedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      settings: { ...settings, hide: hideSettings },
      entryCount: entries.length,
      fields: 'at: epoch ms; t: ms since the context started (page: since navigation start); src: context id',
    };
    const text = [
      '{',
      `"report": ${JSON.stringify(report)},`,
      '"entries": [',
      entries.map((entry) => JSON.stringify(entry)).join(',\n'),
      ']',
      '}',
    ].join('\n');

    this.downloadJson(text, `fck-youtube-ads-debug-${Date.now()}.json`);
  }

  downloadJson(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  showTransferStatus(message, kind) {
    this.transferStatus.textContent = message;
    this.transferStatus.hidden = false;
    this.transferStatus.className = `transfer-status transfer-status-${kind}`;
  }

  async exportSettingsFile() {
    try {
      const payload = await exportSettings();
      this.downloadJson(JSON.stringify(payload, null, 2), `fck-youtube-ads-settings-${Date.now()}.json`);
      this.showTransferStatus('Settings exported.', 'success');
    } catch (error) {
      this.showTransferStatus(`Export failed: ${error.message}`, 'error');
    }
  }

  async importSettingsFile(file) {
    if (!file) return;

    // a settings file is a few KB; anything this large is not one
    if (!file.name.toLowerCase().endsWith('.json') || file.size > 1024 * 1024) {
      this.showTransferStatus('Pick a settings export: a .json file under 1 MB.', 'error');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      this.showTransferStatus('The file is not valid JSON.', 'error');
      return;
    }

    if (!window.confirm('Import replaces the current settings and hide rules with the ones from the file. Continue?')) {
      this.showTransferStatus('Import cancelled.', 'neutral');
      return;
    }

    try {
      const { imported, skipped, droppedEntries } = await importSettings(payload);
      const problems = [
        skipped.length > 0 && `Skipped broken settings: ${skipped.join(', ')}.`,
        droppedEntries > 0 && `Dropped broken rules: ${droppedEntries}.`,
      ].filter(Boolean);
      this.showTransferStatus(
        [`Imported settings: ${imported.length}.`, ...problems].join(' '),
        problems.length > 0 ? 'error' : 'success',
      );
      // the popup shows what it read at start: reload it, after long enough to read what was left out
      setTimeout(() => location.reload(), problems.length > 0 ? 5000 : 1200);
    } catch (error) {
      this.showTransferStatus(`Import failed: ${error.message}`, 'error');
    }
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
    this.skipperBody.disabled = !isEnabled;
    this.statusMessage.textContent = isEnabled ? 'Enabled' : 'Disabled';
    this.statusMessage.classList.toggle('status-enabled', isEnabled);
    this.statusMessage.classList.toggle('status-disabled', !isEnabled);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});
