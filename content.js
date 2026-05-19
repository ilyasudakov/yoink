(function () {
  if (window.__cookieTransferPanelInjected) return;
  window.__cookieTransferPanelInjected = true;

  const ICONS = {
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v.01"/><path d="M11 12h1v4h1"/></svg>'
  };

  const root = document.createElement("div");
  root.id = "cookie-transfer-root";
  root.innerHTML = `
    <div class="ct-panel" data-collapsed="false">
      <div class="ct-header" data-action="toggle">
        <div class="ct-title">
          <span class="ct-dot"></span>
          <span>Cookie Transfer</span>
        </div>
        <div class="ct-header-actions">
          <button class="ct-icon-btn" data-action="transfer" title="Copy cookies now" data-stop>${ICONS.refresh}</button>
          <button class="ct-icon-btn ct-chevron" title="Collapse">${ICONS.chevron}</button>
        </div>
      </div>
      <div class="ct-body">
        <div class="ct-row">
          <div>
            <div class="ct-row-label">Pause extension</div>
            <div class="ct-row-sub">Disable cookie syncing</div>
          </div>
          <label class="ct-switch" data-stop>
            <input type="checkbox" id="ct-global-pause" />
            <span class="ct-switch-slider"></span>
          </label>
        </div>
        <div class="ct-divider"></div>
        <div class="ct-section-label">Source hosts</div>
        <div class="ct-hosts" id="ct-hosts"></div>
        <div class="ct-add" data-stop>
          <input type="text" id="ct-new-host" placeholder="Add a source host" spellcheck="false" autocomplete="off" />
          <button id="ct-add-btn">Add</button>
        </div>
      </div>
    </div>
    <div class="ct-toast" id="ct-toast"></div>
  `;
  document.documentElement.appendChild(root);

  const panel = root.querySelector(".ct-panel");
  const hostsEl = root.querySelector("#ct-hosts");
  const globalPauseEl = root.querySelector("#ct-global-pause");
  const newHostInput = root.querySelector("#ct-new-host");
  const toastEl = root.querySelector("#ct-toast");
  const dotEl = root.querySelector(".ct-dot");

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => resolve(resp));
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
  }

  function showToast(text, kind) {
    const icon = kind === "success" ? ICONS.check : kind === "error" ? ICONS.info : ICONS.info;
    toastEl.innerHTML = `${icon}<span>${text}</span>`;
    toastEl.dataset.kind = kind || "info";
    toastEl.classList.add("visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove("visible"), 2800);
  }

  function renderHosts(state) {
    hostsEl.innerHTML = "";
    if (!state.hosts || state.hosts.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ct-empty";
      empty.textContent = "No hosts yet — add one below.";
      hostsEl.appendChild(empty);
      return;
    }
    for (const host of state.hosts) {
      const row = document.createElement("div");
      row.className = "ct-host";
      row.dataset.paused = host.paused ? "true" : "false";
      let hostname = host.url;
      try { hostname = new URL(host.url).hostname; } catch (e) {}
      row.innerHTML = `
        <span class="ct-host-dot"></span>
        <span class="ct-host-url" title="${host.url}">${hostname}</span>
        <div class="ct-host-actions">
          <button class="ct-icon-btn" data-action="pause" data-id="${host.id}" title="${host.paused ? "Resume" : "Pause"}">${host.paused ? ICONS.play : ICONS.pause}</button>
          <button class="ct-icon-btn" data-action="remove" data-id="${host.id}" title="Remove">${ICONS.trash}</button>
        </div>
      `;
      hostsEl.appendChild(row);
    }
  }

  function updateDot(state) {
    if (state.globallyPaused) dotEl.dataset.state = "paused";
    else if (!state.hosts || state.hosts.filter((h) => !h.paused).length === 0) dotEl.dataset.state = "idle";
    else dotEl.dataset.state = "active";
  }

  async function refresh() {
    const state = await send({ type: "get-state" });
    if (!state) return;
    globalPauseEl.checked = !!state.globallyPaused;
    renderHosts(state);
    updateDot(state);
  }

  root.addEventListener("click", async (e) => {
    const stop = e.target.closest("[data-stop]");
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (stop && btn.dataset.action !== "transfer") return;
    const action = btn.dataset.action;
    if (action === "toggle") {
      const collapsed = panel.dataset.collapsed === "true";
      panel.dataset.collapsed = collapsed ? "false" : "true";
      return;
    }
    if (action === "transfer") {
      e.stopPropagation();
      const r = await send({ type: "transfer-now" });
      if (r && r.ok) {
        const copied = r.result && r.result.copied;
        if (copied > 0) showToast(`Copied ${copied} cookie${copied === 1 ? "" : "s"}`, "success");
        else showToast(humanSkip(r.result), "info");
      } else {
        showToast("Transfer failed", "error");
      }
      return;
    }
    if (action === "pause") {
      e.stopPropagation();
      await send({ type: "toggle-host-pause", id: btn.dataset.id });
      await refresh();
      return;
    }
    if (action === "remove") {
      e.stopPropagation();
      await send({ type: "remove-host", id: btn.dataset.id });
      await refresh();
      return;
    }
  });

  function humanSkip(result) {
    if (!result) return "Nothing to copy";
    if (result.skipped === "globally-paused") return "Extension is paused";
    if (result.skipped === "not-localhost") return "Not a localhost tab";
    if (result.skipped === "no-active-hosts") return "No active source hosts";
    return "No cookies copied";
  }

  globalPauseEl.addEventListener("change", async () => {
    await send({ type: "set-global-pause", paused: globalPauseEl.checked });
    await refresh();
  });

  root.querySelector("#ct-add-btn").addEventListener("click", async () => {
    const url = newHostInput.value.trim();
    if (!url) return;
    const r = await send({ type: "add-host", url });
    if (r && r.ok) {
      newHostInput.value = "";
      await refresh();
      showToast("Host added", "success");
    } else {
      const reason = r && r.error === "duplicate" ? "Already added" : "Invalid URL";
      showToast(reason, "error");
    }
  });
  let suggestedHost = null;
  async function refreshSuggestion() {
    const r = await send({ type: "get-suggested-host" });
    suggestedHost = (r && r.ok && r.suggestion) || null;
    if (suggestedHost) {
      try {
        newHostInput.placeholder = new URL(suggestedHost).hostname + "  (Tab to fill)";
      } catch (e) {
        newHostInput.placeholder = suggestedHost + "  (Tab to fill)";
      }
    } else {
      newHostInput.placeholder = "Add a source host";
    }
  }
  refreshSuggestion();

  newHostInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      root.querySelector("#ct-add-btn").click();
      return;
    }
    if (e.key === "Tab" && !e.shiftKey && !newHostInput.value && suggestedHost) {
      e.preventDefault();
      newHostInput.value = suggestedHost;
    }
  });
  newHostInput.addEventListener("focus", refreshSuggestion);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "cookie-transfer:notify") {
      if (msg.copied > 0) {
        const hostCount = msg.perHost.filter((h) => h.copied > 0).length;
        showToast(`Copied ${msg.copied} cookie${msg.copied === 1 ? "" : "s"} · ${hostCount} host${hostCount === 1 ? "" : "s"}`, "success");
      }
    }
  });

  chrome.storage.onChanged.addListener(() => refresh());
  refresh();
})();
