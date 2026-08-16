# Building LongView Chromium

LongView builds the ordinary Chromium `chrome` target at an exact upstream commit, then launches it with the LongView runtime from this repository. This keeps baseline and variant measurements on the same engine revision.

## Pinned baseline

`chromium.version` is the source of truth:

- version: `151.0.7922.77`;
- tag: `refs/tags/151.0.7922.77`;
- commit: `ff37cfca210138f2a40b843b4a8195ab7e4fc7ff`.

Do not silently substitute tip-of-tree when publishing performance numbers.

## Common capacity requirements

Chromium's checkout and build are large. Plan for:

- 64-bit host;
- 16 GB RAM minimum, with 32 GB preferable;
- 120 GB or more free storage;
- SSD storage;
- a path without spaces;
- a stable connection for the initial checkout and DEPS download.

`python3 tools/longview.py doctor` verifies the local tools it can inspect and warns when storage is low.

## macOS

Install Xcode and its command-line tools. Accept the Xcode license and make sure the active developer directory points to the intended Xcode installation.

```bash
xcode-select --install
python3 tools/longview.py fetch
python3 tools/longview.py build --profile longview-dev
python3 tools/longview.py run https://chatgpt.com/
```

The expected browser binary is:

```text
.longview/src/out/LongView/Chromium.app/Contents/MacOS/Chromium
```

## Windows

Use 64-bit Windows 10 or newer and Visual Studio 2022 with:

- Desktop development with C++;
- Windows SDK;
- MFC/ATL support.

Run from a Developer Command Prompt or PowerShell environment that can discover Git, Python, and Visual Studio. Chromium's Clang toolchain is downloaded by its hooks, while Visual Studio supplies platform headers, libraries, and tools.

```powershell
py tools\longview.py fetch
py tools\longview.py build --profile longview-dev
py tools\longview.py run https://chatgpt.com/
```

The expected browser binary is:

```text
.longview\src\out\LongView\chrome.exe
```

## Linux

On Ubuntu/Debian, after the checkout exists, Chromium's own dependency helper may be used:

```bash
.longview/src/build/install-build-deps.sh
python3 tools/longview.py sync
python3 tools/longview.py build --profile longview-dev
```

The expected browser binary is:

```text
.longview/src/out/LongView/chrome
```

Linux is useful for CI and performance infrastructure. Initial user-facing release work targets macOS and Windows.

## GN profiles

### `baseline.gn`

Non-component, release-like, symbol-free build intended for clean comparison.

### `longview-dev.gn`

Release-mode component build with limited symbols. It links and iterates faster.

### `longview-release.gn`

Non-component release-like LongView development distribution. It is not an official Google Chrome build.

## Reproducibility rule

A benchmark report is valid only when it records:

- Chromium SHA;
- LongView repository SHA;
- GN arguments;
- OS, CPU, RAM, GPU, display refresh rate, and power mode;
- fixture parameters;
- warmup/run count;
- exact launch flags.
