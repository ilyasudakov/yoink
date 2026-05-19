const ICONS = {
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v.01"/><path d="M11 12h1v4h1"/></svg>'
};

const hostsEl = document.getElementById("hosts");
const globalPauseEl = document.getElementById("global-pause");
const newHostInput = document.getElementById("new-host");
const addBtn = document.getElementById("add-btn");
const transferBtn = document.getElementById("transfer-btn");
const toastEl = document.getElementById("toast");
const dotEl = document.getElementById("dot");

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => resolve(resp));
  });
}

function showToast(text, kind) {
  const icon = kind === "success" ? ICONS.check : ICONS.info;
  toastEl.innerHTML = `${icon}<span>${text}</span>`;
  toastEl.dataset.kind = kind || "info";
  toastEl.classList.add("visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("visible"), 2500);
}

function humanSkip(result) {
  if (!result) return "Nothing to copy";
  if (result.skipped === "globally-paused") return "Extension is paused";
  if (result.skipped === "not-localhost") return "Not a localhost tab";
  if (result.skipped === "no-active-hosts") return "No active source hosts";
  return "No cookies copied";
}

function renderHosts(state) {
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
      <span class="host-url" title="${host.url}">${hostname}</span>
      <div class="host-actions">
        <button class="icon-btn" data-action="pause" data-id="${host.id}" title="${host.paused ? "Resume" : "Pause"}">${host.paused ? ICONS.play : ICONS.pause}</button>
        <button class="icon-btn" data-action="remove" data-id="${host.id}" title="Remove">${ICONS.trash}</button>
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

hostsEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === "pause") await send({ type: "toggle-host-pause", id: btn.dataset.id });
  if (action === "remove") await send({ type: "remove-host", id: btn.dataset.id });
  await refresh();
});

globalPauseEl.addEventListener("change", async () => {
  await send({ type: "set-global-pause", paused: globalPauseEl.checked });
  await refresh();
});

addBtn.addEventListener("click", async () => {
  const url = newHostInput.value.trim();
  if (!url) return;
  const r = await send({ type: "add-host", url });
  if (r && r.ok) {
    newHostInput.value = "";
    showToast("Host added", "success");
    await refresh();
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
    addBtn.click();
    return;
  }
  if (e.key === "Tab" && !e.shiftKey && !newHostInput.value && suggestedHost) {
    e.preventDefault();
    newHostInput.value = suggestedHost;
  }
});
newHostInput.addEventListener("focus", refreshSuggestion);

transferBtn.addEventListener("click", async () => {
  const r = await send({ type: "transfer-now" });
  if (r && r.ok) {
    const copied = r.result && r.result.copied;
    if (copied > 0) showToast(`Copied ${copied} cookie${copied === 1 ? "" : "s"}`, "success");
    else showToast(humanSkip(r.result), "info");
  } else {
    showToast("Transfer failed", "error");
  }
});

chrome.storage.onChanged.addListener(() => refresh());
refresh();
