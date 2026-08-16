'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeNavigationInput, looksLikeHost } = require('../src/main/url.cjs');

test('empty input opens the LongView new tab page', () => {
  assert.equal(normalizeNavigationInput(''), 'longview://newtab/');
});

test('normalizes hosts and localhost', () => {
  assert.equal(normalizeNavigationInput('example.com'), 'https://example.com/');
  assert.equal(normalizeNavigationInput('localhost:3000/test'), 'http://localhost:3000/test');
  assert.equal(looksLikeHost('docs.example.com/path'), true);
});

test('uses search for ordinary text and blocks javascript navigation', () => {
  assert.equal(normalizeNavigationInput('long page browser'), 'https://www.google.com/search?q=long%20page%20browser');
  assert.match(normalizeNavigationInput('javascript:alert(1)'), /^https:\/\/www\.google\.com\/search/);
});
