#!/usr/bin/env bash
set -euo pipefail

: "${LONGVIEW_WORKSPACE:?LONGVIEW_WORKSPACE is required}"
: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"

cd "$GITHUB_WORKSPACE"

log() {
  printf '\n===== %s =====\n' "$*"
}

log "Apple Silicon capacity preflight"
test "$(uname -m)" = "arm64"
latest="$(find /Applications -maxdepth 1 -type d -name 'Xcode*.app' -print | LC_ALL=C sort | tail -1)"
test -n "$latest"
sudo xcode-select -s "$latest/Contents/Developer"
for candidate in /Applications/Xcode*.app; do
  [ "$candidate" = "$latest" ] || sudo rm -rf "$candidate"
done
xcrun simctl delete all >/dev/null 2>&1 || true
sudo rm -rf /Library/Developer/CoreSimulator/Profiles/Runtimes/* || true
sudo rm -rf "$HOME/Library/Android" /usr/local/lib/android /opt/hostedtoolcache/CodeQL || true
sudo rm -rf /usr/local/share/dotnet /usr/local/share/powershell || true
rm -rf "$HOME/Library/Caches"/* "$HOME/.gradle" "$HOME/.cargo/registry" || true
brew cleanup -s >/dev/null 2>&1 || true
xcodebuild -version
df -h /
free_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
if [ "$free_kb" -lt $((82 * 1024 * 1024)) ]; then
  echo "Need at least 82 GiB free for the Chromium checkout and component build; found $((free_kb / 1024 / 1024)) GiB." >&2
  exit 78
fi

log "Fetch exact pinned Chromium"
python3 tools/longview.py fetch
source="$LONGVIEW_WORKSPACE/chromium/src"
test -d "$source/.git"
expected="$(python3 -c 'import json; print(json.load(open("chromium.version"))["commit"])')"
actual="$(git -C "$source" rev-parse HEAD)"
test "$actual" = "$expected"
depot="$(find "$LONGVIEW_WORKSPACE" -maxdepth 4 -type d -name depot_tools -print -quit)"
test -n "$depot"
export PATH="$depot:$PATH"
export CHROMIUM_SOURCE="$source"
df -h /

log "Install LongView overlay and Blink native COLD behavior"
python3 tools/longview.py install-overlay --force
mkdir -p build/native-alpha
PYTHONPATH=tools python3 tools/install_blink_native_cold.py \
  --source "$source" \
  --metadata build/native-alpha/BLINK_NATIVE_COLD.json \
  --patch-output build/native-alpha/applied-native-cold.patch
cmp build/native-alpha/applied-native-cold.patch patches/blink/0002-longview-native-cold-layout-detach.patch
git -C "$source" diff --check

log "Generate GN build"
out="$source/out/LongViewNativeAlpha"
args="$(tr '\n' ' ' < configs/gn/longview-native-alpha.gn)"
gn gen "$out" --args="$args"
gn args "$out" --list --short > build/native-alpha/args.gn.resolved.txt
export CHROMIUM_OUT="$out"
df -h /

log "Compile complete Chromium browser"
autoninja -C "$out" chrome -j 2
test -d "$out/Chromium.app"
test -x "$out/Chromium.app/Contents/MacOS/Chromium"
"$out/Chromium.app/Contents/MacOS/Chromium" --version | tee build/native-alpha/browser-version.txt
df -h /

log "Execute native LayoutObject detach/materialize proof"
fixture="$RUNNER_TEMP/native-cold-proof.html"
cat > "$fixture" <<'HTML'
<!doctype html><meta charset="utf-8"><title>LongView Native COLD Proof</title>
<style>
#segment { width: 720px; contain: layout style paint; }
.row { height: 24px; border-bottom: 1px solid transparent; }
</style>
<div id="segment"></div>
<script>
const segment = document.querySelector('#segment');
for (let i = 0; i < 240; i += 1) {
  const row = document.createElement('div');
  row.className = 'row';
  row.textContent = `native-layout-row-${i}`;
  segment.appendChild(row);
}
const finish = async () => {
  try {
    void segment.offsetHeight;
    if (typeof segment.longViewDetachDescendantLayoutObjects !== 'function') {
      throw new Error('native method unavailable');
    }
    const heightBefore = segment.getBoundingClientRect().height;
    const before = Number(segment.longViewCountDescendantLayoutObjects());
    segment.style.containIntrinsicBlockSize = `auto ${Math.ceil(heightBefore)}px`;
    segment.style.contentVisibility = 'hidden';
    const detached = Number(segment.longViewDetachDescendantLayoutObjects());
    const after = Number(segment.longViewCountDescendantLayoutObjects());
    const heightCold = segment.getBoundingClientRect().height;
    segment.style.contentVisibility = 'visible';
    void segment.offsetHeight;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const restored = Number(segment.longViewCountDescendantLayoutObjects());
    const heightRestored = segment.getBoundingClientRect().height;
    const proof = {before, detached, after, restored, heightBefore, heightCold, heightRestored};
    document.body.textContent = `LONGVIEW_NATIVE_PROOF ${JSON.stringify(proof)}`;
  } catch (error) {
    document.body.textContent = `LONGVIEW_NATIVE_FAILURE ${error.stack || error}`;
  }
};
finish();
</script>
HTML
browser="$out/Chromium.app/Contents/MacOS/Chromium"
"$browser" \
  --headless=new \
  --no-first-run \
  --no-default-browser-check \
  --enable-blink-features=LongViewSegmentLifecycle \
  --user-data-dir="$RUNNER_TEMP/native-alpha-profile" \
  --virtual-time-budget=5000 \
  --dump-dom "file://$fixture" \
  > build/native-alpha/native-cold-proof.html
python3 - <<'PY'
from pathlib import Path
import html, json, re
text = html.unescape(Path('build/native-alpha/native-cold-proof.html').read_text(encoding='utf-8'))
match = re.search(r'LONGVIEW_NATIVE_PROOF\s+(\{.*?\})', text)
if not match:
    raise SystemExit(text[-4000:])
proof = json.loads(match.group(1))
assert proof['before'] > 0, proof
assert proof['detached'] > 0, proof
assert proof['after'] == 0, proof
assert proof['restored'] > 0, proof
assert abs(proof['heightBefore'] - proof['heightCold']) <= 2.0, proof
assert abs(proof['heightBefore'] - proof['heightRestored']) <= 2.0, proof
Path('build/native-alpha/native-cold-proof.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps(proof, indent=2))
PY

log "Package proof-carrying Apple Silicon Alpha"
version="0.4.0-blink-native-alpha.${GITHUB_RUN_ID}"
dist="dist/macos-native-alpha"
rm -rf "$dist"
mkdir -p "$dist/proof"
export CHROMIUM_APP="$out/Chromium.app"
export OUTPUT_APP="$dist/LongView Chromium Native Alpha.app"
export LONGVIEW_VERSION="$version"
bash tools/ci/package_macos_blink_native_alpha.sh
cp build/native-alpha/BLINK_NATIVE_COLD.json "$dist/proof/"
cp build/native-alpha/native-cold-proof.json "$dist/proof/"
cp build/native-alpha/native-cold-proof.html "$dist/proof/"
cp build/native-alpha/args.gn.resolved.txt "$dist/proof/"
cp build/native-alpha/browser-version.txt "$dist/proof/"
cp patches/blink/0002-longview-native-cold-layout-detach.patch "$dist/proof/"
cp chromium.version "$dist/proof/"
git rev-parse HEAD > "$dist/proof/LONGVIEW_REPOSITORY_SHA.txt"
shasum -a 256 patches/blink/0002-longview-native-cold-layout-detach.patch > "$dist/proof/PATCH_SHA256.txt"
binary="$dist/LongView Chromium Native Alpha.app/Contents/Resources/Chromium.app/Contents/MacOS/Chromium"
shasum -a 256 "$binary" > "$dist/proof/BROWSER_BINARY_SHA256.txt"
cat > "$dist/README-FIRST.txt" <<EOF
LongView Chromium Blink Native macOS Alpha

Version: $version
Chromium: $(python3 -c 'import json; print(json.load(open("chromium.version"))["version"])')
Architecture: Apple Silicon arm64
Signature: ad-hoc test signature; not notarized

This app was compiled from the exact pinned Chromium source after applying the
LongView Blink native COLD patch. The proof directory contains the actual
LayoutObject detach/restore result, resolved GN arguments, source SHAs, patch
SHA-256 and browser binary SHA-256.

Double-click "LongView Chromium Native Alpha.app". The native ARM64 launcher
enables LongViewSegmentLifecycle and loads the bundled LongView runtime automatically.

Gatekeeper may require right-click > Open or:
xattr -dr com.apple.quarantine "LongView Chromium Native Alpha.app"
EOF
archive="$dist/LongView-Chromium-macOS-arm64-Blink-Native-Alpha.zip"
ditto -c -k --sequesterRsrc --keepParent "$dist/LongView Chromium Native Alpha.app" "$archive"
shasum -a 256 "$archive" > "$dist/SHA256SUMS.txt"
printf '%s\n' "$version" > "$dist/VERSION.txt"
