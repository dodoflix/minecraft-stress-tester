import type { DashboardContext } from "./dashboard.js";

/**
 * The self-contained dashboard page: no external assets, subscribes to /events (SSE) and
 * renders the live metric snapshot. Pure string builder, so it's unit-tested; the HTTP/SSE
 * server that pushes data lives in web.ts and is excluded from coverage.
 */
export function renderWebPage(ctx: DashboardContext): string {
  const title = `mcst - ${ctx.target}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:dark}body{font:14px system-ui,sans-serif;margin:0;background:#0e1116;color:#e6e6e6}
header{padding:14px 20px;background:#161b22;border-bottom:1px solid #30363d}
header b{font-size:16px}header span{color:#8b949e;margin-left:8px}
main{padding:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;max-width:1000px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:14px}
.card .k{color:#8b949e;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.card .v{font-size:26px;margin-top:6px;font-variant-numeric:tabular-nums}
.bar{height:8px;background:#30363d;border-radius:4px;margin-top:10px;overflow:hidden}
.bar>i{display:block;height:100%;background:#2ea043}
#kicks{grid-column:1/-1;color:#8b949e}
</style></head>
<body>
<header><b>Minecraft Stress Tester</b><span>${escapeHtml(ctx.target)}</span><span id="ver">${escapeHtml(ctx.version)}</span></header>
<main id="app">connecting...</main>
<script>
const COUNT=${Number(ctx.count) || 0};
const cards=[
 ["bots", s=>s.spawned+"/"+COUNT, s=>COUNT?s.spawned/COUNT:0],
 ["success", s=>(s.connectSuccessRate*100).toFixed(0)+"%", s=>s.connectSuccessRate],
 ["server TPS", s=>s.tps.toFixed(1), s=>s.tps/20],
 ["active", s=>s.active],
 ["connect p95", s=>s.timeToConnectMs.p95+" ms"],
 ["server ping p95", s=>s.serverPingMs.count?s.serverPingMs.p95+" ms":"n/a"],
 ["in pkt/s", s=>Math.round(s.packetsPerSec)],
 ["kicked/errors", s=>s.kicked+" / "+s.errors],
];
const app=document.getElementById("app");
function render(s){
 app.innerHTML=cards.map(([k,val,frac])=>{
  const bar=frac?'<div class="bar"><i style="width:'+Math.max(0,Math.min(1,frac(s)))*100+'%"></i></div>':'';
  return '<div class="card"><div class="k">'+k+'</div><div class="v">'+val(s)+'</div>'+bar+'</div>';
 }).join("")+
 (Object.keys(s.kickReasons).length?'<div id="kicks">kicks: '+Object.entries(s.kickReasons).map(([r,n])=>n+" x "+r).join(", ")+'</div>':'');
}
const es=new EventSource("/events");
es.onmessage=e=>render(JSON.parse(e.data));
</script>
</body></html>
`;
}

function escapeHtml(v: string): string {
  return v.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}
