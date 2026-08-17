#!/usr/bin/env bash
set -euo pipefail

: "${LONGVIEW_BROWSER:?LONGVIEW_BROWSER is required}"
: "${LONGVIEW_EXTENSION:?LONGVIEW_EXTENSION is required}"
: "${PROOF_OUTPUT:?PROOF_OUTPUT is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"

root="$RUNNER_TEMP/longview-controller-fixture"
mkdir -p "$root"
cat > "$root/index.html" <<'HTML'
<!doctype html><meta charset="utf-8"><title>LongView Controller Native Proof</title>
<style>
html,body{margin:0;font:16px system-ui}main{width:min(900px,92vw);margin:auto}.turn{min-height:320px;padding:20px;border-bottom:1px solid #ddd;box-sizing:border-box}.turn p{margin:8px 0}
</style>
<main id="conversation"></main>
<script>
const root=document.querySelector('#conversation');
for(let i=0;i<120;i++){
  const turn=document.createElement('article');turn.className='turn';
  turn.innerHTML=`<h2>Turn ${i}</h2>${Array.from({length:12},(_,j)=>`<p>LongView native controller row ${i}-${j}: ${'content '.repeat(18)}</p>`).join('')}`;
  root.appendChild(turn);
}
setTimeout(()=>{
  const segments=[...document.querySelectorAll('[data-longview-segment="true"]')];
  const cold=segments.filter(node=>node.dataset.longviewState==='cold');
  const native=cold.filter(node=>Number(node.dataset.longviewNativeDetached||0)>0);
  const detached=native.reduce((sum,node)=>sum+Number(node.dataset.longviewNativeDetached||0),0);
  const zeroLayout=native.filter(node=>typeof node.longViewCountDescendantLayoutObjects==='function'&&Number(node.longViewCountDescendantLayoutObjects())===0).length;
  document.body.textContent=`LONGVIEW_CONTROLLER_NATIVE_PROOF ${JSON.stringify({segments:segments.length,cold:cold.length,nativeCold:native.length,detachedLayoutObjects:detached,zeroLayout})}`;
},7000);
</script>
HTML

port=18765
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$root" >"$RUNNER_TEMP/longview-controller-http.log" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" >/dev/null 2>&1 || true' EXIT
sleep 1

"$LONGVIEW_BROWSER" \
  --headless=new \
  --no-first-run \
  --no-default-browser-check \
  --enable-blink-features=LongViewSegmentLifecycle \
  --disable-extensions-except="$LONGVIEW_EXTENSION" \
  --load-extension="$LONGVIEW_EXTENSION" \
  --user-data-dir="$RUNNER_TEMP/native-controller-profile" \
  --virtual-time-budget=11000 \
  --dump-dom "http://127.0.0.1:$port/index.html" \
  > "$PROOF_OUTPUT.html"

PROOF_OUTPUT="$PROOF_OUTPUT" python3 - <<'PY'
from pathlib import Path
import html, json, os, re
base=Path(os.environ['PROOF_OUTPUT'])
text=html.unescape(Path(str(base)+'.html').read_text(encoding='utf-8'))
match=re.search(r'LONGVIEW_CONTROLLER_NATIVE_PROOF\s+(\{.*?\})',text)
if not match: raise SystemExit(text[-5000:])
proof=json.loads(match.group(1))
assert proof['segments']>=12,proof
assert proof['cold']>0,proof
assert proof['nativeCold']>0,proof
assert proof['detachedLayoutObjects']>0,proof
assert proof['zeroLayout']==proof['nativeCold'],proof
Path(str(base)+'.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
print(json.dumps(proof,indent=2))
PY
