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

async function updateActionTitle() {
  const state = await getState();
  const status = computeStatus(state);
  const titles = {
    active: "Yoink — active",
    paused: "Yoink — paused",
    idle:   "Yoink — no hosts"
  };
  try { await chrome.action.setTitle({ title: titles[status] }); } catch (e) {}
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
  const dests = (state.destinations || []).filter((d) => d && d.pattern && !d.paused);
  for (const d of dests) {
    const re = destPatternToRegExp(d.pattern);
    if (re && re.test(url)) return d;
  }
  return null;
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

async function getState() {
  const data = await chrome.storage.local.get(DEFAULT_STATE);
  return { ...DEFAULT_STATE, ...data };
}

async function setState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set(next);
  return next;
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

async function transferCookiesToTab(tab) {
  const state = await getState();
  if (state.globallyPaused) return { skipped: "globally-paused" };
  if (!tab || !tab.url || !activeDestinationMatch(tab.url, state)) return { skipped: "not-destination" };

  const localUrlObj = new URL(tab.url);
  const localProtocol = localUrlObj.protocol;
  const localHostname = localUrlObj.hostname;

  const activeHosts = (state.hosts || []).filter((h) => h && h.url && !h.paused);
  if (activeHosts.length === 0) return { skipped: "no-active-hosts" };

  let totalCopied = 0;
  let totalAttempted = 0;
  const perHost = [];
  const storeId = tab.incognito ? await getIncognitoStoreId() : undefined;

  for (const host of activeHosts) {
    try {
      const queryOpts = { url: host.url };
      if (storeId) queryOpts.storeId = storeId;
      const cookies = await chrome.cookies.getAll(queryOpts);
      let copied = 0;
      for (const c of cookies) {
        totalAttempted++;
        try {
          const setDetails = {
            url: localProtocol + "//" + localHostname + (localUrlObj.port ? ":" + localUrlObj.port : "") + "/",
            name: c.name,
            value: c.value,
            path: "/",
            httpOnly: c.httpOnly,
            sameSite: c.sameSite === "no_restriction" ? "no_restriction" : (c.sameSite || "lax"),
            secure: localProtocol === "https:" ? c.secure : false
          };
          if (!c.session && c.expirationDate) {
            setDetails.expirationDate = c.expirationDate;
          }
          if (storeId) setDetails.storeId = storeId;
          const result = await chrome.cookies.set(setDetails);
          if (result) copied++;
        } catch (err) {
          // skip individual cookie failure (e.g. __Host- prefix, secure on http)
        }
      }
      perHost.push({ url: host.url, total: cookies.length, copied });
      totalCopied += copied;
    } catch (err) {
      perHost.push({ url: host.url, error: String(err && err.message || err) });
    }
  }

  await notifyTransfer(tab.id, totalCopied, perHost);
  return { copied: totalCopied, attempted: totalAttempted, perHost };
}

async function getSuggestedHost(sender) {
  const state = await getState();
  function toOrigin(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (!/^https?:$/i.test(u.protocol)) return null;
      if (activeDestinationMatch(url, state)) return null;
      return u.origin + "/";
    } catch (e) {
      return null;
    }
  }
  try {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const fromActive = toOrigin(active && active.url);
    if (fromActive) return fromActive;
  } catch (e) {}
  try {
    const tabs = await chrome.tabs.query({});
    const candidates = tabs
      .map((t) => ({ tab: t, origin: toOrigin(t.url) }))
      .filter((c) => c.origin);
    candidates.sort((a, b) => (b.tab.lastAccessed || 0) - (a.tab.lastAccessed || 0));
    if (candidates[0]) return candidates[0].origin;
  } catch (e) {}
  return null;
}

async function getIncognitoStoreId() {
  try {
    const stores = await chrome.cookies.getAllCookieStores();
    const incog = stores.find((s) => s.incognito) || stores.find((s) => s.id === "1");
    return incog ? incog.id : undefined;
  } catch (e) {
    return undefined;
  }
}

