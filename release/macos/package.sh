#!/usr/bin/env bash
set -euo pipefail

: "${LONGVIEW_APP:?Path to LongView Chromium.app is required}"
: "${LONGVIEW_VERSION:?Version is required}"
OUTPUT_DIR="${OUTPUT_DIR:-dist/macos}"
IDENTITY="${MACOS_SIGNING_IDENTITY:-}"
NOTARY_PROFILE="${MACOS_NOTARY_PROFILE:-}"

mkdir -p "$OUTPUT_DIR"
WORK="$OUTPUT_DIR/LongView Chromium.app"
rm -rf "$WORK"
ditto "$LONGVIEW_APP" "$WORK"

if [[ -n "$IDENTITY" ]]; then
  codesign --force --deep --options runtime --timestamp --sign "$IDENTITY" "$WORK"
  codesign --verify --deep --strict --verbose=2 "$WORK"
else
  echo "No MACOS_SIGNING_IDENTITY supplied; producing an unsigned developer package." >&2
fi

ZIP="$OUTPUT_DIR/LongView-Chromium-${LONGVIEW_VERSION}-macos.zip"
ditto -c -k --sequesterRsrc --keepParent "$WORK" "$ZIP"

if [[ -n "$NOTARY_PROFILE" ]]; then
  xcrun notarytool submit "$ZIP" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$WORK"
fi

shasum -a 256 "$ZIP" > "$ZIP.sha256"
echo "$ZIP"
