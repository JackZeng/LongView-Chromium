'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [baselinePath, longviewPath, outputPath = 'artifacts/comparison.md'] = process.argv.slice(2);
if (!baselinePath || !longviewPath) {
  console.error('Usage: node tools/compare-results.cjs baseline.json longview.json [output.md]');
  process.exit(2);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const longview = JSON.parse(fs.readFileSync(longviewPath, 'utf8'));
const metrics = [
  ['Frame p50', 'frameP50Ms', 'ms', false],
  ['Frame p95', 'frameP95Ms', 'ms', false],
  ['Frame p99', 'frameP99Ms', 'ms', false],
  ['Long-frame ratio', 'longFrameRatio', '', false],
  ['Average FPS', 'averageFps', 'fps', true],
  ['JS heap used', 'jsHeapUsed', 'bytes', false]
];

function change(before, after, higherIsBetter) {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === 0) return 'n/a';
  const raw = ((after - before) / Math.abs(before)) * 100;
  const improvement = higherIsBetter ? raw : -raw;
  return `${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}%`;
}

const rows = metrics.map(([label, key, unit, higherIsBetter]) => {
  const before = Number(baseline.summary?.[key]);
  const after = Number(longview.summary?.[key]);
  return `| ${label} | ${Number.isFinite(before) ? before : 'n/a'} ${unit} | ${Number.isFinite(after) ? after : 'n/a'} ${unit} | ${change(before, after, higherIsBetter)} |`;
});

const markdown = `# LongView benchmark comparison\n\n` +
  `- Baseline: \`${path.basename(baselinePath)}\`\n` +
  `- LongView: \`${path.basename(longviewPath)}\`\n` +
  `- Turns: ${longview.configuration?.turns ?? 'unknown'}\n\n` +
  `| Metric | Baseline | LongView | Improvement |\n|---|---:|---:|---:|\n${rows.join('\n')}\n`;

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, markdown, 'utf8');
console.log(markdown);
