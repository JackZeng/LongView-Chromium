'use strict';

const fs = require('node:fs');
const path = require('node:path');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class JsonStore {
  constructor(filePath, defaults = {}) {
    this.filePath = filePath;
    this.defaults = clone(defaults);
    this.data = clone(defaults);
    this.loaded = false;
  }

  load() {
    if (this.loaded) return this.data;
    this.loaded = true;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.data = { ...clone(this.defaults), ...parsed };
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        const backup = `${this.filePath}.corrupt-${Date.now()}`;
        try {
          fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
          fs.copyFileSync(this.filePath, backup);
        } catch {
          // Best-effort backup; defaults remain usable.
        }
      }
    }
    return this.data;
  }

  get(key, fallback) {
    const data = this.load();
    return Object.prototype.hasOwnProperty.call(data, key) ? clone(data[key]) : clone(fallback);
  }

  set(key, value) {
    this.load();
    this.data[key] = clone(value);
    this.flush();
    return this.get(key);
  }

  update(mutator) {
    this.load();
    const draft = clone(this.data);
    const result = mutator(draft) || draft;
    this.data = result;
    this.flush();
    return clone(this.data);
  }

  flush() {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
    fs.renameSync(temporary, this.filePath);
  }
}

const DEFAULT_SETTINGS = Object.freeze({
  longviewEnabled: true,
  longviewMode: 'balanced',
  hotScreens: 2,
  warmScreens: 8,
  predictionMs: 240,
  genericSegmentation: true,
  showDiagnostics: false,
  restoreSession: true,
  searchTemplate: 'https://www.google.com/search?q=%s',
  homepage: 'longview://newtab/'
});

const DEFAULT_BROWSER_DATA = Object.freeze({
  settings: DEFAULT_SETTINGS,
  history: [],
  bookmarks: [],
  session: { tabs: ['longview://newtab/'], activeIndex: 0 }
});

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeSettings(input = {}) {
  const mode = ['compatibility', 'balanced', 'aggressive'].includes(input.longviewMode)
    ? input.longviewMode
    : DEFAULT_SETTINGS.longviewMode;
  const searchTemplate = typeof input.searchTemplate === 'string' && input.searchTemplate.trim()
    ? input.searchTemplate.trim().slice(0, 2000)
    : DEFAULT_SETTINGS.searchTemplate;
  const homepage = typeof input.homepage === 'string' && input.homepage.trim()
    ? input.homepage.trim().slice(0, 2000)
    : DEFAULT_SETTINGS.homepage;
  return {
    ...DEFAULT_SETTINGS,
    ...input,
    longviewMode: mode,
    hotScreens: Math.max(0.5, Math.min(8, finiteNumber(input.hotScreens, DEFAULT_SETTINGS.hotScreens))),
    warmScreens: Math.max(2, Math.min(30, finiteNumber(input.warmScreens, DEFAULT_SETTINGS.warmScreens))),
    predictionMs: Math.max(0, Math.min(1000, finiteNumber(input.predictionMs, DEFAULT_SETTINGS.predictionMs))),
    searchTemplate,
    homepage,
    longviewEnabled: input.longviewEnabled !== false,
    genericSegmentation: input.genericSegmentation !== false,
    showDiagnostics: Boolean(input.showDiagnostics),
    restoreSession: input.restoreSession !== false
  };
}

function addHistoryEntry(store, entry, limit = 5000) {
  if (!entry || !entry.url || !/^https?:/i.test(entry.url)) return;
  store.update((data) => {
    const history = Array.isArray(data.history) ? data.history : [];
    const normalized = {
      url: String(entry.url),
      title: String(entry.title || entry.url).slice(0, 500),
      visitedAt: Number(entry.visitedAt || Date.now())
    };
    const last = history[0];
    if (last && last.url === normalized.url && Math.abs(last.visitedAt - normalized.visitedAt) < 30000) {
      history[0] = normalized;
    } else {
      history.unshift(normalized);
    }
    data.history = history.slice(0, limit);
    return data;
  });
}

module.exports = {
  DEFAULT_BROWSER_DATA,
  DEFAULT_SETTINGS,
  JsonStore,
  addHistoryEntry,
  sanitizeSettings
};
