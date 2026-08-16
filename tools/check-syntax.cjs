'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', 'dist', '.git', 'chromium-src']);
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (/\.(?:js|cjs|mjs)$/.test(entry.name)) files.push(fullPath);
    else if (entry.name.endsWith('.json') || entry.name === 'chromium.version') {
      JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    }
  }
}

walk(root);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`\nSyntax error in ${path.relative(root, file)}\n${result.stderr}\n`);
  }
}

if (failed) process.exit(1);
console.log(`Syntax and JSON checks passed for ${files.length} JavaScript files.`);
