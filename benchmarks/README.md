# Benchmarks

LongView's deterministic benchmark suite separates one-run performance from scaling behavior.

```text
fixtures/conversation/       ChatGPT-like long conversation with code, tables, images,
                             streaming, observers, long tasks, and distant mutations
runner/runner.mjs            one baseline or LongView measurement
runner/campaign.mjs          baseline + LongView scale matrix
runner/gate.mjs              correctness/regression evaluation
runner/cdp.mjs               CDP metrics and trace stream capture
expectations/                JSON schemas
```

The runner is dependency-free on Node.js 22+ and always measures the executable passed with `--executable`.

One run:

```bash
node runner.mjs --executable /path/to/chromium --turns 1000 --runs 5 --longview --stress
```

Full evidence campaign:

```bash
node campaign.mjs \
  --executable /path/to/chromium \
  --turns 100,500,1000,2000 \
  --runs 5 \
  --stress --stream --trace \
  --outputDir ../../benchmark-results/machine-date
```

Generated traces can be opened in Perfetto. Do not commit large traces to this repository.
