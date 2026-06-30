// Pure, dependency-free logic shared by the service worker, the popup, the
// content script, and the Node test suite. No chrome.* / DOM access here.
//
// Loaded as a classic script: in the extension it defines globals (via
// importScripts in background.js and <script>/content_scripts elsewhere); in
// Node it also exports through module.exports (see the bottom of the file).

const DEFAULT_STATE = {
  hosts: [],
  destinations: [
    { id: "default-localhost", pattern: "localhost", paused: false },
    { id: "default-loopback", pattern: "127.0.0.1", paused: false }
  ],
  globallyPaused: false,
  showPanel: false
};

function computeStatus(state) {
  if (state.globallyPaused) return "paused";
  const active = (state.hosts || []).filter((h) => !h.paused);
  if (active.length === 0) return "idle";
  return "active";
}

const LOCALHOST_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?(\/|$)/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?(\/|$)/i
];

function isLocalhost(url) {
  if (!url) return false;
  return LOCALHOST_PATTERNS.some((re) => re.test(url));
}

// Convert a user destination pattern (with `*` wildcards) into an anchored
// RegExp. Examples that should match:
//   app-*.staging.example.com  -> https://app-123.staging.example.com/foo
//   https://*.preview.example.com/
// Scheme defaults to http/https when omitted; port and path are optional.
function destPatternToRegExp(pattern) {
  let p = String(pattern || "").trim().replace(/\/+$/, "");
  if (!p) return null;
  let scheme = "https?";
  const m = p.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
  if (m) { scheme = m[1]; p = p.slice(m[0].length); }
  const slash = p.indexOf("/");
  const hostport = slash === -1 ? p : p.slice(0, slash);
  const path = slash === -1 ? "" : p.slice(slash);
  if (!hostport) return null;
  const escapeRe = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  let re = "^" + scheme + ":\\/\\/" + escapeRe(hostport);
  if (!hostport.includes(":")) re += "(:\\d+)?";
  re += path ? escapeRe(path) + "(/.*)?$" : "(/.*)?$";
  try { return new RegExp(re, "i"); } catch (e) { return null; }
}

// Returns the matching destination entry, or null. localhost ships as a default
// destination entry (see DEFAULT_STATE) so it can be paused/removed like any
// other. Paused destinations are ignored.
function activeDestinationMatch(url, state) {
  if (!url) return null;
  const dests = ((state && state.destinations) || []).filter((d) => d && d.pattern && !d.paused);
  for (const d of dests) {
    const re = destPatternToRegExp(d.pattern);
    if (re && re.test(url)) return d;
  }
  return null;
}

function isActiveDestination(url, state) {
  return !!activeDestinationMatch(url, state);
}

// A destination pattern that points at the local machine. Such patterns are
// already covered by the static content script in the manifest, so they are
// skipped when registering dynamic content scripts.
function isLocalhostPattern(pattern) {
  const host = String(pattern || "")
    .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "")
    .split("/")[0]
    .split(":")[0]
    .toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

// Translate a destination pattern into the closest valid Chrome match pattern
// for dynamic content-script registration. Chrome only allows a leading `*.`
// host wildcard, so a partial-label wildcard (app-*.staging...) widens to the
// clean suffix (*.staging.example.com). The content script re-checks the real
// pattern on load, so the wider match never shows the panel on a non-match.
function patternToMatchPattern(pattern) {
  let p = String(pattern || "").trim().replace(/\/+$/, "");
  if (!p) return null;
  let scheme = "*";
  const m = p.match(/^(https?):\/\//i);
  if (m) { scheme = m[1].toLowerCase(); p = p.slice(m[0].length); }
  else p = p.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  const host = p.split("/")[0].split(":")[0];
  if (!host) return null;
  if (!host.includes("*")) return scheme + "://" + host + "/*";
  const labels = host.split(".");
  const clean = [];
  for (let i = labels.length - 1; i >= 0 && !labels[i].includes("*"); i--) {
    clean.unshift(labels[i]);
  }
  if (clean.length < 2) return null; // too broad to register safely
  return scheme + "://*." + clean.join(".") + "/*";
}

function normalizeHostEntry(entry) {
  if (!entry || !entry.url) return null;
  let url = entry.url.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const u = new URL(url);
    return {
      id: entry.id || (u.origin + "_" + Date.now()),
      url: u.origin + "/",
      paused: !!entry.paused
    };
  } catch (e) {
    return null;
  }
}

function normalizeDestinationEntry(entry) {
  if (!entry) return null;
  let pattern = String(entry.pattern || entry.url || "").trim().replace(/\/+$/, "");
  if (!pattern) return null;
  const host = pattern.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "").split("/")[0];
  if (!host || /\s/.test(host)) return null; // needs a host, no spaces
  if (!destPatternToRegExp(pattern)) return null;
  return {
    id: entry.id || ("dest_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)),
    pattern,
    paused: !!entry.paused
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_STATE,
    computeStatus,
    LOCALHOST_PATTERNS,
    isLocalhost,
    destPatternToRegExp,
    activeDestinationMatch,
    isActiveDestination,
    isLocalhostPattern,
    patternToMatchPattern,
    normalizeHostEntry,
    normalizeDestinationEntry
  };
}
