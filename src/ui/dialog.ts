import type { ParamSpec, ToolSpec } from "../tools/registry.js";
import { GROUP_ORDER } from "../tools/registry.js";

/* ------------------------------------------------------------------ */
/* Shared panel styling — quiet hardware-module look                   */
/* ------------------------------------------------------------------ */

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --panel:hsl(26,5%,17%);
  --well:hsl(26,8%,11%);
  --hair:hsl(26,7%,26%);
  --hair-hi:hsl(26,6%,32%);
  --ink:hsl(30,9%,80%);
  --ink-dim:hsl(27,6%,60%);
  --acc:hsl(28,100%,62%);
  --acc-hot:hsl(28,100%,70%);
  --acc-ink:hsl(26,60%,10%);
}
html{background:var(--panel);color:var(--ink);font-family:"AbletonSansSmall",-apple-system,sans-serif;
  font-size:11.5px;font-weight:500;height:100%;-webkit-font-smoothing:antialiased}
body{height:100%;display:flex;flex-direction:column;overflow:hidden}
button,input,select{font:inherit;color:inherit}

/* header rail */
.hdr{display:flex;align-items:center;gap:8px;padding:10px 14px 9px;border-bottom:1px solid var(--hair);flex:none}
.led{width:7px;height:7px;border-radius:2px;background:var(--acc);box-shadow:0 0 5px hsla(28,100%,62%,.55);flex:none}
.hdr .name{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink)}
.hdr .brand{margin-left:auto;font-size:9px;letter-spacing:.22em;color:var(--ink-dim);text-transform:uppercase}

.blurb{color:var(--ink-dim);font-size:10.5px;line-height:1.45;padding:9px 14px 0;flex:none}

/* parameter rows */
.params{display:flex;flex-direction:column;gap:11px;padding:11px 14px;overflow-y:auto;flex:1}
.row{display:flex;flex-direction:column;gap:4px}
.row .top{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.lbl{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-dim)}
.val{font-variant-numeric:tabular-nums;font-size:10.5px;color:var(--acc);
  background:var(--well);border:1px solid var(--hair);border-radius:3px;padding:1px 7px;min-width:52px;text-align:right}

input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:16px;background:transparent;cursor:pointer}
input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;border:1px solid var(--well);
  background:var(--fill,var(--well))}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:15px;border-radius:3px;margin-top:-6px;
  background:linear-gradient(hsl(26,8%,42%),hsl(26,8%,30%));border:1px solid hsl(26,10%,8%);
  box-shadow:inset 0 1px 0 hsla(30,20%,80%,.25)}
input[type=range]:focus-visible{outline:2px solid var(--acc);outline-offset:2px;border-radius:3px}

select{background:var(--well);border:1px solid var(--hair);border-radius:3px;padding:4px 6px;width:100%;
  color:var(--ink);cursor:pointer}
select:focus-visible{outline:2px solid var(--acc);outline-offset:1px}
input[type=text]{background:var(--well);border:1px solid var(--hair);border-radius:3px;padding:4px 7px;width:100%;color:var(--ink)}
input[type=text]:focus-visible{outline:2px solid var(--acc);outline-offset:1px}

/* toggle */
.tgl{display:flex;align-items:center;gap:8px;cursor:pointer}
.tgl input{position:absolute;opacity:0;pointer-events:none}
.tgl .sw{width:26px;height:14px;border-radius:7px;background:var(--well);border:1px solid var(--hair);position:relative;
  transition:background .15s ease-out;flex:none}
.tgl .sw::after{content:"";position:absolute;top:1px;left:1px;width:10px;height:10px;border-radius:5px;
  background:hsl(26,8%,42%);transition:transform .15s cubic-bezier(.22,1,.36,1),background .15s}
.tgl input:checked+.sw{background:hsl(28,70%,30%)}
.tgl input:checked+.sw::after{transform:translateX(12px);background:var(--acc)}
.tgl input:focus-visible+.sw{outline:2px solid var(--acc);outline-offset:2px}
.tgl .lbl{text-transform:none;letter-spacing:.02em;font-size:10.5px;color:var(--ink)}

