# Persistent Apple Silicon builder for Blink Native Alpha

The LongView Blink Native Alpha must be compiled and proven on Apple Silicon. GitHub's standard hosted macOS runner does not reliably provide enough persistent disk, memory, or wall-clock budget for a first Chromium checkout and full build. The repository therefore includes a safe persistent runner workflow:

```text
.github/workflows/macos-blink-native-alpha-self-hosted.yml
```

## Host requirements

- Apple Silicon Mac running macOS 14 or newer;
- current Xcode selected with `xcode-select`;
- at least 150 GiB free in the persistent workspace;
- recommended 16 GiB RAM or more;
- GitHub Actions runner labels:
  - `self-hosted`
  - `macOS`
  - `ARM64`
  - `longview-macos`

The user's MacBook Pro M4 is suitable when sufficient free disk is available.

## Registration

Open repository settings:

```text
Settings → Actions → Runners → New self-hosted runner → macOS → ARM64
```

Follow GitHub's generated download, configuration, and startup commands. When configuring labels, add:

```text
longview-macos
```

Do not paste the short-lived registration token into source code, issues, logs, or chat history.

## Optional repository variables

Set these under `Settings → Secrets and variables → Actions → Variables`:

```text
LONGVIEW_PERSISTENT_WORKSPACE=/Volumes/Build/LongViewChromiumBuild
LONGVIEW_JOBS=6
```

If `LONGVIEW_PERSISTENT_WORKSPACE` is omitted, the workflow uses:

```text
$HOME/LongViewChromiumBuild
```

## Running the build

Start the local runner service, then open GitHub Actions and dispatch:

```text
macos-blink-native-alpha-self-hosted
```

The job:

1. checks out the LongView branch;
2. shallow-fetches the exact pinned Chromium revision;
3. preserves the checkout and `out` directory for incremental builds;
4. structurally installs the runtime-feature-gated Blink native COLD behavior;
5. compiles the complete `Chromium.app`;
6. proves direct descendant LayoutObject release and materialization;
7. proves the LongView Controller puts real far-off Segment content into native COLD;
8. packages a double-clickable ARM64 application with the feature and LongView runtime automatically enabled;
9. publishes the fixed prerelease tag:

```text
v0.4.0-blink-native-alpha.proven
```

## Promotion rule

Source code, a GN generation, a `content_shell` build, or an extension-only Chrome package is not sufficient. The PR is complete only after the release contains:

- `LongView-Chromium-macOS-arm64-Blink-Native-Alpha.zip`;
- `native-cold-proof.json`;
- `native-controller-proof.json`;
- `BLINK_NATIVE_COLD.json`;
- `BROWSER_BINARY_SHA256.txt`;
- `PATCH_SHA256.txt`;
- resolved `args.gn`;
- repository and Chromium SHAs.
