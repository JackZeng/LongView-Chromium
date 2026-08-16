# LongView Chromium quick start

## 1. Prepare the host

Use a path without spaces and reserve at least 120 GB for the Chromium checkout and build output.

Required tools:

- Git;
- Python 3.10 or newer;
- Node.js 20 or newer for repository tests and benchmarks;
- the platform-specific Chromium prerequisites described in `BUILDING.md`.

## 2. Diagnose

```bash
python3 tools/longview.py doctor
```

The command reports the pinned Chromium revision, tool discovery, workspace, and available disk space. Set a different checkout location with either:

```bash
export LONGVIEW_WORKSPACE=/absolute/path/without/spaces
```

or pass `--workspace` to every command.

## 3. Fetch and pin Chromium

```bash
python3 tools/longview.py fetch
```

This command:

1. clones `depot_tools` when needed;
2. fetches Chromium without full history by default;
3. checks out the exact SHA in `chromium.version`;
4. synchronizes DEPS and branch heads;
5. runs Chromium hooks.

## 4. Build

For normal development:

```bash
python3 tools/longview.py build --profile longview-dev --output LongView
```

For a baseline comparison using a non-component release-like build:

```bash
python3 tools/longview.py build --profile baseline --output Baseline
```

For a distributable local experiment:

```bash
python3 tools/longview.py build --profile longview-release --output LongViewRelease
```

## 5. Run

```bash
python3 tools/longview.py run --output LongView https://chatgpt.com/
```

LongView uses an isolated profile under the workspace and loads only the repository's LongView extension. To use the exact same browser build without the optimization:

```bash
python3 tools/longview.py run --output LongView --baseline https://chatgpt.com/
```

The toolbar popup shows whether LongView activated and how many segments are HOT, WARM, COLD, or PINNED. The default diagnostics shortcut is `Alt+Shift+D` (`Control+Shift+D` on macOS as registered by Chromium).

## 6. Package a developer bundle

```bash
python3 tools/longview.py package --output LongView
```

On macOS, an unsigned self-contained development app can also be produced:

```bash
python3 tools/longview.py package --output LongView --mac-app
```

Production signing, notarization, Windows installer integration, update service, and release-channel infrastructure are intentionally outside the v0.1 developer bundle.
