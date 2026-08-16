const fieldIds = [
  "enabled", "mode", "showDiagnostics", "minimumPageScreens", "minimumDomNodes",
  "minimumSegments", "minimumSegmentHeight", "hotScreens", "warmAheadScreens",
  "warmBehindScreens", "maxWarmSegments", "excludedHosts"
];
const defaults = {
  enabled: true, mode: "conservative", showDiagnostics: false, minimumPageScreens: 24,
  minimumDomNodes: 3500, minimumSegments: 12, minimumSegmentHeight: 160,
  hotScreens: 1.25, warmAheadScreens: 6, warmBehindScreens: 2.5,
  maxWarmSegments: 80, excludedHosts: []
};

function populate(settings) {
  const value = { ...defaults, ...settings };
  for (const id of fieldIds) {
    const field = document.getElementById(id);
    if (field.type === "checkbox") field.checked = Boolean(value[id]);
    else if (id === "excludedHosts") field.value = (value[id] || []).join("\n");
    else field.value = value[id];
  }
}

function collect() {
  const settings = {};
  for (const id of fieldIds) {
    const field = document.getElementById(id);
    if (field.type === "checkbox") settings[id] = field.checked;
    else if (id === "excludedHosts") settings[id] = field.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    else if (field.type === "number") settings[id] = Number(field.value);
    else settings[id] = field.value;
  }
  return settings;
}

async function load() {
  const response = await chrome.runtime.sendMessage({ type: "longview:get-settings" });
  populate(response?.settings || defaults);
}

document.getElementById("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = await chrome.runtime.sendMessage({ type: "longview:save-settings", settings: collect() });
  populate(response.settings);
  document.getElementById("status").textContent = "Settings saved and applied to open tabs.";
  setTimeout(() => document.getElementById("status").textContent = "", 2500);
});

document.getElementById("reset").addEventListener("click", () => populate(defaults));
load();
