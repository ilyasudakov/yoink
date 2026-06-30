# CLAUDE.md

Yoink — a Chrome MV3 extension that copies cookies from configured **source hosts** onto **destination** tabs (localhost and staging) on load.

## Architecture

- `matching.js` — **pure logic** (no `chrome.*` / DOM): pattern → RegExp matching, wildcard handling, Chrome match-pattern translation, state normalization. Single source of truth, loaded by the worker (`importScripts`), the popup/content script (`<script>` / `content_scripts`), and the Node tests.
- `background.js` — service worker: cookie transfer, message handlers, dynamic content-script registration. Impure (`chrome.*`) glue only.
- `shared.js` — UI helpers (icons, render, toast) shared by popup + content script.
- `popup.{html,js,css}` — toolbar popup. `content.js` + `panel.css` — floating panel.
- **Destinations** are configurable, support `*` wildcards; `localhost` / `127.0.0.1` ship as default (removable) entries in `DEFAULT_STATE`.

## Testing

**New functionality must come with tests in the same change.** No feature/fix lands without coverage.

- **Pure logic** (anything in `matching.js`: new matching rules, normalization, wildcard behavior) → add/extend unit tests in `tests/matching.test.js` (`node:test`). Run: `npm test`.
- **UI / popup / background wiring** (new controls, message handlers, state that surfaces in the popup or panel) → add/extend Playwright tests in `tests/e2e/`. Run: `npm run test:e2e`.
- Cover the happy path **and** the rejection/edge cases (invalid input, paused entries, anchoring so a pattern can't match via another origin's path).
- Keep the split clean: `node --test` must stay fast and Chrome-free — never `require` extension files that touch `chrome.*` from unit tests; exercise that surface through the e2e suite instead.

CI runs both suites on every push/PR (`.github/workflows/`), plus an automated Claude review.

## Conventions

- Plain ES (no build step, no TypeScript, no bundler). Keep `matching.js` loadable both as a classic script (globals) and in Node (`module.exports`) — don't add `import`/`export`.
- Match the surrounding style: 2-space indent, double quotes, semicolons throughout.
- Don't hardcode company/tenant names in code or examples — use generic placeholders (`*.staging.example.com`).
- Bump `version` in `manifest.json` (and `package.json`) for releases.
