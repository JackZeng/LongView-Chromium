import "./shared/core.js";

const Core = globalThis.LongViewCore;
const DEFAULT_SETTINGS = Core.normalizeSettings();
const tabStats = new Map();

async function readSettings() {
  const stored = await chrome.storage.local.get("settings");
  return Core.normalizeSettings(stored.settings || DEFAULT_SETTINGS);
}

async function writeSettings(settings) {
  const normalized = Core.normalizeSettings(settings);
  await chrome.storage.local.set({ settings: normalized });
  return normalized;
}

async function initializeSettings() {
  const stored = await chrome.storage.local.get("settings");
  if (!stored.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
}

async function safeSend(tabId, message) {
  if (!Number.isInteger(tabId)) return null;
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return null;
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function updateBadge(tabId, stats = tabStats.get(tabId)) {
  if (!Number.isInteger(tabId)) return;
  const active = Boolean(stats?.active);
  const text = active ? String(stats.cold ?? "ON") : "";
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: active ? "#13795b" : "#697386" });
  await chrome.action.setTitle({
    tabId,
    title: active
      ? `LongView active — ${stats.hot ?? 0} hot / ${stats.warm ?? 0} warm / ${stats.cold ?? 0} cold`
      : "LongView"
  });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await initializeSettings();
  if (reason === "install") await chrome.tabs.create({ url: chrome.runtime.getURL("ui/welcome.html") });
});

chrome.runtime.onStartup.addListener(initializeSettings);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return undefined;

  if (message.type === "longview:get-settings") {
    readSettings().then((settings) => sendResponse({ settings }));
    return true;
  }

  if (message.type === "longview:save-settings") {
    writeSettings(message.settings).then((settings) => sendResponse({ settings }));
    return true;
  }

  if (message.type === "longview:stats") {
    const tabId = sender.tab?.id;
    if (Number.isInteger(tabId)) {
      tabStats.set(tabId, message.stats);
      updateBadge(tabId, message.stats).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "longview:get-tab-stats") {
    const tabId = Number.isInteger(message.tabId) ? message.tabId : sender.tab?.id;
    sendResponse({ stats: Number.isInteger(tabId) ? tabStats.get(tabId) || null : null });
    return true;
  }

  return undefined;
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local" || !changes.settings) return;
  const settings = Core.normalizeSettings(changes.settings.newValue || DEFAULT_SETTINGS);
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => safeSend(tab.id, { type: "longview:settings-changed", settings })));
});

chrome.commands.onCommand.addListener(async (command) => {
  const tab = await activeTab();
  if (!tab?.id) return;

  if (command === "toggle-diagnostics") {
    await safeSend(tab.id, { type: "longview:toggle-diagnostics" });
    return;
  }

  if (command === "toggle-longview") {
    const current = await safeSend(tab.id, { type: "longview:get-status" });
    const enabled = !Boolean(current?.stats?.active);
    const response = await safeSend(tab.id, { type: "longview:set-enabled", enabled });
    if (!response) return;
    const next = await safeSend(tab.id, { type: "longview:get-status" });
    if (next?.stats) {
      tabStats.set(tab.id, next.stats);
      await updateBadge(tab.id, next.stats);
    }
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => updateBadge(tabId).catch(() => {}));
chrome.tabs.onRemoved.addListener((tabId) => tabStats.delete(tabId));
