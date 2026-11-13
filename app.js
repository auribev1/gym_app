/* Gym App · todo se guarda en este dispositivo (localStorage) */
(function(){
'use strict';
const D=window.GYM_DATA, KEY='gymapp.v1', VERSION='1.1';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const clone=o=>JSON.parse(JSON.stringify(o));
const num=v=>{if(v===''||v==null)return NaN;return parseFloat(String(v).replace(',','.'))};
const fmt=n=>isFinite(n)?(Math.round(n*100)/100).toLocaleString('es-ES',{maximumFractionDigits:2}):'';
const e1rm=(kg,r)=>(kg>0&&r>0)?kg*(1+r/30):0;
const DAY=86400000;
const WD=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const dstr=t=>new Date(t).toLocaleDateString('es-ES',{day:'numeric',month:'short'});
const dlong=t=>new Date(t).toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
const ago=t=>{const d=Math.floor((Date.now()-t)/DAY);return d<=0?'hoy':d===1?'ayer':`hace ${d} días`};

// ---------------- estado ----------------
function defaultState(){
  return {v:1,routines:clone(D.ROUTINES),active:'mi5',ptr:{},cycles:{},sessions:[],current:null,exNotes:{},body:[],customEx:{},
   settings:{restC:150,restA:75,sound:true,showRIR:false,inc:{maquina:5,polea:2.5,smith:2.5,barra:2.5,mancuerna:2,corporal:0},deloadEvery:7,daysOverride:0,mode:'rotation',backupEvery:14},
   fixed:{},deload:{active:false,lastAt:0,startCycle:0,snooze:-1},lastBackup:0,timer:null,created:Date.now()};
}
function load(){try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.v){const d=defaultState();s.settings=Object.assign(d.settings,s.settings||{});s.settings.inc=Object.assign(d.settings.inc,s.settings.inc||{});
  for(const k in d)if(!(k in s))s[k]=d[k];return s}}catch(e){}return defaultState()}
let S=load();
let saveT=null;
function save(now){clearTimeout(saveT);const f=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){toast('⚠️ No se pudo guardar (almacenamiento lleno)')}};if(now)f();else saveT=setTimeout(f,250)}
window.addEventListener('pagehide',()=>save(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)save(true);else tick()});
try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}

const ui={tab:'hoy',sheet:null,planEdit:null,planView:null,sel:[],selMode:false,progSeg:'ej',progEx:null,metric:'e1rm',lib:{q:'',m:'',e:'',t:''},confirm:null,openDays:{}};

// ---------------- helpers de datos ----------------
function ex(id){const c=S.customEx[id];const a=c?[c.name,c.type,c.equip,c.primary,c.secondary||[],c.pattern]:D.EX[id];
  if(!a)return {id,name:id,type:'A',equip:'maquina',primary:'abdomen',secondary:[],pattern:'curl'};
  return {id,name:a[0],type:a[1],equip:a[2],primary:a[3],secondary:a[4],pattern:a[5],custom:!!c}}
const allEx=()=>[...Object.keys(D.EX),...Object.keys(S.customEx)];
const routine=id=>S.routines.find(r=>r.id===id)||S.routines[0];
const activeR=()=>routine(S.active);
const incFor=id=>{const e=ex(id);return S.settings.inc[e.equip]??2.5};
const restFor=id=>ex(id).type==='C'?S.settings.restC:S.settings.restA;
const repTxt=t=>`${t.repMin}–${t.repMax}${t.suf||''}`;
const working=sets=>sets.filter(s=>s.done&&!s.warm&&num(s.reps)>0);
function history(exId){ // [{date, sets}] cronológico
  const out=[];for(const s of S.sessions){for(const it of s.items){if(it.exId===exId){const w=working(it.sets);if(w.length)out.push({date:s.start,sets:w,sid:s.id})}}}return out}
function lastPerf(exId){for(let i=S.sessions.length-1;i>=0;i--){const s=S.sessions[i];for(const it of s.items)if(it.exId===exId){const w=working(it.sets);if(w.length)return {date:s.start,sets:w}}}return null}
function bestE(exId,excludeCurrent){let b=0;for(const h of history(exId))for(const s of h.sets)b=Math.max(b,e1rm(num(s.kg),num(s.reps)));return b}
function suggestion(exId,t){
  const lp=lastPerf(exId),inc=incFor(exId);
  if(!lp)return {kg:'',kind:'new',text:`Primera vez: elige un peso con el que llegues a ${t.repMin}–${t.repMax} reps dejando RIR ${t.rir}`};
  const w=lp.sets;const kg=Math.max(...w.map(s=>num(s.kg)||0));
  const allTop=w.length>=t.sets&&w.every(s=>num(s.reps)>=t.repMax);
  if(allTop&&inc>0)return {kg:fmt(kg+inc),kind:'up',text:`▲ La última vez llegaste a ${t.repMax} en todas: sube a ${fmt(kg+inc)} kg`};
  if(allTop)return {kg:kg?fmt(kg):'',kind:'up',text:'▲ Tope del rango alcanzado: añade lastre o usa una variante más difícil'};
  if(w.some(s=>num(s.reps)<t.repMin))return {kg:kg?fmt(kg):'',kind:'hold',text:`Mantén ${fmt(kg)} kg: alguna serie quedó por debajo de ${t.repMin}. Si se repite, baja un poco el peso.`};
  return {kg:kg?fmt(kg):'',kind:'hold',text:`Mantén ${fmt(kg)} kg y busca +1 repetición`};
}
function groupLetters(items){const m={};let n=0;items.forEach(it=>{if(it.group&&!(it.group in m))m[it.group]=String.fromCharCode(65+n++)});return m}
function runs(items){ // agrupa consecutivos con mismo grupo
  const out=[];items.forEach((it,i)=>{const last=out[out.length-1];if(it.group&&last&&last.g===it.group)last.idx.push(i);else out.push({g:it.group,idx:[i]})});
  return out.map(r=>r.idx.length<2?{g:null,idx:r.idx}:r)}
function cleanGroups(items){const c={};items.forEach(it=>{if(it.group)c[it.group]=(c[it.group]||0)+1});items.forEach(it=>{if(it.group&&c[it.group]<2)it.group=null})}
function estMin(items){let t=0;runs(items).forEach(r=>{const its=r.idx.map(i=>items[i]);const rounds=Math.max(...its.map(it=>it.sets));
  const rest=Math.max(...its.map(it=>restFor(it.ex)));t+=rounds*(its.length*45+rest)});return Math.round(t/60+8)}
function daysPerWeek(){if(S.settings.daysOverride)return S.settings.daysOverride;
  const since=Date.now()-28*DAY;const n=S.sessions.filter(s=>s.start>=since).length;const first=S.sessions[0];
  if(!first||Date.now()-first.start<14*DAY||n<3)return 4;return Math.max(1,Math.min(7,Math.round(n/4*10)/10))}
function cyc(rid){return S.cycles[rid]||0}

