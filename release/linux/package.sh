#!/usr/bin/env bash
set -euo pipefail
: "${LONGVIEW_SOURCE:?Path to the built Chromium distribution is required}"
: "${LONGVIEW_VERSION:?Version is required}"
OUTPUT_DIR="${OUTPUT_DIR:-dist/linux}"
ARCH="${LONGVIEW_ARCH:-x64}"
mkdir -p "$OUTPUT_DIR"
python3 tools/release/package_portable.py \
  --source "$LONGVIEW_SOURCE" \
  --output "$OUTPUT_DIR/LongView-Chromium-${LONGVIEW_VERSION}-linux-${ARCH}.zip" \
  --version "$LONGVIEW_VERSION" \
  --platform linux \
  --arch "$ARCH" \
  --chromium-commit "$(python3 -c 'import json; print(json.load(open("chromium.version"))["commit"])')"
