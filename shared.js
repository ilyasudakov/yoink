// Shared helpers used by both content.js and popup.js.
// Loaded as a separate <script> in popup.html and as the first entry in
// content_scripts in manifest.json — runs in the same realm as its consumer.

const CT_ICONS = {
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v.01"/><path d="M11 12h1v4h1"/></svg>'
};

function ctSend(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (resp) => resolve(resp));
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
}

function ctHumanSkip(result) {
  if (!result) return "Nothing to copy";
  if (result.skipped === "globally-paused") return "Extension is paused";
  if (result.skipped === "not-localhost") return "Not a localhost tab";
  if (result.skipped === "no-active-hosts") return "No active source hosts";
  return "No cookies copied";
}

function ctUpdateDot(dotEl, state) {
  if (!dotEl) return;
  if (state.globallyPaused) dotEl.dataset.state = "paused";
  else if (!state.hosts || state.hosts.filter((h) => !h.paused).length === 0) dotEl.dataset.state = "idle";
  else dotEl.dataset.state = "active";
}

function ctEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function ctRenderHosts(hostsEl, state) {
  if (!hostsEl) return;
  hostsEl.innerHTML = "";
  if (!state.hosts || state.hosts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No hosts yet — add one below.";
    hostsEl.appendChild(empty);
    return;
  }
  for (const host of state.hosts) {
    const row = document.createElement("div");
    row.className = "host";
    row.dataset.paused = host.paused ? "true" : "false";
    let hostname = host.url;
    try { hostname = new URL(host.url).hostname; } catch (e) {}
    row.innerHTML = `
      <span class="host-dot"></span>
      <span class="host-url" title="${ctEscape(host.url)}">${ctEscape(hostname)}</span>
      <div class="host-actions">
        <button class="icon-btn" data-action="pause" data-id="${ctEscape(host.id)}" title="${host.paused ? "Resume" : "Pause"}">${host.paused ? CT_ICONS.play : CT_ICONS.pause}</button>
        <button class="icon-btn" data-action="remove" data-id="${ctEscape(host.id)}" title="Remove">${CT_ICONS.trash}</button>
      </div>
    `;
    hostsEl.appendChild(row);
  }
}

function ctMakeToast(toastEl) {
  let timer;
  return function showToast(text, kind) {
    if (!toastEl) return;
    const icon = kind === "success" ? CT_ICONS.check : CT_ICONS.info;
    toastEl.innerHTML = `${icon}<span>${ctEscape(text)}</span>`;
    toastEl.dataset.kind = kind || "info";
    toastEl.classList.add("visible");
    clearTimeout(timer);
    timer = setTimeout(() => toastEl.classList.remove("visible"), 2800);
  };
}

function ctSetupSuggestion(inputEl) {
  let suggestedHost = null;
  async function refresh() {
    const r = await ctSend({ type: "get-suggested-host" });
    suggestedHost = (r && r.ok && r.suggestion) || null;
    if (suggestedHost) {
      try {
        inputEl.placeholder = new URL(suggestedHost).hostname + "  (Tab to fill)";
      } catch (e) {
        inputEl.placeholder = suggestedHost + "  (Tab to fill)";
      }
    } else {
      inputEl.placeholder = "Add a source host";
    }
  }
  inputEl.addEventListener("focus", refresh);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && !e.shiftKey && !inputEl.value && suggestedHost) {
      e.preventDefault();
      inputEl.value = suggestedHost;
    }
  });
  refresh();
  return { refresh, get value() { return suggestedHost; } };
}
