# Blink Native COLD Alpha

## Purpose

This milestone is the first LongView experiment that changes Blink rendering state rather than only applying extension-level CSS.

The exact Chromium revision is pinned in `chromium.version`. The native behavior is installed structurally by:

```bash
PYTHONPATH=tools python3 tools/install_blink_native_cold.py \
  --source /path/to/chromium/src \
  --metadata /tmp/BLINK_NATIVE_COLD.json \
  --patch-output /tmp/longview-native-cold.patch
```

The generated, auditable patch is stored at:

```text
patches/blink/0002-longview-native-cold-layout-detach.patch
```

## Native behavior

When `LongViewSegmentLifecycle` is enabled, Blink exposes two experimental methods on `Element`:

```javascript
segment.longViewCountDescendantLayoutObjects()
segment.longViewDetachDescendantLayoutObjects()
```

The detach operation:

1. counts live descendant `LayoutObject` instances;
2. marks every direct child for layout-tree reattachment;
3. detaches each child layout subtree while retaining the segment element's own outer layout box;
4. returns the number of layout objects actually present before release.

The LongView runtime calls this operation only for COLD segments. Before detaching, it applies `content-visibility:hidden` and an intrinsic block size derived from the measured segment height, preserving scroll geometry. HOT, WARM, focus, selection, find-in-page, mutation and viewport-approach transitions materialize the segment through Blink's normal style/layout lifecycle.

## Proof, not inference

A valid native Alpha must provide all of the following:

- `nativeColdAvailable: true`;
- `nativeDetachedLayoutObjects > 0`;
- a post-materialization descendant layout count greater than zero;
- unchanged outer segment geometry within the accepted tolerance;
- a browser binary built from the exact pinned Chromium source after the native patch was installed;
- `args.gn`, Chromium SHA, repository SHA, patch SHA-256 and browser binary SHA-256 in the artifact.

A launcher around Chrome for Testing cannot satisfy this contract.

## Safety boundary

The runtime feature is disabled by default and must be enabled explicitly:

```text
--enable-blink-features=LongViewSegmentLifecycle
```

The Alpha is intentionally conservative:

- the DOM and JavaScript object identity remain intact;
- the outer segment layout object remains intact;
- active focus, text selection, media, dialogs, popovers and ineligible segments are not placed into COLD by the LongView controller;
- the extension-only fallback remains available when the native methods do not exist;
- production stable promotion remains blocked until native compatibility, accessibility, screenshot, print and mutation tests pass.

## macOS build gate

The complete Apple Silicon browser is built by `.github/workflows/macos-blink-native-alpha.yml`. The workflow performs a real Chromium checkout and `autoninja chrome` build; a successful GN generation alone is not accepted as a build.

GitHub-hosted Apple Silicon runners have limited RAM and initially limited free disk. The workflow removes unused toolchains and fails closed unless its disk preflight reaches the configured threshold. A persistent self-hosted runner labelled `longview-macos` remains the preferred production path.