async function notifyTransfer(tabId, copied, perHost) {
  if (copied <= 0 || !tabId) return;
  try {
    chrome.tabs.sendMessage(tabId, {
      type: "cookie-transfer:notify",
      copied,
      perHost
    });
  } catch (e) {}
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading") return;
  if (!tab.url) return;
  const state = await getState();
  if (!activeDestinationMatch(tab.url, state)) return;
  await transferCookiesToTab(tab);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "get-state") {
        sendResponse(await getState());
        return;
      }
      if (msg.type === "set-hosts") {
        const normalized = (msg.hosts || []).map(normalizeHostEntry).filter(Boolean);
        await setState({ hosts: normalized });
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === "add-host") {
        const state = await getState();
        const entry = normalizeHostEntry({ url: msg.url, paused: false });
        if (!entry) {
          sendResponse({ ok: false, error: "invalid-url" });
          return;
        }
        if (state.hosts.some((h) => h.url === entry.url)) {
          sendResponse({ ok: false, error: "duplicate" });
          return;
        }
        const next = [...state.hosts, entry];
        await setState({ hosts: next });
        sendResponse({ ok: true, hosts: next });
        return;
      }
      if (msg.type === "remove-host") {
        const state = await getState();
        const next = state.hosts.filter((h) => h.id !== msg.id);
        await setState({ hosts: next });
        sendResponse({ ok: true, hosts: next });
        return;
      }
      if (msg.type === "toggle-host-pause") {
        const state = await getState();
        const next = state.hosts.map((h) => (h.id === msg.id ? { ...h, paused: !h.paused } : h));
        await setState({ hosts: next });
        sendResponse({ ok: true, hosts: next });
        return;
      }
      if (msg.type === "add-destination") {
        const state = await getState();
        const entry = normalizeDestinationEntry({ pattern: msg.pattern, paused: false });
        if (!entry) {
          sendResponse({ ok: false, error: "invalid-pattern" });
          return;
        }
        if ((state.destinations || []).some((d) => d.pattern === entry.pattern)) {
          sendResponse({ ok: false, error: "duplicate" });
          return;
        }
        const next = [...(state.destinations || []), entry];
        await setState({ destinations: next });
        sendResponse({ ok: true, destinations: next });
        return;
      }
      if (msg.type === "remove-destination") {
        const state = await getState();
        const next = (state.destinations || []).filter((d) => d.id !== msg.id);
        await setState({ destinations: next });
        sendResponse({ ok: true, destinations: next });
        return;
      }
      if (msg.type === "toggle-destination-pause") {
        const state = await getState();
        const next = (state.destinations || []).map((d) => (d.id === msg.id ? { ...d, paused: !d.paused } : d));
        await setState({ destinations: next });
        sendResponse({ ok: true, destinations: next });
        return;
      }
      if (msg.type === "set-global-pause") {
        await setState({ globallyPaused: !!msg.paused });
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === "set-show-panel") {
        await setState({ showPanel: !!msg.show });
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === "get-suggested-host") {
        const suggestion = await getSuggestedHost(sender);
        sendResponse({ ok: true, suggestion });
        return;
      }
      if (msg.type === "transfer-now") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          sendResponse({ ok: false, error: "no-active-tab" });
          return;
        }
        const result = await transferCookiesToTab(tab);
        sendResponse({ ok: true, result });
        return;
      }
      sendResponse({ ok: false, error: "unknown-message" });
    } catch (err) {
      sendResponse({ ok: false, error: String(err && err.message || err) });
    }
  })();
  return true;
});

// The floating panel ships as a static content script on localhost. For custom
// destinations we register it dynamically so it also appears on staging hosts.
const DEST_PANEL_SCRIPT_ID = "ct-dest-panel";
const DEST_PANEL_FILES = {
  js: ["shared.js", "content.js"],
  css: ["panel.css"],
  runAt: "document_idle",
  allFrames: false
};

async function syncDestinationContentScripts() {
  if (!chrome.scripting || !chrome.scripting.registerContentScripts) return;
  const state = await getState();
  const matches = Array.from(new Set(
    (state.destinations || [])
      .filter((d) => d && d.pattern && !d.paused && !isLocalhostPattern(d.pattern))
      .map((d) => patternToMatchPattern(d.pattern))
      .filter(Boolean)
  ));
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [DEST_PANEL_SCRIPT_ID] });
    const isRegistered = existing && existing.length > 0;
    if (matches.length === 0) {
      if (isRegistered) await chrome.scripting.unregisterContentScripts({ ids: [DEST_PANEL_SCRIPT_ID] });
    } else if (isRegistered) {
      await chrome.scripting.updateContentScripts([{ id: DEST_PANEL_SCRIPT_ID, matches, ...DEST_PANEL_FILES }]);
    } else {
      await chrome.scripting.registerContentScripts([{ id: DEST_PANEL_SCRIPT_ID, matches, ...DEST_PANEL_FILES }]);
    }
  } catch (e) {
    // Invalid match pattern or registration race — panel just won't show; the
    // background transfer still works regardless.
  }
  await injectIntoOpenDestinationTabs(state);
}

// Registration only affects future navigations, so inject into already-open
// destination tabs (e.g. the staging the user is looking at while adding it).
async function injectIntoOpenDestinationTabs(state) {
  if (!chrome.scripting || !chrome.scripting.executeScript) return;
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch (e) { return; }
  for (const t of tabs) {
    if (!t.id || !t.url || isLocalhost(t.url)) continue;
    if (!activeDestinationMatch(t.url, state)) continue;
    try {
      const [probe] = await chrome.scripting.executeScript({
        target: { tabId: t.id },
        func: () => !!window.__cookieTransferInjected
      });
      if (probe && probe.result) continue;
      await chrome.scripting.insertCSS({ target: { tabId: t.id }, files: DEST_PANEL_FILES.css });
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: DEST_PANEL_FILES.js });
    } catch (e) {
      // Restricted page (chrome://, web store, etc.) — ignore.
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(null);
  if (!data.hosts) await chrome.storage.local.set(DEFAULT_STATE);
  await updateActionTitle();
  await syncDestinationContentScripts();
});

chrome.runtime.onStartup.addListener(() => {
  updateActionTitle();
  syncDestinationContentScripts();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.hosts || changes.globallyPaused) updateActionTitle();
  if (changes.destinations) syncDestinationContentScripts();
});

updateActionTitle();
syncDestinationContentScripts();