// ---------------- render ----------------
const ICONS={hoy:'<path d="M6 12h3M15 12h3M9 8v8M15 8v8M3 10v4M21 10v4"/>',plan:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
 prog:'<path d="M4 19V5M4 19h16M7 15l4-4 3 3 5-6"/>',vol:'<rect x="4" y="12" width="3.5" height="8" rx="1"/><rect x="10.25" y="7" width="3.5" height="13" rx="1"/><rect x="16.5" y="3" width="3.5" height="17" rx="1"/>',
 aj:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'};
function tabs(){const T=[['hoy','Hoy'],['plan','Plan'],['prog','Progreso'],['vol','Volumen'],['aj','Ajustes']];
  return `<nav class="tabs">${T.map(([k,l])=>`<button data-a="tab" data-v="${k}" class="${ui.tab===k?'on':''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>${l}</button>`).join('')}</nav>`}
let lastTab=null;
function render(){
  const y=window.scrollY;const key=ui.tab+'|'+(ui.planEdit||'')+'|'+(ui.planView||'')+'|'+(ui.progEx||'')+'|'+(S.current?S.current.id:'')+'|'+ui.progSeg;const same=lastTab===key;
  const scr={hoy:Hoy,plan:Plan,prog:Prog,vol:Vol,aj:Ajustes}[ui.tab];
  $('#main').innerHTML=scr();$('#tabs').innerHTML=tabs();renderSheet();
  if(same)window.scrollTo(0,y);else window.scrollTo(0,0);lastTab=key;
  tick();
}

// ---------------- HOY ----------------
function nextDayIdx(r){if(S.settings.mode==='fixed'){const wd=(new Date().getDay()+6)%7;const m=S.fixed[r.id]||{};const i=r.days.findIndex(d=>m[d.id]===wd);return i}
  return (S.ptr[r.id]||0)%r.days.length}
function banners(){let h='';const r=activeR();
  if(S.sessions.length&&Date.now()-(S.lastBackup||S.created)>S.settings.backupEvery*DAY)
    h+=`<div class="banner w"><span class="grow">💾 Hace más de ${S.settings.backupEvery} días que no haces copia de seguridad.</span><button class="btn sm" data-a="exportJSON">Hacer copia</button></div>`;
  const dl=S.deload;
  if(dl.active)h+=`<div class="banner ok">🧘 Vuelta de descarga activa: mismos pesos, mitad de series. Termina al acabar esta vuelta.</div>`;
  else if(dl.snooze<cyc(r.id)&&(cyc(r.id)-dl.lastAt>=S.settings.deloadEvery||stagnation()))
    h+=`<div class="banner w"><span class="grow">📉 ${cyc(r.id)-dl.lastAt>=S.settings.deloadEvery?`Llevas ${cyc(r.id)-dl.lastAt} vueltas seguidas`:'Varios básicos llevan 2 vueltas sin progresar'}. Toca una vuelta de descarga.</span><span class="col"><button class="btn sm pri" data-a="deloadOn">Activar</button><button class="btn sm ghost" data-a="deloadSnooze">Ahora no</button></span></div>`;
  return h}
function stagnation(){const r=activeR();const ids=[...new Set(r.days.flatMap(d=>d.items.map(i=>i.ex)))].filter(id=>ex(id).type==='C');
  let n=0,st=0;ids.forEach(id=>{const h=history(id);if(h.length<3)return;n++;const e=h.map(x=>Math.max(...x.sets.map(s=>e1rm(num(s.kg),num(s.reps)))));
    const L=e.length;if(Math.max(e[L-1],e[L-2])<=e[L-3])st++});return n>=3&&st>=Math.ceil(n/2)}
function Hoy(){
  if(S.current)return Session();
  const r=activeR();let h=`<div class="row sp" style="margin-top:6px"><div><div class="k">${esc(r.name)}</div><h1>Hoy</h1></div></div>`;
  h+=banners();
  const i=nextDayIdx(r);
  if(i<0){h+=`<div class="card"><div class="k">Días fijos</div><h2 style="margin:6px 0">Hoy toca descanso</h2><div class="mu sm">Según tu calendario fijo no hay entreno hoy. Si quieres, empieza cualquier día:</div></div>`}
  else{const d=r.days[i];const n=d.items.reduce((a,b)=>a+b.sets,0);
    h+=`<div class="card"><div class="k">Vuelta ${cyc(r.id)+1} · Día ${i+1} de ${r.days.length}</div>
     <div class="row sp" style="margin:4px 0 8px"><div class="big">${esc(d.name)}</div><span class="chip">~${estMin(d.items)} min</span></div>
     <div class="mu sm">${d.items.length} ejercicios · ${S.deload.active?Math.ceil(n/2)+' series (descarga)':n+' series'}</div>
     <div class="hr"></div><div class="col sm">${d.items.map(it=>`<div class="row sp"><span>${esc(ex(it.ex).name)}${it.group?` <span class="chip" style="padding:1px 6px">SS</span>`:''}</span><span class="mu">${it.sets}×${repTxt(it)}</span></div>`).join('')}</div>
     <button class="btn pri full" style="margin-top:14px" data-a="start" data-d="${d.id}">Empezar ${esc(d.name)}</button></div>`}
  h+=`<div class="row sp" style="margin:16px 2px 6px"><div class="k">Elegir otro día</div><button class="lnk" data-a="viewR" data-id="${r.id}" data-from="hoy">Ver mi rutina completa ›</button></div><div class="chips">${r.days.map((d,j)=>`<button class="fchip" data-a="start" data-d="${d.id}">${j+1} · ${esc(d.name)}</button>`).join('')}</div>`;
  const last=S.sessions[S.sessions.length-1];
  if(last)h+=`<div class="card row"><div class="grow"><div class="k">Último entreno</div><div class="b">${esc(last.dayName)} · ${ago(last.start)}</div><div class="mu sm">${sessSets(last)} series · ${Math.round((last.end-last.start)/60000)} min${last.prs?` · 🏆 ${last.prs} récord${last.prs>1?'s':''}`:''}</div></div><button class="lnk" data-a="viewSess" data-id="${last.id}">Ver</button></div>`;
  // semana
  const mon=new Date();mon.setHours(0,0,0,0);mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
  const days=[...Array(7)].map((_,k)=>{const t0=mon.getTime()+k*DAY;return S.sessions.some(s=>s.start>=t0&&s.start<t0+DAY)});
  h+=`<div class="card"><div class="k">Esta semana · ${days.filter(Boolean).length} entrenos</div><div class="row sp" style="margin-top:10px">${days.map((on,k)=>`<div class="col" style="align-items:center;gap:4px"><span class="xs mu">${WD[k][0]}</span><span style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;${on?'background:var(--ac);color:#000;font-weight:800':'background:var(--card2)'}">${on?'✓':''}</span></div>`).join('')}</div></div>`;
  return h}
const sessSets=s=>s.items.reduce((a,it)=>a+working(it.sets).length,0);

function makeItem(pi,exId,deload){
  const t={sets:deload?Math.max(1,Math.ceil(pi.sets/2)):pi.sets,repMin:pi.repMin,repMax:pi.repMax,rir:pi.rir,suf:pi.suf||''};
  const sug=suggestion(exId,t);
  return {uid:uid(),exId,planEx:pi.ex,alts:(pi.alts||[]).slice(),group:pi.group,target:t,sug,skipped:false,
    sets:[...Array(t.sets)].map(()=>({kg:sug.kg,reps:'',rir:'',warm:false,done:false}))}}
function startSession(dayId){const r=activeR();const d=r.days.find(x=>x.id===dayId);
  S.current={id:uid(),routineId:r.id,routineName:r.name,dayId:d.id,dayName:d.name,dayIdx:r.days.indexOf(d),start:Date.now(),deload:S.deload.active,
    items:d.items.map(pi=>makeItem(pi,pi.ex,S.deload.active)),cardio:{min:'',speed:'',incl:''}};
  save(true);render()}

function Session(){
  const c=S.current;const r=routine(c.routineId);const L=groupLetters(c.items);
  let tot=0,done=0,rem=0;c.items.forEach(it=>{if(it.skipped)return;it.sets.forEach(s=>{if(s.warm)return;tot++;if(s.done)done++;else rem+=45+restFor(it.exId)})});
  const el=Math.round((Date.now()-c.start)/60000);
  let h=`<div class="shead"><div class="row sp"><div class="grow"><div class="k">Vuelta ${cyc(r.id)+1} · Día ${c.dayIdx+1} de ${r.days.length}${c.deload?' · Descarga':''}</div><h1>${esc(c.dayName)}</h1></div>
   <button class="btn sm pri" data-a="finish">Terminar</button></div>
   <div class="prog" style="margin:10px 0 4px"><i style="width:${tot?done/tot*100:0}%"></i></div>
   <div class="row sp xs mu"><span>${done} de ${tot} series · ${el} min</span><span>~${Math.round(rem/60)} min restantes</span></div></div>`;
  runs(c.items).forEach(run=>{
    const cards=run.idx.map(i=>exCard(c.items[i],i)).join('');
    h+=run.g?`<div class="ss"><div class="lbl">⛓ Superserie ${L[run.g]} · sin descanso entre ejercicios</div>${cards}</div>`:cards});
  h+=`<div class="card"><h3>Cardio</h3><div class="mu sm" style="margin:4px 0 6px">Opcional, al final.</div><div class="grid3">
   <div class="field"><label>Minutos</label><input inputmode="numeric" data-in="cardio" data-f="min" value="${esc(c.cardio.min)}" placeholder="25"></div>
   <div class="field"><label>Km/h</label><input inputmode="decimal" data-in="cardio" data-f="speed" value="${esc(c.cardio.speed)}" placeholder="4"></div>
   <div class="field"><label>Inclinación %</label><input inputmode="decimal" data-in="cardio" data-f="incl" value="${esc(c.cardio.incl)}" placeholder="12"></div></div></div>
   <button class="btn pri full" data-a="finish" style="margin-top:6px">Terminar entreno</button>
   <button class="btn ghost full danger" data-a="cancelSess" style="margin-top:8px">${ui.confirm==='cancel'?'Toca otra vez para descartar el entreno':'Descartar entreno'}</button>`;
  return h}
function exCard(it,i){
  const e=ex(it.exId);
  if(it.skipped)return `<div class="card ex skipped row sp"><div><div class="nm">${esc(e.name)}</div><div class="tg">Saltado</div></div><button class="btn sm" data-a="unskip" data-i="${i}">Recuperar</button></div>`;
  const lp=lastPerf(it.exId);const note=S.exNotes[it.exId];const rir=S.settings.showRIR;
  let wn=0;
  const rows=it.sets.map((s,j)=>{const lbl=s.warm?'C':String(++wn);const prev=lp&&!s.warm?lp.sets[Math.min(wn-1,lp.sets.length-1)]:null;
    const phR=prev?prev.reps:(s.warm?'':it.target.repMax);
    return `<div class="set ${rir?'rir':''} ${s.done?'done':''} ${s.warm?'warm':''}"><div class="n" data-a="setMenu" data-i="${i}" data-s="${j}">${lbl}</div>
     <input inputmode="decimal" data-in="kg" data-i="${i}" data-s="${j}" value="${esc(s.kg)}" placeholder="${prev?esc(prev.kg):'kg'}" aria-label="kg">
     <input inputmode="numeric" data-in="reps" data-i="${i}" data-s="${j}" value="${esc(s.reps)}" placeholder="${esc(phR)}" aria-label="reps">
     ${rir?`<input inputmode="numeric" data-in="rir" data-i="${i}" data-s="${j}" value="${esc(s.rir)}" placeholder="RIR">`:''}
     <button class="ck" data-a="check" data-i="${i}" data-s="${j}">✓</button></div>`}).join('');
  // pista en vivo
  const w=working(it.sets);let live='';
  if(w.length>=it.target.sets&&w.every(s=>num(s.reps)>=it.target.repMax)){const inc=incFor(it.exId);const kg=Math.max(...w.map(s=>num(s.kg)||0));
    live=`<div class="sug up">🔥 ¡Todas al tope! La próxima vez: ${inc&&kg?fmt(kg+inc)+' kg':'variante más difícil'}</div>`}
  return `<div class="card ex" id="it${i}">
   <div class="row sp" style="align-items:flex-start"><div class="grow" data-a="info" data-id="${it.exId}"><div class="nm">${esc(e.name)}</div>
    <div class="row wrap" style="gap:6px;margin-top:6px"><span class="chip">${D.MUSCLES[e.primary]||''}</span><span class="tg">${it.target.sets} × ${repTxt(it.target)} · RIR ${esc(it.target.rir)}</span></div></div>
    <div class="row" style="gap:6px"><button class="icb" data-a="alt" data-i="${i}" title="Alternativa">⇄</button><button class="icb" data-a="exMenu" data-i="${i}">⋯</button></div></div>
   ${it.exId!==it.planEx?`<div class="xs ac" style="margin-top:6px">Alternativa de: ${esc(ex(it.planEx).name)}</div>`:''}
   <div class="last">${lp?`Última vez (${dstr(lp.date)}): ${lp.sets.map(s=>`${fmt(num(s.kg))||'–'}×${s.reps}`).join(' · ')}`:'Sin registros todavía'}</div>
   ${note?`<div class="note" data-a="info" data-id="${it.exId}">📝 ${esc(note)}</div>`:''}
   <div class="set ${rir?'rir':''} xs mu" style="margin:2px 0 -4px"><span></span><span style="text-align:center">kg</span><span style="text-align:center">reps</span>${rir?'<span style="text-align:center">RIR</span>':''}<span></span></div>
   ${rows}
   <div class="row" style="gap:14px;margin-top:2px"><button class="lnk" data-a="addSet" data-i="${i}">+ Serie</button><button class="lnk" data-a="addWarm" data-i="${i}">+ Calentamiento</button></div>
   ${live||`<div class="sug ${it.sug.kind==='up'?'up':''}">${esc(it.sug.text)}</div>`}
  </div>`}

// ---------------- PLAN ----------------
function Plan(){
  if(ui.planEdit)return PlanEdit();
  if(ui.planView)return PlanView();
  let h=`<h1 style="margin-top:6px">Plan</h1>
   <div class="seg"><button data-a="mode" data-v="rotation" class="${S.settings.mode==='rotation'?'on':''}">Rotación</button><button data-a="mode" data-v="fixed" class="${S.settings.mode==='fixed'?'on':''}">Días fijos</button></div>
   <div class="mu sm" style="margin:0 2px 6px">${S.settings.mode==='rotation'?'Haces los días en orden y vuelves al primero, sin importar el día de la semana.':'Cada día de la rutina va asignado a un día de la semana (asígnalos en Editar).'}</div>`;
  S.routines.forEach(r=>{const on=r.id===S.active;
    h+=`<div class="card" style="${on?'border-color:var(--ac)':''}"><div class="row sp"><div class="grow"><h3>${esc(r.name)}</h3><div class="mu sm">${esc(r.desc||'')}</div></div>${on?'<span class="chip">Activa</span>':''}</div>
     <div class="mu xs" style="margin:6px 0 10px">${r.days.length} días · ${r.days.map(d=>esc(d.name)).join(' · ')}</div>
     <div class="row wrap" style="gap:8px"><button class="btn sm ${on?'pri':''}" data-a="viewR" data-id="${r.id}">Ver rutina</button>${on?'':`<button class="btn sm pri" data-a="useR" data-id="${r.id}">Usar esta</button>`}<button class="btn sm" data-a="editR" data-id="${r.id}">Editar</button><button class="btn sm" data-a="dupR" data-id="${r.id}">Duplicar</button>${S.routines.length>1&&!on?`<button class="btn sm ghost danger" data-a="delR" data-id="${r.id}">${ui.confirm==='delR'+r.id?'¿Seguro?':'Borrar'}</button>`:''}</div></div>`});
  h+=`<button class="btn full" data-a="newR">+ Nueva rutina</button>`;
  return h}
function PlanEdit(){
  const r=routine(ui.planEdit);const fixed=S.settings.mode==='fixed';const fm=S.fixed[r.id]||{};
  let h=`<div class="row" style="margin-top:6px"><button class="icb" data-a="planBack">‹</button><div class="k grow">Editar rutina</div></div>
   <div class="field"><label>Nombre</label><input data-in="rname" value="${esc(r.name)}"></div>
   <div class="sel">${ui.selMode?`<div class="row" style="gap:8px"><button class="btn sm pri grow" data-a="ssJoin">⛓ Unir en superserie (${ui.sel.length})</button><button class="btn sm grow" data-a="ssSplit">Quitar superserie</button><button class="btn sm ghost" data-a="selOff">✕</button></div>
     <div class="xs mu" style="margin-top:6px">Marca 2 o más ejercicios del mismo día. Al unirlos se colocan seguidos.</div>`:`<button class="btn sm full" data-a="selOn">⛓ Superseries: seleccionar ejercicios</button>`}</div>`;
  r.days.forEach((d,di)=>{const L=groupLetters(d.items);const open=ui.openDays[d.id]!==false;
    h+=`<div class="card"><div class="row sp"><button class="row grow" data-a="toggleDay" data-id="${d.id}" style="text-align:left"><span class="mu">${open?'▾':'▸'}</span><h3>${di+1} · ${esc(d.name)}</h3></button><span class="mu xs">~${estMin(d.items)} min</span></div>`;
    if(open){
      h+=`<div class="grid2" style="margin-top:6px"><div class="field"><label>Nombre del día</label><input data-in="dname" data-d="${d.id}" value="${esc(d.name)}"></div>
       ${fixed?`<div class="field"><label>Día de la semana</label><select data-in="dwd" data-d="${d.id}"><option value="">—</option>${WD.map((w,k)=>`<option value="${k}" ${fm[d.id]===k?'selected':''}>${w}</option>`).join('')}</select></div>`:'<div></div>'}</div>`;
      d.items.forEach((it,ii)=>{const e=ex(it.ex);const sel=ui.sel.includes(d.id+':'+ii);
        h+=`<div class="pit">${ui.selMode?`<span class="ckb ${sel?'on':''}" data-a="selT" data-k="${d.id}:${ii}">${sel?'✓':''}</span>`:''}<span class="gbar ${it.group?'on':''}"></span>
         <div class="grow" data-a="${ui.selMode?'selT':'editItem'}" data-k="${d.id}:${ii}" data-d="${d.id}" data-ii="${ii}"><div class="b">${esc(e.name)} ${it.group?`<span class="chip">SS ${L[it.group]}</span>`:''}</div>
          <div class="mu sm">${it.sets} × ${repTxt(it)} · RIR ${esc(it.rir)} · ${it.alts.length} alternativa${it.alts.length===1?'':'s'}</div></div>
         ${ui.selMode?'':`<button class="icb" data-a="mvItem" data-d="${d.id}" data-ii="${ii}" data-v="-1">↑</button><button class="icb" data-a="mvItem" data-d="${d.id}" data-ii="${ii}" data-v="1">↓</button>`}</div>`});
      h+=`<div class="row wrap" style="gap:8px;margin-top:10px"><button class="btn sm pri" data-a="addEx" data-d="${d.id}">+ Ejercicio</button><button class="btn sm" data-a="mvDay" data-d="${d.id}" data-v="-1">↑ Día</button><button class="btn sm" data-a="mvDay" data-d="${d.id}" data-v="1">↓ Día</button><button class="btn sm" data-a="dupDay" data-d="${d.id}">Duplicar</button>${r.days.length>1?`<button class="btn sm ghost danger" data-a="delDay" data-d="${d.id}">${ui.confirm==='delDay'+d.id?'¿Seguro?':'Borrar día'}</button>`:''}</div>`}
    h+=`</div>`});
  h+=`<button class="btn full" data-a="addDay">+ Añadir día</button>`;
  return h}

function PlanView(){
  const r=routine(ui.planView);const on=r.id===S.active;
  let h=`<div class="row" style="margin-top:6px"><button class="icb" data-a="viewBack">‹</button><div class="grow"><div class="k">${on?'Rutina activa':'Rutina'}</div><h2 style="margin:2px 0">${esc(r.name)}</h2></div><button class="btn sm" data-a="editR" data-id="${r.id}">Editar</button></div>
   <div class="mu sm" style="margin:2px 2px 6px">${esc(r.desc||'')}</div><div class="mu xs" style="margin:0 2px 4px">Toca un ejercicio para ver su técnica, animación, alternativas e historial.</div>`;
  const nx=on?nextDayIdx(r):-1;
  r.days.forEach((d,di)=>{const L=groupLetters(d.items);const n=d.items.reduce((a,b)=>a+b.sets,0);
    h+=`<div class="card" style="${di===nx?'border-color:var(--ac)':''}"><div class="row sp"><div><div class="k">Día ${di+1}${di===nx?' · Siguiente':''}</div><h3 style="font-size:19px;margin-top:2px">${esc(d.name)}</h3></div><span class="chip g">${n} series · ~${estMin(d.items)} min</span></div><div style="margin-top:6px">`;
    runs(d.items).forEach(run=>{
      const rows=run.idx.map(ii=>{const it=d.items[ii],e=ex(it.ex);const lp=lastPerf(it.ex);
        return `<div class="li" data-a="infoPlan" data-rid="${r.id}" data-did="${d.id}" data-ii="${ii}">${Anim.svg(e.pattern).replace('class="anim"','class="anim mini"')}
          <div class="grow"><div class="b">${esc(e.name)}</div><div class="xs mu">${it.sets} × ${repTxt(it)} · RIR ${esc(it.rir)} · ${D.MUSCLES[e.primary]}</div>${lp?`<div class="xs ac">Última: ${lp.sets.map(s=>`${fmt(num(s.kg))||'–'}×${s.reps}`).slice(0,3).join(' · ')}</div>`:''}</div><span class="mu">›</span></div>`}).join('');
      h+=run.g?`<div class="ss" style="margin:8px 0"><div class="lbl">⛓ Superserie ${L[run.g]}</div>${rows}</div>`:rows});
    h+=`</div>${on?`<button class="btn sm full" style="margin-top:10px" data-a="start" data-d="${d.id}">Empezar este día</button>`:''}</div>`});
  return h}

// ---------------- PROGRESO ----------------
function Prog(){
  if(ui.progEx)return ProgEx();
  let h=`<h1 style="margin-top:6px">Progreso</h1><div class="seg">${[['ej','Ejercicios'],['hist','Historial'],['body','Cuerpo'],['cal','Calendario']].map(([k,l])=>`<button data-a="pseg" data-v="${k}" class="${ui.progSeg===k?'on':''}">${l}</button>`).join('')}</div>`;
  if(ui.progSeg==='ej'){
    const m={};S.sessions.forEach(s=>s.items.forEach(it=>{const w=working(it.sets);if(!w.length)return;const b=Math.max(...w.map(x=>e1rm(num(x.kg),num(x.reps))));
      const o=m[it.exId]||(m[it.exId]={n:0,last:0,best:0,first:b,lastE:b});o.n++;o.last=s.start;o.best=Math.max(o.best,b);o.lastE=b}));
    const ids=Object.keys(m).sort((a,b)=>m[b].last-m[a].last);
    if(!ids.length)return h+`<div class="empty">Cuando registres tu primer entreno, aquí verás la evolución de cada ejercicio.</div>`;
    h+=`<input placeholder="Buscar ejercicio" data-in="pq" value="${esc(ui.pq||'')}" style="margin-bottom:6px">`;
    const q=(ui.pq||'').toLowerCase();
    h+=`<div class="card" style="padding:4px 14px">${ids.filter(id=>ex(id).name.toLowerCase().includes(q)).map(id=>{const o=m[id];const d=o.first?Math.round((o.lastE/o.first-1)*100):0;
      return `<div class="li" data-a="openEx" data-id="${id}"><div class="grow"><div class="b">${esc(ex(id).name)}</div><div class="mu xs">${o.n} sesiones · última ${dstr(o.last)}</div></div>
       <div style="text-align:right"><div class="b">${fmt(Math.round(o.best))} kg</div><div class="xs ${d>0?'ac':'mu'}">${d>0?'▲ '+d+'%':d<0?'▼ '+(-d)+'%':'='}</div></div></div>`}).join('')}</div>
     <div class="xs mu" style="margin:0 4px">Cifra = fuerza estimada (1RM) de tu mejor serie. % = cambio desde la primera sesión.</div>`}
  if(ui.progSeg==='hist'){
    if(!S.sessions.length)return h+`<div class="empty">Aún no hay entrenos guardados.</div>`;
    h+=`<div class="card" style="padding:4px 14px">${S.sessions.slice().reverse().map(s=>`<div class="li" data-a="viewSess" data-id="${s.id}"><div class="grow"><div class="b">${esc(s.dayName)} <span class="mu xs">· ${esc(s.routineName)}</span></div><div class="mu xs">${dlong(s.start)} · ${Math.round((s.end-s.start)/60000)} min</div></div><div class="sm" style="text-align:right">${sessSets(s)} series${s.prs?`<div class="xs ac">🏆 ${s.prs}</div>`:''}</div></div>`).join('')}</div>`}
  if(ui.progSeg==='body'){
    const today=new Date().toISOString().slice(0,10);
    h+=`<div class="card"><h3>Nuevo registro</h3><div class="grid2"><div class="field"><label>Fecha</label><input type="date" id="bDate" value="${today}"></div><div class="field"><label>Peso (kg)</label><input id="bW" inputmode="decimal" placeholder="110"></div></div>
     <div class="k" style="margin-top:6px">Perímetros (opcional, cm)</div><div class="grid2"><div class="field"><label>Cintura</label><input id="bWa" inputmode="decimal"></div><div class="field"><label>Pecho</label><input id="bCh" inputmode="decimal"></div><div class="field"><label>Brazo</label><input id="bAr" inputmode="decimal"></div><div class="field"><label>Muslo</label><input id="bTh" inputmode="decimal"></div></div>
     <button class="btn pri full" data-a="addBody">Guardar</button></div>`;
    const b=S.body.slice().sort((a,c)=>a.date.localeCompare(c.date));const pw=b.filter(x=>x.w);
    if(pw.length>1)h+=`<div class="card"><div class="row sp"><h3>Peso corporal</h3><span class="b">${fmt(pw[pw.length-1].w)} kg <span class="xs ${pw[pw.length-1].w-pw[0].w<=0?'ac':'mu'}">${fmt(pw[pw.length-1].w-pw[0].w)}</span></span></div>${chart(pw.map(x=>({x:x.date.slice(5).split('-').reverse().join('/'),y:x.w})),'kg')}</div>`;
    const wa=b.filter(x=>x.wa);if(wa.length>1)h+=`<div class="card"><h3>Cintura</h3>${chart(wa.map(x=>({x:x.date.slice(5).split('-').reverse().join('/'),y:x.wa})),'cm')}</div>`;
    if(b.length)h+=`<div class="card" style="padding:4px 14px">${b.slice().reverse().map(x=>`<div class="li"><div class="grow"><div class="b">${x.date.split('-').reverse().join('/')}</div><div class="mu xs">${[x.wa&&'Cintura '+fmt(x.wa),x.ch&&'Pecho '+fmt(x.ch),x.ar&&'Brazo '+fmt(x.ar),x.th&&'Muslo '+fmt(x.th)].filter(Boolean).join(' · ')}</div></div><span class="b">${x.w?fmt(x.w)+' kg':''}</span><button class="icb" data-a="delBody" data-id="${x.id}">✕</button></div>`).join('')}</div>`}
  if(ui.progSeg==='cal'){
    const W=20;const today=new Date();today.setHours(0,0,0,0);const mon=today.getTime()-((today.getDay()+6)%7)*DAY;const start=mon-(W-1)*7*DAY;
    const set=new Set(S.sessions.map(s=>{const d=new Date(s.start);d.setHours(0,0,0,0);return d.getTime()}));
    let cells='';for(let w=0;w<W;w++)for(let d=0;d<7;d++){const t=start+(w*7+d)*DAY;cells+=`<i class="${set.has(t)?'on':''} ${t===today.getTime()?'today':''}" style="${t>today.getTime()?'opacity:.25':''}"></i>`}
    const m0=new Date(today.getFullYear(),today.getMonth(),1).getTime();const month=S.sessions.filter(s=>s.start>=m0).length;
    let streak=0;for(let w=0;w<52;w++){const a=mon-w*7*DAY,b2=a+7*DAY;const n=S.sessions.filter(s=>s.start>=a&&s.start<b2).length;if(n>=3)streak++;else if(w>0)break}
    h+=`<div class="row" style="gap:8px"><div class="stat"><div class="xs mu">Este mes</div><div class="big">${month}</div></div><div class="stat"><div class="xs mu">Días/semana</div><div class="big">${fmt(daysPerWeek())}</div></div><div class="stat"><div class="xs mu">Semanas ≥3</div><div class="big">${streak}</div></div></div>
     <div class="card"><div class="k" style="margin-bottom:10px">Últimas ${W} semanas</div><div class="heat" style="grid-template-columns:repeat(${W},1fr)">${cells}</div><div class="row sp xs mu" style="margin-top:6px"><span>${dstr(start)}</span><span>Hoy</span></div></div>`}
  return h}
function ProgEx(){
  const id=ui.progEx,e=ex(id),h0=history(id);
  const pts=h0.map(x=>{const b=x.sets.reduce((a,s)=>e1rm(num(s.kg),num(s.reps))>e1rm(num(a.kg),num(a.reps))?s:a,x.sets[0]);
    return {d:x.date,e:e1rm(num(b.kg),num(b.reps)),max:Math.max(...x.sets.map(s=>num(s.kg)||0)),vol:x.sets.reduce((a,s)=>a+(num(s.kg)||0)*num(s.reps),0),best:b,sets:x.sets}});
  const M={e1rm:['Fuerza estimada','e','kg'],max:['Peso máximo','max','kg'],vol:['Volumen (kg×reps)','vol','kg']}[ui.metric];
  const bestE=Math.max(...pts.map(p=>p.e)),bestKg=Math.max(...pts.map(p=>p.max));const bp=pts.find(p=>p.e===bestE);
  let h=`<div class="row" style="margin-top:6px"><button class="icb" data-a="progBack">‹</button><div class="grow"><div class="k">${D.MUSCLES[e.primary]}</div><h2 style="margin:2px 0">${esc(e.name)}</h2></div><button class="icb" data-a="info" data-id="${id}">ⓘ</button></div>
   <div class="row" style="gap:8px;margin-top:8px"><div class="stat"><div class="xs mu">1RM estimado</div><div class="big">${fmt(Math.round(bestE))}</div><div class="xs mu">${bp?fmt(num(bp.best.kg))+'×'+bp.best.reps:''}</div></div><div class="stat"><div class="xs mu">Más peso</div><div class="big">${fmt(bestKg)}</div><div class="xs mu">kg</div></div><div class="stat"><div class="xs mu">Sesiones</div><div class="big">${pts.length}</div></div></div>
   <div class="seg">${[['e1rm','Fuerza est.'],['max','Peso máx'],['vol','Volumen']].map(([k,l])=>`<button data-a="metric" data-v="${k}" class="${ui.metric===k?'on':''}">${l}</button>`).join('')}</div>
   <div class="card"><div class="k">${M[0]}</div>${pts.length>1?chart(pts.map(p=>({x:dstr(p.d),y:Math.round(p[M[1]]*10)/10})),M[2]):'<div class="mu sm" style="padding:20px 0">Necesitas al menos 2 sesiones para ver la gráfica.</div>'}</div>
   <div class="card" style="padding:4px 14px"><table class="t">${pts.slice().reverse().map(p=>`<tr><td class="mu" style="white-space:nowrap">${dstr(p.d)}</td><td>${p.sets.map(s=>`${fmt(num(s.kg))||'–'}×${s.reps}`).join(' · ')}</td><td style="text-align:right" class="b">${fmt(Math.round(p.e))}</td></tr>`).join('')}</table></div>`;
  return h}
function chart(pts,unit){
  const W=340,H=170,pl=36,pr=10,pt=14,pb=26;const ys=pts.map(p=>p.y);let mn=Math.min(...ys),mx=Math.max(...ys);if(mn===mx){mn-=1;mx+=1}const pad=(mx-mn)*.12;mn-=pad;mx+=pad;
  const X=i=>pl+(W-pl-pr)*(pts.length===1?.5:i/(pts.length-1)),Y=v=>pt+(H-pt-pb)*(1-(v-mn)/(mx-mn));
  const line=pts.map((p,i)=>`${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  const step=Math.ceil(pts.length/5);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;margin-top:8px"><defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#C6F432" stop-opacity=".28"/><stop offset="1" stop-color="#C6F432" stop-opacity="0"/></linearGradient></defs>
   ${[0,.5,1].map(f=>{const v=mn+(mx-mn)*(1-f);const y=pt+(H-pt-pb)*f;return `<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" stroke="#26262B"/><text x="${pl-6}" y="${y+4}" fill="#8A8A93" font-size="10" text-anchor="end">${fmt(Math.round(v))}</text>`}).join('')}
   <polygon points="${X(0)},${H-pb} ${line} ${X(pts.length-1)},${H-pb}" fill="url(#ga)"/>
   <polyline points="${line}" fill="none" stroke="#C6F432" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
   ${pts.map((p,i)=>`<circle cx="${X(i)}" cy="${Y(p.y)}" r="${i===pts.length-1?4.5:3}" fill="${i===pts.length-1?'#C6F432':'#000'}" stroke="#C6F432" stroke-width="2"/>`).join('')}
   ${pts.map((p,i)=>(i%step===0||i===pts.length-1)?`<text x="${X(i)}" y="${H-8}" fill="#8A8A93" font-size="10" text-anchor="${i===pts.length-1?'end':i===0?'start':'middle'}">${esc(p.x)}</text>`:'').join('')}
   <text x="${X(pts.length-1)}" y="${Y(pts[pts.length-1].y)-10}" fill="#F5F5F5" font-size="11" font-weight="700" text-anchor="end">${fmt(pts[pts.length-1].y)} ${unit}</text></svg>`}

// ---------------- VOLUMEN ----------------
function weight(exId,m){const e=ex(exId);return e.primary===m?1:(e.secondary||[]).includes(m)?.5:0}
function Vol(){
  const r=activeR();const dpw=daysPerWeek();const plan={},real={};Object.keys(D.MUSCLES).forEach(m=>{plan[m]=0;real[m]=0});
  r.days.forEach(d=>d.items.forEach(it=>{for(const m in plan)plan[m]+=it.sets*weight(it.ex,m)}));
  for(const m in plan)plan[m]=plan[m]*dpw/r.days.length;
  const since=Date.now()-7*DAY;S.sessions.filter(s=>s.start>=since).forEach(s=>s.items.forEach(it=>{const n=working(it.sets).length;for(const m in real)real[m]+=n*weight(it.exId,m)}));
  const hasReal=S.sessions.some(s=>s.start>=since);
  let h=`<h1 style="margin-top:6px">Volumen</h1>
   <div class="card"><div class="row sp"><div><div class="k">Días por semana</div><div class="mu xs">${S.settings.daysOverride?'Fijado a mano':'Calculado con tus últimas 4 semanas'}</div></div>
    <div class="step"><button data-a="dpw" data-v="-1">−</button><b>${S.settings.daysOverride?S.settings.daysOverride:'Auto'}</b><button data-a="dpw" data-v="1">+</button></div></div>
    <div class="mu xs" style="margin-top:8px">Usando <b class="ac">${fmt(dpw)}</b> días/semana con «${esc(r.name)}». Series directas + 0,5 por músculo secundario (p. ej. el press cuenta medio para tríceps).</div></div>
   <div class="row xs mu" style="gap:14px;margin:4px 4px 0"><span><span style="display:inline-block;width:12px;height:8px;background:#26301A;border-radius:2px"></span> Rango objetivo</span><span><span style="display:inline-block;width:3px;height:10px;background:#fff"></span> Plan</span>${hasReal?'<span><span style="display:inline-block;width:12px;height:8px;background:var(--ac);border-radius:2px"></span> Real (7 días)</span>':''}</div>
   <div class="card">`;
  const scale=24;
  Object.keys(D.MUSCLES).forEach(m=>{const [lo,hi]=D.TARGETS[m];const p=plan[m];const st=p<lo?['Bajo','w']:p>hi?['Alto','r']:['OK',''];
    h+=`<div style="margin:10px 0 14px"><div class="row sp"><span class="b sm">${D.MUSCLES[m]}</span><span class="row" style="gap:8px"><span class="xs mu">Plan ${fmt(Math.round(p*10)/10)}${hasReal?' · Real '+fmt(real[m]):''} · ${lo}–${hi}</span><span class="chip ${st[1]}">${st[0]}</span></span></div>
     <div class="vbar"><div class="zone" style="left:${lo/scale*100}%;width:${(hi-lo)/scale*100}%"></div>${hasReal?`<div class="real" style="width:${Math.min(100,real[m]/scale*100)}%"></div>`:''}<div class="plan" style="left:calc(${Math.min(100,p/scale*100)}% - 1px)"></div></div></div>`});
  h+=`</div>`;
  // reps fuera de rango
  const since4=Date.now()-28*DAY;const st={};
  S.sessions.filter(s=>s.start>=since4).forEach(s=>s.items.forEach(it=>{const t=it.target;working(it.sets).forEach(x=>{const o=st[it.exId]||(st[it.exId]={n:0,lo:0,hi:0,t});o.n++;const rr=num(x.reps);if(rr<t.repMin)o.lo++;else if(rr>t.repMax)o.hi++})}));
  const bad=Object.entries(st).filter(([,o])=>o.n>=3&&(o.lo+o.hi)/o.n>.3);
  h+=`<h2>Repeticiones fuera de rango</h2><div class="card">${!Object.keys(st).length?'<div class="mu sm">Aún no hay datos de las últimas 4 semanas.</div>':!bad.length?'<div class="ac b sm">✓ Todo dentro de rango en las últimas 4 semanas.</div>':
    bad.map(([id,o])=>`<div class="li"><div class="grow"><div class="b sm">${esc(ex(id).name)}</div><div class="xs mu">Objetivo ${o.t.repMin}–${o.t.repMax} · ${Math.round(o.lo/o.n*100)}% por debajo · ${Math.round(o.hi/o.n*100)}% por encima</div></div><span class="chip ${o.lo>o.hi?'w':''}">${o.lo>o.hi?'Baja peso':'Sube peso'}</span></div>`).join('')}</div>`;
  h+=`<h2>Series por día</h2><div class="card" style="padding:4px 14px">${r.days.map((d,i)=>`<div class="li"><span class="grow">${i+1} · ${esc(d.name)}</span><span class="mu sm">${d.items.reduce((a,b)=>a+b.sets,0)} series · ~${estMin(d.items)} min</span></div>`).join('')}</div>`;
  return h}

// ---------------- AJUSTES ----------------
function Ajustes(){const s=S.settings;
  const stp=(k,step,lbl,unit)=>`<div class="li"><span class="grow">${lbl}</span><div class="step"><button data-a="stp" data-k="${k}" data-v="${-step}">−</button><b>${s[k]}${unit||''}</b><button data-a="stp" data-k="${k}" data-v="${step}">+</button></div></div>`;
  const tg=(k,lbl,sub)=>`<div class="li"><div class="grow"><div>${lbl}</div>${sub?`<div class="xs mu">${sub}</div>`:''}</div><button class="tog ${s[k]?'on':''}" data-a="tog" data-k="${k}"></button></div>`;
  return `<h1 style="margin-top:6px">Ajustes</h1>
   <h2>Entreno</h2><div class="card" style="padding:4px 14px">${stp('restC',15,'Descanso compuestos','s')}${stp('restA',15,'Descanso aislamiento','s')}${tg('sound','Sonido al terminar el descanso','Suena con la app abierta. El iPhone no permite vibrar ni avisar con la pantalla bloqueada desde una app web.')}${tg('showRIR','Anotar RIR en cada serie')}${stp('deloadEvery',1,'Aviso de descarga cada',' vueltas')}</div>
   <h2>Subida de peso por equipo</h2><div class="card"><div class="grid2">${Object.entries(D.EQUIP).map(([k,l])=>`<div class="field"><label>${l} (kg)</label><input inputmode="decimal" data-in="inc" data-k="${k}" value="${fmt(s.inc[k])}"></div>`).join('')}</div></div>
   <h2>Tus datos</h2><div class="card"><div class="mu sm">Todo se guarda solo en este iPhone. Haz copias de seguridad para no perderlo si borras la app o cambias de móvil.</div>
    <div class="mu xs" style="margin:6px 0 12px">Última copia: <b>${S.lastBackup?dlong(S.lastBackup):'nunca'}</b></div>
    <div class="col"><button class="btn pri full" data-a="exportJSON">💾 Exportar copia de seguridad</button><button class="btn full" data-a="importJSON">📂 Importar copia</button><button class="btn full" data-a="exportCSV">📊 Exportar a Excel (CSV)</button></div>
    <input type="file" id="fileIn" accept=".json,application/json" style="display:none"></div>
   <div class="card" style="padding:4px 14px">${stp('backupEvery',7,'Recordar copia cada',' días')}</div>
   <h2>Otros</h2><div class="card col"><button class="btn full" data-a="restoreR">${ui.confirm==='restore'?'Toca otra vez: se reponen las 3 rutinas de ejemplo':'Restaurar rutinas de ejemplo'}</button>
    <button class="btn full ghost danger" data-a="wipe">${ui.confirm==='wipe'?'⚠️ Toca otra vez para BORRAR TODO':'Borrar todos los datos'}</button></div>
   <div class="xs mu" style="text-align:center;margin:16px 0">Gym · versión ${VERSION} · funciona sin conexión</div>`}

// ---------------- SHEETS ----------------
function openSheet(type,data){ui.sheet={type,...(data||{})};renderSheet()}
function closeSheet(){ui.sheet=null;renderSheet()}
function renderSheet(){const el=$('#sheet');if(!ui.sheet){el.innerHTML='';return}
  const f={info:shInfo,alt:shAlt,exMenu:shExMenu,lib:shLib,item:shItem,finish:shFinish,sess:shSess,newEx:shNewEx,setMenu:shSetMenu,importOk:shImport}[ui.sheet.type];
  const keep=el.querySelector('.sheet');const st=keep?keep.scrollTop:0;const animate=!keep||el.dataset.t!==ui.sheet.type;
  el.dataset.t=ui.sheet.type;
  el.innerHTML=`<div class="ov" data-a="closeSheet" style="${animate?'':'animation:none;opacity:1'}"></div><div class="sheet" style="${animate?'':'animation:none;transform:none'}"><div class="grab"></div>${f()}</div>`;
  if(!animate)el.querySelector('.sheet').scrollTop=st}
function shInfo(){const id=ui.sheet.id,e=ex(id);const c=D.CUES[e.pattern]||[[],[]];const hb=history(id);const be=bestE(id);
  let ctx='';const cx=ui.sheet.ctx;
  if(cx){const day=routine(cx.rid).days.find(d=>d.id===cx.did);const it=day&&day.items[cx.ii];
    if(it){const L=groupLetters(day.items);const lp=lastPerf(id);const sg=suggestion(id,it);
      ctx=`<div class="card" style="margin-top:14px;border-color:var(--ac)"><div class="k">En tu rutina · ${esc(day.name)}</div>
       <div class="big" style="margin:4px 0">${it.sets} × ${repTxt(it)}</div><div class="mu sm">RIR ${esc(it.rir)} · descanso ${restFor(it.ex)} s${it.group?` · ⛓ Superserie ${L[it.group]}`:''}</div>
       ${lp?`<div class="sm" style="margin-top:8px">Última vez (${dstr(lp.date)}): <b>${lp.sets.map(s=>`${fmt(num(s.kg))||'–'}×${s.reps}`).join(' · ')}</b></div>`:''}
       <div class="sug ${sg.kind==='up'?'up':''}">${esc(sg.text)}</div></div>
       ${it.alts.length?`<h3 style="margin:14px 0 2px">Alternativas</h3>${it.alts.map(a=>`<div class="li" data-a="infoAlt" data-id="${a}">${Anim.svg(ex(a).pattern).replace('class="anim"','class="anim mini"')}<div class="grow"><div class="b">${esc(ex(a).name)}</div><div class="xs mu">${D.EQUIP[ex(a).equip]} · ${D.TYPES[ex(a).type]}</div></div><span class="mu">›</span></div>`).join('')}`:''}`}}
  return `${ui.sheet.back?'<button class="lnk" data-a="sheetBack">‹ Volver</button>':''}${Anim.svg(e.pattern)}<h2 style="margin:14px 0 6px">${esc(e.name)}</h2>
   <div class="row wrap" style="gap:6px"><span class="chip">${D.MUSCLES[e.primary]}</span>${(e.secondary||[]).map(m=>`<span class="chip g">${D.MUSCLES[m]}</span>`).join('')}<span class="chip g">${D.TYPES[e.type]}</span><span class="chip g">${D.EQUIP[e.equip]}</span></div>
   ${ctx}
   ${hb.length?`<div class="row" style="gap:8px;margin-top:12px"><div class="stat"><div class="xs mu">1RM estimado</div><div class="b">${fmt(Math.round(be))} kg</div></div><div class="stat"><div class="xs mu">Sesiones</div><div class="b">${hb.length}</div></div></div>`:''}
   <h3 style="margin:16px 0 6px">Claves de técnica</h3><div class="col sm">${c[0].map(x=>`<div>✓ ${esc(x)}</div>`).join('')}</div>
   <h3 style="margin:14px 0 6px">Errores típicos</h3><div class="col sm">${c[1].map(x=>`<div style="color:var(--bad)">✕ <span style="color:var(--tx)">${esc(x)}</span></div>`).join('')}</div>
   <div class="field" style="margin-top:14px"><label>📝 Nota (posición de asiento, molestias…)</label><textarea data-in="note" data-id="${id}" placeholder="Ej.: asiento en posición 4">${esc(S.exNotes[id]||'')}</textarea></div>
   <a class="btn full" href="https://www.youtube.com/results?search_query=${encodeURIComponent(e.name+' técnica')}" target="_blank" rel="noopener">▶ Ver en YouTube (necesita conexión)</a>
   ${hb.length?`<button class="btn full ghost" style="margin-top:8px" data-a="openEx" data-id="${id}">Ver evolución</button>`:''}`}
function shAlt(){const it=S.current.items[ui.sheet.i];const cur=ex(it.exId);const base=ex(it.planEx);
  const opts=[it.planEx,...it.alts].filter((v,i,a)=>a.indexOf(v)===i);const eq=ui.sheet.eq||'';
  const others=allEx().filter(id=>!opts.includes(id)&&ex(id).primary===base.primary&&(!eq||ex(id).equip===eq));
  const row=id=>{const lp=lastPerf(id);return `<div class="li" data-a="pickAlt" data-id="${id}">${Anim.svg(ex(id).pattern).replace('class="anim"','class="anim mini"')}<div class="grow"><div class="b">${esc(ex(id).name)}</div><div class="xs mu">${D.EQUIP[ex(id).equip]}${lp?` · última: ${lp.sets.map(s=>fmt(num(s.kg))+'×'+s.reps).slice(0,3).join(' · ')}`:''}</div></div>${id===it.exId?'<span class="chip">Actual</span>':''}</div>`};
  return `<div class="k">Cambiar ejercicio</div><h2 style="margin:4px 0 2px">${esc(cur.name)}</h2><div class="mu xs">Cada alternativa guarda su propio historial de pesos.</div>
   <h3 style="margin:14px 0 2px">Del plan</h3>${opts.map(row).join('')}
   <h3 style="margin:16px 0 6px">Otras de ${D.MUSCLES[base.primary].toLowerCase()}</h3>
   <div class="chips"><button class="fchip ${!eq?'on':''}" data-a="altEq" data-v="">Todas</button>${Object.entries(D.EQUIP).map(([k,l])=>`<button class="fchip ${eq===k?'on':''}" data-a="altEq" data-v="${k}">${l}</button>`).join('')}</div>
   ${others.map(row).join('')||'<div class="mu sm">No hay más con ese equipo.</div>'}`}
function shExMenu(){const i=ui.sheet.i,c=S.current,it=c.items[i];const next=c.items[i+1];
  const b=(a,l,x)=>`<button class="btn full" style="margin:5px 0;justify-content:flex-start" data-a="${a}" data-i="${i}" ${x||''}>${l}</button>`;
  return `<div class="k">${esc(ex(it.exId).name)}</div><div class="mu xs" style="margin:4px 0 8px">Estos cambios son solo para hoy. Para cambiar la rutina, ve a Plan → Editar.</div>
   ${b('info','ⓘ Técnica y animación','data-id="'+it.exId+'"')}
   ${next?b('ssWithNext',it.group&&it.group===next.group?'⛓ Ya está en superserie con el siguiente':'⛓ Hacer superserie con el siguiente'):''}
   ${it.group?b('ssOut','✂️ Quitar de la superserie'):''}
   ${b('mvEx','↑ Mover arriba','data-v="-1"')}${b('mvEx','↓ Mover abajo','data-v="1"')}
   ${b('addSet','+ Añadir serie')}${b('delSet','− Quitar última serie')}
   ${b('skip','⏭ Saltar ejercicio')}`}
function shSetMenu(){const {i,s}=ui.sheet;const set=S.current.items[i].sets[s];
  return `<div class="k">Serie</div><button class="btn full" style="margin:8px 0" data-a="toggleWarm" data-i="${i}" data-s="${s}">${set.warm?'Marcar como serie efectiva':'Marcar como calentamiento'}</button><button class="btn full danger" data-a="delThisSet" data-i="${i}" data-s="${s}">Borrar serie</button>`}
function shLib(){const L=ui.lib;const q=L.q.toLowerCase();
  const list=allEx().filter(id=>{const e=ex(id);return (!q||e.name.toLowerCase().includes(q))&&(!L.m||e.primary===L.m)&&(!L.e||e.equip===L.e)&&(!L.t||e.type===L.t)}).sort((a,b)=>ex(a).name.localeCompare(ex(b).name));
  const title={add:'Añadir ejercicio',replace:'Cambiar ejercicio',alt:'Añadir alternativa'}[ui.sheet.mode];
  return `<div class="row sp"><h2 style="margin:0">${title}</h2><button class="lnk" data-a="newEx">+ Crear</button></div>
   <input placeholder="Buscar…" data-in="libq" value="${esc(L.q)}" style="margin:10px 0 8px">
   <div class="chips"><button class="fchip ${!L.m?'on':''}" data-a="libF" data-k="m" data-v="">Todos</button>${Object.entries(D.MUSCLES).map(([k,l])=>`<button class="fchip ${L.m===k?'on':''}" data-a="libF" data-k="m" data-v="${k}">${l}</button>`).join('')}</div>
   <div class="chips"><button class="fchip ${!L.e?'on':''}" data-a="libF" data-k="e" data-v="">Todo equipo</button>${Object.entries(D.EQUIP).map(([k,l])=>`<button class="fchip ${L.e===k?'on':''}" data-a="libF" data-k="e" data-v="${k}">${l}</button>`).join('')}</div>
   <div class="chips"><button class="fchip ${!L.t?'on':''}" data-a="libF" data-k="t" data-v="">Todos</button><button class="fchip ${L.t==='C'?'on':''}" data-a="libF" data-k="t" data-v="C">Compuestos</button><button class="fchip ${L.t==='A'?'on':''}" data-a="libF" data-k="t" data-v="A">Aislamiento</button></div>
   <div id="libList">${libRows(list)}</div>`}
const libRows=list=>list.map(id=>{const e=ex(id);return `<div class="li" data-a="libPick" data-id="${id}">${Anim.svg(e.pattern).replace('class="anim"','class="anim mini"')}<div class="grow"><div class="b">${esc(e.name)}</div><div class="xs mu">${D.MUSCLES[e.primary]} · ${D.EQUIP[e.equip]} · ${D.TYPES[e.type]}</div></div></div>`}).join('')||'<div class="empty">Sin resultados</div>';
function shItem(){const {rid,did,ii}=ui.sheet;const it=routine(rid).days.find(d=>d.id===did).items[ii];const e=ex(it.ex);
  const st=(k,lbl,step)=>`<div class="li"><span class="grow">${lbl}</span><div class="step"><button data-a="itStep" data-k="${k}" data-v="${-step}">−</button><b>${it[k]}</b><button data-a="itStep" data-k="${k}" data-v="${step}">+</button></div></div>`;
  const RIRS=['0','0–1','1','1–2','2','2–3','3'];
  return `<div class="row" style="gap:12px">${Anim.svg(e.pattern).replace('class="anim"','class="anim mini"')}<div class="grow"><div class="k">${D.MUSCLES[e.primary]}</div><h2 style="margin:2px 0">${esc(e.name)}</h2><button class="lnk" data-a="libOpen" data-mode="replace">Cambiar ejercicio</button></div></div>
   <div class="card" style="padding:4px 14px">${st('sets','Series',1)}${st('repMin','Reps mínimas',1)}${st('repMax','Reps máximas',1)}
    <div class="li"><span class="grow">RIR</span><select data-in="itRir" style="width:110px">${RIRS.map(r=>`<option ${r===it.rir?'selected':''}>${r}</option>`).join('')}</select></div>
    <div class="li"><span class="grow">Unidad de reps</span><select data-in="itSuf" style="width:130px">${[['','—'],['/lado','/lado'],['/pierna','/pierna'],['/brazo','/brazo']].map(([v,l])=>`<option value="${v}" ${v===(it.suf||'')?'selected':''}>${l}</option>`).join('')}</select></div></div>
   <h3 style="margin:14px 0 4px">Alternativas</h3><div class="card" style="padding:4px 14px">${it.alts.map((a,k)=>`<div class="li"><span class="grow">${esc(ex(a).name)}</span><button class="icb" data-a="altDel" data-k="${k}">✕</button></div>`).join('')||'<div class="mu sm" style="padding:10px 0">Sin alternativas. En el entreno también verás otras del mismo músculo.</div>'}</div>
   <button class="btn full" data-a="libOpen" data-mode="alt">+ Añadir alternativa</button>
   <div class="row" style="gap:8px;margin-top:14px"><button class="btn grow danger" data-a="itDel">${ui.confirm==='itDel'?'¿Seguro?':'Borrar'}</button><button class="btn pri grow" data-a="closeSheet">Listo</button></div>`}
function shFinish(){const c=S.current;const n=c.items.reduce((a,it)=>a+working(it.sets).length,0);const vol=c.items.reduce((a,it)=>a+working(it.sets).reduce((b,s)=>b+(num(s.kg)||0)*num(s.reps),0),0);
  const pending=c.items.filter(it=>!it.skipped&&it.sets.some(s=>!s.done&&!s.warm)).length;
  return `<h2 style="margin:0 0 10px">Terminar entreno</h2><div class="row" style="gap:8px"><div class="stat"><div class="xs mu">Series</div><div class="big">${n}</div></div><div class="stat"><div class="xs mu">Minutos</div><div class="big">${Math.round((Date.now()-c.start)/60000)}</div></div><div class="stat"><div class="xs mu">Volumen</div><div class="big">${fmt(Math.round(vol/100)/10)}t</div></div></div>
   ${pending?`<div class="banner w">Quedan ${pending} ejercicio${pending>1?'s':''} con series sin marcar. Las series sin ✓ no se guardan.</div>`:''}
   <button class="btn pri full" style="margin-top:12px" data-a="saveSess">Guardar entreno</button><button class="btn full ghost" style="margin-top:6px" data-a="closeSheet">Seguir entrenando</button>`}
function shSess(){const s=S.sessions.find(x=>x.id===ui.sheet.id);if(!s)return '';
  return `<div class="k">${dlong(s.start)}</div><h2 style="margin:4px 0">${esc(s.dayName)}</h2><div class="mu sm">${esc(s.routineName)} · ${Math.round((s.end-s.start)/60000)} min · ${sessSets(s)} series${s.cardio&&s.cardio.min?` · Cardio ${s.cardio.min} min`:''}</div>
   <div class="card" style="padding:4px 14px">${s.items.filter(it=>working(it.sets).length).map(it=>`<div class="li"><div class="grow"><div class="b sm">${esc(ex(it.exId).name)}</div><div class="xs mu">${working(it.sets).map(x=>`${fmt(num(x.kg))||'–'}×${x.reps}`).join(' · ')}</div></div></div>`).join('')||'<div class="mu sm">Sin series.</div>'}</div>
   <button class="btn full ghost danger" data-a="delSess" data-id="${s.id}">${ui.confirm==='delSess'?'Toca otra vez para borrarlo':'Borrar este entreno'}</button>`}
function shNewEx(){const pats=Anim.PATTERNS;
  return `<h2 style="margin:0 0 8px">Crear ejercicio</h2><div class="field"><label>Nombre</label><input id="nxName" placeholder="Ej.: Remo Hammer unilateral"></div>
   <div class="grid2"><div class="field"><label>Tipo</label><select id="nxType"><option value="C">Compuesto</option><option value="A">Aislamiento</option></select></div>
   <div class="field"><label>Equipo</label><select id="nxEq">${Object.entries(D.EQUIP).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div></div>
   <div class="field"><label>Músculo principal</label><select id="nxM">${Object.entries(D.MUSCLES).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div>
   <div class="field"><label>Secundarios (cuentan media serie)</label><div class="chips" style="flex-wrap:wrap">${Object.entries(D.MUSCLES).map(([k,l])=>`<button class="fchip ${(ui.nxSec||[]).includes(k)?'on':''}" data-a="nxSec" data-v="${k}">${l}</button>`).join('')}</div></div>
   <div class="field"><label>Animación / tipo de movimiento</label><select id="nxP">${Object.entries(pats).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div>
   <button class="btn pri full" data-a="nxSave">Crear y usar</button>`}
function shImport(){return `<h2 style="margin:0 0 8px">Importar copia</h2><div class="mu sm">Copia del ${dlong(ui.sheet.when||Date.now())} con ${ui.sheet.n} entrenos. <b>Reemplazará</b> todos los datos actuales de esta app.</div>
  <button class="btn pri full" style="margin-top:14px" data-a="importDo">Reemplazar mis datos</button><button class="btn full ghost" style="margin-top:6px" data-a="closeSheet">Cancelar</button>`}

// ---------------- TIMER ----------------
let actx=null;
function unlockAudio(){try{if(!actx)actx=new(window.AudioContext||window.webkitAudioContext)();if(actx.state==='suspended')actx.resume()}catch(e){}}
function beep(){if(!S.settings.sound||!actx)return;try{[0,.25,.5].forEach((d,i)=>{const o=actx.createOscillator(),g=actx.createGain();o.frequency.value=i===2?1320:880;o.connect(g);g.connect(actx.destination);
  const t=actx.currentTime+d;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.4,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.2);o.start(t);o.stop(t+.22)})}catch(e){}}
function startTimer(sec){S.timer={end:Date.now()+sec*1000,total:sec,fired:false};save();tick()}
function tick(){const el=$('#timer');const T=S.timer;
  if(!T||!S.current){el.className='';el.innerHTML='';return}
  const left=Math.ceil((T.end-Date.now())/1000);
  if(left<=0&&!T.fired){T.fired=true;beep();save()}
  if(left<-6){S.timer=null;save();el.className='';el.innerHTML='';return}
  const l=Math.max(0,left);const mm=Math.floor(l/60),ss=String(l%60).padStart(2,'0');
  el.className='show'+(left<=0?' end':'');
  const pct=T.total?Math.max(0,l/T.total):0;
  el.innerHTML=`<div class="in"><svg width="34" height="34" viewBox="0 0 36 36" style="flex:none"><circle cx="18" cy="18" r="15" fill="none" stroke="${left<=0?'rgba(0,0,0,.2)':'#26262B'}" stroke-width="4"/><circle cx="18" cy="18" r="15" fill="none" stroke="${left<=0?'#000':'#C6F432'}" stroke-width="4" stroke-dasharray="${(94.2*pct).toFixed(1)} 94.2" transform="rotate(-90 18 18)" stroke-linecap="round"/></svg>
   <div class="grow"><div class="xs" style="opacity:.7">${left<=0?'¡A por la siguiente serie!':'Descanso'}</div><div class="t">${left<=0?'0:00':mm+':'+ss}</div></div>
   <button class="btn sm" data-a="tAdd" data-v="-15">−15</button><button class="btn sm" data-a="tAdd" data-v="15">+15</button><button class="btn sm" data-a="tSkip">✕</button></div>`}
setInterval(tick,500);

// ---------------- efectos ----------------
function toast(t,cls){const d=document.createElement('div');d.className='toast '+(cls||'');d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),cls==='pr'?2600:2000)}
function celebrate(t){toast('🏆 '+t,'pr');const b=document.createElement('div');b.className='burst';
  for(let i=0;i<26;i++){const p=document.createElement('i');const a=Math.random()*Math.PI*2,r=80+Math.random()*120;p.style.setProperty('--x',Math.cos(a)*r+'px');p.style.setProperty('--y',Math.sin(a)*r-40+'px');
    if(i%3===0)p.style.background='#fff';b.appendChild(p)}document.body.appendChild(b);setTimeout(()=>b.remove(),1300)}

// ---------------- export / import ----------------
async function shareFiles(files){
  try{if(navigator.canShare&&navigator.canShare({files})){await navigator.share({files});return true}}catch(e){if(e&&e.name==='AbortError')return false}
  files.forEach(f=>{const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)});return true}
const today=()=>new Date().toISOString().slice(0,10);
async function exportJSON(){const data=JSON.stringify({app:'gymapp',version:1,exported:Date.now(),state:Object.assign({},S,{timer:null})});
  const ok=await shareFiles([new File([data],`gym-copia-${today()}.json`,{type:'application/json'})]);if(ok){S.lastBackup=Date.now();save(true);render();toast('💾 Copia exportada')}}
async function exportCSV(){const q=v=>{v=String(v??'');return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};const dc=v=>isFinite(num(v))?String(num(v)).replace('.',','):'';
  let rows=[['Fecha','Rutina','Día','Ejercicio','Músculo','Serie','Tipo','Kg','Reps','RIR'].join(';')];
  S.sessions.forEach(s=>{const d=new Date(s.start).toLocaleDateString('es-ES');s.items.forEach(it=>{let n=0;it.sets.filter(x=>x.done).forEach(x=>{rows.push([d,s.routineName,s.dayName,ex(it.exId).name,D.MUSCLES[ex(it.exId).primary],x.warm?'C':++n,x.warm?'Calentamiento':'Efectiva',dc(x.kg),x.reps,x.rir].map(q).join(';'))})});
    if(s.cardio&&s.cardio.min)rows.push([d,s.routineName,s.dayName,'Cardio','','','Cardio',`${s.cardio.min} min`,`${s.cardio.speed||''} km/h`,`${s.cardio.incl||''} %`].map(q).join(';'))});
  const files=[new File(['﻿'+rows.join('\n')],`gym-entrenos-${today()}.csv`,{type:'text/csv'})];
  if(S.body.length){const b=['Fecha;Peso;Cintura;Pecho;Brazo;Muslo',...S.body.slice().sort((a,c)=>a.date.localeCompare(c.date)).map(x=>[x.date,dc(x.w),dc(x.wa),dc(x.ch),dc(x.ar),dc(x.th)].join(';'))];
    files.push(new File(['﻿'+b.join('\n')],`gym-medidas-${today()}.csv`,{type:'text/csv'}))}
  await shareFiles(files)}
let pendingImport=null;
function onFile(ev){const f=ev.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const o=JSON.parse(r.result);if(o.app!=='gymapp'||!o.state||!o.state.v)throw 0;
  pendingImport=o.state;openSheet('importOk',{n:(o.state.sessions||[]).length,when:o.exported})}catch(e){toast('⚠️ Ese archivo no es una copia válida')}};r.readAsText(f);ev.target.value=''}

// ---------------- acciones ----------------
const curItem=d=>S.current.items[+d.i];
function swap(arr,i,j){if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]]}
function editRoutine(){return routine(ui.planEdit)}
const A={
 tab:d=>{if(d.v==='plan'&&ui.tab==='plan'){ui.planView=null;ui.planEdit=null}ui.tab=d.v;ui.confirm=null;if(d.v!=='plan'){ui.selMode=false;ui.sel=[]}render()},
 start:d=>{ui.tab='hoy';ui.planView=null;startSession(d.d)},
 check:d=>{const it=curItem(d),s=it.sets[+d.s];
   if(!s.done){if(s.reps===''){const ph=document.querySelector(`input[data-in="reps"][data-i="${d.i}"][data-s="${d.s}"]`);s.reps=ph&&ph.placeholder&&ph.placeholder!=='reps'?ph.placeholder:''}
     if(s.kg===''){const pk=document.querySelector(`input[data-in="kg"][data-i="${d.i}"][data-s="${d.s}"]`);if(pk&&pk.placeholder&&pk.placeholder!=='kg')s.kg=pk.placeholder}
     if(!(num(s.reps)>0)){toast('Escribe las repeticiones');return}
     s.done=true;
     if(!s.warm){const e=e1rm(num(s.kg),num(s.reps));const prev=bestE(it.exId);
       const inSess=it.sets.filter(x=>x!==s&&x.done&&!x.warm).reduce((a,x)=>Math.max(a,e1rm(num(x.kg),num(x.reps))),0);
       if(prev>0&&e>prev+0.01&&e>inSess+0.01){celebrate(`¡Récord en ${ex(it.exId).name}!`);S.current.prs=(S.current.prs||0)+1;it.pr=true}}
     // descanso
     const c=S.current,i=+d.i;const run=runs(c.items).find(r=>r.idx.includes(i));const lastInRun=!run.g||run.idx[run.idx.length-1]===i;
     if(lastInRun)startTimer(s.warm?60:Math.max(...run.idx.map(k=>restFor(c.items[k].exId))));
     else toast('⛓ Sigue con el siguiente de la superserie');
   }else s.done=false;
   save();render()},
 setMenu:d=>openSheet('setMenu',{i:+d.i,s:+d.s}),
 toggleWarm:d=>{const s=curItem(d).sets[+d.s];s.warm=!s.warm;save();closeSheet();render()},
 delThisSet:d=>{curItem(d).sets.splice(+d.s,1);save();closeSheet();render()},
 addSet:d=>{const it=curItem(d);const l=it.sets.filter(s=>!s.warm).slice(-1)[0];it.sets.push({kg:l?l.kg:it.sug.kg,reps:'',rir:'',warm:false,done:false});save();closeSheet();render()},
 addWarm:d=>{const it=curItem(d);const k=it.sets.findIndex(s=>!s.warm);it.sets.splice(k<0?it.sets.length:k,0,{kg:'',reps:'',rir:'',warm:true,done:false});save();render()},
 delSet:d=>{const it=curItem(d);for(let j=it.sets.length-1;j>=0;j--)if(!it.sets[j].done){it.sets.splice(j,1);break}save();closeSheet();render()},
 skip:d=>{curItem(d).skipped=true;save();closeSheet();render()},
 unskip:d=>{curItem(d).skipped=false;save();render()},
 mvEx:d=>{const c=S.current.items,i=+d.i;swap(c,i,i+ +d.v);cleanGroups(c);save();closeSheet();render()},
 ssWithNext:d=>{const c=S.current.items,i=+d.i;const g=c[i].group||c[i+1].group||'s'+uid();c[i].group=g;c[i+1].group=g;save();closeSheet();render()},
 ssOut:d=>{const c=S.current.items;c[+d.i].group=null;cleanGroups(c);save();closeSheet();render()},
 exMenu:d=>openSheet('exMenu',{i:+d.i}),
 alt:d=>openSheet('alt',{i:+d.i}),
 altEq:d=>{ui.sheet.eq=d.v;renderSheet()},
 pickAlt:d=>{const it=S.current.items[ui.sheet.i];if(it.exId!==d.id){it.exId=d.id;it.sug=suggestion(d.id,it.target);it.sets.forEach(s=>{if(!s.done)s.kg=it.sug.kg})}save();closeSheet();render()},
 info:d=>openSheet('info',{id:d.id}),
 infoPlan:d=>{const it=routine(d.rid).days.find(x=>x.id===d.did).items[+d.ii];openSheet('info',{id:it.ex,ctx:{rid:d.rid,did:d.did,ii:+d.ii}})},
 infoAlt:d=>{const back=Object.assign({},ui.sheet);openSheet('info',{id:d.id,back})},
 sheetBack:()=>{ui.sheet=ui.sheet.back;renderSheet()},
 viewR:d=>{ui.tab='plan';ui.planEdit=null;ui.planView=d.id;render()},
 viewBack:()=>{ui.planView=null;render()},
 finish:()=>openSheet('finish'),
 cancelSess:()=>{if(ui.confirm!=='cancel'){ui.confirm='cancel';render();return}ui.confirm=null;S.current=null;S.timer=null;save(true);render()},
 saveSess:()=>{const c=S.current;c.end=Date.now();c.items.forEach(it=>{it.sets=it.sets.filter(s=>s.done)});
   S.sessions.push(c);const r=routine(c.routineId);
   if(S.settings.mode==='rotation'||true){S.ptr[r.id]=(c.dayIdx+1)%r.days.length}
   if(c.dayIdx===r.days.length-1){S.cycles[r.id]=cyc(r.id)+1;if(S.deload.active&&cyc(r.id)>S.deload.startCycle){S.deload.active=false;S.deload.lastAt=cyc(r.id)}}
   const prs=c.prs||0;S.current=null;S.timer=null;save(true);closeSheet();ui.tab='hoy';render();
   toast(prs?`✅ Guardado · 🏆 ${prs} récord${prs>1?'s':''}`:'✅ Entreno guardado')},
 viewSess:d=>openSheet('sess',{id:d.id}),
 delSess:d=>{if(ui.confirm!=='delSess'){ui.confirm='delSess';renderSheet();return}ui.confirm=null;S.sessions=S.sessions.filter(s=>s.id!==d.id);save(true);closeSheet();render()},
 deloadOn:()=>{S.deload.active=true;S.deload.startCycle=cyc(S.active);save();render()},
 deloadSnooze:()=>{S.deload.snooze=cyc(S.active);save();render()},
 closeSheet:()=>{ui.confirm=null;closeSheet();render()},
 // plan
 mode:d=>{S.settings.mode=d.v;save();render()},
 useR:d=>{S.active=d.id;save();render();toast('Rutina activa: '+routine(d.id).name)},
 editR:d=>{ui.planView=null;ui.planEdit=d.id;ui.selMode=false;ui.sel=[];render()},
 planBack:()=>{ui.planEdit=null;ui.selMode=false;ui.sel=[];render()},
 dupR:d=>{const r=clone(routine(d.id));r.id='r'+uid();r.name=r.name+' (copia)';r.days.forEach(x=>x.id='d'+uid());S.routines.push(r);save();render()},
 delR:d=>{if(ui.confirm!=='delR'+d.id){ui.confirm='delR'+d.id;render();return}ui.confirm=null;S.routines=S.routines.filter(r=>r.id!==d.id);save();render()},
 newR:()=>{const r={id:'r'+uid(),name:'Nueva rutina',desc:'',days:[{id:'d'+uid(),name:'Día 1',items:[]}]};S.routines.push(r);ui.planEdit=r.id;save();render()},
 toggleDay:d=>{ui.openDays[d.id]=ui.openDays[d.id]===false;render()},
 addDay:()=>{const r=editRoutine();r.days.push({id:'d'+uid(),name:'Día '+(r.days.length+1),items:[]});save();render()},
 dupDay:d=>{const r=editRoutine();const i=r.days.findIndex(x=>x.id===d.d);const c=clone(r.days[i]);c.id='d'+uid();c.name+=' (copia)';r.days.splice(i+1,0,c);save();render()},
 delDay:d=>{if(ui.confirm!=='delDay'+d.d){ui.confirm='delDay'+d.d;render();return}ui.confirm=null;const r=editRoutine();r.days=r.days.filter(x=>x.id!==d.d);save();render()},
 mvDay:d=>{const r=editRoutine();const i=r.days.findIndex(x=>x.id===d.d);swap(r.days,i,i+ +d.v);save();render()},
 mvItem:d=>{const day=editRoutine().days.find(x=>x.id===d.d);const i=+d.ii;swap(day.items,i,i+ +d.v);cleanGroups(day.items);save();render()},
 editItem:d=>openSheet('item',{rid:ui.planEdit,did:d.d,ii:+d.ii}),
 itStep:d=>{const {rid,did,ii}=ui.sheet;const it=routine(rid).days.find(x=>x.id===did).items[ii];it[d.k]=Math.max(1,Math.min(50,it[d.k]+ +d.v));
   if(it.repMin>it.repMax){if(d.k==='repMin')it.repMax=it.repMin;else it.repMin=it.repMax}save();renderSheet();render()},
 altDel:d=>{const {rid,did,ii}=ui.sheet;routine(rid).days.find(x=>x.id===did).items[ii].alts.splice(+d.k,1);save();renderSheet();render()},
 itDel:()=>{if(ui.confirm!=='itDel'){ui.confirm='itDel';renderSheet();return}ui.confirm=null;const {rid,did,ii}=ui.sheet;const day=routine(rid).days.find(x=>x.id===did);day.items.splice(ii,1);cleanGroups(day.items);save();closeSheet();render()},
 selOn:()=>{ui.selMode=true;ui.sel=[];render()},selOff:()=>{ui.selMode=false;ui.sel=[];render()},
 selT:d=>{const k=d.k;const i=ui.sel.indexOf(k);if(i>=0)ui.sel.splice(i,1);else ui.sel.push(k);render()},
 ssJoin:()=>{const days=[...new Set(ui.sel.map(k=>k.split(':')[0]))];if(ui.sel.length<2){toast('Marca al menos 2 ejercicios');return}if(days.length>1){toast('Tienen que ser del mismo día');return}
   const day=editRoutine().days.find(x=>x.id===days[0]);const idx=ui.sel.map(k=>+k.split(':')[1]).sort((a,b)=>a-b);const g='g'+uid();
   const picked=idx.map(i=>day.items[i]);picked.forEach(it=>it.group=g);const rest=day.items.filter((_,i)=>!idx.includes(i));const pos=idx[0];
   const before=day.items.slice(0,pos).filter((_,i)=>!idx.includes(i));day.items=[...before,...picked,...rest.slice(before.length)];cleanGroups(day.items);
   ui.sel=[];ui.selMode=false;save();render();toast('⛓ Superserie creada')},
 ssSplit:()=>{if(!ui.sel.length){toast('Marca los ejercicios a separar');return}ui.sel.forEach(k=>{const [did,i]=k.split(':');const day=editRoutine().days.find(x=>x.id===did);day.items[+i].group=null});
   editRoutine().days.forEach(x=>cleanGroups(x.items));ui.sel=[];ui.selMode=false;save();render();toast('Superserie quitada')},
 addEx:d=>{ui.lib={q:'',m:'',e:'',t:''};openSheet('lib',{mode:'add',rid:ui.planEdit,did:d.d})},
 libOpen:d=>{const s=ui.sheet;ui.lib={q:'',m:d.mode==='alt'?ex(routine(s.rid).days.find(x=>x.id===s.did).items[s.ii].ex).primary:'',e:'',t:''};openSheet('lib',{mode:d.mode,rid:s.rid,did:s.did,ii:s.ii})},
 libF:d=>{ui.lib[d.k]=d.v;renderSheet()},
 libPick:d=>{const s=ui.sheet;const day=routine(s.rid).days.find(x=>x.id===s.did);
   if(s.mode==='add'){const e=ex(d.id);day.items.push({ex:d.id,sets:3,repMin:e.type==='C'?8:10,repMax:e.type==='C'?12:15,rir:e.type==='C'?'1–2':'1',alts:[],group:null,suf:''});save();closeSheet();render();toast('Añadido: '+e.name);return}
   const it=day.items[s.ii];if(s.mode==='replace')it.ex=d.id;if(s.mode==='alt'&&!it.alts.includes(d.id)&&d.id!==it.ex)it.alts.push(d.id);
   save();openSheet('item',{rid:s.rid,did:s.did,ii:s.ii});render()},
 newEx:()=>{ui.nxSec=[];ui.nxBack=ui.sheet;openSheet('newEx')},
 nxSec:d=>{const a=ui.nxSec;const i=a.indexOf(d.v);if(i>=0)a.splice(i,1);else a.push(d.v);renderSheet()},
 nxSave:()=>{const name=$('#nxName').value.trim();if(!name){toast('Ponle un nombre');return}const id='c'+uid();const m=$('#nxM').value;
   S.customEx[id]={name,type:$('#nxType').value,equip:$('#nxEq').value,primary:m,secondary:ui.nxSec.filter(x=>x!==m),pattern:$('#nxP').value};save();
   ui.sheet=ui.nxBack;A.libPick({id})},
 // progreso
 pseg:d=>{ui.progSeg=d.v;render()},openEx:d=>{ui.tab='prog';ui.progEx=d.id;closeSheet();render()},progBack:()=>{ui.progEx=null;render()},metric:d=>{ui.metric=d.v;render()},
 addBody:()=>{const g=id=>num($('#'+id).value);const o={id:uid(),date:$('#bDate').value||today(),w:g('bW'),wa:g('bWa'),ch:g('bCh'),ar:g('bAr'),th:g('bTh')};
   for(const k of ['w','wa','ch','ar','th'])if(!isFinite(o[k]))delete o[k];if(Object.keys(o).length<=2){toast('Escribe al menos un dato');return}S.body.push(o);save();render();toast('Guardado')},
 delBody:d=>{S.body=S.body.filter(x=>x.id!==d.id);save();render()},
 // volumen / ajustes
 dpw:d=>{let v=S.settings.daysOverride||0;v=v+ +d.v;if(v<2&&+d.v<0)v=0;else if(v<2)v=2;if(v>7)v=7;S.settings.daysOverride=v;save();render()},
 stp:d=>{const lim={restC:[30,600],restA:[15,600],deloadEvery:[3,20],backupEvery:[7,90]}[d.k];S.settings[d.k]=Math.max(lim[0],Math.min(lim[1],S.settings[d.k]+ +d.v));save();render()},
 tog:d=>{S.settings[d.k]=!S.settings[d.k];save();render()},
 exportJSON:()=>exportJSON(),exportCSV:()=>exportCSV(),importJSON:()=>$('#fileIn').click(),
 importDo:()=>{if(!pendingImport)return;const d=defaultState();S=Object.assign(d,pendingImport);S.settings=Object.assign(defaultState().settings,pendingImport.settings||{});pendingImport=null;save(true);closeSheet();ui.tab='hoy';render();toast('✅ Copia importada')},
 restoreR:()=>{if(ui.confirm!=='restore'){ui.confirm='restore';render();return}ui.confirm=null;D.ROUTINES.forEach(r=>{const i=S.routines.findIndex(x=>x.id===r.id);if(i>=0)S.routines[i]=clone(r);else S.routines.push(clone(r))});save();render();toast('Rutinas de ejemplo restauradas')},
 wipe:()=>{if(ui.confirm!=='wipe'){ui.confirm='wipe';render();return}S=defaultState();save(true);ui.confirm=null;ui.tab='hoy';render();toast('Datos borrados')},
 tAdd:d=>{if(!S.timer)return;S.timer.end+=(+d.v)*1000;S.timer.total=Math.max(S.timer.total,(S.timer.end-Date.now())/1000);S.timer.fired=false;save();tick()},
 tSkip:()=>{S.timer=null;save();tick()},
};
document.addEventListener('click',e=>{unlockAudio();const el=e.target.closest('[data-a]');if(!el)return;const a=el.dataset.a;
  if(ui.confirm&&!/^(cancelSess|delR|delDay|itDel|delSess|restoreR|wipe)$/.test(a)){ui.confirm=null}
  if(A[a]){e.preventDefault();A[a](el.dataset,el)}});
document.addEventListener('input',e=>{const t=e.target,k=t.dataset.in;if(!k)return;const d=t.dataset;
  if(k==='kg'||k==='reps'||k==='rir'){const s=S.current.items[+d.i].sets[+d.s];s[k]=t.value.replace(/[^\d.,]/g,'');save();return}
  if(k==='cardio'){S.current.cardio[d.f]=t.value;save();return}
  if(k==='note'){const v=t.value.trim();if(v)S.exNotes[d.id]=v;else delete S.exNotes[d.id];save();return}
  if(k==='rname'){editRoutine().name=t.value;save();return}
  if(k==='dname'){editRoutine().days.find(x=>x.id===d.d).name=t.value;save();return}
  if(k==='inc'){const v=num(t.value);if(isFinite(v))S.settings.inc[d.k]=v;save();return}
  if(k==='libq'){ui.lib.q=t.value;const L=ui.lib,q=L.q.toLowerCase();$('#libList').innerHTML=libRows(allEx().filter(id=>{const x=ex(id);return (!q||x.name.toLowerCase().includes(q))&&(!L.m||x.primary===L.m)&&(!L.e||x.equip===L.e)&&(!L.t||x.type===L.t)}).sort((a,b)=>ex(a).name.localeCompare(ex(b).name)));return}
  if(k==='pq'){ui.pq=t.value;const pos=t.selectionStart;render();const n=document.querySelector('[data-in="pq"]');n.focus();n.setSelectionRange(pos,pos);return}
});
document.addEventListener('change',e=>{const t=e.target,k=t.dataset.in,d=t.dataset;
  if(t.id==='fileIn')return onFile(e);
  if(k==='dwd'){const r=editRoutine();const m=S.fixed[r.id]||(S.fixed[r.id]={});if(t.value==='')delete m[d.d];else m[d.d]=+t.value;save();return}
  if(k==='itRir'||k==='itSuf'){const {rid,did,ii}=ui.sheet;const it=routine(rid).days.find(x=>x.id===did).items[ii];if(k==='itRir')it.rir=t.value;else it.suf=t.value;save();render();return}
  if(k==='note'||k==='rname'||k==='dname')render();
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('.set input')){e.preventDefault();const ins=[...document.querySelectorAll('.set input')];const i=ins.indexOf(e.target);if(ins[i+1])ins[i+1].focus();else e.target.blur()}});

// ---------------- arranque ----------------
render();
if('serviceWorker' in navigator&&location.protocol.startsWith('http')){
  navigator.serviceWorker.register('sw.js').then(reg=>{reg.addEventListener('updatefound',()=>{const w=reg.installing;w&&w.addEventListener('statechange',()=>{
    if(w.state==='installed'&&navigator.serviceWorker.controller){const b=document.createElement('div');b.className='toast';b.innerHTML='Nueva versión disponible · <u>Actualizar</u>';b.onclick=()=>location.reload();document.body.appendChild(b)}})})}).catch(()=>{});
}
window.__gym={get S(){return S},render};
})();
