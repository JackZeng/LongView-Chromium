# Release engineering

## Release definition

A LongView release is not complete merely because the repository compiles. A release candidate must satisfy four independent gates:

1. **Engine correctness** — feature-off behavior is identical to the pinned Chromium baseline; focus, selection, find, anchors, accessibility, screenshot, print and mutation probes pass.
2. **Performance evidence** — controlled baseline/LongView campaigns use the same executable and publish raw JSON plus traces.
3. **Supply-chain integrity** — deterministic package, SHA-256 manifest, SBOM, detached signature and exact Chromium commit are published together.
4. **Platform trust** — macOS artifacts are Developer ID signed, hardened-runtime enabled, notarized and stapled; Windows executables and installer are Authenticode signed and timestamped.

## Channels

- `nightly`: developer builds; signing optional; no automatic rollout.
- `beta`: signed builds; staged rollout; rollback feed retained.
- `stable`: signed and notarized; controlled evidence bundle; security support policy applies.

## External credentials

The repository contains no private signing material. Full Phase 7 activation requires repository secrets or a signing service for:

- Apple Developer ID identity and Notary API/keychain profile;
- Windows code-signing certificate or cloud signing credentials;
- update-manifest private key;
- optional Crashpad upload endpoint token.

Without those credentials the workflows deliberately create unsigned developer artifacts and mark them as non-stable.

## Rollback

Every stable feed retains the previous two signed manifests. The updater stages but does not silently replace the running browser. Platform helpers perform an atomic install with backup and restore the previous package when launch health checks fail.
