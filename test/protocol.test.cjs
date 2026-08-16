'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveRoute } = require('../src/main/internal-protocol.cjs');

const root = path.resolve(__dirname, '..');

test('internal protocol maps known hosts to their page roots', () => {
  assert.equal(resolveRoute(root, 'longview://newtab/'), path.join(root, 'src', 'internal', 'newtab.html'));
  assert.equal(resolveRoute(root, 'longview://history/'), path.join(root, 'src', 'internal', 'library.html'));
  assert.equal(resolveRoute(root, 'longview://benchmark/conversation.js'), path.join(root, 'benchmarks', 'fixtures', 'conversation.js'));
});

test('internal protocol does not allow escaping a route root', () => {
  const resolved = resolveRoute(root, 'longview://benchmark/..%2f..%2fpackage.json');
  assert.equal(resolved, path.join(root, 'benchmarks', 'fixtures', 'conversation.html'));
});
