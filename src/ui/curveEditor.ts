/* ------------------------------------------------------------------ */
/* Curve editor — the `curves` composite param (preset first, then     */
/* refine by drawing). Plain ES5 inlined after PARAM_JS, like it.      */
/*                                                                     */
/* Curves are stored in the param state as `t v` strings (t 0–1, v in  */
/* real units, optional `:b` bend) — the format and the bend formula   */
/* must stay identical to src/tools/envelope-curve.ts, which turns     */
/* them into CDP breakpoint files.                                     */
/* ------------------------------------------------------------------ */

export const CURVE_CSS = `
.cv-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.cv-chip{height:20px;padding:0 9px;border-radius:10px;font-size:10px}
.cv-chip.on{border-color:var(--acc);color:var(--acc)}
.cv-chip:disabled{opacity:.4;cursor:default}
svg.cv-ed{display:block;width:100%;height:150px;margin-top:6px;background:var(--well);border:1px solid var(--hair);
  border-radius:3px;touch-action:none;cursor:crosshair}
.cv-bg{fill:transparent}
.cv-wave{fill:hsl(26,6%,24%)}
.cv-grid{stroke:var(--hair);stroke-width:1;vector-effect:non-scaling-stroke}
.cv-line,.cv-flat{fill:none;stroke:var(--acc);stroke-width:1.6;vector-effect:non-scaling-stroke}
.cv-flat{stroke-dasharray:4 3;opacity:.75}
.cv-pt{fill:var(--panel);stroke:var(--acc);stroke-width:1.5;vector-effect:non-scaling-stroke;cursor:grab}
.cv-axis{display:flex;justify-content:space-between;font-size:9.5px;color:var(--ink-dim);margin-top:2px}
.cv-ctl{display:flex;gap:10px;margin-top:6px}
.cv-ctl:empty{display:none}
.cv-s{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0}
.cv-summary{font-size:10px;color:var(--ink-dim);margin-top:6px;line-height:1.4}
`;

