# Evidence campaign

## Question

Does LongView make active scrolling work grow more slowly as total document scale increases?

The answer must be based on a scale matrix, not on a single large page.

## Standard matrix

```text
turns            100, 500, 1000, 2000
variants         baseline, LongView
runs             5 measured per variant/scale
warm-up          one navigation/ready cycle before each measurement
interaction      deterministic full-document scroll
stress           distant mutation + bounded main-thread task
stream           optional append stream in the final message
trace            largest scale by default
```

Baseline and LongView must use the same executable and Chromium pin.

## Command

```bash
python3 tools/longview.py evidence \
  --turns 100,500,1000,2000 \
  --runs 5 \
  --duration 9000 \
  --stress \
  --stream \
  --trace \
  --label macbook-pro-m4 \
  --display-hz 120 \
  --power-mode plugged-in \
  --gpu "Apple M4" \
  --output-dir benchmark-results/macbook-pro-m4-2026-08-16
```

## Captured metrics

### Page-level

- rAF frame p50/p95/p99/max;
- estimated frame budget and refresh rate;
- dropped-frame ratio;
- long-task count, total, and maximum;
- fixture DOM count and document height;
- JS heap when exposed;
- LongView HOT/WARM/COLD/PINNED counts;
- correctness probe results.

### CDP

- `Performance.getMetrics` before/after deltas;
- `Memory.getDOMCounters`;
- layout, style, script, and task duration when exposed;
- optional Chromium trace stream.

### Metadata

- browser version;
- executable path;
- Chromium and LongView commits;
- dirty working-tree status;
- OS, CPU, architecture, RAM;
- optional GPU/display/power notes.

## Scaling analysis

For each metric, the campaign fits:

```text
log(metric) = intercept + exponent × log(turns)
```

The exponent describes growth with document scale. For example:

```text
baseline p95 exponent   0.82
LongView p95 exponent   0.31
```

This is stronger evidence than reporting only that a 2000-turn run was 20% faster. It addresses the actual objective: reduce dependence on total document size.

## Correctness gate

Every run must pass:

- target exists and geometry is finite;
- focus can enter a distant turn;
- text selection works;
- anchor/scrollIntoView navigation reaches the target.

Native phases add accessibility, print, screenshot, and observer-specific web tests.

## Default regression gate

The campaign records a gate with these initial conservative thresholds:

```text
largest-scale LongView p95 / baseline p95      ≤ 1.05
largest-scale dropped-frame ratio              ≤ 1.10 × baseline
largest-scale JS heap                          ≤ 1.25 × baseline
LongView p95 scaling exponent delta            ≤ +0.05
all correctness probes                         pass
```

These thresholds prevent an experiment from improving one trace while regressing tail latency or memory. They are not the final product targets.

## Trace capture

`--trace` captures baseline and LongView traces at the largest scale. `--trace-all` captures all scales but can produce large output.

Recommended Perfetto questions:

1. Did style/layout duration shrink during active scroll?
2. Did renderer scheduler long tasks move or merely disappear from rAF metrics?
3. Did raster/checkerboarding increase?
4. Did GC or image decode become the new bottleneck?
5. Did the extension controller itself consume significant main-thread time?

## Output

```text
campaign.json
campaign.csv
REPORT.md
100/baseline.json
100/longview.json
...
2000/traces-baseline/run-01.json
2000/traces-longview/run-01.json
```

Large traces are CI artifacts or local evidence; they are not checked into source control.

## Interpreting results

A gate pass means the tested configuration is a valid candidate. It does not prove general web compatibility.

A gate failure should remain visible. Do not discard unfavorable runs unless the reason is documented (thermal throttling, interruption, wrong executable, corrupted trace, etc.). Re-run the full pair, not just the preferred variant.
