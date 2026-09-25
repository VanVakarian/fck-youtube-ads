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

Tick "Collect debug logs" in the popup: from then on every YouTube tab (and the service worker) records what it sees and does — page lifecycle, the `<video>` state and events, ad/dialog elements appearing in the DOM, the skip button's visibility and click target, input events with `isTrusted`, the page's network requests (paths only), tab events. "Download" saves everything as one JSON file, "Clear" empties the log. The log lives in `chrome.storage.local` and is kept under 8 MB (oldest entries go first). Nothing is recorded while the box is off.

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