export const CURVE_JS = `
var CV_W=360,CV_H=150,CV_NS='http://www.w3.org/2000/svg';
var CV_CLIP_PRESETS=['rampUp','rampDown','wobble','steps','random','beat'];
var CV_SHAPE_PRESETS=['pluck','swell','doubleHit','ramp','hump'];
var CV_NAMES={fixed:'Fixed',rampUp:'Ramp up',rampDown:'Ramp down',wobble:'Wobble',steps:'Steps',random:'Random',
  beat:'Beat sync',pluck:'Pluck',swell:'Swell',doubleHit:'Double hit',ramp:'Ramp',hump:'Hump',custom:'Custom'};
function cvClip(){return typeof CLIP!=='undefined'&&CLIP?CLIP:null}
function cvClipOk(){var c=cvClip();return !!(c&&isFinite(c.seconds)&&c.seconds>0&&isFinite(c.tempo)&&c.tempo>0)}
function cvClamp(v,a,b){return v<a?a:v>b?b:v}
function cvRange(tg){return {min:tg.min,max:tg.max,log:tg.log}}
function cvToDisp(v,r){v=cvClamp(Number(v),r.min,r.max);return r.log?Math.log(v/r.min)/Math.log(r.max/r.min):(v-r.min)/(r.max-r.min)}
function cvFromDisp(y,r){y=cvClamp(y,0,1);return r.log?r.min*Math.pow(r.max/r.min,y):r.min+y*(r.max-r.min)}
function cvBend(x,b){if(!b)return x;var k=1+3*Math.abs(b);return b>0?Math.pow(x,k):1-Math.pow(1-x,k)}
function cvNum(n){return String(Number(n.toFixed(6)))}
function cvParse(s){
  s=String(s||'').trim();var tok=s?s.split(/\\s+/):[];var out=[];
  for(var i=0;i+1<tok.length;i+=2){
    var vb=tok[i+1].split(':');var t=Number(tok[i]),v=Number(vb[0]),b=vb.length>1?Number(vb[1]):0;
    if(!isFinite(t)||!isFinite(v))continue;
    out.push({t:cvClamp(t,0,1),v:v,b:isFinite(b)?cvClamp(b,-1,1):0});
  }
  return out.sort(function(a,z){return a.t-z.t});
}
function cvSer(pts){return pts.map(function(p){return cvNum(p.t)+' '+cvNum(p.v)+(p.b?':'+cvNum(p.b):'')}).join(' ')}

// Preset generators, in display space (0–1 both axes). c = the fixed value's
// position, d = depth, rate = cycles/steps per clip (beats per step for beat).
function curvePreset(name,x){
  var c=x.c,d=x.d,lo=c-d/2,hi=c+d/2,n=Math.max(1,Math.round(x.rate||1)),pts=[],i,k,v;
  function P(t,y,b){pts.push({t:cvClamp(t,0,1),v:cvClamp(y,0,1),b:b||0})}
  switch(name){
    case 'rampUp':P(0,lo);P(1,hi);break;
    case 'rampDown':P(0,hi);P(1,lo);break;
    case 'wobble':for(i=0;i<=8*n;i++)P(i/(8*n),c+d/2*Math.sin(2*Math.PI*n*i/(8*n)));break;
    case 'steps':for(k=0;k<n;k++){v=c+d*(Math.random()-0.5);P(k/n,v);P((k+1)/n,v)}break;
    case 'random':for(i=0;i<=2*n;i++)P(i/(2*n),c+d*(Math.random()-0.5));break;
    case 'beat':
      var step=(x.rate*60/x.tempo)/x.seconds,cnt=Math.min(256,Math.ceil(1/step-1e-9));
      for(k=0;k<cnt;k++){v=k%2?lo:hi;P(k*step,v);P(Math.min(1,(k+1)*step),v)}break;
    case 'pluck':P(0,0);P(0.04,1);P(1,0,0.6);break;
    case 'swell':P(0,0);P(0.8,1,0.5);P(1,0);break;
    case 'doubleHit':P(0,0);P(0.03,1);P(0.4,0.15,0.5);P(0.45,0.9);P(1,0,0.5);break;
    case 'ramp':P(0,0);P(1,1);break;
    case 'hump':P(0,0);P(0.5,1,-0.5);P(1,0,0.5);break;
  }
  return pts;
}

// One drag at a time across every editor on the page; document listeners are bound once.
var CV_DRAG=null;
if(!window.__cvBound){
  window.__cvBound=true;
  document.addEventListener('pointermove',function(e){if(CV_DRAG)CV_DRAG.move(e)});
  document.addEventListener('pointerup',function(e){if(CV_DRAG){var d=CV_DRAG;CV_DRAG=null;d.up(e)}});
}

function buildCurves(row,p,state,init){
  var ui={};try{ui=JSON.parse(state[p.key]||'{}')||{}}catch(e){ui={}}
  ui.meta=ui.meta||{};
  p.targets.forEach(function(tg){
    if(state[tg.param]===undefined)state[tg.param]=(init&&init[tg.param]!==undefined)?init[tg.param]:tg.def;
    if(state[tg.curveKey]===undefined)state[tg.curveKey]=(init&&init[tg.curveKey]!==undefined)?init[tg.curveKey]:'';
  });
  var mode=String(state[p.modeKey]);
  // no modeKey / no modes: the target applies whatever the mode
  var valid=p.targets.filter(function(tg){return !p.modeKey||!tg.modes||tg.modes.indexOf(mode)>=0});
  if(!valid.length)return;
  var cur=valid.filter(function(tg){return tg.param===ui.target})[0]||valid[0];
  ui.target=cur.param;
  var disp=[]; // current target's points in display space ([] = fixed)
  function save(){state[p.key]=JSON.stringify(ui)}
  function meta(tg){return ui.meta[tg.param]||(ui.meta[tg.param]={})}
  function presetOf(tg){
    if(!state[tg.curveKey])return tg.kind==='shape'?'pluck':'fixed';
    return meta(tg).preset||'custom';
  }
  function load(){
    var r=cvRange(cur),pts=cvParse(state[cur.curveKey]);
    if(pts.length<2&&cur.kind==='shape')return curvePreset('pluck',{});
    if(pts.length<2)return [];
    return pts.map(function(q){return {t:q.t,v:cvToDisp(q.v,r),b:q.b}});
  }
  function store(pts){
    var r=cvRange(cur);
    state[cur.curveKey]=cvSer(pts.map(function(q){return {t:q.t,v:cvFromDisp(q.v,r),b:q.b}}));
  }
  function fmtVal(tg,v){return fmt({type:'slider',step:tg.step,log:tg.log,unit:tg.unit,display:tg.display},Number(v))}
  function presetCtx(tg,name){
    var m=meta(tg),c=cvClip();
    return {c:cvToDisp(state[tg.param],cvRange(tg)),d:m.depth!==undefined?m.depth:0.6,
      rate:name==='beat'?(m.beats||1):(m.rate||3),seconds:c?c.seconds:NaN,tempo:c?c.tempo:NaN};
  }
  function apply(name){
    var m=meta(cur);
    if(name==='fixed'){state[cur.curveKey]='';m.preset='fixed';disp=[];return}
    m.preset=name;disp=curvePreset(name,presetCtx(cur,name));store(disp);
  }

  row.className='row cv';
  row.innerHTML='<div class="top"><span class="lbl"></span></div><select class="cv-target"></select>'+
    '<div class="cv-chips"></div><svg class="cv-ed" viewBox="0 0 '+CV_W+' '+CV_H+'" preserveAspectRatio="none"></svg>'+
    '<div class="cv-axis"><span></span><span></span><span></span></div><div class="cv-ctl"></div><div class="cv-summary"></div>';
  row.querySelector('.lbl').textContent=p.label;
  var sel=row.querySelector('.cv-target'),chips=row.querySelector('.cv-chips'),svg=row.querySelector('svg.cv-ed'),
      axis=row.querySelectorAll('.cv-axis span'),ctl=row.querySelector('.cv-ctl'),summary=row.querySelector('.cv-summary');
  sel.setAttribute('aria-label',p.label);
  valid.forEach(function(tg){var o=document.createElement('option');o.value=tg.param;o.textContent=tg.label;sel.appendChild(o)});
  sel.value=cur.param;
  sel.addEventListener('change',function(){ui.target=sel.value;save();buildCurves(row,p,state,null)});

  function drawSummary(){
    summary.textContent=valid.map(function(tg){
      var pr=presetOf(tg);
      return tg.label+': '+(pr==='fixed'?fmtVal(tg,state[tg.param]):'\\u223f '+CV_NAMES[pr].toLowerCase());
    }).join('  \\u00b7  ');
  }
  function drawChips(){
    chips.innerHTML='';
    var list=cur.kind==='shape'?CV_SHAPE_PRESETS:['fixed'].concat(CV_CLIP_PRESETS),on=presetOf(cur);
    list.forEach(function(name){
      var b=document.createElement('button');b.type='button';b.className='cv-chip'+(name===on?' on':'');
      b.dataset.preset=name;b.textContent=CV_NAMES[name];
      if(name==='beat'&&!cvClipOk()){b.disabled=true;b.title='Needs the clip length and tempo'}
      b.addEventListener('click',function(){apply(name);save();refresh()});
      chips.appendChild(b);
    });
  }
  function slider(role,label,min,max,step,val,txt,on){
    var w=document.createElement('div');w.className='cv-s';
    w.innerHTML='<div class="top"><span class="lbl"></span><span class="val"></span></div>';
    w.querySelector('.lbl').textContent=label;var vs=w.querySelector('.val');vs.textContent=txt(val);
    var r=document.createElement('input');r.type='range';r.min=min;r.max=max;r.step=step;r.value=val;
    r.dataset.role=role;r.setAttribute('aria-label',label);paint(r);
    r.addEventListener('input',function(){var v=parseFloat(r.value);vs.textContent=txt(v);paint(r);on(v)});
    w.appendChild(r);ctl.appendChild(w);
  }
  function drawControls(){
    ctl.innerHTML='';
    var pr=presetOf(cur),m=meta(cur),rr=cvRange(cur);
    if(pr==='fixed'){
      slider('value',cur.label,0,1000,1,Math.round(cvToDisp(state[cur.param],rr)*1000),
        function(x){return fmtVal(cur,snap(cvFromDisp(x/1000,rr)))},
        function(x){state[cur.param]=snap(cvFromDisp(x/1000,rr));drawEditor();drawSummary()});
    }else if(cur.kind==='clip'&&CV_CLIP_PRESETS.indexOf(pr)>=0){
      var beat=pr==='beat';
      slider('rate',beat?'Beats / step':'Rate',beat?0.25:1,beat?8:16,beat?0.25:1,beat?(m.beats||1):(m.rate||3),
        function(x){return beat?x+' beats':x+' / clip'},
        function(x){if(beat)m.beats=x;else m.rate=x;apply(pr);save();drawEditor()});
      slider('depth','Depth',0,1,0.05,m.depth!==undefined?m.depth:0.6,
        function(x){return Math.round(x*100)+'%'},
        function(x){m.depth=x;apply(pr);save();drawEditor()});
    }
  }
  function snap(v){var s=cur.step||0.01;return Math.round(v/s)*s}
  function drawAxis(){
    var c=cvClip(),r=cvRange(cur);
    if(cur.kind==='shape'){axis[0].textContent='start';axis[1].textContent='one envelope';axis[2].textContent='end'}
    else{
      axis[0].textContent='0 s';
      axis[1].textContent=cur.label+' '+cvNum(r.min)+' \\u2013 '+cvNum(r.max)+(r.log?' (log)':'');
      axis[2].textContent=cvClipOk()?c.seconds.toFixed(2)+' s':'clip end';
    }
  }
  function el(tag,attrs){var e=document.createElementNS(CV_NS,tag);for(var k in attrs)e.setAttribute(k,attrs[k]);svg.appendChild(e);return e}
  function X(t){return t*CV_W}
  function Y(v){return (1-v)*CV_H}
  function drawEditor(){
    while(svg.firstChild)svg.removeChild(svg.firstChild);
    el('rect',{'class':'cv-bg',x:0,y:0,width:CV_W,height:CV_H});
    var c=cvClip(),i;
    if(cur.kind==='clip'&&c&&c.peaks&&c.peaks.length>1){
      var n=c.peaks.length,top=[],bot=[];
      for(i=0;i<n;i++){var x=X(i/(n-1)),a=cvClamp(c.peaks[i],0,1)*(CV_H/2-5);top.push(x+','+(CV_H/2-a));bot.unshift(x+','+(CV_H/2+a))}
      el('polygon',{'class':'cv-wave',points:top.concat(bot).join(' ')});
    }else for(i=1;i<4;i++)el('line',{'class':'cv-grid',x1:X(i/4),x2:X(i/4),y1:0,y2:CV_H});
    if(!disp.length){var y=Y(cvToDisp(state[cur.param],cvRange(cur)));el('line',{'class':'cv-flat',x1:0,x2:CV_W,y1:y,y2:y});return}
    var d='M'+X(disp[0].t)+','+Y(disp[0].v);
    for(i=1;i<disp.length;i++){
      var a0=disp[i-1],z=disp[i];
      if(z.b){for(var k=1;k<=8;k++){var f=k/8;d+=' L'+X(a0.t+(z.t-a0.t)*f)+','+Y(a0.v+(z.v-a0.v)*cvBend(f,z.b))}}
      else d+=' L'+X(z.t)+','+Y(z.v);
    }
    el('path',{'class':'cv-line',d:d});
    disp.forEach(function(q,j){el('circle',{'class':'cv-pt',cx:X(q.t),cy:Y(q.v),r:4,'data-i':j})});
  }
  function refresh(){drawChips();drawEditor();drawAxis();drawControls();drawSummary()}

  // --- pointer editing (Live-style: click adds, click a point deletes, Shift = fine, Alt-drag bends) ---
  function at(e){
    var r=svg.getBoundingClientRect();if(!r.width||!r.height)return null;
    return {t:cvClamp((e.clientX-r.left)/r.width,0,1),y:cvClamp(1-(e.clientY-r.top)/r.height,0,1)};
  }
  function commit(){store(disp);meta(cur).preset='custom';save();refresh()}
  svg.addEventListener('pointerdown',function(e){
    var pos=at(e);if(!pos)return;
    if(e.preventDefault)e.preventDefault();
    // keep receiving moves and the release even if the pointer leaves the dialog
    if(e.pointerId!==undefined&&svg.setPointerCapture){try{svg.setPointerCapture(e.pointerId)}catch(_){}}
    if(!disp.length){var c0=cvToDisp(state[cur.param],cvRange(cur));disp=[{t:0,v:c0,b:0},{t:1,v:c0,b:0}]}
    var tgt=e.target,idx=tgt&&tgt.getAttribute&&tgt.getAttribute('class')==='cv-pt'?Number(tgt.getAttribute('data-i')):-1;
    var drag;
    if(idx>=0){
      drag={kind:'pt',i:idx,t0:disp[idx].t,v0:disp[idx].v,x0:pos.t,y0:pos.y,moved:false,isNew:false};
    }else if(e.altKey){
      var s=1;while(s<disp.length-1&&disp[s].t<pos.t)s++;
      drag={kind:'bend',i:s,b0:disp[s].b,y0:pos.y,moved:false};
    }else{
      var ins=1;while(ins<disp.length-1&&disp[ins].t<=pos.t)ins++;
      disp.splice(ins,0,{t:pos.t,v:pos.y,b:0});
      drag={kind:'pt',i:ins,t0:pos.t,v0:pos.y,x0:pos.t,y0:pos.y,moved:false,isNew:true};
      drawEditor();
    }
    CV_DRAG={
      move:function(ev){
        var q=at(ev);if(!q)return;
        if(drag.kind==='bend'){disp[drag.i].b=cvClamp(drag.b0-(q.y-drag.y0)*2,-1,1);drag.moved=true;drawEditor();return}
        var k=ev.shiftKey?0.2:1,pt=disp[drag.i],last=disp.length-1,r=svg.getBoundingClientRect();
        // a click with a few pixels of hand jitter is still a click (and deletes the point)
        if(Math.abs(q.t-drag.x0)*r.width+Math.abs(q.y-drag.y0)*r.height>4)drag.moved=true;
        pt.v=cvClamp(drag.v0+(q.y-drag.y0)*k,0,1);
        if(drag.i===0)pt.t=0;else if(drag.i===last)pt.t=1;
        else pt.t=cvClamp(drag.t0+(q.t-drag.x0)*k,disp[drag.i-1].t,disp[drag.i+1].t);
        drawEditor();
      },
      up:function(){
        var last=disp.length-1;
        if(drag.kind==='pt'&&!drag.moved&&!drag.isNew&&drag.i>0&&drag.i<last)disp.splice(drag.i,1);
        commit();
      }
    };
  });

  disp=load();
  save();
  refresh();
}
`;
