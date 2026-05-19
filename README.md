# Yoink

A Chrome extension (Manifest V3) that yoinks cookies from any configured host (staging, QA, prod) onto your `localhost` tabs on load. Built for local testing of apps that need a real auth session — no more manually copying cookies through DevTools.

## Install (unpacked)

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder
4. For Incognito support: click **Details** on the extension, enable **Allow in Incognito**

## Usage

- Click the toolbar icon to open the popup; add source hosts (any origin you want to yoink cookies from)
- Cookies are auto-copied to `localhost` / `127.0.0.1` tabs every time they load
- Pause individual hosts via the ⏸ button, or pause the whole extension via the global switch
- Optional floating panel on the localhost page itself (off by default — enable in the popup)
- A toast in the top-right corner confirms how many cookies were copied
- Toolbar icon turns green when active, amber when paused, gray when no hosts are configured

## Notes / limitations

- `Secure` cookies cannot be set on `http://localhost` and are skipped silently — use `https://localhost` if you need them
- `__Host-` / `__Secure-` prefixed cookies have strict rules and may not transfer
- Incognito has its own cookie jar; Yoink writes to the matching store of the localhost tab
- Cookies never leave the browser — copying happens entirely via the Chrome cookies API

## Files

- `manifest.json` — MV3 manifest
- `background.js` — service worker; listens for tab loads and copies cookies
- `shared.js` — shared helpers (icons, render, toast) used by both popup and content script
- `content.js` + `panel.css` — optional floating overlay panel on localhost pages
- `popup.html` + `popup.js` + `popup.css` — toolbar popup
- `icon-active.png` / `icon-paused.png` / `icon-idle.png` — status-colored toolbar icons
