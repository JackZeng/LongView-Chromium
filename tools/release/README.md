# Release and updater tooling

`longview_release.py` creates canonical release manifests, verifies artifacts and optional OpenSSL detached signatures, and builds channel feeds.

`update_client.py` is deliberately split into **verify/stage** rather than silently replacing a running browser. It enforces HTTPS, size and SHA-256, supports detached signature verification, applies deterministic staged rollout, and writes `staged-update.json` for the signed platform installer/helper.

Signing keys never belong in the repository. GitHub Actions expects them through encrypted secrets or an external signing service.

`install_staged_update.py` runs as a separate updater process after the browser exits. It re-verifies the staged artifact, rejects path traversal and symlinks, installs into a temporary directory, atomically swaps the portable installation, runs an optional health check, and restores the prior installation when the check fails. Platform-signed installers may replace this portable flow while retaining the same signed manifest and rollback semantics.
