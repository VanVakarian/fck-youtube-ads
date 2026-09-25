// Passive recorder of what the page and the extension do around ads, for the debug log (see diagnostics.js).
// Runs only while debug logging is on. It reads, listens and observes — it never touches the page and never
// changes what content.js decides — so a log taken with it on describes the same behavior as with it off,
// apart from a little extra work per DOM change.
//
// Who feeds the log:
//  - this file: page lifecycle, the <video> elements' events, the page's own network requests (path only),
//    input events with `isTrusted`, ad/dialog elements appearing and changing, and a heartbeat snapshot;
//  - content.js: its decisions (ad state on every check, mute, overlay, skip requests) through the note*
//    functions and debugLog directly.

const PAGE_ID = Math.random().toString(36).slice(2, 8);
const SCRIPT_START_T = Math.round(performance.now());
setDebugSource(`page:${PAGE_ID}`);

const TEXT_LIMIT = 300;
const STATE_LOG_MIN_INTERVAL_MS = 100;
const TICK_MS = 1000;
const FAST_HEARTBEAT_WINDOW_MS = 90 * 1000; // how long since navigation a heartbeat is written every tick
const SLOW_HEARTBEAT_EVERY_TICKS = 30;
const ATTRIBUTE_LOGS_PER_TICK = 30;

const INPUT_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'];
const WINDOW_EVENTS = ['focus', 'blur', 'pageshow', 'pagehide', 'beforeunload', 'load', 'freeze', 'resume'];
const YOUTUBE_EVENTS = [
  'yt-navigate-start',
  'yt-navigate-finish',
  'yt-page-type-changed',
  'yt-page-data-updated',
  'yt-player-updated',
];
// no timeupdate / progress: they fire several times a second and say nothing the heartbeat doesn't
const VIDEO_EVENTS = [
  'loadstart',
  'loadedmetadata',
  'loadeddata',
  'canplay',
  'play',
  'playing',
  'pause',
  'waiting',
  'stalled',
  'suspend',
  'abort',
  'emptied',
  'ended',
  'error',
  'seeking',
  'seeked',
  'volumechange',
  'ratechange',
  'durationchange',
  'resize',
];

// what is worth a line when it appears in / disappears from / changes in the DOM: the ad UI, the skip
// button, and anything that looks like a dialog or an error screen (where an ad-blocker notice would show up)
const NOTABLE_NODE_SELECTOR = [
  'ytd-enforcement-message-view-model',
  'yt-playability-error-supported-renderers',
  'ytd-popup-container',
  'tp-yt-paper-dialog',
  'yt-confirm-dialog-renderer',
  'ytd-player-error-message-renderer',
  'dialog',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[class*="enforcement"]',
  '[class*="adblock"]',
  '[class*="ad-block"]',
  '[class*="ytp-ad"]',
  '[class*="ytp-skip"]',
  '[class*="ytp-error"]',
  '[class*="video-ads"]',
].join(', ');

let controller = null; // recording is on while this is set
let domObserver = null;
let resourceObserver = null;
let tickTimer = null;
let watchedVideos = new WeakSet();

let tickCount = 0;
let checkCount = 0;
let attributeBudget = ATTRIBUTE_LOGS_PER_TICK;
let mouseMoveCount = 0;
let lastMouseMove = null;
let lastStateSignature = '';
let lastStateLogAt = 0;

// ---- describing things ---------------------------------------------------------------------

function describeElement(el) {
  if (!el?.localName) return null;
  const id = el.id ? `#${el.id}` : '';
  const classes = el.classList?.length ? `.${[...el.classList].join('.')}` : '';
  return `${el.localName}${id}${classes}`.slice(0, TEXT_LIMIT);
}

function textOf(el) {
  return (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, TEXT_LIMIT);
}

function boxOf(el) {
  const { left, top, width, height } = el.getBoundingClientRect();
  return `${Math.round(left)},${Math.round(top)} ${Math.round(width)}x${Math.round(height)}`;
}

function describeViewport() {
  return {
    inner: `${innerWidth}x${innerHeight}`,
    outer: `${outerWidth}x${outerHeight}`,
    dpr: devicePixelRatio,
    scroll: `${Math.round(scrollX)},${Math.round(scrollY)}`,
  };
}

// whether the element can be seen and clicked right now: computed style, the browser's own visibility
// verdict (which accounts for hidden ancestors), and what is actually under the element's center
function describeVisibility(el) {
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return {
    el: describeElement(el),
    box: boxOf(el),
    inlineStyle: el.getAttribute('style')?.slice(0, 100) ?? null,
    css: `${style.display}/${style.visibility}/${style.opacity}`,
    visible: el.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
    hit: describeElement(hit),
    hitIsElement: hit ? el.contains(hit) : false,
    parent: describeElement(el.parentElement),
  };
}

function describeVideo(video) {
  return {
    paused: video.paused,
    muted: video.muted,
    vol: Number(video.volume.toFixed(2)),
    time: Number(video.currentTime.toFixed(2)),
    dur: Number.isFinite(video.duration) ? Number(video.duration.toFixed(1)) : String(video.duration),
    ready: video.readyState,
    net: video.networkState,
    ended: video.ended,
    rate: video.playbackRate,
    size: `${video.videoWidth}x${video.videoHeight}`,
    src: video.src.startsWith('blob:') ? 'blob' : video.src.slice(0, 80),
    err: video.error?.code ?? null,
  };
}

