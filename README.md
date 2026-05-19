# Cookie Transfer for Localhost

Chrome extension (Manifest V3) that automatically copies cookies from configured source hosts (e.g. staging/QA) to `localhost` tabs on load. Useful for local testing of apps that need a real auth session.

## Install (unpacked)

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder
4. For Incognito support: click **Details** on the extension, enable **Allow in Incognito**

## Usage

- Click the extension icon (or use the floating panel that appears on any `localhost` page) to add source hosts (any staging/QA origin you want to pull cookies from)
- Cookies are auto-copied to `localhost` / `127.0.0.1` tabs every time they navigate/reload
- Pause individual hosts via the ⏸ button, or pause the whole extension via the global switch
- A toast on the page + a Chrome notification confirm how many cookies were copied

## Notes / limitations

- `Secure` cookies cannot be set on `http://localhost` and are skipped silently — use `https://localhost` if you need them
- `__Host-` / `__Secure-` prefixed cookies have strict rules and may not transfer to localhost
- Cross-store: incognito has its own cookie jar. The extension writes to the matching store of the localhost tab
- The extension never sends cookies anywhere — copying happens entirely via the Chrome cookies API

## Files

- `manifest.json` — MV3 manifest
- `background.js` — service worker, listens to tab updates and copies cookies
- `content.js` + `panel.css` — floating overlay panel on localhost pages
- `popup.html` + `popup.js` + `popup.css` — toolbar popup with the same controls
- `icon.png` — toolbar / notification icon
