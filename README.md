# Fck YouTube Ads

A Chrome extension designed to enhance your YouTube viewing experience by automatically managing and skipping advertisements.

## Features

- Automatic detection and skipping of video advertisements
- Mutes audio during ads — no annoying sounds
- Dims the video with customizable overlay while ads are playing
- Adjustable transparency level (0-100%)
- Choice of overlay color (black or white)
- Works on all YouTube pages
- No external dependencies
- Lightweight and efficient

## Debug logs

A ready-made diagnostics engine ([diagnostics.js](diagnostics.js)), shared by the content script, the service worker and the popup. Tick "Collect debug logs" in the popup to turn it on: "Download" saves the log as one JSON file, "Clear" empties it. The log lives in `chrome.storage.local` and is kept under 8 MB (oldest entries go first). Nothing is recorded while the box is off.

On its own the engine records only uncaught errors. To diagnose something, hook onto it: `debugLog(category, message, data)` writes an entry, `onDebugChange(listener)` starts and stops a heavier recorder together with the box. The header of `diagnostics.js` describes the API. A full ad/YouTube recorder that was built on it (page lifecycle, `<video>` events, ad DOM, skip-button visibility, input events, network, tab events) lives in the git history, commit `d46d4d0`.

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory

## How it Works

The extension uses content scripts to monitor YouTube pages and automatically handles advertisement-related elements. It operates entirely client-side and doesn't require any external services.

## Technical Details

- Built using Manifest V3
- Uses modern JavaScript features
- Implements content scripts for page manipulation
- Background service worker for extension functionality
- Custom styling for seamless integration

## Browser Support

Currently supports Chromium-based browsers (Chrome, Edge, Brave, etc.)

## License

This project is open source and available under the MIT License.

## Disclaimer

This extension is for educational purposes only. Do not use this extension since it may violate YouTube's terms of service and policies.
