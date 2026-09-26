// Export / import of the settings as one JSON file, to hand them to someone else. A plain script for the popup,
// loaded after hide-rules.js.
//
// Only settings travel: not the skipper's on/off switch (a running state the pages are told about by message)
// and not the debug flag or log. The file is an envelope (who wrote it, in which format version) around `data`,
// the stored values by key. Import makes the settings equal to the file's: a key the file lacks goes back to
// its default. A broken file is refused; a broken part of a good file is left out and reported.

const TRANSFER_APP_ID = 'fck-youtube-ads';
const TRANSFER_KIND = 'settings-export';
const TRANSFER_VERSION = 1;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isPercent = (value) => Number.isFinite(value) && value >= 0 && value <= 100;

// what the code reading each setting relies on; the delay range is the popup slider's
const SETTING_CHECKS = {
  adTransparency: isPercent,
  overlayColor: (value) => value === 'black' || value === 'white',
  [HIDE_DELAY_KEY]: (value) => Number.isFinite(value) && value >= 0 && value <= 30,
  [HIDE_DIM_KEY]: isPercent,
  [HIDE_RULES_KEY]: Array.isArray,
};
const SETTING_KEYS = Object.keys(SETTING_CHECKS);

// rebuilt from known fields only, so nothing else from the file reaches the storage
function sanitizeHideRule(rule) {
  if (!isPlainObject(rule) || typeof rule.selector !== 'string') return null;
  if (!Object.values(HideMode).includes(rule.mode)) return null;

  const clean = { selector: rule.selector.trim(), mode: rule.mode };
  const label = typeof rule.label === 'string' ? rule.label.trim() : '';
  if (label) clean.label = label;
  return clean;
}

// The setting as the extension can use it, or undefined when nothing of it is usable
function sanitizeSetting(key, value) {
  if (!SETTING_CHECKS[key](value)) return undefined;
  return key === HIDE_RULES_KEY ? value.map(sanitizeHideRule).filter(Boolean) : value;
}

async function exportSettings() {
  return {
    app: TRANSFER_APP_ID,
    kind: TRANSFER_KIND,
    exportVersion: TRANSFER_VERSION,
    extensionVersion: chrome.runtime.getManifest().version,
    exportedAt: new Date().toISOString(),
    data: await chrome.storage.local.get(SETTING_KEYS),
  };
}

// The file as a whole: whether it is an export of this extension that this version can read at all
function validateSettingsPayload(payload) {
  if (!isPlainObject(payload)) return ['The file is broken: a JSON object was expected.'];

  const errors = [];
  if (payload.app !== TRANSFER_APP_ID) errors.push('Not an export of this extension ("app" does not match).');
  if (payload.kind !== TRANSFER_KIND) errors.push('Wrong file type ("kind" does not match).');
  if (typeof payload.exportVersion !== 'number' || payload.exportVersion > TRANSFER_VERSION) {
    errors.push(`Unsupported export version (${payload.exportVersion ?? 'missing'}): update the extension.`);
  }
  if (!isPlainObject(payload.data)) errors.push('The file has no "data" section.');
  return errors;
}

// Returns { imported, skipped, droppedEntries }: the keys written, the keys with nothing usable in them, and how
// many rules failed their check. Throws when the file is refused or nothing in it can be used.
async function importSettings(payload) {
  const errors = validateSettingsPayload(payload);
  if (errors.length > 0) throw new Error(errors.join(' '));

  const data = {};
  const skipped = [];
  let droppedEntries = 0;
  for (const key of SETTING_KEYS) {
    if (!(key in payload.data)) continue;

    const value = sanitizeSetting(key, payload.data[key]);
    if (value === undefined) {
      skipped.push(key);
      continue;
    }
    if (Array.isArray(value)) droppedEntries += payload.data[key].length - value.length;
    data[key] = value;
  }
  if (Object.keys(data).length === 0) throw new Error('The file has no usable settings.');

  await chrome.storage.local.remove(SETTING_KEYS.filter((key) => !(key in data)));
  await chrome.storage.local.set(data);
  return { imported: Object.keys(data), skipped, droppedEntries };
}
