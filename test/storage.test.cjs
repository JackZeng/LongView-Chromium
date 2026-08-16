'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JsonStore, addHistoryEntry, sanitizeSettings } = require('../src/main/storage.cjs');

test('JSON store persists atomically and history deduplicates immediate repeats', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'longview-store-'));
  const file = path.join(directory, 'state.json');
  const store = new JsonStore(file, { history: [] });
  addHistoryEntry(store, { url: 'https://example.com/', title: 'One', visitedAt: 1000 });
  addHistoryEntry(store, { url: 'https://example.com/', title: 'Two', visitedAt: 1500 });
  const reloaded = new JsonStore(file, { history: [] });
  assert.equal(reloaded.get('history', []).length, 1);
  assert.equal(reloaded.get('history', [])[0].title, 'Two');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('settings are clamped and invalid modes fall back safely', () => {
  const settings = sanitizeSettings({ longviewMode: 'unknown', hotScreens: 99, warmScreens: -1 });
  assert.equal(settings.longviewMode, 'balanced');
  assert.equal(settings.hotScreens, 8);
  assert.equal(settings.warmScreens, 2);
});


test('settings preserve a zero prediction window and sanitize string fields', () => {
  const settings = sanitizeSettings({ predictionMs: 0, searchTemplate: 42, homepage: null });
  assert.equal(settings.predictionMs, 0);
  assert.equal(settings.searchTemplate, 'https://www.google.com/search?q=%s');
  assert.equal(settings.homepage, 'longview://newtab/');
});
