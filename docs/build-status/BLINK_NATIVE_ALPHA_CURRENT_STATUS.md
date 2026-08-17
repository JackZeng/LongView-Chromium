# Blink Native Alpha current status

## Submitted implementation

PR #11 contains the first real Blink native COLD implementation path:

- exact Chromium pin validation;
- runtime-feature-gated `Element` methods that count and detach descendant `LayoutObject` trees;
- forced layout-tree reattachment for materialization;
- LongView HOT/WARM/COLD/PINNED bridge with actual detached/restored counters;
- direct layout-release proof;
- end-to-end LongView Controller native-COLD proof;
- self-contained Apple Silicon app packaging with the feature and extension enabled by the native launcher;
- SHA, GN arguments, patch and binary proof assets;
- fail-closed promotion gates.

## Not yet satisfied

No proof-carrying full `Chromium.app` release has passed the final gate on the standard GitHub-hosted macOS runners. Source submission and workflow generation are therefore complete, but the browser milestone is **not** marked complete and PR #11 must remain unmerged.

The hosted runners are unsuitable for treating a first Chromium checkout/build as a reliable release process because they do not provide persistent source/output state and may exhaust disk, memory, or per-job wall-clock budget.

## Deterministic completion path

Register a persistent Apple Silicon runner with the label:

```text
longview-macos
```

Then dispatch:

```text
macos-blink-native-alpha-self-hosted
```

The workflow requires at least 150 GiB free, retains the Chromium checkout for incremental builds, executes both native proofs, publishes:

```text
v0.4.0-blink-native-alpha.proven
```

and allows `native-alpha-proven-promotion-gate` to merge PR #11 only after all proof assertions pass.

See `docs/MACOS_NATIVE_ALPHA_RUNNER.md` for registration and execution instructions.