// every class token of the ad UI currently inside the player — the picture of which ad elements exist
function adClassTokens(player) {
  if (!player) return [];
  const tokens = new Set();
  for (const el of player.querySelectorAll('[class*="ytp-ad"], [class*="ytp-skip"], [class*="video-ads"]')) {
    for (const token of el.classList) {
      if (/^(ytp-ad|ytp-skip|video-ads)/.test(token)) tokens.add(token);
    }
  }
  return [...tokens].sort();
}

function playerSnapshot() {
  const player = document.querySelector('.html5-video-player');
  const video = document.querySelector('video');
  return {
    vis: document.visibilityState,
    focus: document.hasFocus(),
    videos: document.querySelectorAll('video').length,
    video: video ? { ...describeVideo(video), inPlayer: Boolean(player?.contains(video)) } : null,
    player: player?.className.slice(0, TEXT_LIMIT) ?? null,
    adClasses: adClassTokens(player).join(' '),
    overlay: Boolean(document.querySelector('.fck-ad-overlay')),
    skipCandidates: [...(player?.querySelectorAll('[class*="skip"]') ?? [])].slice(0, 5).map(describeVisibility),
  };
}

// what the initial page HTML says about this video's ads: the player response is inline JSON
function describeInitialPlayerResponse() {
  const text = [...document.scripts].find((script) => script.textContent.includes('ytInitialPlayerResponse'))
    ?.textContent;
  if (!text) return null;
  return {
    playability: text.match(/"playabilityStatus":\{"status":"(\w+)"/)?.[1] ?? null,
    adPlacements: text.includes('"adPlacements"'),
    playerAds: text.includes('"playerAds"'),
    adSlots: text.includes('"adSlots"'),
    adBlockWord: /ad.?block/i.test(text),
  };
}

function describeNavigation() {
  const nav = performance.getEntriesByType('navigation')[0];
  return {
    type: nav?.type,
    responseEnd: Math.round(nav?.responseEnd ?? 0),
    domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? 0),
    loadEnd: Math.round(nav?.loadEventEnd ?? 0),
    paint: performance.getEntriesByType('paint').map((entry) => `${entry.name}=${Math.round(entry.startTime)}`),
  };
}

// ---- what content.js reports ---------------------------------------------------------------

// content.js calls this on every check; a line is written only when the ad state actually changed
function noteAdCheck(decision) {
  checkCount++;
  if (!controller) return;

  const now = performance.now();
  if (now - lastStateLogAt < STATE_LOG_MIN_INTERVAL_MS) return;
  lastStateLogAt = now;

  watchVideos();
  const snapshot = playerSnapshot();
  const modes = snapshot.player?.match(/\S+-mode|ad-\S+/g) ?? [];
  const signature = JSON.stringify([
    decision,
    snapshot.videos,
    snapshot.video && [snapshot.video.muted, snapshot.video.paused, snapshot.video.ended],
    modes,
    snapshot.adClasses,
    snapshot.skipCandidates.map((candidate) => candidate.visible),
  ]);
  if (signature === lastStateSignature) return;

  lastStateSignature = signature;
  debugLog('state', 'ad state changed', { decision, ...snapshot });
}

function noteSkipRequest(skipButton) {
  if (!controller) return;
  debugLog('skip', 'requesting click from background', {
    button: describeVisibility(skipButton),
    viewport: describeViewport(),
    ...playerSnapshot(),
  });
}

// ---- recording -----------------------------------------------------------------------------

function watchVideos() {
  for (const video of document.querySelectorAll('video')) {
    if (watchedVideos.has(video)) continue;

    watchedVideos.add(video);
    debugLog('video', 'element seen', { el: describeElement(video), ...describeVideo(video) });
    const isMain = () => video === document.querySelector('video');
    for (const type of VIDEO_EVENTS) {
      video.addEventListener(type, () => debugLog('video', type, { ...describeVideo(video), isMain: isMain() }), {
        signal: controller.signal,
      });
    }
  }
}

function recordInput(event) {
  debugLog('input', `${event.type} trusted=${event.isTrusted}`, {
    pos: `${Math.round(event.clientX)},${Math.round(event.clientY)}`,
    button: event.button,
    buttons: event.buttons,
    pointer: event.pointerType,
    target: describeElement(event.target),
  });
}

// the pointer entering the skip button before the click is what a person's click always has
function recordHover(event) {
  const skip = event.target.closest?.('[class*="skip"]');
  if (skip) debugLog('input', `${event.type} trusted=${event.isTrusted}`, { target: describeElement(skip) });
}

function recordMouseMove(event) {
  mouseMoveCount++;
  lastMouseMove = `${Math.round(event.clientX)},${Math.round(event.clientY)} trusted=${event.isTrusted}`;
}

