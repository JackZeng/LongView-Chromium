# Building LongView Browser

## Desktop MVP

Install Node.js 22+ and run:

```bash
npm install
npm run check
npm start
```

Electron is pinned exactly in `package.json`; the Chromium, V8, and embedded Node versions are recorded in `chromium.version`.

### China mainland download mirror

Electron downloads may be redirected without changing the project files:

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

On Windows PowerShell:

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

## Packaging

`@electron/packager` produces unpacked, unsigned application bundles.

```bash
npm run package
```

The CI packaging workflow builds Windows x64 and both macOS x64/arm64 folders. Installers, code signing, notarization, automatic updates, and release-channel infrastructure are intentionally outside the first milestone.

## Benchmark CLI

```bash
npm run benchmark:baseline
npm run benchmark:longview
npm run benchmark:compare
```

Custom example:

```bash
npx electron . --benchmark \
  --longview=aggressive \
  --turns=2000 \
  --runs=5 \
  --duration=15000 \
  --output=artifacts/aggressive-2000.json
```

Valid `--longview` values are `off`, `compatibility`, `balanced`, and `aggressive`.

## Native Chromium checkout

Install depot_tools first, place it at the front of `PATH`, and ensure Git is configured for long paths on Windows.

```bash
python3 tools/bootstrap-chromium.py /fast-disk/chromium
python3 tools/install-overlay.py /fast-disk/chromium/src
```

Generate and test the native policy target:

```bash
cd /fast-disk/chromium/src
gn gen out/LongView
autoninja -C out/LongView longview_policy_tests
out/LongView/longview_policy_tests
```

On Windows, run the corresponding `.exe`.

A full Chromium checkout and build is large. Keep it outside this Git repository, preferably on a fast SSD with substantial free space.
