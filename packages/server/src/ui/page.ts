/**
 * The control-plane web UI: a single self-contained page (inline CSS + vanilla JS, no build
 * step, no external CDNs) served at `/` by the API server. It drives the same REST + SSE
 * endpoints the CLI uses, so it never reaches into engine internals. The API token is embedded
 * because the server binds localhost; treat the page as trusted-local, same as the printed token.
 *
 * Pure string builder, so it is unit-tested. A richer React/shadcn build can replace this later
 * without changing the API it speaks to.
 */
export function renderUiPage(token: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>mcst control panel</title>
<style>
:root{--bg:#0f1216;--panel:#181d24;--line:#2a323d;--fg:#e6e9ee;--mut:#8b95a3;--accent:#4ea1ff;--bad:#ff6b6b;--ok:#4ec98a}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
header{padding:14px 20px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px}
header h1{font-size:16px;margin:0}header .mut{color:var(--mut);font-size:12px}
nav{display:flex;gap:4px;padding:10px 20px 0}
nav button{background:none;border:1px solid transparent;color:var(--mut);padding:8px 14px;border-radius:8px 8px 0 0;cursor:pointer;font-size:14px}
nav button.active{color:var(--fg);background:var(--panel);border-color:var(--line);border-bottom-color:var(--panel)}
main{padding:20px;max-width:960px}section{display:none}section.active{display:block}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:16px}
label{display:block;font-size:12px;color:var(--mut);margin:8px 0 4px}
input,select,textarea{width:100%;background:#0d1015;border:1px solid var(--line);color:var(--fg);border-radius:6px;padding:8px;font:inherit}
textarea{min-height:220px;font-family:ui-monospace,monospace;font-size:13px}
.row{display:flex;gap:12px;flex-wrap:wrap}.row>div{flex:1;min-width:120px}
button.act{background:var(--accent);border:none;color:#04101f;font-weight:600;padding:9px 16px;border-radius:6px;cursor:pointer;margin-top:12px}
button.ghost{background:none;border:1px solid var(--line);color:var(--fg)}
button.danger{background:none;border:1px solid var(--bad);color:var(--bad)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);font-size:13px}
th{color:var(--mut);font-weight:500}.pill{font-size:11px;padding:2px 8px;border-radius:20px;border:1px solid var(--line)}
.running{color:var(--ok);border-color:var(--ok)}.failed{color:var(--bad);border-color:var(--bad)}
.msg{font-size:13px;margin-top:8px;min-height:18px}.msg.err{color:var(--bad)}.msg.ok{color:var(--ok)}
pre{background:#0d1015;border:1px solid var(--line);border-radius:6px;padding:12px;overflow:auto;font-size:12px}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-top:10px}
.metric{background:#0d1015;border:1px solid var(--line);border-radius:8px;padding:10px}.metric b{display:block;font-size:18px}
.metric span{color:var(--mut);font-size:11px}small.warn{color:var(--mut)}
</style></head>
<body>
<header><h1>mcst control panel</h1><span class="mut" id="server"></span></header>
<nav>
  <button data-tab="runs" class="active">Runs</button>
  <button data-tab="configs">Configs</button>
  <button data-tab="history">History</button>
</nav>
<main>
  <section id="runs" class="active">
    <div class="card">
      <h3>Start a run</h3>
      <div class="row">
        <div><label>Host</label><input id="r-host" value="127.0.0.1"></div>
        <div><label>Port</label><input id="r-port" type="number" value="25565"></div>
        <div><label>Bots</label><input id="r-count" type="number" value="50"></div>
        <div><label>Driver</label><select id="r-driver"><option value="light">light</option><option value="full">full</option></select></div>
        <div><label>Hold (s)</label><input id="r-hold" type="number" value="60"></div>
      </div>
      <label><input type="checkbox" id="r-auth" style="width:auto"> I own or am authorized to test this target</label>
      <button class="act" id="r-start">Start run</button>
      <div class="msg" id="r-msg"></div>
    </div>
    <div class="card"><h3>Runs</h3><table id="runs-tbl"><thead><tr><th>id</th><th>target</th><th>bots</th><th>status</th><th></th></tr></thead><tbody></tbody></table>
      <div id="live"></div>
    </div>
  </section>

  <section id="configs">
    <div class="card"><h3>Configs</h3>
      <div class="row"><div><label>Saved configs</label><select id="c-list"></select></div>
        <div><label>Name</label><input id="c-name" placeholder="run.yaml"></div></div>
      <label>Content (YAML or JSON)</label><textarea id="c-body"></textarea>
      <div class="row">
        <button class="act ghost" id="c-validate">Validate</button>
        <button class="act" id="c-save">Save</button>
        <button class="act danger" id="c-delete">Delete</button>
      </div>
      <div class="msg" id="c-msg"></div>
    </div>
  </section>

  <section id="history">
    <div class="card"><h3>Past runs</h3><table id="hist-tbl"><thead><tr><th>finished</th><th>target</th><th>spawned</th><th>tps</th></tr></thead><tbody></tbody></table></div>
    <div class="card"><h3>Report</h3><pre id="hist-report">Select a run above.</pre></div>
  </section>
</main>
<script>
const TOKEN=${JSON.stringify(token)};
const H={Authorization:"Bearer "+TOKEN,"Content-Type":"application/json"};
const $=(s)=>document.querySelector(s);
const api=(p,opts={})=>fetch("/api"+p,{headers:H,...opts}).then(async r=>({ok:r.ok,status:r.status,body:await r.json().catch(()=>({}))}));

document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("nav button").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll("section").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");$("#"+b.dataset.tab).classList.add("active");
  if(b.dataset.tab==="configs")loadConfigs();if(b.dataset.tab==="history")loadHistory();
});

api("").then(r=>{$("#server").textContent=r.body.name+" v"+r.body.version});

// --- Runs ---
$("#r-start").onclick=async()=>{
  const cfg={authorized:$("#r-auth").checked,driver:$("#r-driver").value,
    target:{host:$("#r-host").value,port:+$("#r-port").value},
    ramp:{count:+$("#r-count").value,holdSeconds:+$("#r-hold").value}};
  const r=await api("/runs",{method:"POST",body:JSON.stringify(cfg)});
  const m=$("#r-msg");
  if(r.ok){m.className="msg ok";m.textContent="started "+r.body.id;loadRuns();}
  else{m.className="msg err";m.textContent=r.body.error||("error "+r.status);}
};
async function loadRuns(){
  const r=await api("/runs");const tb=$("#runs-tbl tbody");tb.innerHTML="";
  (r.body.runs||[]).forEach(run=>{
    const tr=document.createElement("tr");
    tr.innerHTML='<td>'+run.id+'</td><td>'+run.target.host+':'+run.target.port+'</td><td>'+run.count+
      '</td><td><span class="pill '+run.status+'">'+run.status+'</span></td><td></td>';
    if(run.status==="running"){
      const b=document.createElement("button");b.className="ghost";b.textContent="stop";
      b.onclick=async()=>{await api("/runs/"+run.id+"/stop",{method:"POST"});loadRuns();};
      tr.lastChild.appendChild(b);watch(run.id);
    }
    tb.appendChild(tr);
  });
}
let es=null,watching=null;
function watch(id){
  if(watching===id)return;watching=id;if(es)es.close();
  es=new EventSource("/api/runs/"+id+"/stream?token="+encodeURIComponent(TOKEN));
  es.onmessage=(e)=>{const m=JSON.parse(e.data);$("#live").innerHTML='<h4>live: '+id+'</h4><div class="metrics">'+
    metric("active",m.active)+metric("spawned",m.spawned)+metric("TPS",m.tps.toFixed(1))+
    metric("connect p95",m.timeToConnectMs.p95+"ms")+metric("pkt/s",Math.round(m.packetsPerSec))+
    metric("kicked",m.kicked)+'</div>';};
  es.onerror=()=>{if(es)es.close();es=null;watching=null;};
}
const metric=(k,v)=>'<div class="metric"><b>'+v+'</b><span>'+k+'</span></div>';
setInterval(()=>{if($("#runs").classList.contains("active"))loadRuns();},2500);
loadRuns();

// --- Configs ---
async function loadConfigs(){
  const r=await api("/configs");const sel=$("#c-list");sel.innerHTML='<option value="">(new)</option>';
  (r.body.configs||[]).forEach(n=>{const o=document.createElement("option");o.value=n;o.textContent=n;sel.appendChild(o);});
}
$("#c-list").onchange=async()=>{const n=$("#c-list").value;if(!n){$("#c-body").value="";$("#c-name").value="";return;}
  const r=await api("/configs/"+encodeURIComponent(n));$("#c-name").value=n;$("#c-body").value=r.body.content||"";};
function cmsg(ok,t){const m=$("#c-msg");m.className="msg "+(ok?"ok":"err");m.textContent=t;}
$("#c-validate").onclick=async()=>{const r=await api("/configs/validate",{method:"POST",body:JSON.stringify({content:$("#c-body").value})});
  r.body.valid?cmsg(true,"valid"):cmsg(false,(r.body.errors||["invalid"]).join("; "));};
$("#c-save").onclick=async()=>{const n=$("#c-name").value.trim();if(!n)return cmsg(false,"name required");
  const r=await api("/configs/"+encodeURIComponent(n),{method:"PUT",body:JSON.stringify({content:$("#c-body").value})});
  r.ok?(cmsg(true,"saved "+n),loadConfigs()):cmsg(false,(r.body.errors||[r.body.error||"error"]).join("; "));};
$("#c-delete").onclick=async()=>{const n=$("#c-name").value.trim();if(!n)return;
  const r=await api("/configs/"+encodeURIComponent(n),{method:"DELETE"});r.ok?(cmsg(true,"deleted"),loadConfigs()):cmsg(false,"not found");};

// --- History ---
async function loadHistory(){
  const r=await api("/history");const tb=$("#hist-tbl tbody");tb.innerHTML="";
  (r.body.history||[]).forEach(h=>{const tr=document.createElement("tr");
    tr.innerHTML='<td>'+h.finishedAt+'</td><td>'+h.target.host+':'+h.target.port+'</td><td>'+h.spawned+'</td><td>'+h.tps.toFixed(1)+'</td>';
    tr.style.cursor="pointer";tr.onclick=async()=>{const d=await api("/history/"+encodeURIComponent(h.file));$("#hist-report").textContent=JSON.stringify(d.body,null,2);};
    tb.appendChild(tr);});
}
</script>
</body></html>`;
}
