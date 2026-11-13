/* Animaciones de figuras propias por patrón de movimiento (SVG, sin conexión) */
(function(){
const LEN={torso:50,ua:28,fa:26,th:40,sh:40};
const rad=a=>a*Math.PI/180;
const dir=a=>[Math.sin(rad(a)),-Math.cos(rad(a))];
const add=(p,a,l)=>{const d=dir(a);return [p[0]+d[0]*l,p[1]+d[1]*l]};
function ik(root,target,a,b,bend){
  let dx=target[0]-root[0],dy=target[1]-root[1];let d=Math.hypot(dx,dy)||0.01;
  const base=Math.atan2(dy,dx);const dc=Math.max(Math.abs(a-b)+0.5,Math.min(d,a+b-0.5));
  const cosA=(a*a+dc*dc-b*b)/(2*a*dc);const A=Math.acos(Math.max(-1,Math.min(1,cosA)));
  const ang=base+bend*A;const j=[root[0]+a*Math.cos(ang),root[1]+a*Math.sin(ang)];
  const end=d>a+b-0.5?[root[0]+(a+b-0.5)*Math.cos(base),root[1]+(a+b-0.5)*Math.sin(base)]:target;
  return [j,end];
}
function lerp(a,b,t){
  if(typeof a==='number')return a+(b-a)*t;
  if(Array.isArray(a))return a.map((v,i)=>lerp(v,b[i],t));
  if(a&&typeof a==='object'){const o={};for(const k in a)o[k]=(k in b)?lerp(a[k],b[k],t):a[k];return o}
  return a;
}
// ---------- poses (vista lateral mirando a la derecha; suelo y=192) ----------
const P={
 squat:{A:{hip:[104,110],torso:6,arm:{hand:[97,62],bend:-1},leg:{foot:[112,190],bend:-1}},
        B:{hip:[78,146],torso:40,arm:{hand:[98,108],bend:-1},leg:{foot:[112,190],bend:-1}},plate:'hand',ground:1},
 hinge:{A:{hip:[106,108],torso:4,arm:{hand:[112,112],bend:1},leg:{foot:[112,190],bend:-1}},
        B:{hip:[86,116],torso:78,arm:{hand:[132,158],bend:1},leg:{foot:[112,190],bend:-1}},plate:'hand',ground:1},
 legpress:{A:{hip:[80,150],torso:-60,arm:{hand:[72,162],bend:1},leg:{foot:[118,112],bend:-1}},
           B:{hip:[80,150],torso:-60,arm:{hand:[72,162],bend:1},leg:{foot:[144,96],bend:-1}},platform:1,
           st:'<line x1="18" y1="118" x2="86" y2="160" class="pr" stroke-width="7"/><line x1="70" y1="160" x2="104" y2="172" class="pr" stroke-width="6"/>'},
 bench:{A:{hip:[140,140],torso:-90,arm:{hand:[92,84],bend:1},leg:{foot:[178,190],bend:-1}},
        B:{hip:[140,140],torso:-90,arm:{hand:[94,126],bend:1},leg:{foot:[178,190],bend:-1}},plate:'hand',ground:1,
        st:'<rect x="48" y="147" width="104" height="7" rx="3" class="pf"/><line x1="60" y1="154" x2="60" y2="192" class="pr" stroke-width="4"/><line x1="140" y1="154" x2="140" y2="192" class="pr" stroke-width="4"/>'},
 incline:{A:{hip:[128,160],torso:-60,arm:{hand:[96,82],bend:1},leg:{foot:[170,190],bend:-1}},
          B:{hip:[128,160],torso:-60,arm:{hand:[92,128],bend:1},leg:{foot:[170,190],bend:-1}},plate:'hand',ground:1,
          st:'<line x1="136" y1="171" x2="58" y2="128" class="pr" stroke-width="7"/><line x1="120" y1="168" x2="150" y2="168" class="pr" stroke-width="7"/><line x1="128" y1="171" x2="128" y2="192" class="pr" stroke-width="4"/>'},
 ohpress:{A:{hip:[102,112],torso:0,arm:{hand:[114,60],bend:1},leg:{foot:[106,190],bend:-1}},
          B:{hip:[102,112],torso:0,arm:{hand:[104,10],bend:1},leg:{foot:[106,190],bend:-1}},plate:'hand',ground:1},
 row:{A:{hip:[70,160],torso:18,arm:{hand:[128,118],bend:1},leg:{foot:[150,176],bend:-1}},
      B:{hip:[70,160],torso:-4,arm:{hand:[96,120],bend:1},leg:{foot:[150,176],bend:-1}},cable:[196,140],
      st:'<rect x="44" y="163" width="56" height="8" rx="3" class="pf"/><line x1="156" y1="160" x2="156" y2="192" class="pr" stroke-width="5"/>',ground:1},
 facepull:{A:{hip:[90,112],torso:-4,arm:{hand:[138,60],bend:-1},leg:{foot:[100,190],bend:-1},leg2:{foot:[72,190],bend:-1}},
           B:{hip:[90,112],torso:-4,arm:{hand:[104,50],bend:-1},leg:{foot:[100,190],bend:-1},leg2:{foot:[72,190],bend:-1}},cable:[204,50],ground:1},
 pulldown:{A:{hip:[100,150],torso:-8,arm:{hand:[98,40],bend:1},leg:{th:90,sh:180}},
           B:{hip:[100,150],torso:-8,arm:{hand:[108,96],bend:1},leg:{th:90,sh:180}},cable:[100,0],bar:1,
           st:'<rect x="74" y="153" width="54" height="8" rx="3" class="pf"/><line x1="100" y1="161" x2="100" y2="192" class="pr" stroke-width="4"/><rect x="118" y="132" width="26" height="7" rx="3" class="pf"/>',ground:1},
 pullup:{A:{hip:[100,130],torso:0,arm:{hand:[104,24],bend:1},leg:{th:175,sh:200}},
         B:{hip:[100,96],torso:0,arm:{hand:[104,24],bend:1},leg:{th:175,sh:200}},
         st:'<line x1="56" y1="22" x2="150" y2="22" class="pr" stroke-width="5"/>'},
 curl:{A:{hip:[100,112],torso:0,arm:{ua:182,fa:178},leg:{foot:[104,190],bend:-1}},
       B:{hip:[100,112],torso:0,arm:{ua:174,fa:22},leg:{foot:[104,190],bend:-1}},plate:'hand',ground:1},
 pushdown:{A:{hip:[96,112],torso:10,arm:{ua:178,fa:70},leg:{foot:[100,190],bend:-1}},
           B:{hip:[96,112],torso:10,arm:{ua:178,fa:178},leg:{foot:[100,190],bend:-1}},cable:[132,0],ground:1},
 ohext:{A:{hip:[100,112],torso:0,arm:{ua:10,fa:200},leg:{foot:[104,190],bend:-1}},
        B:{hip:[100,112],torso:0,arm:{ua:10,fa:8},leg:{foot:[104,190],bend:-1}},plate:'hand',ground:1},
 skull:{A:{hip:[140,140],torso:-90,arm:{ua:-10,fa:-100},leg:{foot:[178,190],bend:-1}},
        B:{hip:[140,140],torso:-90,arm:{ua:-10,fa:-8},leg:{foot:[178,190],bend:-1}},plate:'hand',ground:1,st:null},
 dip:{A:{hip:[102,98],torso:10,arm:{hand:[110,100],bend:1},leg:{th:170,sh:215}},
      B:{hip:[96,128],torso:22,arm:{hand:[110,100],bend:1},leg:{th:170,sh:215}},
      st:'<line x1="96" y1="102" x2="140" y2="102" class="pr" stroke-width="6"/><line x1="134" y1="102" x2="134" y2="192" class="pr" stroke-width="4"/>',ground:1},
 calf:{A:{hip:[104,112],torso:0,arm:{ua:182,fa:178},leg:{foot:[108,186],bend:-1},toe:[122,190]},
       B:{hip:[106,100],torso:0,arm:{ua:182,fa:178},leg:{foot:[110,174],bend:-1},toe:[122,190]},plate:'hand',ground:1},
 lunge:{A:{hip:[100,110],torso:6,arm:{ua:178,fa:178},leg:{foot:[138,190],bend:-1},leg2:{foot:[50,146],bend:-1}},
        B:{hip:[92,142],torso:12,arm:{ua:178,fa:178},leg:{foot:[138,190],bend:-1},leg2:{foot:[50,146],bend:-1}},plate:'hand',ground:1,
        st:'<rect x="18" y="150" width="46" height="8" rx="3" class="pf"/><line x1="40" y1="158" x2="40" y2="192" class="pr" stroke-width="4"/>'},
 hipthrust:{A:{hip:[112,174],torso:-51,arm:{hand:[110,166],bend:-1},leg:{foot:[160,190],bend:-1}},
            B:{hip:[120,140],torso:-90,arm:{hand:[118,132],bend:-1},leg:{foot:[160,190],bend:-1}},plate:'hand',ground:1,
            st:'<rect x="26" y="142" width="46" height="9" rx="3" class="pf"/><line x1="48" y1="151" x2="48" y2="192" class="pr" stroke-width="4"/>'},
 legext:{A:{hip:[90,150],torso:-6,arm:{hand:[100,158],bend:1},leg:{th:92,sh:175}},
         B:{hip:[90,150],torso:-6,arm:{hand:[100,158],bend:1},leg:{th:92,sh:96}},pad:1,
         st:'<rect x="66" y="153" width="62" height="8" rx="3" class="pf"/><line x1="70" y1="156" x2="58" y2="98" class="pr" stroke-width="7"/><line x1="96" y1="161" x2="96" y2="192" class="pr" stroke-width="4"/>',ground:1},
 legcurl:{A:{hip:[110,150],torso:-90,arm:{hand:[50,164],bend:1},leg:{th:90,sh:90}},
          B:{hip:[110,150],torso:-90,arm:{hand:[50,164],bend:1},leg:{th:90,sh:-12}},pad:1,
          st:'<rect x="36" y="157" width="124" height="8" rx="3" class="pf"/><line x1="60" y1="165" x2="60" y2="192" class="pr" stroke-width="4"/><line x1="140" y1="165" x2="140" y2="192" class="pr" stroke-width="4"/>',ground:1},
 crunch:{A:{hip:[122,182],torso:-90,arm:{hand:[64,172],bend:1},leg:{foot:[162,190],bend:-1}},
         B:{hip:[122,182],torso:-60,arm:{hand:[74,146],bend:1},leg:{foot:[162,190],bend:-1}},ground:1},
 legraise:{A:{hip:[100,104],torso:0,arm:{ua:180,fa:90},leg:{th:178,sh:180}},
           B:{hip:[100,104],torso:0,arm:{ua:180,fa:90},leg:{th:86,sh:176}},
           st:'<line x1="90" y1="40" x2="90" y2="192" class="pr" stroke-width="6"/><line x1="90" y1="100" x2="134" y2="100" class="pr" stroke-width="5"/>',ground:1},
 wheel:{A:{hip:[70,158],torso:50,arm:{hand:[108,180],bend:1},leg:{knee:[60,184],foot:[22,188]}},
        B:{hip:[96,170],torso:82,arm:{hand:[196,180],bend:1},leg:{knee:[60,184],foot:[22,188]}},wheel:1,ground:1},
 pallof:{A:{hip:[96,112],torso:0,arm:{hand:[112,84],bend:1},leg:{foot:[100,190],bend:-1},leg2:{foot:[84,190],bend:-1}},
         B:{hip:[96,112],torso:0,arm:{hand:[148,80],bend:1},leg:{foot:[100,190],bend:-1},leg2:{foot:[84,190],bend:-1}},cable:[204,82],ground:1},
 wrist:{A:{hip:[70,150],torso:10,arm:{ua:160,fa:90},leg:{th:90,sh:180},wrist:140},
        B:{hip:[70,150],torso:10,arm:{ua:160,fa:90},leg:{th:90,sh:180},wrist:40},plate:'wrist',
        st:'<rect x="46" y="153" width="44" height="8" rx="3" class="pf"/><line x1="68" y1="161" x2="68" y2="192" class="pr" stroke-width="4"/>',ground:1},
 pullover:{A:{hip:[140,140],torso:-90,arm:{ua:-95,fa:-95},leg:{foot:[178,190],bend:-1}},
           B:{hip:[140,140],torso:-90,arm:{ua:-5,fa:-5},leg:{foot:[178,190],bend:-1}},plate:'hand',ground:1,st:null},
};
P.skull.st=P.bench.st;P.pullover.st=P.bench.st;
// vista frontal
const FR={
 lateral:{A:{arm:12,sh:0,leg:5},B:{arm:86,sh:0,leg:5},plates:1},
 shrug:{A:{arm:6,sh:0,leg:5},B:{arm:6,sh:-9,leg:5},plates:1},
 fly:{A:{hands:[70,66],sh:0,leg:5},B:{hands:[10,84],sh:0,leg:5}},
 revfly:{A:{hands:[10,84],sh:0,leg:5},B:{hands:[70,66],sh:0,leg:5}},
 adduct:{A:{arm:8,sh:0,leg:26},B:{arm:8,sh:0,leg:5}},
 abduct:{A:{arm:8,sh:0,leg:5},B:{arm:8,sh:0,leg:26}},
};
const ln=(a,b,w,c)=>`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" class="${c||'fg'}" stroke-width="${w}"/>`;
const ci=(p,r,c)=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${r}" class="${c}"/>`;
function legPts(hip,leg){
  if(leg.knee)return [leg.knee,leg.foot];
  if(leg.foot)return ik(hip,leg.foot,LEN.th,LEN.sh,leg.bend);
  const k=add(hip,leg.th,LEN.th);return [k,add(k,leg.sh,LEN.sh)];
}
function drawSide(def,p){
  let s='';const hip=p.hip,sh=add(hip,p.torso,LEN.torso),head=add(sh,p.torso,15);
  if(def.ground)s+='<line x1="4" y1="192" x2="216" y2="192" class="gr" stroke-width="2"/>';
  if(def.st)s+=def.st;
  let el,hand;
  if(p.arm.hand){[el,hand]=ik(sh,p.arm.hand,LEN.ua,LEN.fa,p.arm.bend)}else{el=add(sh,p.arm.ua,LEN.ua);hand=add(el,p.arm.fa,LEN.fa)}
  if(def.cable)s+=ln(hand,def.cable,1.5,'cb');
  if(p.leg2){const [k2,f2]=legPts(hip,p.leg2);s+=ln(hip,k2,7,'fg2')+ln(k2,f2,6,'fg2')}
  const [k,f]=legPts(hip,p.leg);s+=ln(hip,k,8)+ln(k,f,7);
  if(p.toe)s+=ln(f,p.toe,6);
  if(def.pad)s+=ci(f,6,'pf');
  if(def.platform)s+=ln([f[0]-12,f[1]-14],[f[0]+12,f[1]+14],5,'pr');
  s+=ln(hip,sh,10)+ci(head,10,'hd');
  s+=ln(sh,el,6)+ln(el,hand,5);
  let tip=hand;if(p.wrist!==undefined){tip=add(hand,p.wrist,12);s+=ln(hand,tip,4)}
  if(def.bar)s+=ln([hand[0]-22,hand[1]],[hand[0]+22,hand[1]],3,'pr');
  if(def.plate==='hand')s+=ci(hand,9,'pl');
  if(def.plate==='wrist')s+=ci(tip,6,'pl');
  if(def.wheel)s+=ci([hand[0],hand[1]+2],8,'pl');
  return s;
}
function drawFront(def,p){
  const cx=110,sy=62+p.sh;let s='<line x1="4" y1="192" x2="216" y2="192" class="gr" stroke-width="2"/>';
  const hip=[cx,112];
  [-1,1].forEach(sg=>{const k=[cx+sg*8+sg*Math.sin(rad(p.leg))*40,112+Math.cos(rad(p.leg))*40];
    const f=[cx+sg*8+sg*Math.sin(rad(p.leg))*80,112+Math.cos(rad(p.leg))*80];s+=ln([cx+sg*8,112],k,8)+ln(k,f,7)});
  s+=ln([cx,sy],hip,12)+ln([cx-18,sy],[cx+18,sy],8)+ci([cx,sy-17],10,'hd');
  [-1,1].forEach(sg=>{const sp=[cx+sg*18,sy];let h;
    if(p.hands){h=[cx+sg*p.hands[0],p.hands[1]]}else{h=[sp[0]+sg*Math.sin(rad(p.arm))*54,sp[1]+Math.cos(rad(p.arm))*54]}
    s+=ln(sp,h,5);if(def.plates)s+=ci(h,7,'pl')});
  return s;
}
const PATTERNS={squat:'Sentadilla',hinge:'Bisagra de cadera',legpress:'Prensa',bench:'Press horizontal (banco)',incline:'Press inclinado',ohpress:'Press vertical',
 row:'Remo',facepull:'Face pull',pulldown:'Jalón',pullup:'Dominada',curl:'Curl',pushdown:'Extensión de tríceps abajo',ohext:'Extensión sobre la cabeza',
 skull:'Press francés',dip:'Fondos',calf:'Gemelo',lunge:'Zancada / búlgara',hipthrust:'Hip thrust',legext:'Extensión de pierna',legcurl:'Curl femoral',
 crunch:'Crunch',legraise:'Elevación de piernas',wheel:'Rueda / plancha',pallof:'Anti-rotación',wrist:'Muñeca',pullover:'Pullover',
 lateral:'Elevación lateral',shrug:'Encogimiento',fly:'Aperturas',revfly:'Aperturas invertidas',adduct:'Aducción',abduct:'Abducción'};
function frame(pattern,t){
  if(FR[pattern]){const d=FR[pattern];return drawFront(d,lerp(d.A,d.B,t))}
  const d=P[pattern]||P.curl;return drawSide(d,lerp(d.A,d.B,t));
}
const live=new Set();
function svg(pattern){return `<svg class="anim" viewBox="0 0 220 200" data-pattern="${pattern}">${frame(pattern,0)}</svg>`}
function loop(ts){
  document.querySelectorAll('svg.anim').forEach(el=>{
    const ph=(ts/2600)%1;const t=(1-Math.cos(ph*2*Math.PI))/2;el.innerHTML=frame(el.dataset.pattern,t)});
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.Anim={svg,frame,PATTERNS};
})();
