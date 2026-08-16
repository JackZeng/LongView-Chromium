# Building and running

## Resource planning

A Chromium checkout and development build can exceed 100 GiB. For a comfortable workspace, plan for:

```text
free disk       120–160 GiB
RAM             16 GiB minimum, 32 GiB preferred
CPU             8 logical cores or more preferred
initial fetch   tens of GiB
```

## 1. Diagnose the machine

```bash
python3 tools/longview.py doctor
```

The command reports required tools and platform-specific caveats. `fetch` also runs this preflight and stops before downloading Chromium when a required tool is missing.

## 2. Fetch pinned Chromium

```bash
python3 tools/longview.py fetch
```

The default workspace is a sibling directory named `.longview-chromium`. Override it:

```bash
python3 tools/longview.py --workspace /Volumes/Build/LongView fetch
```

The checkout is pinned to `chromium.version`. A detached HEAD is intentional.

## 3. Install the LongView native overlay

```bash
python3 tools/longview.py install-overlay
```

The overlay is copied to:

```text
<workspace>/src/longview/
```

It provides an independent Chromium GN target:

```bash
python3 tools/longview.py build --target //longview:segment_policy_test
```

## 4. Install the disabled Blink feature candidate

```bash
python3 tools/longview.py install-blink-observability
```

The patch installer verifies the exact Chromium pin and refuses to apply a patch on a dirty checkout unless `--force` is supplied. The feature stays disabled by default.

Build the probe:

```bash
python3 tools/longview.py build --target //longview:blink_feature_probe
```

## 5. Build Chromium

Development build:

```bash
python3 tools/longview.py build --profile longview-dev
```

Release-oriented build:

```bash
python3 tools/longview.py build --profile longview-release
```

Baseline build uses a separate output directory and no extension at runtime:

```bash
python3 tools/longview.py build --profile baseline
```

A full Chromium build has not been completed unless `autoninja` reaches the requested target successfully. Creating GN files is not a successful build.

## 6. Run

LongView:

```bash
python3 tools/longview.py run https://chatgpt.com/
```

Baseline:

```bash
python3 tools/longview.py run --baseline https://chatgpt.com/
```

Both commands use the same Chromium executable. LongView mode loads only `product/extension/`.

## 7. Run the evidence matrix

```bash
python3 tools/longview.py evidence \
  --turns 100,500,1000,2000 \
  --runs 5 \
  --duration 9000 \
  --stress \
  --stream \
  --trace \
  --output-dir benchmark-results/$(hostname)-$(date +%F)
```

`--trace` captures traces for the largest scale. Use `--trace-all` only when storage allows it. For publishable macOS/Windows evidence, run in a real desktop session. Linux automation may use `xvfb-run`; do not force real-extension runs into Chromium headless mode.

## 8. Package

```bash
python3 tools/longview.py package --profile longview-release
```

Unsigned output is written under `dist/`. Public distribution requires platform signing and, on macOS, notarization.

## Platform notes

### macOS

Install Xcode and accept its license. Apple Silicon and Intel builds require matching GN CPU configuration and should be benchmarked separately.

### Windows

Use a normal local path with adequate space. Developer Mode or an elevated shell may be required for Chromium's link/symlink workflow. Visual Studio toolchain requirements follow upstream Chromium documentation.

### Linux

Linux is useful for CI and synthetic benchmarks. It is not a substitute for macOS/Windows product measurements. Sandbox errors in containers must not be hidden with `--no-sandbox` in production instructions.
