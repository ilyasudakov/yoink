const DEFAULT_STATE = {
  hosts: [],
  globallyPaused: false,
  showPanel: false
};

const ICON_SETS = {
  active: { 16: "icon-active.png", 48: "icon-active.png", 128: "icon-active.png" },
  paused: { 16: "icon-paused.png", 48: "icon-paused.png", 128: "icon-paused.png" },
  idle:   { 16: "icon-idle.png",   48: "icon-idle.png",   128: "icon-idle.png" }
};

function computeStatus(state) {
  if (state.globallyPaused) return "paused";
  const active = (state.hosts || []).filter((h) => !h.paused);
  if (active.length === 0) return "idle";
  return "active";
}

async function updateActionIcon() {
  const state = await getState();
  const status = computeStatus(state);
  try {
    await chrome.action.setIcon({ path: ICON_SETS[status] });
  } catch (e) {}
  try {
    const titles = {
      active: "Yoink — active",
      paused: "Yoink — paused",
      idle:   "Yoink — no hosts"
    };
    await chrome.action.setTitle({ title: titles[status] });
  } catch (e) {}
}

const LOCALHOST_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?(\/|$)/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?(\/|$)/i
];

function isLocalhost(url) {
  if (!url) return false;
  return LOCALHOST_PATTERNS.some((re) => re.test(url));
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

async function transferCookiesToLocalhost(tab) {
  const state = await getState();
  if (state.globallyPaused) return { skipped: "globally-paused" };
  if (!tab || !tab.url || !isLocalhost(tab.url)) return { skipped: "not-localhost" };

  const localhostUrl = tab.url;
  const localUrlObj = new URL(localhostUrl);
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
  function toOrigin(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (!/^https?:$/i.test(u.protocol)) return null;
      if (isLocalhost(url)) return null;
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
  if (!isLocalhost(tab.url)) return;
  await transferCookiesToLocalhost(tab);
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
        const result = await transferCookiesToLocalhost(tab);
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

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(null);
  if (!data.hosts) await chrome.storage.local.set(DEFAULT_STATE);
  await updateActionIcon();
});

chrome.runtime.onStartup.addListener(() => { updateActionIcon(); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.hosts || changes.globallyPaused) updateActionIcon();
});

updateActionIcon();