/* footer rail */
.ftr{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--hair);flex:none}
.target{font-size:9.5px;color:var(--ink-dim);letter-spacing:.04em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.target b{color:var(--ink);font-weight:500}
button{background:var(--well);border:1px solid var(--hair);border-radius:4px;height:26px;padding:0 14px;cursor:pointer;
  color:var(--ink);white-space:nowrap}
button:hover{border-color:var(--hair-hi)}
button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
button.pri{background:var(--acc);border-color:var(--acc);color:var(--acc-ink);font-weight:600}
button.pri:hover{background:var(--acc-hot);border-color:var(--acc-hot)}
.spacer{flex:1}

/* documentation block under the parameters */
.docs{margin:2px 14px 12px;padding:10px 12px;background:var(--well);border:1px solid var(--hair);border-radius:4px;
  color:var(--ink-dim);font-size:10px;line-height:1.55}
.docs .cat{display:block;font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--acc);margin-bottom:5px}

/* Rack grid landing page */
.grid-wrap{flex:1;overflow-y:auto;padding:12px 14px 4px}
.grid-grp{font-size:8.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-dim);margin:2px 2px 7px}
.grid-grp:not(:first-child){margin-top:16px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
.cell{display:flex;align-items:center;justify-content:center;text-align:center;height:46px;padding:4px 6px;
  background:var(--well);border:1px solid var(--hair);border-radius:4px;color:var(--ink);font-size:10.5px;line-height:1.2;
  cursor:pointer;transition:border-color .12s,background .12s,transform .06s}
.cell:hover{border-color:var(--acc);background:hsla(28,80%,55%,.08);color:var(--acc-hot)}
.cell:active{transform:translateY(1px)}
.cell:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.back{background:none;border:none;color:var(--ink-dim);height:26px;padding:0 6px 0 4px;cursor:pointer;
  display:flex;align-items:center;gap:5px;font-size:10.5px}
.back:hover{color:var(--acc-hot)}
.back .arw{font-size:13px;line-height:1}

/* dice / secondary button */
button.dice{background:none;border:1px solid var(--hair);color:var(--ink-dim);padding:0 10px;letter-spacing:.04em}
button.dice:hover{border-color:var(--acc);color:var(--acc-hot)}

/* Rack grid tools: search + tweak-last */
.gridtools{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.gridtools input{flex:1}
.tweaklast{background:none;border:1px solid var(--hair);color:var(--ink-dim);height:26px;border-radius:4px;
  padding:0 10px;cursor:pointer;white-space:nowrap;max-width:48%;overflow:hidden;text-overflow:ellipsis}
.tweaklast:hover{border-color:var(--acc);color:var(--acc-hot)}
.grid-sec[hidden]{display:none}
.grid-empty{color:var(--ink-dim);font-size:10.5px;padding:14px 2px}
`;

/* ------------------------------------------------------------------ */
/* Shared client-side parameter engine                                 */
/* ------------------------------------------------------------------ */

const PARAM_JS = `
function send(m){(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.live
  ?window.webkit.messageHandlers.live
  :window.chrome&&window.chrome.webview||{postMessage:function(){}}).postMessage(m)}
function decimals(step){if(step>=1)return 0;var s=String(step);var i=s.indexOf('.');return i<0?0:s.length-i-1}
function fmt(p,v){
  if(p.type==='check')return '';
  var d=decimals(p.step||1);
  if(p.log&&v>=100)d=0;else if(p.log&&v>=10)d=1;else if(p.log)d=2;
  return v.toFixed(d)+(p.unit||'');
}
function toSlider(p,v){if(!p.log)return v;return 1000*Math.log(v/p.min)/Math.log(p.max/p.min)}
function fromSlider(p,x){if(!p.log)return parseFloat(x);return p.min*Math.pow(p.max/p.min,x/1000)}
function paint(el){var pc=(el.value-el.min)/(el.max-el.min)*100;
  el.style.setProperty('--fill','linear-gradient(to right,var(--acc) '+pc+'%,var(--well) '+pc+'%)')}

// Renders spec params into container; returns {collect, setSpec}
function buildParams(container,spec,init){
  var state={};
  container.innerHTML='';
  spec.forEach(function(p){
    var v=(init&&init[p.key]!==undefined)?init[p.key]:p.def;
    state[p.key]=v;
    var row=document.createElement('div');row.className='row';row.dataset.key=p.key;
    if(p.type==='slider'){
      var eff=p.modeCfg?p.modeCfg[String(state[p.modeKey]!==undefined?state[p.modeKey]:findDef(spec,p.modeKey))]:null;
      var cfg=eff||p;
      if(eff&&(v<eff.min||v>eff.max))v=eff.def,state[p.key]=v;
      row.innerHTML='<div class="top"><span class="lbl"></span><span class="val"></span></div>';
      row.querySelector('.lbl').textContent=(eff&&eff.label)||p.label;
      var r=document.createElement('input');r.type='range';r.setAttribute('aria-label',p.label);
      r.min=p.log?0:cfg.min;r.max=p.log?1000:cfg.max;r.step=p.log?1:cfg.step;
      r.value=toSlider(p,v);paint(r);
      row.querySelector('.val').textContent=fmt(p,v);
      r.addEventListener('input',function(){var nv=fromSlider(p,r.value);state[p.key]=nv;
        row.querySelector('.val').textContent=fmt(p,nv);paint(r)});
      row.appendChild(r);
      if(eff&&eff.hide)row.style.display='none';
    }else if(p.type==='select'){
      row.innerHTML='<div class="top"><span class="lbl"></span></div>';
      row.querySelector('.lbl').textContent=p.label;
      var s=document.createElement('select');s.setAttribute('aria-label',p.label);
      p.options.forEach(function(o){var op=document.createElement('option');op.value=o.value;op.textContent=o.label;s.appendChild(op)});
      s.value=String(v);
      s.addEventListener('change',function(){state[p.key]=s.value;
        // re-render dependents
        spec.forEach(function(q){if(q.modeKey===p.key){var cur=state;buildParams(container,spec,cur)}})});
      row.appendChild(s);
    }else if(p.type==='check'){
      var lab=document.createElement('label');lab.className='tgl';
      var c=document.createElement('input');c.type='checkbox';c.checked=Boolean(v);
      c.addEventListener('change',function(){state[p.key]=c.checked});
      var sw=document.createElement('span');sw.className='sw';
      var t=document.createElement('span');t.className='lbl';t.textContent=p.label;
      lab.appendChild(c);lab.appendChild(sw);lab.appendChild(t);
      row.appendChild(lab);
    }else if(p.type==='text'){
      row.innerHTML='<div class="top"><span class="lbl"></span></div>';
      row.querySelector('.lbl').textContent=p.label;
      var x=document.createElement('input');x.type='text';x.value=String(v||'');x.spellcheck=false;
      x.setAttribute('aria-label',p.label);
      x.addEventListener('input',function(){state[p.key]=x.value});
      row.appendChild(x);
    }
    container.appendChild(row);
  });
  function findDef(spec,key){var q=spec.find(function(s){return s.key===key});return q?q.def:undefined}
  var eng={collect:function(){return JSON.parse(JSON.stringify(state))}};
  container.__eng=eng; // survives internal re-renders (mode selects)
  return eng;
}
function collectFrom(container){return container.__eng.collect()}

// --- Randomize: roll sensible values across a spec's params, then re-render ---
function specDef(spec,key){for(var i=0;i<spec.length;i++)if(spec[i].key===key)return spec[i].def;return undefined}
function effFor(spec,p,state){
  if(!p.modeCfg)return p;
  var mk=state[p.modeKey];if(mk===undefined)mk=specDef(spec,p.modeKey);
  return p.modeCfg[String(mk)]||p;
}
function rollSlider(p,cfg){
  var v;
  if(p.log){v=p.min*Math.pow(p.max/p.min,Math.random());}
  else{v=cfg.min+Math.random()*(cfg.max-cfg.min);}
  var step=cfg.step||p.step||1;
  v=Math.round((v-cfg.min)/step)*step+cfg.min;
  if(v<cfg.min)v=cfg.min;if(v>cfg.max)v=cfg.max;
  return v;
}
function randomize(container,spec){
  var st=container.__eng.collect();
  // pass 1: selects + checks (these can change which sliders are active)
  spec.forEach(function(p){
    if(p.type==='select')st[p.key]=p.options[Math.floor(Math.random()*p.options.length)].value;
    else if(p.type==='check')st[p.key]=Math.random()<0.5;
  });
  // pass 2: sliders, within their now-effective range (skip hidden ones)
  spec.forEach(function(p){
    if(p.type!=='slider')return;
    var eff=effFor(spec,p,st);if(eff.hide)return;
    st[p.key]=rollSlider(p,eff);
  });
  buildParams(container,spec,st);
}
`;

function embed(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c");
}

/* ------------------------------------------------------------------ */
/* Per-tool dialog                                                     */
/* ------------------------------------------------------------------ */

function rowHeight(p: ParamSpec): number {
  return p.type === "check" ? 28 : p.type === "slider" ? 47 : 50;
}

function docsHeight(spec: ToolSpec): number {
  // ~52 chars/line at this width; 15px line-height + 20px padding + 12px margin + ~14px category
  const lines = Math.ceil(spec.docs.length / 52);
  return lines * 15 + 20 + 12 + 14;
}

export function toolDialogSize(spec: ToolSpec): [number, number] {
  const h = 40 /*hdr*/ + 30 /*blurb*/ + 22 /*params pad*/ +
    spec.params.reduce((a, p) => a + rowHeight(p), 0) +
    (spec.params.length - 1) * 11 + docsHeight(spec) + 47 /*ftr*/ + 20 /*safety*/;
  return [380, Math.min(680, h)];
}

export function renderToolDialog(spec: ToolSpec): string {
  const clientSpec = spec.params;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>CDP: ${spec.title}</title>
<style>${CSS}</style></head><body>
<div class="hdr"><span class="led"></span><span class="name">${spec.title}</span><span class="brand">CDP</span></div>
<div class="blurb">${spec.blurb}</div>
<div class="params" id="params"></div>
<div class="docs"><span class="cat">${spec.group}</span>${spec.docs}</div>
<div class="ftr"><button class="dice" id="rnd" title="Randomize parameters">🎲 Random</button><span class="spacer"></span>
<button id="cancel">Cancel</button><button class="pri" id="ok">Process</button></div>
<script>${PARAM_JS}
var SPEC=${embed(clientSpec)};
var box=document.getElementById('params');
buildParams(box,SPEC,null);
function ok(){send({method:'close_and_send',params:[JSON.stringify(collectFrom(box))]})}
function cancel(){send({method:'close_and_send',params:[JSON.stringify(null)]})}
document.getElementById('ok').addEventListener('click',ok);
document.getElementById('cancel').addEventListener('click',cancel);
document.getElementById('rnd').addEventListener('click',function(){randomize(box,SPEC)});
document.addEventListener('keydown',function(e){
  if(e.key==='Enter')ok();if(e.key==='Escape')cancel();
  if(e.key==='r'&&(e.metaKey||e.ctrlKey)){e.preventDefault();randomize(box,SPEC)}
});
</script></body></html>`;
}

/* ------------------------------------------------------------------ */
/* "All Tools" dialog — tool rail + param pane, chained processing     */
/* ------------------------------------------------------------------ */

export const ALL_DIALOG_W = 620;
export const ALL_DIALOG_H = 560;

export interface AllDialogState {
  /** Tool + params to restore when that tool's detail is opened (last used). */
  toolId: string;
  params: Record<string, unknown> | null;
  clipName: string;
  /** Most-recently used tool ids, newest first (for the Recent row + Tweak-last). */
  recent: string[];
}

export function renderAllDialog(tools: ToolSpec[], state: AllDialogState): string {
  const clientTools = tools.map((t) => ({
    id: t.id, title: t.title, group: t.group, blurb: t.blurb, docs: t.docs, params: t.params,
  }));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>CDP Rack</title>
<style>${CSS}
.pane{flex:1;display:flex;flex-direction:column;min-width:0}
[hidden]{display:none!important}
</style></head><body>
<div class="hdr">
  <button class="back" id="back" hidden><span class="arw">‹</span>All effects</button>
  <span class="led" id="led"></span><span class="name" id="title">CDP Rack</span>
  <span class="brand" id="brand">Rack</span>
</div>

<!-- grid landing -->
<div class="grid-wrap" id="gridView">
  <div class="gridtools">
    <input id="search" type="text" spellcheck="false" placeholder="Search effects…" aria-label="Search effects">
    <button class="tweaklast" id="tweaklast" hidden></button>
  </div>
  <div id="gridBody"></div>
  <div class="grid-empty" id="noResults" hidden>No effects match.</div>
</div>

<!-- effect detail -->
<div class="pane" id="detailView" hidden>
  <div class="blurb" id="blurb"></div>
  <div class="params" id="params"></div>
  <div class="docs"><span class="cat" id="cat"></span><span id="docs"></span></div>
</div>

<div class="ftr">
  <span class="target">target&nbsp;&nbsp;<b id="clip"></b></span>
  <button class="dice" id="rnd" hidden title="Randomize parameters">🎲 Random</button>
  <button id="close">Close</button>
  <button class="pri" id="ok" hidden>Process</button>
</div>
<script>${PARAM_JS}
var TOOLS=${embed(clientTools)};
var GROUPS=${embed(GROUP_ORDER)};
var STATE=${embed(state)};
var curId=null;
var paramBox=document.getElementById('params');
document.getElementById('clip').textContent=STATE.clipName;
var byId=function(id){return TOOLS.find(function(x){return x.id===id})};

// build grid into #gridBody: a "Recent" section (if any) then one section per category.
var gbody=document.getElementById('gridBody');
function makeCell(t){
  var b=document.createElement('button');b.className='cell';b.textContent=t.title;
  b.dataset.id=t.id;b.dataset.title=t.title.toLowerCase();
  b.addEventListener('click',function(){openDetail(t.id)});
  return b;
}
function makeSection(label,tools){
  var sec=document.createElement('div');sec.className='grid-sec';
  var h=document.createElement('div');h.className='grid-grp';h.textContent=label;sec.appendChild(h);
  var grid=document.createElement('div');grid.className='grid';
  tools.forEach(function(t){grid.appendChild(makeCell(t))});
  sec.appendChild(grid);return sec;
}
var recentTools=(STATE.recent||[]).map(byId).filter(Boolean);
if(recentTools.length)gbody.appendChild(makeSection('Recent',recentTools));
GROUPS.forEach(function(g){
  var tools=TOOLS.filter(function(t){return t.group===g});
  if(tools.length)gbody.appendChild(makeSection(g,tools));
});

var elGrid=document.getElementById('gridView'),elDetail=document.getElementById('detailView'),
    elBack=document.getElementById('back'),elOk=document.getElementById('ok'),elRnd=document.getElementById('rnd'),
    elTitle=document.getElementById('title'),elBrand=document.getElementById('brand'),
    elLed=document.getElementById('led'),elSearch=document.getElementById('search'),
    elTweak=document.getElementById('tweaklast'),elNo=document.getElementById('noResults');

// Tweak-last: reopen the most recently used effect directly
if(STATE.toolId&&byId(STATE.toolId)){
  elTweak.hidden=false;
  elTweak.textContent='↻ '+byId(STATE.toolId).title;
  elTweak.addEventListener('click',function(){openDetail(STATE.toolId)});
}

function applySearch(){
  var q=elSearch.value.trim().toLowerCase();var anyAll=false;
  document.querySelectorAll('#gridBody .grid-sec').forEach(function(sec){
    var any=false;
    sec.querySelectorAll('.cell').forEach(function(c){
      var show=!q||c.dataset.title.indexOf(q)>=0;c.hidden=!show;if(show)any=true;
    });
    sec.hidden=!any;if(any)anyAll=true;
  });
  elNo.hidden=anyAll;
}
elSearch.addEventListener('input',applySearch);

function showGrid(){
  curId=null;
  elGrid.hidden=false;elDetail.hidden=true;
  elBack.hidden=true;elOk.hidden=true;elRnd.hidden=true;elLed.hidden=false;
  elTitle.textContent='CDP Rack';elBrand.textContent='Rack';
}
function openDetail(id){
  curId=id;
  var t=byId(id);
  elGrid.hidden=true;elDetail.hidden=false;
  elBack.hidden=false;elOk.hidden=false;elRnd.hidden=false;elLed.hidden=true;
  elTitle.textContent=t.title;elBrand.textContent=t.group;
  document.getElementById('blurb').textContent=t.blurb;
  document.getElementById('cat').textContent=t.group;
  document.getElementById('docs').textContent=t.docs;
  var init=(STATE.toolId===id)?STATE.params:null;
  buildParams(paramBox,t.params,init);
}

elBack.addEventListener('click',showGrid);
elRnd.addEventListener('click',function(){if(curId)randomize(paramBox,byId(curId).params)});
function ok(){if(!curId)return;send({method:'close_and_send',params:[JSON.stringify({tool:curId,params:collectFrom(paramBox)})]})}
function closeIt(){send({method:'close_and_send',params:[JSON.stringify(null)]})}
document.getElementById('ok').addEventListener('click',ok);
document.getElementById('close').addEventListener('click',closeIt);
document.addEventListener('keydown',function(e){
  if(e.key==='Enter'&&curId)ok();
  if(e.key==='r'&&(e.metaKey||e.ctrlKey)&&curId){e.preventDefault();randomize(paramBox,byId(curId).params);return}
  if(e.key==='Escape'){
    if(curId){showGrid();return}
    if(document.activeElement===elSearch&&elSearch.value){elSearch.value='';applySearch();return}
    closeIt();
  }
});
showGrid();
</script></body></html>`;
}
