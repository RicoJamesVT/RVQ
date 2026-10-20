(()=>{
const $=id=>document.getElementById(id);
const cv=$('stage'),g=cv.getContext('2d');
const CH=[['E',40],['A',45],['D',50],['G',43],['B',47],['C',48]];
let ac,master,dist,clean,mode='punk',cur=0,minor=false;
const strs=Array.from({length:6},()=>({amp:0,ph:0}));
const sparks=[];let flash=0,beatN=0,W=0,H=0,dpr=1;
const cache={};
// pads
const pads=$('pads');
CH.forEach((c,i)=>{const b=document.createElement('button');b.className='pad'+(i?'':' sel');b.innerHTML=c[0]+'<small>'+(i<3?'I IV V'.split(' ')[i]:'')+'</small>';
 b.addEventListener('pointerdown',e=>{e.preventDefault();ensure();setChord(i);strum(1,0.9)});pads.appendChild(b)});
function setChord(i){cur=i;[...pads.children].forEach((p,j)=>p.classList.toggle('sel',j===i))}
function notes(c=cur,m=mode){const r=CH[c][1];
 return m==='punk'?[r,r+7,r+12,r+19,r+24,r+31]:[r+12,r+19,r+24,r+(minor?27:28),r+31,r+36]}
// audio
function ensure(){if(ac){if(ac.state!=='running')ac.resume();return}
 ac=new(window.AudioContext||window.webkitAudioContext)();
 master=ac.createGain();master.gain.value=.8;
 const comp=ac.createDynamicsCompressor();master.connect(comp);comp.connect(ac.destination);
 dist=ac.createWaveShaper();const k=new Float32Array(1024);
 for(let i=0;i<1024;i++){const x=i/512-1;k[i]=Math.tanh(x*9)}
 dist.curve=k;dist.oversample='2x';
 const lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=3800;
 const dg=ac.createGain();dg.gain.value=.55;
 dist.connect(lp);lp.connect(dg);dg.connect(master);
 clean=ac.createGain();clean.gain.value=.9;clean.connect(master)}
function pluck(m,decay){const key=m+'_'+decay;if(cache[key])return cache[key];
 const sr=ac.sampleRate,f=440*Math.pow(2,(m-69)/12),N=Math.round(sr/f),len=Math.floor(sr*(decay>.9?1.6:.35));
 const buf=ac.createBuffer(1,len,sr),d=buf.getChannelData(0);
 for(let i=0;i<N;i++)d[i]=Math.random()*2-1;
 for(let i=N;i<len;i++)d[i]=(d[i-N]+d[i-N+1])*.5*decay;
 return cache[key]=buf}
function note(m,vel,when,md=mode){
 const s=ac.createBufferSource();s.buffer=pluck(m,md==='punk'?.9985:.97);
 const gn=ac.createGain();gn.gain.value=vel*.35;
 if(md==='ska'){gn.gain.setValueAtTime(vel*.35,when);gn.gain.exponentialRampToValueAtTime(.001,when+.28)}
 s.connect(gn);gn.connect(md==='punk'?dist:clean);s.start(when)}
function strum(dir,vel,at,ch=cur,md=mode){ensure();const n=notes(ch,md),t=at||ac.currentTime;
 if(at===undefined)rec({k:'s',dir,vel,ch,md});
 const order=dir>0?[0,1,2,3,4,5]:[5,4,3,2,1,0];
 order.forEach((s,k)=>{note(n[s],vel,t+k*.012,md);const w=t+k*.012-ac.currentTime;setTimeout(()=>hit(s,vel),Math.max(0,w*1000))})}
function hit(s,v){strs[s].amp=Math.min(1,.4+v*.6);
 for(let i=0;i<6;i++)sparks.push({x:W*(.2+Math.random()*.6),y:sy(s),vx:(Math.random()-.5)*8,vy:(Math.random()-.5)*8,l:1,c:Math.random()<.5?'#ffd400':'#ff2d55'})}
// drums
const nz=()=>{const b=ac.createBuffer(1,ac.sampleRate*.3,ac.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;return b};
let nbuf;
let drum=function(type,t){const gn=ac.createGain();gn.connect(master);
 if(type==='k'){const o=ac.createOscillator();o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(40,t+.12);
  gn.gain.setValueAtTime(1,t);gn.gain.exponentialRampToValueAtTime(.001,t+.18);o.connect(gn);o.start(t);o.stop(t+.2)}
 else{nbuf=nbuf||nz();const s=ac.createBufferSource();s.buffer=nbuf;const f=ac.createBiquadFilter();
  f.type=type==='h'?'highpass':'bandpass';f.frequency.value=type==='h'?7000:1800;
  gn.gain.setValueAtTime(type==='h'?.25:.7,t);gn.gain.exponentialRampToValueAtTime(.001,t+(type==='h'?.05:.15));
  s.connect(f);f.connect(gn);s.start(t);s.stop(t+.2)}}
let drumsOn=false,autoOn=false,next=0,step=0,timer;
const bpm=()=>+$('bpm').value;
function sched(){while(next<ac.currentTime+.12){const s=step%8,t=next;
  if(mode==='punk'){ if(s%4===0)drum('k',t); if(s===2||s===6)drum('s',t); drum('h',t); if(s===5)drum('k',t);
    if(autoOn)strum(1,.8,t)}
  else{ if(s%4===0)drum('k',t); if(s===2||s===6)drum('s',t); if(s%2===1)drum('h',t);
    if(autoOn&&s%2===1)strum(-1,.7,t)}
  const d=Math.max(0,(t-ac.currentTime)*1000),st=s;setTimeout(()=>{beatN=st;if(st%2===0)flash=1},d);
  next+=60/bpm()/2;step++}}
function runClock(){clearInterval(timer);if(!(drumsOn||autoOn))return;ensure();next=ac.currentTime+.05;step=0;
 timer=setInterval(()=>{if(drumsOn||autoOn)sched()},25)}
function tog(id,label,get,set){const b=$(id);b.onclick=()=>{ensure();set(!get());b.classList.toggle('on',get());b.textContent=label+': '+(get()?'ON':'OFF');runClock()}}
// drums that are off but auto on: keep rhythm silent by skipping drum calls
const _d=drum;drum=function(t,w){if(drumsOn)_d(t,w)};
tog('drums','DRUMS',()=>drumsOn,v=>drumsOn=v);
tog('auto','AUTO',()=>autoOn,v=>autoOn=v);
$('bpm').oninput=e=>$('bpmv').textContent=e.target.value;
$('mode').onclick=e=>{ensure();mode=mode==='punk'?'ska':'punk';
 e.target.textContent='MODE: '+mode.toUpperCase();e.target.classList.toggle('on',mode==='ska');
 if(mode==='ska'){$('bpm').value=150}else{$('bpm').value=180}$('bpmv').textContent=$('bpm').value}
$('go').onclick=()=>{$('start').remove();ensure()};
// looper
let LS='idle',L=0,LT=0,LN=0,ev=[],bars=2;
const lb=$('loop'),LB=$('bars'),LC=$('clear');
function rec(e){if(LS!=='rec'&&LS!=='dub')return;e.t=(ac.currentTime-LT)%L;ev.push(e)}
function playEv(e,w){if(e.k==='s')strum(e.dir,e.vel,w,e.ch,e.md);
 else{note(notes(e.ch,e.md)[e.s],e.vel,w,e.md);setTimeout(()=>hit(e.s,e.vel),Math.max(0,(w-ac.currentTime)*1000))}}
function ltick(){if(LS==='idle'||LS==='rec'&&!ac)return;const now=ac.currentTime;
 if(LS==='rec'){if(now>=LT+L){LS='play';LN=LT+L;ui()}return}
 const end=now+.12;
 for(let k=Math.max(0,Math.floor((LN-LT)/L));LT+k*L<end;k++)for(const e of ev){const t=LT+k*L+e.t;if(t>=LN&&t<end)playEv(e,Math.max(t,now))}
 LN=end}
setInterval(ltick,25);
function ui(){lb.textContent={idle:'LOOP: REC',rec:'\u25CF RECORDING',play:'LOOP: PLAYING',dub:'+ OVERDUB'}[LS];
 lb.classList.toggle('on',LS!=='idle');lb.classList.toggle('rec',LS==='rec'||LS==='dub');LB.textContent='BARS: '+bars}
lb.onclick=()=>{ensure();
 if(LS==='idle'){L=bars*4*60/bpm();LT=ac.currentTime;ev=[];LS='rec'}
 else if(LS==='rec'){const el=ac.currentTime-LT;if(el<.4)LS='idle';else{L=el;LS='play';LN=ac.currentTime}}
 else LS=LS==='play'?'dub':'play';ui()};
LB.onclick=()=>{bars=bars===4?1:bars*2;ui()};
LC.onclick=()=>{LS='idle';ev=[];ui()};
ui();
// canvas
function size(){dpr=Math.min(2,devicePixelRatio||1);W=cv.clientWidth;H=cv.clientHeight;cv.width=W*dpr;cv.height=H*dpr;g.setTransform(dpr,0,0,dpr,0,0)}
addEventListener('resize',size);addEventListener('orientationchange',()=>setTimeout(size,200));size();
const sy=s=>H*(.12+s*.152);
const ptr={};
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ensure();ptr[e.pointerId]={y:e.offsetY,t:performance.now()};
 const s=nearest(e.offsetY);if(s>=0)one(s,.8)});
cv.addEventListener('pointermove',e=>{const p=ptr[e.pointerId];if(!p)return;const now=performance.now(),y=e.offsetY;
 const sp=Math.min(1,Math.abs(y-p.y)/(now-p.t+1)/1.5+.35);
 for(let s=0;s<6;s++){const l=sy(s);if((p.y<l&&y>=l)||(p.y>l&&y<=l))one(s,sp)}
 p.y=y;p.t=now});
cv.addEventListener('pointerup',e=>delete ptr[e.pointerId]);
cv.addEventListener('pointercancel',e=>delete ptr[e.pointerId]);
function nearest(y){for(let s=0;s<6;s++)if(Math.abs(y-sy(s))<H*.04)return s;return -1}
function one(s,v){rec({k:'o',s,vel:v,ch:cur,md:mode});note(notes()[s],v,ac.currentTime);hit(s,v)}
addEventListener('keydown',e=>{if(e.repeat)return;const i='123456'.indexOf(e.key);
 if(i>=0){ensure();setChord(i)}else if(e.code==='Space'){e.preventDefault();strum(1,.9)}
 else if(e.key==='ArrowDown')strum(1,.9);else if(e.key==='ArrowUp')strum(-1,.9)});
function draw(t){
 g.clearRect(0,0,W,H);const p=mode==='punk';
 // checkerboard for ska, torn stripes for punk
 const sq=Math.max(40,W/10);
 for(let y=0;y*sq<H;y++)for(let x=0;x*sq<W;x++){g.fillStyle=(x+y)%2?(p?'#1a1a1a':'#101010'):(p?'#260a14':'#1b1b1b');g.fillRect(x*sq,y*sq,sq,sq)}
 if(flash>0){g.fillStyle=(p?'rgba(255,45,85,':'rgba(255,212,0,')+flash*.25+')';g.fillRect(0,0,W,H);flash*=.88}
 g.fillStyle='rgba(255,255,255,.07)';g.font=`bold ${Math.min(W/4,H/3)}px Impact,sans-serif`;g.textAlign='center';
 g.fillText(CH[cur][0]+(p?'5':minor?'m':''),W/2,H/2+Math.min(W/8,H/6));
 for(let s=0;s<6;s++){const o=strs[s],y=sy(s);o.ph+=.6+s*.2;o.amp*=.965;
  g.lineWidth=2+(5-s)*.0+(6-s)*.9;g.strokeStyle=o.amp>.05?(p?'#ff2d55':'#ffd400'):'#ddd';
  g.shadowColor=g.strokeStyle;g.shadowBlur=o.amp*25;g.beginPath();
  for(let x=0;x<=W;x+=8){const e=Math.sin(x/W*Math.PI),yy=y+Math.sin(x*.05+o.ph)*o.amp*20*e;x?g.lineTo(x,yy):g.moveTo(x,yy)}
  g.stroke();g.shadowBlur=0}
 for(let i=sparks.length-1;i>=0;i--){const q=sparks[i];q.x+=q.vx;q.y+=q.vy;q.vy+=.25;q.l-=.03;if(q.l<=0){sparks.splice(i,1);continue}
  g.globalAlpha=q.l;g.fillStyle=q.c;g.fillRect(q.x,q.y,5,5)}
 g.globalAlpha=1;
 // beat lights
 for(let i=0;i<8;i++){g.fillStyle=(drumsOn||autoOn)&&i===beatN?'#ffd400':'#333';g.fillRect(12+i*22,H-22,16,10)}
 if(LS!=='idle'&&ac){const ph=Math.min(1,((ac.currentTime-LT)%(LS==='rec'?1e9:L))/L);
  g.fillStyle=LS==='play'?'#ffd400':'#ff2d55';g.fillRect(0,H-8,W*ph,8)}
 requestAnimationFrame(draw)}
requestAnimationFrame(draw);
})();
