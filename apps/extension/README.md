# HawkEye-Cue Browser Extension

Chrome extension that detects leads and mentions while scrolling social media.

## Features

- Scans Facebook, Instagram, LinkedIn, and TikTok feeds for keyword matches
- Shows a 🦅 hawk icon on matching posts
- One-click save as Lead or Appreciation
- Syncs with HawkEye-Cue backend API
- Auto-refreshes keywords every 15 minutes

## Installation (Development)

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select this `apps/extension` directory

## Publishing to Chrome Web Store

1. Replace placeholder icons in `src/icons/` with real 16x16, 48x48, and 128x128 PNG hawk icons
2. Zip the entire `apps/extension` directory (manifest.json must be at the root of the zip)
3. Upload to [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole)
4. Fill in store listing details and submit for review

## How It Works

1. User signs into the extension popup with their HawkEye-Cue credentials
2. Extension fetches their saved keywords from the API
3. Content script injects into social media pages
4. As user scrolls, new posts are scanned against keywords
5. Matches show a hawk badge — clicking reveals options to save as lead or appreciation
6. Saved items appear in the HawkEye-Cue web app
