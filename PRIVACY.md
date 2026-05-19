# Privacy Policy — Yoink

**Last updated:** 2026-05-19

Yoink is a Chrome extension that automatically copies cookies from user-configured source hosts to the user's `localhost` / `127.0.0.1` tabs, so developers can test local builds against a real authenticated session.

## What data Yoink accesses

Yoink accesses the following data, **all locally inside your browser only**:

| Data | Why | Where it goes |
| --- | --- | --- |
| Cookies of the source hosts you add | To copy them to your localhost tabs | Chrome's local cookie store on your machine — never transmitted anywhere |
| The hostname of your active tab | To suggest it as autocomplete in the "Add host" input | Read transiently; not stored |
| Your list of configured source hosts, pause states, and panel-visibility preference | To remember your settings between sessions | `chrome.storage.local` on your machine |

## What Yoink does NOT do

- **Yoink does not transmit any data over the network.** There are no servers, no analytics, no telemetry, no third-party SDKs, no remote logging.
- **Yoink does not sell, share, or expose your data** to any third party.
- **Yoink does not collect personally identifiable information** beyond what you explicitly configure (the source-host URLs you type in).
- **Yoink does not read page content** or inject scripts into the pages of source hosts. It only reads cookies via the Chrome `cookies` API.
- **Yoink does not load remote code.** All JavaScript is bundled within the extension package; nothing is fetched at runtime.

## Authentication data

Cookies often contain session tokens, which qualify as authentication information. Yoink handles such cookies only by moving them between Chrome's own local cookie stores (from the source host you configured → to your `localhost`). They never leave the browser and are never persisted anywhere except where Chrome itself stores them.

## Data retention

- Settings (host list, pause state, panel preference): stored on your device until you uninstall the extension or clear its storage.
- Cookies copied to localhost: stored by Chrome itself in your localhost cookie jar according to each cookie's own expiration. Yoink does not retain a separate copy.

## Your control

- You can pause individual source hosts or the entire extension at any time via the popup.
- You can remove any host from the list at any time.
- Uninstalling the extension immediately deletes its stored settings. Cookies that were previously copied to your localhost will remain in Chrome's normal cookie storage until you clear them via Chrome's standard tools.

## Permissions explained

- **`cookies`** — to read cookies from your configured source hosts and write them to your localhost.
- **`storage`** — to remember your settings.
- **`tabs`** — to know when a localhost tab loads (so cookies can be copied at the right moment) and to read the active tab's hostname for autocomplete.
- **`<all_urls>` host permission** — because the source hosts you add are unique to your environment and not known in advance. Yoink only uses this permission to read cookies via `chrome.cookies.getAll` for hosts you explicitly add — not to inject scripts, modify pages, or make network requests.

## Open source

Yoink is open source. You can audit every line of code, including exactly what data is touched, at:

https://github.com/ilyasudakov/yoink

## Contact

For privacy questions or concerns, open an issue at:
https://github.com/ilyasudakov/yoink/issues
