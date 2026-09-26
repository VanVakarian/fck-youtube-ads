// Debug log shared by every context of the extension — content script, service worker, popup — as a plain
// script: the manifest lists it before content.js, background.js importScripts() it, popup.html loads it.
//
// While the "Collect debug logs" box is on, every context appends entries `{ at, t, src, cat, msg, data }`
// to chrome.storage.local, and the popup downloads them as one file:
//  - at: epoch ms; t: ms since the context started (for a page: since navigation start); src: who wrote it
//    (a random id per page load / popup open, or whatever setDebugSource gave, e.g. `bg` for the worker);
//  - entries are buffered and written in batches, each batch under its own key `fckdbg:<first at>:<random>`.
//    A batch is never rewritten, so many tabs and the worker never race on a read-modify-write;
//  - one budget guards the quota (10 MB for the whole storage): past the high-water mark the oldest batches
//    are dropped until the log is back under the low-water mark;
//  - nothing here may throw into the extension's own flow: a logging failure costs only the entries.
//
// Hooking new diagnostics onto it (the engine records nothing by itself except uncaught errors):
//  - debugLog(cat, msg, data): one entry; a no-op while the box is off, so call it freely. Build `data` only
//    when it is cheap, or behind isDebugEnabled() when it isn't;
//  - onDebugChange(listener): start / stop a heavier recorder (listeners, observers) with the box, in whatever
//    context needs one — a content script, the worker;
//  - flushDebugLog(): write the buffer now, for a context that may die right after (a closing page, the worker).

const DEBUG_FLAG_KEY = 'debugLogging';
const DEBUG_CHUNK_PREFIX = 'fckdbg:';
const DEBUG_FLUSH_DELAY_MS = 1000;
const DEBUG_PENDING_LIMIT = 5000;
const DEBUG_HIGH_WATER_BYTES = 8 * 1024 * 1024;
const DEBUG_LOW_WATER_BYTES = 6 * 1024 * 1024;

// null until the stored flag is read: entries logged before that wait in debugPending, then are kept or dropped
let debugEnabled = null;
let debugSource = Math.random().toString(36).slice(2, 8);
let debugPending = [];
let debugFlushTimer = null;
const debugChangeListeners = new Set();

function setDebugSource(source) {
  debugSource = source;
}

function isDebugEnabled() {
  return debugEnabled === true;
}

function debugLog(cat, msg, data) {
  if (debugEnabled === false) return;

  if (debugPending.length >= DEBUG_PENDING_LIMIT) debugPending.shift();
  debugPending.push({ at: Date.now(), t: Math.round(performance.now()), src: debugSource, cat, msg, data });
  if (debugEnabled) debugFlushTimer ??= setTimeout(flushDebugLog, DEBUG_FLUSH_DELAY_MS);
}

// listener(enabled) runs on every change of the flag, and once right away when it is already known
function onDebugChange(listener) {
  debugChangeListeners.add(listener);
  if (debugEnabled !== null) listener(debugEnabled);
}

function applyDebugFlag(value) {
  const enabled = Boolean(value);
  if (enabled === debugEnabled) return;

  debugEnabled = enabled;
  if (enabled) {
    debugFlushTimer ??= setTimeout(flushDebugLog, DEBUG_FLUSH_DELAY_MS);
  } else {
    debugPending = [];
    clearTimeout(debugFlushTimer);
    debugFlushTimer = null;
  }
  debugChangeListeners.forEach((listener) => listener(enabled));
}

chrome.storage.local.get(DEBUG_FLAG_KEY).then((result) => applyDebugFlag(result[DEBUG_FLAG_KEY]));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && DEBUG_FLAG_KEY in changes) applyDebugFlag(changes[DEBUG_FLAG_KEY].newValue);
});

async function flushDebugLog() {
  clearTimeout(debugFlushTimer);
  debugFlushTimer = null;
  if (!debugEnabled || debugPending.length === 0) return;

  const batch = debugPending;
  debugPending = [];
  const key = `${DEBUG_CHUNK_PREFIX}${String(batch[0].at).padStart(13, '0')}:${Math.random().toString(36).slice(2, 8)}`;
  try {
    await chrome.storage.local.set({ [key]: batch });
    await enforceDebugBudget();
  } catch (error) {
    // an extension reloaded under an open page can't write anything any more — stop trying
    if (error.message?.includes('Extension context invalidated')) applyDebugFlag(false);
    // otherwise (a full quota) the batch is lost and this makes room for the next one
    else await enforceDebugBudget().catch(() => {});
  }
}

async function debugChunkKeys() {
  const keys = await chrome.storage.local.getKeys();
  return keys.filter((key) => key.startsWith(DEBUG_CHUNK_PREFIX));
}

// the keys sort by time, so dropping from the front of the list drops the oldest; a quarter at a time
// keeps the number of storage calls small
async function enforceDebugBudget() {
  if ((await chrome.storage.local.getBytesInUse(null)) <= DEBUG_HIGH_WATER_BYTES) return;

  const keys = (await debugChunkKeys()).sort();
  while (keys.length > 0 && (await chrome.storage.local.getBytesInUse(null)) > DEBUG_LOW_WATER_BYTES) {
    await chrome.storage.local.remove(keys.splice(0, Math.ceil(keys.length / 4)));
  }
}

// all entries, oldest first
async function readDebugEntries() {
  const keys = await debugChunkKeys();
  const chunks = await chrome.storage.local.get(keys);
  return keys.flatMap((key) => chunks[key]).sort((a, b) => a.at - b.at);
}

async function debugLogBytes() {
  return chrome.storage.local.getBytesInUse(await debugChunkKeys());
}

async function clearDebugLog() {
  await chrome.storage.local.remove(await debugChunkKeys());
}

// what this context's own scripts throw and nobody handles (a page's errors never reach a content script)
globalThis.addEventListener('error', (event) => {
  const stack = event.error?.stack?.split('\n').slice(0, 6).join(' | ');
  debugLog('error', `uncaught: ${event.message}`, { where: `${event.filename}:${event.lineno}:${event.colno}`, stack });
});

globalThis.addEventListener('unhandledrejection', (event) => {
  const stack = event.reason?.stack?.split('\n').slice(0, 6).join(' | ');
  debugLog('error', `unhandled rejection: ${event.reason?.message ?? event.reason}`, { stack });
});
