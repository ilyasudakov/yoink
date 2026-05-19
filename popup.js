const hostsEl = document.getElementById("hosts");
const globalPauseEl = document.getElementById("global-pause");
const showPanelEl = document.getElementById("show-panel");
const newHostInput = document.getElementById("new-host");
const addBtn = document.getElementById("add-btn");
const transferBtn = document.getElementById("transfer-btn");
const toastEl = document.getElementById("toast");
const dotEl = document.getElementById("dot");

const showToast = ctMakeToast(toastEl);
ctSetupSuggestion(newHostInput);

async function refresh() {
  const state = await ctSend({ type: "get-state" });
  if (!state) return;
  globalPauseEl.checked = !!state.globallyPaused;
  showPanelEl.checked = !!state.showPanel;
  ctRenderHosts(hostsEl, state);
  ctUpdateDot(dotEl, state);
}

hostsEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "pause") await ctSend({ type: "toggle-host-pause", id: btn.dataset.id });
  if (btn.dataset.action === "remove") await ctSend({ type: "remove-host", id: btn.dataset.id });
  await refresh();
});

globalPauseEl.addEventListener("change", async () => {
  await ctSend({ type: "set-global-pause", paused: globalPauseEl.checked });
  await refresh();
});

showPanelEl.addEventListener("change", async () => {
  await ctSend({ type: "set-show-panel", show: showPanelEl.checked });
  await refresh();
});

addBtn.addEventListener("click", async () => {
  const url = newHostInput.value.trim();
  if (!url) return;
  const r = await ctSend({ type: "add-host", url });
  if (r && r.ok) {
    newHostInput.value = "";
    showToast("Host added", "success");
    await refresh();
  } else {
    showToast(r && r.error === "duplicate" ? "Already added" : "Invalid URL", "error");
  }
});

newHostInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addBtn.click();
});

transferBtn.addEventListener("click", async () => {
  const r = await ctSend({ type: "transfer-now" });
  if (r && r.ok) {
    const copied = r.result && r.result.copied;
    if (copied > 0) showToast(`Copied ${copied} cookie${copied === 1 ? "" : "s"}`, "success");
    else showToast(ctHumanSkip(r.result), "info");
  } else {
    showToast("Transfer failed", "error");
  }
});

chrome.storage.onChanged.addListener(() => refresh());
refresh();
