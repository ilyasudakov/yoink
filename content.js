(function () {
  if (window.__cookieTransferInjected) return;
  window.__cookieTransferInjected = true;

  const root = document.createElement("div");
  root.id = "cookie-transfer-root";
  root.innerHTML = `<div class="toast" id="ct-toast"></div>`;
  document.documentElement.appendChild(root);

  const toastEl = root.querySelector("#ct-toast");
  const showToast = ctMakeToast(toastEl);

  let panelEl = null;
  let refs = null;
  let suggestion = null;

  function mountPanel() {
    if (panelEl) return;
    panelEl = document.createElement("div");
    panelEl.className = "panel";
    panelEl.dataset.collapsed = "false";
    panelEl.innerHTML = `
      <div class="header" data-action="toggle">
        <div class="title">
          <span class="dot"></span>
          <span>Cookie Transfer</span>
        </div>
        <div class="header-actions">
          <button class="icon-btn" data-action="transfer" title="Copy cookies now" data-stop>${CT_ICONS.refresh}</button>
          <button class="icon-btn chevron" title="Collapse">${CT_ICONS.chevron}</button>
        </div>
      </div>
      <div class="body">
        <div class="row">
          <div>
            <div class="row-label">Pause extension</div>
            <div class="row-sub">Disable cookie syncing</div>
          </div>
          <label class="switch" data-stop>
            <input type="checkbox" id="ct-global-pause" />
            <span class="switch-slider"></span>
          </label>
        </div>
        <div class="divider"></div>
        <div class="section-label">Source hosts</div>
        <div class="hosts" id="ct-hosts"></div>
        <div class="add" data-stop>
          <input type="text" id="ct-new-host" placeholder="Add a source host" spellcheck="false" autocomplete="off" />
          <button id="ct-add-btn">Add</button>
        </div>
      </div>
    `;
    root.insertBefore(panelEl, toastEl);

    refs = {
      hostsEl: panelEl.querySelector("#ct-hosts"),
      globalPauseEl: panelEl.querySelector("#ct-global-pause"),
      newHostInput: panelEl.querySelector("#ct-new-host"),
      dotEl: panelEl.querySelector(".dot"),
      addBtn: panelEl.querySelector("#ct-add-btn")
    };

    suggestion = ctSetupSuggestion(refs.newHostInput);

    panelEl.addEventListener("click", onPanelClick);
    refs.globalPauseEl.addEventListener("change", async () => {
      await ctSend({ type: "set-global-pause", paused: refs.globalPauseEl.checked });
    });
    refs.addBtn.addEventListener("click", onAddClick);
    refs.newHostInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") refs.addBtn.click();
    });

    renderPanel();
  }

  function unmountPanel() {
    if (!panelEl) return;
    panelEl.remove();
    panelEl = null;
    refs = null;
    suggestion = null;
  }

  async function onPanelClick(e) {
    const stop = e.target.closest("[data-stop]");
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (stop && btn.dataset.action !== "transfer") return;
    const action = btn.dataset.action;
    if (action === "toggle") {
      const collapsed = panelEl.dataset.collapsed === "true";
      panelEl.dataset.collapsed = collapsed ? "false" : "true";
      return;
    }
    if (action === "transfer") {
      e.stopPropagation();
      const r = await ctSend({ type: "transfer-now" });
      if (r && r.ok) {
        const copied = r.result && r.result.copied;
        if (copied > 0) showToast(`Copied ${copied} cookie${copied === 1 ? "" : "s"}`, "success");
        else showToast(ctHumanSkip(r.result), "info");
      } else {
        showToast("Transfer failed", "error");
      }
      return;
    }
    if (action === "pause") {
      e.stopPropagation();
      await ctSend({ type: "toggle-host-pause", id: btn.dataset.id });
      return;
    }
    if (action === "remove") {
      e.stopPropagation();
      await ctSend({ type: "remove-host", id: btn.dataset.id });
      return;
    }
  }

  async function onAddClick() {
    const url = refs.newHostInput.value.trim();
    if (!url) return;
    const r = await ctSend({ type: "add-host", url });
    if (r && r.ok) {
      refs.newHostInput.value = "";
      showToast("Host added", "success");
    } else {
      const reason = r && r.error === "duplicate" ? "Already added" : "Invalid URL";
      showToast(reason, "error");
    }
  }

  async function renderPanel() {
    if (!refs) return;
    const state = await ctSend({ type: "get-state" });
    if (!state || !refs) return;
    refs.globalPauseEl.checked = !!state.globallyPaused;
    ctRenderHosts(refs.hostsEl, state);
    ctUpdateDot(refs.dotEl, state);
  }

  async function syncPanelVisibility() {
    const state = await ctSend({ type: "get-state" });
    if (!state) return;
    if (state.showPanel) mountPanel();
    else unmountPanel();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "cookie-transfer:notify" && msg.copied > 0) {
      const hostCount = msg.perHost.filter((h) => h.copied > 0).length;
      showToast(`Copied ${msg.copied} cookie${msg.copied === 1 ? "" : "s"} · ${hostCount} host${hostCount === 1 ? "" : "s"}`, "success");
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.showPanel) syncPanelVisibility();
    if (refs && (changes.hosts || changes.globallyPaused)) renderPanel();
  });

  syncPanelVisibility();
})();
