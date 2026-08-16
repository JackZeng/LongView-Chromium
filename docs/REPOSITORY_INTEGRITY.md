# Repository integrity

## Goal

A checked-out Git commit should contain normal source files that can be inspected, reviewed, and executed directly. Encoded source archives are transport artifacts, not an acceptable final source layout.

## Source manifest

`SOURCE_MANIFEST.sha256` is generated from the checked-in source tree:

```bash
python3 tools/generate_source_manifest.py
```

Validation recomputes hashes and rejects missing, extra, or changed source files:

```bash
python3 tools/validate_repository.py
```

Excluded from the manifest:

- `.git/`;
- `SOURCE_MANIFEST.sha256` itself;
- generated build and benchmark output;
- caches and local profiles.

## Forbidden release-tree content

The validator rejects:

```text
.longview-bootstrap/
.github/workflows/promote-native-source.yml
```

These names represent a one-time source carrier and promotion mechanism. They must not be present in a release branch or tag.

## Artifact integrity

Benchmark reports include executable path, browser version, LongView/Chromium commits, host metadata, and scale. Traces should be uploaded as CI artifacts with their source report; do not commit large trace blobs.

## Chromium checkout integrity

`tools/longview.py fetch` checks out the exact commit in `chromium.version`. The Blink patch installer verifies this commit before applying a candidate patch. Overlay installation writes metadata into the Chromium checkout so a benchmark can record exactly what was installed.
