const inks=[{name:'Cherry',hex:'#e74435',className:'ink-red'},{name:'Electric',hex:'#f5cc39',className:'ink-yellow'},{name:'Night',hex:'#302a68',className:'ink-purple'}];
const designs=[{id:'boom',title:'BOOM BAP',subtitle:'Beat maker',color:'#e74435',accent:'#f5cc39',stamp:'★'},{id:'fresh',title:'STAY FRESH',subtitle:'Keep it crisp',color:'#35a99e',accent:'#f5cc39',stamp:'✦'},{id:'gold',title:'GOLDEN ERA',subtitle:'Since ‘88',color:'#f5cc39',accent:'#302a68',stamp:'♛'}];
const shirts=['#ece6d9','#d6e4e0','#ead5d0','#d9d8ea'],lvls=['THE STARTER','THE APPRENTICE','THE PRO','THE MASTER'],N=20;
const $=id=>document.getElementById(id),pad=n=>String(n).padStart(4,'0'),clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),R=(a,b)=>a+Math.random()*(b-a);
let inkIndex=0,designIndex=0,stage=0,score=0,streak=0,level=0,orderNo=100,order,done=0,dx=0,dy=0,tx=0,ty=0,cov=Array(N).fill(0),alignQ=0,cureQ=0,needle=.5,raf=0,best=0,drag=null,res={},shirtIdx=0,lk=null;
try{best=+localStorage.getItem('cbp-best')||0}catch(e){}
const avg=()=>cov.reduce((a,b)=>a+b,0)/N,vib=n=>{try{navigator.vibrate&&navigator.vibrate(n)}catch(e){}};
const letter=q=>q>=.9?'A+':q>=.75?'A':q>=.55?'B':q>=.35?'C':'D';
function newOrder(){orderNo++;done=0;order={d:Math.floor(R(0,3)),i:Math.floor(R(0,3)),qty:2+Math.min(level,2)}}
function newShirt(){if(order&&done>=order.qty){level=Math.min(3,level+1);newOrder()}stage=0;dx=dy=0;tx=R(-45,45);ty=R(-25,25);cov.fill(0);alignQ=cureQ=0;shirtIdx=Math.floor(R(0,shirts.length));cancelAnimationFrame(raf);update()}
function renderChoices(){const lock=stage===1||stage===2;
$('ink-list').innerHTML=inks.map((x,i)=>`<button ${lock?'disabled':''} class="ink-swatch ${i===inkIndex?'selected':''}" data-ink="${i}" aria-label="Choose ${x.name} ink"><span class="${x.className}"></span><span>${x.name}</span>${i===inkIndex?'✓':''}</button>`).join('');
$('design-list').innerHTML=designs.map((x,i)=>`<button ${lock?'disabled':''} class="design-option ${i===designIndex?'selected':''}" data-design="${i}"><span class="design-mini" style="background:${x.color};color:${x.accent}">${x.stamp}</span><span><b>${x.title}</b><small>${x.subtitle}</small></span>${i===designIndex?'✓':''}</button>`).join('');
document.querySelectorAll('[data-ink]').forEach(b=>b.onclick=()=>{inkIndex=+b.dataset.ink;if(stage===3)newShirt();renderChoices();update()});
document.querySelectorAll('[data-design]').forEach(b=>b.onclick=()=>{designIndex=+b.dataset.design;if(stage===3)newShirt();renderChoices();update()})}
function place(){$('frame').style.translate=`${dx}px ${dy}px`;$('ring').style.translate=`${tx}px ${ty}px`;$('dot').style.translate=`${dx}px ${dy}px`}
function update(){const ink=inks[inkIndex],d=designs[designIndex],a=avg(),fin=stage===3,lock=stage===1||stage===2;
if(lock!==lk){lk=lock;renderChoices()}
$('press').dataset.stage=stage;$('press').classList.toggle('pressed',lock);place();
$('loaded-dot').className=ink.className;$('loaded-name').textContent=ink.name.toUpperCase();
const art=$('design-art');art.style.color=d.color;art.style.borderColor=d.color;
art.style.background=stage>=1&&a>0?`linear-gradient(90deg,${cov.map((c,i)=>`color-mix(in srgb,${ink.hex} ${Math.round(c*100)}%,transparent) ${i*100/N}% ${(i+1)*100/N}%`).join(',')})`:'transparent';
$('art-stamp').textContent=d.stamp;$('art-title').textContent=d.title;$('art-subtitle').textContent=d.subtitle;
const sa=$('shirt-art');sa.style.opacity=fin?.35+.65*a:0;sa.style.color=sa.style.borderColor=ink.hex;sa.style.translate=`${(dx-tx)*.6}px ${(dy-ty)*.6}px`;sa.style.filter=fin&&cureQ<.35?'blur(1.5px) saturate(.6)':'none';
document.querySelector('.shirt').style.background=shirts[shirtIdx];
$('shirt-stamp').textContent=d.stamp;$('shirt-title').textContent=d.title;$('shirt-subtitle').textContent=d.subtitle;
$('top-score').textContent=pad(score);$('big-score').textContent=pad(score);$('score-bar').style.width=Math.min(100,score/25)+'%';$('combo-pill').textContent='STREAK '+streak;
$('lvl').textContent=`LEVEL 0${level+1} / ${lvls[level]}`;
$('oid').textContent=orderNo;$('otext').textContent=`${order.qty}× ${designs[order.d].title} · ${inks[order.i].name.toUpperCase()}`;$('odots').textContent='●'.repeat(done)+'○'.repeat(Math.max(0,order.qty-done));
$('status').textContent=['READY TO PRINT','PULL THE INK','CURING…','PRINT COMPLETE'][stage];
$('coach-text').textContent=[`STEP 1 · DRAG TO LINE THE DOT UP WITH THE RING`,`STEP 2 · SWIPE ACROSS THE SCREEN · COVERAGE ${Math.round(a*100)}%`,`STEP 3 · TAP WHEN THE NEEDLE HITS GREEN`,`${res.title||''} · ${res.gain>=0?'+'+res.gain:''}`][stage];
$('coach').classList.toggle('cure',stage===2);
$('print-label').textContent=['LOCK THE SCREEN','LIFT THE SCREEN','FLASH CURE!','NEXT SHIRT'][stage];
$('coverage').textContent=fin?Math.round(a*100)+'%':'—';$('alignment').textContent=fin?letter(alignQ):'—';$('cure').textContent=fin?letter(cureQ):'—';$('best').textContent=pad(best);
$('badge-title').textContent=fin?res.title:'NO PRINT YET';$('badge-copy').textContent=fin?res.copy:'Your best work is next.'}
function toast(m){const t=$('toast');t.textContent=m;t.classList.remove('show');void t.offsetWidth;t.classList.add('show')}
function splat(){for(let i=0;i<14;i++){const s=document.createElement('i'),g=R(0,6.28),r=R(50,130);s.className='splat';s.style.background=inks[inkIndex].hex;s.style.setProperty('--x',Math.cos(g)*r+'px');s.style.setProperty('--y',Math.sin(g)*r-30+'px');$('press').appendChild(s);setTimeout(()=>s.remove(),900)}}
function startNeedle(){const t0=performance.now(),sp=.0035+level*.001;(function f(t){needle=.5+.5*Math.sin((t-t0)*sp-Math.PI/2);$('needle').style.left=needle*100+'%';raf=requestAnimationFrame(f)})(t0)}
function flash(){cancelAnimationFrame(raf);const d=Math.abs(needle-.5);cureQ=d<.07?1:clamp(1-(d-.07)/.43,0,1);finish()}
function finish(){const a=avg();alignQ=clamp(1-Math.hypot(dx-tx,dy-ty)/60,0,1);const raw=a*400+alignQ*300+cureQ*300;
const g=raw>=900?['PERFECT PULL','Flawless registration.']:raw>=750?['CLEAN PULL','You’re on a roll.']:raw>=550?['DECENT PRINT','Good enough to ship.']:raw>=350?['ROUGH PULL','Check your alignment.']:['MISPRINT','Toss it and go again.'];
let gain=Math.round(raw/4*(1+.1*Math.min(streak,5)));const match=inkIndex===order.i&&designIndex===order.d;
if(raw>=550)streak++;else streak=0;
if(!match){gain=Math.round(gain*.3);g[1]='Wrong job — check the order!'}else if(raw>=350){done++;gain+=100;if(done>=order.qty){gain+=400;g[1]='ORDER COMPLETE +400'}}
score+=gain;res={title:g[0],copy:g[1],gain};stage=3;if(score>best){best=score;try{localStorage.setItem('cbp-best',best)}catch(e){}}
update();const p=$('press');p.classList.remove('printing');void p.offsetWidth;p.classList.add('printing');splat();vib(raw>=750?[30,40,30]:25);toast(`+${gain} ${g[0]}${match?'':' · WRONG JOB'}`)}
const press=$('press');
function sq(e,first){const r=$('frame').getBoundingClientRect(),x=clamp((e.clientX-r.left)/r.width,0,.999),c=Math.floor(x*N),a=Math.floor(clamp((drag.lx-r.left)/r.width,0,.999)*N);
const sp=first?.5:Math.abs(e.clientX-drag.lx)/Math.max(1,e.timeStamp-drag.t),q=clamp(1.15-sp*.45,.25,1)*.7;
for(let i=Math.min(a,c);i<=Math.max(a,c);i++)cov[i]=Math.min(1,cov[i]+q);
drag.lx=e.clientX;drag.t=e.timeStamp;const s=$('squeegee');s.classList.add('on');s.style.left=x*100+'%';update()}
press.addEventListener('pointerdown',e=>{if(stage===2){flash();return}if(stage>1)return;drag={x:e.clientX,y:e.clientY,dx,dy,lx:e.clientX,t:e.timeStamp};try{press.setPointerCapture(e.pointerId)}catch(_){}if(stage===1)sq(e,true)});
press.addEventListener('pointermove',e=>{if(!drag)return;if(stage===0){dx=clamp(drag.dx+e.clientX-drag.x,-80,80);dy=clamp(drag.dy+e.clientY-drag.y,-50,50);place()}else if(stage===1)sq(e)});
const end=()=>{drag=null;$('squeegee').classList.remove('on')};press.addEventListener('pointerup',end);press.addEventListener('pointercancel',end);
addEventListener('keydown',e=>{if(stage!==0||!$('help-modal').hidden)return;const k={ArrowLeft:[-4,0],ArrowRight:[4,0],ArrowUp:[0,-4],ArrowDown:[0,4]}[e.key];if(k){e.preventDefault();dx=clamp(dx+k[0],-80,80);dy=clamp(dy+k[1],-50,50);place()}});
$('print-button').onclick=()=>{if(stage===0){stage=1;vib(15);update()}else if(stage===1){if(avg()<.15)toast('PULL SOME INK FIRST');else{stage=2;$('squeegee').classList.remove('on');update();startNeedle();vib(15)}}else if(stage===2)flash();else newShirt()};
$('reset-button').onclick=()=>{score=0;streak=0;level=0;orderNo=100;newOrder();newShirt()};
$('help-button').onclick=()=>{$('help-modal').hidden=false};$('close-help').onclick=$('got-it').onclick=()=>{$('help-modal').hidden=true};$('help-modal').onclick=e=>{if(e.target.id==='help-modal')$('help-modal').hidden=true};
newOrder();newShirt();
