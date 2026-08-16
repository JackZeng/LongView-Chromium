const $ = (id) => document.getElementById(id);
let tabId = null;
let active = false;

async function sendToTab(message) {
  if (!Number.isInteger(tabId)) return null;
  try { return await chrome.tabs.sendMessage(tabId, message); }
  catch { return null; }
}

function render(stats = {}) {
  active = Boolean(stats.active);
  $("status").textContent = active ? "Active" : "Idle";
  $("status").className = `pill ${active ? "active" : "idle"}`;
  $("toggle").textContent = active ? "Disable on this page" : "Enable on this page";
  for (const id of ["hot", "warm", "cold", "segments"]) $(id).textContent = stats[id] ?? 0;
  $("adapter").textContent = stats.adapter || "—";
  $("screens").textContent = stats.pageScreens ? `${stats.pageScreens} screens` : "—";
  $("velocity").textContent = Number.isFinite(stats.velocity) ? `${stats.velocity} px/s` : "—";
  $("mode").textContent = stats.mode || "—";
}

async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  try { $("host").textContent = tab?.url ? new URL(tab.url).hostname : "Current page"; }
  catch { $("host").textContent = "Current page"; }
  const response = await sendToTab({ type: "longview:get-status" });
  render(response?.stats || { active: false });
  if (!response) $("message").textContent = "LongView is available on normal HTTP and HTTPS pages.";
}

$("toggle").addEventListener("click", async () => {
  $("message").textContent = "";
  const response = await sendToTab({ type: "longview:set-enabled", enabled: !active });
  if (!response) $("message").textContent = "This page cannot be controlled by extensions.";
  await refresh();
});

$("diagnostics").addEventListener("click", async () => {
  const response = await sendToTab({ type: "longview:toggle-diagnostics" });
  $("message").textContent = response ? `Diagnostics ${response.visible ? "shown" : "hidden"}.` : "Diagnostics unavailable.";
});

$("reindex").addEventListener("click", async () => {
  const response = await sendToTab({ type: "longview:force-reindex" });
  $("message").textContent = response?.ok ? "Segment index rebuilt." : "LongView is not active on this page.";
  setTimeout(refresh, 250);
});

$("options").addEventListener("click", () => chrome.runtime.openOptionsPage());
refresh();