// only keys that aren't text: what is typed (a search query) doesn't belong in a log
function recordKey(event) {
  if (event.key.length > 1 || event.key === ' ') debugLog('input', `keydown ${event.key} trusted=${event.isTrusted}`);
}

function recordPageEvent(event) {
  const isPageLevel = event.target === window || event.target === document;
  if (!isPageLevel && !event.type.startsWith('yt-')) return;

  debugLog('page', event.type, { vis: document.visibilityState, focus: document.hasFocus(), url: location.href });
  // a page going away may not get another chance to write
  if (event.type === 'pagehide' || document.visibilityState === 'hidden') flushDebugLog();
}

function recordNode(kind, node, { withDescendants }) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const found = node.matches(NOTABLE_NODE_SELECTOR) ? [node] : [];
  if (withDescendants) found.push(...[...node.querySelectorAll(NOTABLE_NODE_SELECTOR)].slice(0, 10));
  for (const el of found) {
    const data = kind === 'added' ? { text: textOf(el), parent: describeElement(el.parentElement) } : undefined;
    debugLog('dom', `${kind} ${describeElement(el)}`, data);
  }
}

// skip button changes are always written; other attribute flicker on ad elements is capped per tick
function recordAttribute({ target, attributeName, oldValue }) {
  if (!target.matches(NOTABLE_NODE_SELECTOR)) return;

  const isSkip = /skip/.test(target.getAttribute('class') ?? '');
  if (!isSkip && attributeBudget-- <= 0) return;

  debugLog('dom', `attr ${attributeName} ${describeElement(target)}`, {
    old: oldValue?.slice(0, 150),
    new: target.getAttribute(attributeName)?.slice(0, 150),
  });
}

function recordDomChanges(mutations) {
  for (const mutation of mutations) {
    if (mutation.type === 'attributes') {
      recordAttribute(mutation);
      continue;
    }
    mutation.addedNodes.forEach((node) => recordNode('added', node, { withDescendants: true }));
    mutation.removedNodes.forEach((node) => recordNode('removed', node, { withDescendants: false }));
  }
}

// path only, never the query string: it carries tokens
function recordResource(entry) {
  if (['img', 'css', 'link'].includes(entry.initiatorType)) return;

  const url = new URL(entry.name);
  debugLog('net', `${entry.initiatorType} ${entry.responseStatus} ${url.host}${url.pathname.slice(0, 150)}`, {
    start: Math.round(entry.startTime),
    ms: Math.round(entry.duration),
    bytes: entry.transferSize,
  });
}

function tick() {
  tickCount++;
  attributeBudget = ATTRIBUTE_LOGS_PER_TICK;

  if (mouseMoveCount > 0) {
    debugLog('input', 'mousemove summary', { moves: mouseMoveCount, last: lastMouseMove });
    mouseMoveCount = 0;
  }

  const isAdShowing = document.querySelector('.html5-video-player.ad-showing') !== null;
  const isEarly = performance.now() < FAST_HEARTBEAT_WINDOW_MS;
  if (isEarly || isAdShowing || tickCount % SLOW_HEARTBEAT_EVERY_TICKS === 0) {
    watchVideos();
    debugLog('beat', 'heartbeat', { checks: checkCount, ...playerSnapshot() });
    checkCount = 0;
  }
}

function startRecording() {
  if (controller) return;

  controller = new AbortController();
  const { signal } = controller;
  watchedVideos = new WeakSet();

  for (const type of INPUT_EVENTS) document.addEventListener(type, recordInput, { capture: true, signal });
  document.addEventListener('mouseover', recordHover, { capture: true, signal });
  document.addEventListener('mousemove', recordMouseMove, { capture: true, passive: true, signal });
  document.addEventListener('keydown', recordKey, { capture: true, signal });
  for (const type of [...WINDOW_EVENTS, ...YOUTUBE_EVENTS, 'visibilitychange']) {
    window.addEventListener(type, recordPageEvent, { capture: true, signal });
  }

  domObserver = new MutationObserver(recordDomChanges);
  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'opened'],
    attributeOldValue: true,
  });

  resourceObserver = new PerformanceObserver((list) => list.getEntries().forEach(recordResource));
  resourceObserver.observe({ type: 'resource', buffered: true });

  tickTimer = setInterval(tick, TICK_MS);

  debugLog('boot', 'recording started', {
    url: location.href,
    referrer: document.referrer,
    readyState: document.readyState,
    scriptStartT: SCRIPT_START_T,
    opener: window.opener !== null,
    historyLength: history.length,
    userActivation: { been: navigator.userActivation.hasBeenActive, now: navigator.userActivation.isActive },
    webdriver: navigator.webdriver,
    ua: navigator.userAgent,
    viewport: describeViewport(),
    navigation: describeNavigation(),
    initialPlayerResponse: describeInitialPlayerResponse(),
    ...playerSnapshot(),
  });
  watchVideos();
}

function stopRecording() {
  if (!controller) return;

  controller.abort();
  controller = null;
  domObserver.disconnect();
  resourceObserver.disconnect();
  clearInterval(tickTimer);
}

onDebugChange((enabled) => (enabled ? startRecording() : stopRecording()));
