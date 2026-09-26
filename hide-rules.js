// Cosmetic hide rules: storage keys, defaults and the reader, shared by the popup (editor) and the content
// script (hide.js, applies them) as a plain script.
//
// A rule is `{ selector, mode, label? }`, where `mode` is one of HideMode. Rules are stored as one array in
// chrome.storage.local; until the popup saves it, the list below is used, so every rule starts switched off.

const HIDE_ENABLED_KEY = 'hideEnabled'; // master switch: off, no rule is applied
const HIDE_RULES_KEY = 'hideRules';
const HIDE_DELAY_KEY = 'hideDelaySec';
const HIDE_DIM_KEY = 'hideDimOpacity';

const DEFAULT_HIDE_DELAY_SEC = 5;
const DEFAULT_HIDE_DIM_OPACITY = 10;

const HideMode = {
  Off: 'off',
  Remove: 'remove',
  Dim: 'dim',
};

const DEFAULT_HIDE_RULES = [
  { label: 'Home: ad slots', selector: 'ytd-ad-slot-renderer:not(:hover)' },
  { label: 'Home: rich sections', selector: 'ytd-rich-section-renderer' },
  { label: 'Home: masthead ad', selector: '#masthead-ad' },
  { label: 'Video: ads', selector: '#player-ads' },
  { label: 'Video: merch shelf', selector: 'ytd-merch-shelf-renderer' },
  { label: 'Video: Premium promo', selector: 'tp-yt-paper-dialog:has(yt-mealbar-promo-renderer)' },
  { label: 'Chat: YouTube emojis', selector: 'yt-emoji-picker-category-renderer[aria-label="YouTube"]' },
  { label: 'Search: shelves', selector: 'ytd-shelf-renderer:has(div#dismissible)' },
  { label: 'Search: Shorts', selector: 'ytd-reel-shelf-renderer' },
  { label: 'Search: People also search for', selector: 'ytd-horizontal-card-list-renderer' },
  { label: 'Home: music', selector: 'ytd-rich-item-renderer:has(.badge-style-type-verified-artist)' },
  { label: 'Home: playlists', selector: 'ytd-rich-item-renderer:has(yt-collection-thumbnail-view-model):not(:hover)' },
  {
    label: 'Home: upcoming',
    selector: 'ytd-rich-item-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"]):not(:hover)',
  },
  { label: 'Subs: upcoming streams', selector: 'ytd-rich-item-renderer:has(toggle-button-view-model):not(:hover)' },
  {
    label: 'Video: watched',
    selector: 'yt-lockup-view-model:has(.ytThumbnailOverlayProgressBarHostUseLegacyBar):not(:hover)',
  },
  { label: 'Video: music', selector: 'ytd-compact-video-renderer:has(.badge-style-type-verified-artist):not(:hover)' },
].map((rule) => ({ ...rule, mode: HideMode.Off }));

async function readHideSettings() {
  const stored = await chrome.storage.local.get([HIDE_ENABLED_KEY, HIDE_RULES_KEY, HIDE_DELAY_KEY, HIDE_DIM_KEY]);
  return {
    enabled: stored[HIDE_ENABLED_KEY] ?? true,
    rules: stored[HIDE_RULES_KEY] ?? DEFAULT_HIDE_RULES,
    delaySec: stored[HIDE_DELAY_KEY] ?? DEFAULT_HIDE_DELAY_SEC,
    dimOpacity: stored[HIDE_DIM_KEY] ?? DEFAULT_HIDE_DIM_OPACITY,
  };
}
