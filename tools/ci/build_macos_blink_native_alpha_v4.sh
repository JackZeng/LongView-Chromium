#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"

cd "$GITHUB_WORKSPACE"
section(){ printf '\n===== %s =====\n' "$*"; }
free_gib(){ df -Pk / | awk 'NR==2{printf "%.1f",$4/1024/1024}'; }

section "Reclaim hosted Apple Silicon capacity"
test "$(uname -m)" = arm64
latest="$(find /Applications -maxdepth 1 -type d -name 'Xcode*.app' -print | LC_ALL=C sort | tail -1)"
test -n "$latest"
sudo xcode-select -s "$latest/Contents/Developer"
for candidate in /Applications/Xcode*.app; do [ "$candidate" = "$latest" ] || sudo rm -rf "$candidate"; done
xcrun simctl delete all >/dev/null 2>&1 || true
sudo rm -rf /Library/Developer/CoreSimulator/Profiles/Runtimes/* || true
sudo rm -rf /Users/runner/hostedtoolcache /usr/local/lib/android /usr/local/share/dotnet /usr/local/share/powershell /opt/hostedtoolcache/CodeQL "$HOME/Library/Android" "$HOME/.gradle" "$HOME/.cargo" "$HOME/.rustup" || true
rm -rf "$HOME/Library/Caches"/* || true
brew cleanup -s >/dev/null 2>&1 || true
xcodebuild -version
echo "Free disk after cleanup: $(free_gib) GiB"
df -h /
free_kb="$(df -Pk / | awk 'NR==2{print $4}')"
if [ "$free_kb" -lt $((42*1024*1024)) ]; then
  echo "Need at least 42 GiB free after cleanup; found $(free_gib) GiB." >&2
  exit 78
fi

section "Shallow-fetch the exact pinned Chromium source"
workspace="$RUNNER_TEMP/longview-native-v4"
depot="$workspace/depot_tools"
checkout="$workspace/chromium"
source="$checkout/src"
mkdir -p "$workspace"
git clone --depth 1 https://chromium.googlesource.com/chromium/tools/depot_tools.git "$depot"
export PATH="$depot:$PATH"
export DEPOT_TOOLS_UPDATE=0
export GCLIENT_PY3=1
mkdir -p "$checkout"
cd "$checkout"
fetch --no-history --nohooks chromium
expected="$(python3 -c 'import json;print(json.load(open("'$GITHUB_WORKSPACE'/chromium.version"))["commit"])')"
cd "$source"
if ! git cat-file -e "$expected^{commit}" 2>/dev/null; then git fetch --depth 1 origin "$expected"; fi
git checkout --detach "$expected"
cd "$checkout"
gclient sync --no-history --nohooks --delete_unversioned_trees --force --reset
cd "$source"
gclient runhooks
test "$(git rev-parse HEAD)" = "$expected"
echo "Pinned Chromium: $expected"
echo "Free disk after checkout: $(free_gib) GiB"
df -h /

section "Install exact LongView Blink behavior structurally"
rm -rf "$source/longview"
cp -R "$GITHUB_WORKSPACE/chromium_overlay" "$source/longview"
mkdir -p "$GITHUB_WORKSPACE/build/native-alpha-v4"
CHROMIUM_SOURCE="$source" GITHUB_WORKSPACE="$GITHUB_WORKSPACE" PYTHONPATH="$GITHUB_WORKSPACE/tools" python3 - <<'PY'
from pathlib import Path
import os
from longview_tools.native_cold_patch import install_native_cold, write_metadata
source=Path(os.environ['CHROMIUM_SOURCE'])
result=install_native_cold(source)
write_metadata(result,Path(os.environ['GITHUB_WORKSPACE'])/'build/native-alpha-v4/BLINK_NATIVE_COLD.json')
assert result.installed
PY
git diff --binary -- \
  third_party/blink/renderer/platform/runtime_enabled_features.json5 \
  third_party/blink/renderer/core/dom/node.h \
  third_party/blink/renderer/core/dom/node.cc \
  third_party/blink/renderer/core/dom/element.h \
  third_party/blink/renderer/core/dom/element.cc \
  third_party/blink/renderer/core/dom/element.idl \
  > "$GITHUB_WORKSPACE/build/native-alpha-v4/applied-native-cold.patch"
test -s "$GITHUB_WORKSPACE/build/native-alpha-v4/applied-native-cold.patch"
git diff --check

section "Prepare the exact bundled LongView runtime"
extension="$RUNNER_TEMP/LongViewNativeExtension"
rm -rf "$extension"
cp -R "$GITHUB_WORKSPACE/product/extension" "$extension"
EXTENSION="$extension" python3 - <<'PY'
from pathlib import Path
import json,os
root=Path(os.environ['EXTENSION'])
manifest=root/'manifest.json'
data=json.loads(manifest.read_text(encoding='utf-8'))
data['version']='0.4.0'
scripts=data['content_scripts'][0]['js']
for name in ('content/35-native-cold.js','content/36-native-cold-proof.js'):
    if name not in scripts:
        anchor=scripts.index('content/30-segment-controller.js')+1
        scripts.insert(anchor,name)
manifest.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
PY
python3 -m json.tool "$extension/manifest.json" >/dev/null
node --check "$extension/content/35-native-cold.js"
node --check "$extension/content/36-native-cold-proof.js"

section "Generate and compile complete Chromium.app"
out="$source/out/LongViewNativeAlpha"
args="$(tr '\n' ' ' < "$GITHUB_WORKSPACE/configs/gn/longview-native-alpha-v4.gn")"
gn gen "$out" --args="$args"
gn args "$out" --list --short > "$GITHUB_WORKSPACE/build/native-alpha-v4/args.gn.resolved.txt"
echo "Free disk before compile: $(free_gib) GiB"
df -h /
autoninja -C "$out" chrome -j 1
test -d "$out/Chromium.app"
test -x "$out/Chromium.app/Contents/MacOS/Chromium"
browser="$out/Chromium.app/Contents/MacOS/Chromium"
"$browser" --version | tee "$GITHUB_WORKSPACE/build/native-alpha-v4/browser-version.txt"

section "Direct native LayoutObject detach/materialize proof"
fixture="$RUNNER_TEMP/native-cold-proof-v4.html"
cat > "$fixture" <<'HTML'
<!doctype html><meta charset="utf-8"><title>LongView Native COLD Proof</title>
<style>#segment{width:720px;contain:layout style paint}.row{height:24px;border-bottom:1px solid transparent}</style><div id="segment"></div>
<script>
const segment=document.querySelector('#segment');for(let i=0;i<240;i++){const row=document.createElement('div');row.className='row';row.textContent=`native-layout-row-${i}`;segment.appendChild(row)}
(async()=>{try{void segment.offsetHeight;if(typeof segment.longViewDetachDescendantLayoutObjects!=='function')throw new Error('native method unavailable');const heightBefore=segment.getBoundingClientRect().height;const before=Number(segment.longViewCountDescendantLayoutObjects());segment.style.containIntrinsicBlockSize=`auto ${Math.ceil(heightBefore)}px`;segment.style.contentVisibility='hidden';const detached=Number(segment.longViewDetachDescendantLayoutObjects());const after=Number(segment.longViewCountDescendantLayoutObjects());const heightCold=segment.getBoundingClientRect().height;segment.style.contentVisibility='visible';void segment.offsetHeight;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const restored=Number(segment.longViewCountDescendantLayoutObjects());const heightRestored=segment.getBoundingClientRect().height;document.body.textContent=`LONGVIEW_NATIVE_PROOF ${JSON.stringify({before,detached,after,restored,heightBefore,heightCold,heightRestored})}`}catch(error){document.body.textContent=`LONGVIEW_NATIVE_FAILURE ${error.stack||error}`}})();
</script>
HTML
"$browser" --headless=new --no-first-run --no-default-browser-check \
  --enable-blink-features=LongViewSegmentLifecycle \
  --user-data-dir="$RUNNER_TEMP/native-alpha-v4-direct-profile" \
  --virtual-time-budget=5000 --dump-dom "file://$fixture" \
  > "$GITHUB_WORKSPACE/build/native-alpha-v4/native-cold-proof.html"
cd "$GITHUB_WORKSPACE"
python3 - <<'PY'
from pathlib import Path
import html,json,re
text=html.unescape(Path('build/native-alpha-v4/native-cold-proof.html').read_text())
match=re.search(r'LONGVIEW_NATIVE_PROOF\s+(\{.*?\})',text)
if not match:raise SystemExit(text[-5000:])
proof=json.loads(match.group(1))
assert proof['before']>0 and proof['detached']>0 and proof['after']==0 and proof['restored']>0,proof
assert abs(proof['heightBefore']-proof['heightCold'])<=2.0,proof
assert abs(proof['heightBefore']-proof['heightRestored'])<=2.0,proof
Path('build/native-alpha-v4/native-cold-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof,indent=2))
PY

section "End-to-end LongView Controller native COLD proof"
export LONGVIEW_BROWSER="$browser"
export LONGVIEW_EXTENSION="$extension"
export PROOF_OUTPUT="$GITHUB_WORKSPACE/build/native-alpha-v4/native-controller-proof"
bash "$GITHUB_WORKSPACE/tools/ci/prove_longview_native_controller.sh"

section "Package self-contained double-clickable Alpha and proof"
version="0.4.0-blink-native-alpha.${GITHUB_RUN_ID}"
dist="$GITHUB_WORKSPACE/dist/macos-native-alpha-v4"
rm -rf "$dist";mkdir -p "$dist/proof"
export CHROMIUM_APP="$out/Chromium.app"
export LONGVIEW_EXTENSION_SOURCE="$extension"
export OUTPUT_APP="$dist/LongView Chromium Native Alpha.app"
export LONGVIEW_VERSION="$version"
bash "$GITHUB_WORKSPACE/tools/ci/package_macos_blink_native_alpha_v4.sh"
cp build/native-alpha-v4/BLINK_NATIVE_COLD.json "$dist/proof/"
cp build/native-alpha-v4/native-cold-proof.json "$dist/proof/"
cp build/native-alpha-v4/native-cold-proof.html "$dist/proof/"
cp build/native-alpha-v4/native-controller-proof.json "$dist/proof/"
cp build/native-alpha-v4/native-controller-proof.html "$dist/proof/"
cp build/native-alpha-v4/args.gn.resolved.txt "$dist/proof/"
cp build/native-alpha-v4/browser-version.txt "$dist/proof/"
cp build/native-alpha-v4/applied-native-cold.patch "$dist/proof/"
cp chromium.version "$dist/proof/"
git rev-parse HEAD > "$dist/proof/LONGVIEW_REPOSITORY_SHA.txt"
shasum -a 256 build/native-alpha-v4/applied-native-cold.patch > "$dist/proof/PATCH_SHA256.txt"
binary="$dist/LongView Chromium Native Alpha.app/Contents/Resources/Chromium.app/Contents/MacOS/Chromium"
shasum -a 256 "$binary" > "$dist/proof/BROWSER_BINARY_SHA256.txt"
cat > "$dist/README-FIRST.txt" <<EOF
LongView Chromium Blink Native macOS Alpha

Version: $version
Chromium: $(python3 -c 'import json;print(json.load(open("chromium.version"))["version"])')
Architecture: Apple Silicon arm64
Signature: ad-hoc test signature; not notarized

Double-click the app. Its native launcher enables LongViewSegmentLifecycle and
loads the bundled LongView runtime. The proof directory contains both direct
LayoutObject release/materialization evidence and end-to-end controller evidence.

Gatekeeper may require right-click > Open or:
xattr -dr com.apple.quarantine "LongView Chromium Native Alpha.app"
EOF
archive="$dist/LongView-Chromium-macOS-arm64-Blink-Native-Alpha.zip"
ditto -c -k --sequesterRsrc --keepParent "$dist/LongView Chromium Native Alpha.app" "$archive"
shasum -a 256 "$archive" > "$dist/SHA256SUMS.txt"
printf '%s\n' "$version" > "$dist/VERSION.txt"
