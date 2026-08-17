const fallback={schemaVersion:1,generatedAt:null,release:{version:"development",channel:"nightly",readiness:"development",signedArtifacts:false},engine:{phase:3,featureFlag:"off",controllerContract:true,geometryCapsule:true,coldBackend:true,schedulerContract:true,blinkDerivedStateRelease:false},evidence:{publishable:false,scales:[]},security:{chromiumVersion:"unknown",chromiumCommit:"unknown",pinCurrent:false,lastChecked:null},gates:[]};
const text=(value,fallbackText="—")=>value===null||value===undefined||value===""?fallbackText:String(value);
const badgeClass=(state)=>state==="pass"||state===true?"good":state==="blocked"||state===false?"bad":"warn";
const statusText=(state)=>state==="pass"?"PASS":state==="blocked"?"BLOCKED":"PENDING";
function metric(label,value){return `<article class="metric"><strong>${text(value)}</strong><span>${label}</span></article>`}
function render(data){
 const release=data.release||fallback.release,engine=data.engine||fallback.engine,evidence=data.evidence||fallback.evidence,security=data.security||fallback.security;
 document.querySelector("#summary").innerHTML=[metric("Release",release.version),metric("Channel",release.channel),metric("Engine phase",`Phase ${engine.phase}`),metric("Publishable evidence",evidence.publishable?"Yes":"Not yet")].join("");
 document.querySelector("#summary").setAttribute("aria-busy","false");
 const readiness=release.readiness==="stable"?"pass":release.readiness==="blocked"?"blocked":"pending";
 const releaseBadge=document.querySelector("#release-badge");releaseBadge.textContent=text(release.readiness).toUpperCase();releaseBadge.className=`badge ${badgeClass(readiness)}`;
 const gates=(data.gates||[]);document.querySelector("#release-gates").innerHTML=gates.length?gates.map(g=>`<article class="gate"><span class="status ${g.status}">${statusText(g.status)}</span><h3>${text(g.name)}</h3><p>${text(g.detail)}</p></article>`).join(""):`<article class="gate"><span class="status pending">PENDING</span><h3>Release gates</h3><p>No generated gate data has been published.</p></article>`;
 document.querySelector("#engine-metrics").innerHTML=[metric("Feature default",text(engine.featureFlag)),metric("Controller contract",engine.controllerContract?"Validated":"Pending"),metric("Geometry capsule",engine.geometryCapsule?"Validated":"Pending"),metric("Blink state release",engine.blinkDerivedStateRelease?"Validated":"Pending")].join("");
 const rows=evidence.scales||[];document.querySelector("#evidence-table").innerHTML=rows.length?rows.map(r=>`<tr><td>${text(r.turns)} turns</td><td>${text(r.baselineP95,"Pending")}</td><td>${text(r.longviewP95,"Pending")}</td><td>${text(r.ratio,"Pending")}</td><td>${r.correctness?"Pass":"Pending"}</td></tr>`).join(""):`<tr><td colspan="5">Controlled physical-machine evidence has not been published yet.</td></tr>`;
 const current=Boolean(security.pinCurrent);const sb=document.querySelector("#security-badge");sb.textContent=current?"PIN CURRENT":"CHECK REQUIRED";sb.className=`badge ${current?"good":"warn"}`;
 document.querySelector("#security-details").innerHTML=[metric("Chromium",security.chromiumVersion),metric("Commit",text(security.chromiumCommit).slice(0,12)),metric("Pin checked",security.lastChecked?new Date(security.lastChecked).toLocaleString():"Pending"),metric("Signed artifacts",release.signedArtifacts?"Yes":"No")].join("");
 document.querySelector("#generated-at").textContent=data.generatedAt?`Generated ${new Date(data.generatedAt).toLocaleString()}`:"Development status data";
}
fetch("data/status.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(String(r.status));return r.json()}).then(render).catch(()=>render(fallback));
