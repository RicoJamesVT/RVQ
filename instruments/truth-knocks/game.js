(() => {
  // ---------------------------------------------------------------------
  // Responsive layout
  //
  // The game world is a fixed 1280x720 (16:9) canvas. We never stretch it
  // and we never draw touch buttons on top of it. Instead JS measures the
  // real viewport and gives the stage a true 16:9 box, and the touch
  // controls get their own dedicated area outside that box:
  //   * none   - keyboard/mouse device: stage fills the window, no buttons
  //   * side   - wide touch screens (phone landscape): D-pad on the left,
  //              action buttons on the right, stage in the middle
  //   * bottom - tall touch screens (portrait phones, tablets): stage above,
  //              D-pad + action buttons in a band underneath
  // For touch devices we compute both arrangements and use whichever leaves
  // the bigger game view, so the stage is as large as it can be without any
  // button ever covering it. Re-runs on resize, rotation and viewport changes.
  // ---------------------------------------------------------------------
  const CTRL_PAD = 8;        // padding inside a control zone
  let hudK = 1;              // HUD/text scale so it stays readable on small stages
  let touchMode = (()=>{
    try{
      const coarse = matchMedia('(any-pointer: coarse)').matches;
      return coarse || (navigator.maxTouchPoints||0) > 0 || 'ontouchstart' in window;
    }catch(_){ return false }
  })();
  const hybridDevice = (()=>{ try{ return matchMedia('(any-pointer: fine)').matches }catch(_){ return false } })();

  function layout(){
    const shell = document.getElementById('gameShell');
    const wrap = document.getElementById('stageWrap');
    if(!shell||!wrap)return;
    document.body.classList.toggle('touch', touchMode);
    const vw = shell.clientWidth, vh = shell.clientHeight;
    if(!vw || !vh) return;
    const R = 16/9;
    const fit = (aw, ah) => { let w = aw, h = aw/R; if(h > ah){ h = ah; w = h*R } return {w:Math.max(1,Math.floor(w)), h:Math.max(1,Math.floor(h))} };
    let mode = 'none', s;

    if(!touchMode){
      s = fit(vw, vh);
      shell.style.gridTemplateColumns = '1fr';
      shell.style.gridTemplateRows = '1fr';
      shell.style.gridTemplateAreas = '"stage"';
    } else {
      // Option A: controls in side columns
      const padW = Math.round(Math.max(168, Math.min(220, vw*0.19)));
      const actW = Math.round(Math.max(150, Math.min(210, vw*0.17)));
      const sideS = fit(Math.max(1, vw - padW - actW), vh);
      // Option B: controls in a band under the stage
      const bandH = Math.round(Math.max(168, Math.min(250, vh*0.27)));
      const botS = fit(vw, Math.max(1, vh - bandH));
      const wantSide = vw > vh && sideS.w*sideS.h >= botS.w*botS.h*0.85;  // prefer thumbs-at-the-sides on landscape phones
      if(wantSide){
        mode = 'side'; s = sideS;
        shell.style.gridTemplateColumns = padW+'px 1fr '+actW+'px';
        shell.style.gridTemplateRows = '1fr';
        shell.style.gridTemplateAreas = '"pad stage action"';
        shell.style.setProperty('--pause-left', Math.round(padW/2 - 23)+'px');
        shell.style.setProperty('--pause-right', 'auto');
        shell.style.setProperty('--pause-top', '12px');
      } else {
        mode = 'bottom'; s = botS;
        const padCol = Math.round(Math.max(168, Math.min(300, vw*0.38)));
        shell.style.gridTemplateColumns = padCol+'px 1fr';
        shell.style.gridTemplateRows = '1fr '+bandH+'px';
        shell.style.gridTemplateAreas = '"stage stage" "pad action"';
        // Where does the pause button go? Under the stage if there's room,
        // otherwise in the middle of the control band.
        const zoneH = vh - bandH, below = (zoneH - s.h)/2;
        shell.style.setProperty('--pause-top', below >= 40 ? Math.round((zoneH + s.h)/2 + 6)+'px' : Math.round(vh - bandH/2 - 20)+'px');
        shell.style.setProperty('--pause-left', below >= 40 ? 'auto' : 'calc(50% - 23px)');
        shell.style.setProperty('--pause-right', below >= 40 ? '10px' : 'auto');
      }
    }
    shell.dataset.mode = mode;
    wrap.style.width = s.w+'px';
    wrap.style.height = s.h+'px';
    // Rotate hint only when there's a lot of unused room (tall portrait phones)
    const hint = document.getElementById('rotateHint');
    if(hint){
      const zoneH = mode==='bottom' ? vh - Math.round(Math.max(168, Math.min(250, vh*0.27))) : 0;
      const spare = (zoneH - s.h)/2;
      hint.classList.toggle('hidden', !(mode==='bottom' && vw < vh && spare >= 90));
      if(!hint.classList.contains('hidden')) hint.style.top = Math.round((zoneH - s.h)/2 - 34)+'px';
    }
    // Keep HUD text ~9.5 CSS px or larger on small stages (canvas is 1280 wide)
    hudK = Math.min(1.8, Math.max(1, 9.5/(17*(s.w/1280))));
  }
  addEventListener('resize', layout);
  addEventListener('orientationchange', ()=>{ setTimeout(layout,60); setTimeout(layout,300); });
  if(window.visualViewport) visualViewport.addEventListener('resize', layout);
  if(window.ResizeObserver){ try{ new ResizeObserver(()=>layout()).observe(document.getElementById('gameShell')) }catch(_){} }
  layout();

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;
  const GROUND = 575;
  const DEPTH_MIN = 455;
  const DEPTH_MAX = 570;
  // Unified input layer: keyboard + multi-touch feed the same action state.
  // Pointer capture keeps a held direction/action alive even if the finger
  // drifts outside the button (important on small touch screens).
  const keys = new Set(), touchKeys = new Set();
  const pointerKeys = new Map();
  const img = {};
  const load = name => new Promise((resolve,reject)=>{ const i=new Image(); i.onload=()=>{img[name]=i;resolve(i)}; i.onerror=reject; i.src='assets/'+name+'.png'; });

  const animations = {
    idle:['walk0','walk1'], walk:['walk0','walk1','walk2','walk3'], punch:['punch0','punch1','punch2','punch3'],
    kick:['kick0','kick1','kick2','kick3'], cane:['cane0','cane1','cane2','cane3'], jump:['jump0','jump1','jump2','jump3'],
    dash:['dash0','dash1','dash2','dash3'], crouch:['crouch0','crouch1','crouch2','crouch3'], special:['special0','special1','special2','special3']
  };
  const frameRate={idle:8,walk:6,punch:5,kick:5,cane:6,jump:7,dash:5,crouch:7,special:6};
  // Combat geometry is deliberately separate from sprite dimensions.  The
  // artwork can have transparent padding / extended limbs, so collision is
  // based on small, readable gameplay boxes anchored to the fighter's feet.
  // start/end are horizontal offsets from the player's center while depth is
  // the half-height of the lane box.
  const attacks={
    punch:{wind:.13,active:.28,total:.46,hitStart:24,hitEnd:106,depth:17,damage:13,knock:145,stun:13,meter:7,score:100,lunge:70,next:'kick'},
    kick:{wind:.15,active:.34,total:.54,hitStart:28,hitEnd:133,depth:20,damage:19,knock:235,stun:18,meter:10,score:150,lunge:105,next:'cane'},
    cane:{wind:.17,active:.39,total:.62,hitStart:30,hitEnd:166,depth:23,damage:27,knock:320,stun:24,meter:14,score:220,lunge:65,next:'punch'},
    special:{wind:.10,active:.52,total:.78,hitStart:18,hitEnd:221,depth:29,damage:48,knock:470,stun:35,meter:0,score:500,lunge:90,next:null}
  };

  // Tight hurtboxes prevent the visible sprite's empty/transparent space from
  // making enemies feel either impossible to hit or strangely vulnerable.
  const hurtboxFor=e=>{
    const s=enemyStats[e.type];
    const halfX=e.isBoss ? s.w*.23 : s.w*.24;
    const halfD=e.isBoss ? 19 : 14;
    return {halfX,halfD};
  };
  const playerHurtbox=()=>({halfX:22,halfD:14});
  const overlap1D=(a0,a1,b0,b1)=>a0<=b1&&a1>=b0;

  function attackHitbox(a){
    const x0=player.x+player.dir*a.hitStart;
    const x1=player.x+player.dir*a.hitEnd;
    return {x0:Math.min(x0,x1),x1:Math.max(x0,x1),d0:player.depth-a.depth,d1:player.depth+a.depth};
  }

  function boxesOverlapPlayerAttack(e,a){
    const hb=hurtboxFor(e),box=attackHitbox(a);
    return overlap1D(box.x0,box.x1,e.x-hb.halfX,e.x+hb.halfX) &&
           overlap1D(box.d0,box.d1,e.depth-hb.halfD,e.depth+hb.halfD);
  }

  function boxesOverlapEnemyAttack(e,s){
    const eh={x0:e.x-s.range,x1:e.x+s.range,d0:e.depth-20,d1:e.depth+20};
    const ph=playerHurtbox();
    return overlap1D(eh.x0,eh.x1,player.x-ph.halfX,player.x+ph.halfX) &&
           overlap1D(eh.d0,eh.d1,player.depth-ph.halfD,player.depth+ph.halfD);
  }
  const enemyStats={
    snake:{w:104,h:100,hp:52,speed:145,damage:7,range:105,color:'#c45bff',lunge:105,spacing:105,engage:118},
    gator:{w:108,h:128,hp:86,speed:92,damage:11,range:112,color:'#9cff00',lunge:75,spacing:125,engage:118},
    pig:{w:124,h:150,hp:80,speed:100,damage:14,range:118,color:'#ffb454',lunge:90,spacing:125,engage:120}
  };
  // The Hog Yard's lone grunt species gets its own tiny walk/attack/dead
  // animation set (bosses aren't the only ones who get to move now).
  const gruntVisuals={
    pig:{walk:['pig_walk0','pig_walk1'],attack:'pig_attack',dead:'pig_dead',frameRate:5}
  };
  // Bosses: appear every 5 waves, cycling frog -> king gator -> rat king, each cycle harder than the last.
  const bossOrder=['boss_frog','boss_gator','boss_rat'];
  const bossBase={
    boss_frog:{name:'FROG KING',w:190,h:190,hp:420,speed:120,damage:16,range:150,color:'#7bffb0'},
    boss_gator:{name:'KING GATOR',w:200,h:210,hp:620,speed:110,damage:20,range:160,color:'#ffcf4d'},
    boss_rat:{name:'THE RAT KING',w:200,h:200,hp:860,speed:132,damage:25,range:165,color:'#ff6a6a'}
  };
  const bossVisuals={
    boss_frog:{walk:['boss_frog_walk0','boss_frog_walk1'],attack:'boss_frog_attack',idle:'boss_frog_idle',ko:'boss_frog_ko',frameRate:4},
    boss_gator:{walk:['boss_gator_walk0','boss_gator_walk1'],attack:'boss_gator_attack',idle:'boss_gator_idle',ko:'boss_gator_ko',frameRate:4},
    boss_rat:{walk:['boss_rat_walk0','boss_rat_walk1'],attack:'boss_rat_attack',idle:'boss_rat_idle',ko:'boss_rat_ko',frameRate:4}
  };
  // Enemy-specific hit reactions. These only affect presentation; combat values stay unchanged.
  const hitReactionProfiles={
    snake:{dur:.22, snap:1.0, spin:1.0, squash:1.0, style:'coil'},
    gator:{dur:.30, snap:.72, spin:.35, squash:1.25, style:'stagger'},
    boss_frog:{dur:.38, snap:.9, spin:.65, squash:1.35, style:'hop'},
    boss_gator:{dur:.42, snap:.62, spin:.28, squash:1.55, style:'stagger'},
    boss_rat:{dur:.40, snap:1.0, spin:.9, squash:1.45, style:'whiplash'},
    pig:{dur:.30, snap:.75, spin:.35, squash:1.2, style:'stagger'}
  };
  // Two arenas take turns: 15 waves of Dead Swamp (with its 3 bosses),
  // then 10 waves of Hog Yard grunts, then back to the swamp again - on
  // and on. "wave" itself just keeps climbing (so difficulty keeps
  // creeping up lap over lap); arenaInfo() figures out which map/segment
  // a given absolute wave number falls in.
  const SWAMP_LEN=15, PIGYARD_LEN=10, CYCLE_LEN=SWAMP_LEN+PIGYARD_LEN;
  const arenaInfo=n=>{
    const pos=(n-1)%CYCLE_LEN;
    return pos<SWAMP_LEN ? {arena:'swamp',local:pos+1} : {arena:'pigyard',local:pos-SWAMP_LEN+1};
  };
  const isBossWave=n=>arenaInfo(n).arena==='swamp' && n%5===0;
  const bossInfoForWave=n=>{
    const slot=n/5-1, idx=((slot%3)+3)%3, cycle=Math.floor(slot/3), key=bossOrder[idx];
    return {key,cycle};
  };

  let running=false,paused=false,last=0,worldTime=0,score=0,wave=1,waveTimer=0,message='',messageT=0,cameraX=0;
  let shake=0,hitStop=0,comboTimer=0,stage=0,spawnTimer=0,gameOver=false;
  let impactFlash=0, impactFlashAlpha=0, impactRings=[], impactStreaks=[], comboBursts=[];
  let finisherT=0, finisherLife=0, finisherX=0, finisherY=0, finisherTier=0;
  let audioCtx=null;
  function ensureAudio(){try{if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==='suspended')audioCtx.resume()}catch(_){}}
  function impactSound(strength=1){
    ensureAudio(); if(!audioCtx)return;
    const now=audioCtx.currentTime;
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type='square'; o.frequency.setValueAtTime(105+strength*35,now); o.frequency.exponentialRampToValueAtTime(48,now+.075);
    g.gain.setValueAtTime(.0001,now); g.gain.exponentialRampToValueAtTime(.12*strength,now+.006); g.gain.exponentialRampToValueAtTime(.0001,now+.085);
    o.connect(g);g.connect(audioCtx.destination);o.start(now);o.stop(now+.09);
    const n=audioCtx.createBufferSource(),ng=audioCtx.createGain();
    const b=audioCtx.createBuffer(1,audioCtx.sampleRate*.055,audioCtx.sampleRate),d=b.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3);
    n.buffer=b;ng.gain.setValueAtTime(.0001,now);ng.gain.exponentialRampToValueAtTime(.07*strength,now+.003);ng.gain.exponentialRampToValueAtTime(.0001,now+.055);n.connect(ng);ng.connect(audioCtx.destination);n.start(now)
  }
  function triggerImpact(e,a,comboTier=1){
    const boss=e.isBoss, comboBoost=[0,1,1.08,1.2,1.38][Math.min(4,comboTier)];
    const strength=(boss?1.35:(a===attacks.special?1.25:(a===attacks.cane?1.08:1)))*comboBoost;
    const stopBase=boss?.105:(a===attacks.special?.085:.065);
    hitStop=Math.max(hitStop,Math.min(.13,stopBase*(1+Math.max(0,comboTier-1)*.12)));
    shake=Math.min(30,shake+(boss?10:6)*strength);
    impactFlash=Math.max(impactFlash,boss?.12:.075*(comboTier>=4?1.45:1)); impactFlashAlpha=Math.max(impactFlashAlpha,boss?.32:.22*(comboTier>=4?1.3:1));
    impactRings.push({x:e.x,y:e.depth-42,r:8,max:(boss?82:58)*(1+comboTier*.12),t:0,life:(boss?.24:.17)*(1+comboTier*.1),fill:a===attacks.special?'#f3d5ff':'#bfff32'});
    for(let i=0;i<(boss?18:10)+comboTier*3;i++){
      const side=player.dir, ang=(Math.random()-.5)*Math.PI*.9, speed=((boss?240:170)+Math.random()*180)*(1+comboTier*.1);
      impactStreaks.push({x:e.x-side*4,y:e.depth-42,vx:Math.cos(ang)*speed*side,vy:Math.sin(ang)*speed,t:0,life:.18+Math.random()*.12,size:boss?3:2,fill:i%3?'#fff':(a===attacks.special?'#eec7ff':'#bfff32')});
    }
    impactSound(strength);
  }
  function updateComboBursts(dt){
    for(const b of comboBursts)b.t+=dt;
    comboBursts=comboBursts.filter(b=>b.t<b.life);
  }
  const player={
    x:520,depth:535,vx:0,vd:0,jumpH:0,jumpV:0,w:82,h:145,dir:1,state:'idle',frame:0,stateT:0,
    attackHit:new Set(),hp:100,maxHp:100,meter:25,combo:0,hurtT:0,invT:0,dashT:0,buffer:[],bufferT:0,attackCooldown:0,
    moveHeld:0,lastMoveDir:0
  };
  let enemies=[],particles=[],floats=[],pickups=[];

  // Map by e.code (physical key) rather than e.key. e.key changes with
  // modifiers - holding Shift (our RUN key) turns "j"/"k"/"u"/"l"/"w"/"a"/
  // "s"/"d" into capital letters that don't match a lowercase lookup table,
  // so every fight button (and WASD movement) would silently stop working
  // the moment you ran. Caps Lock caused the same failure. e.code reports
  // the physical key regardless of Shift/Caps state, so this is immune to both.
  const mapKey=code=>({ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',KeyA:'left',KeyD:'right',KeyW:'up',KeyS:'down',KeyJ:'punch',KeyK:'kick',KeyU:'cane',KeyL:'special',KeyI:'jump',Space:'dash',ShiftLeft:'run',ShiftRight:'run',KeyP:'p'})[code]||null;
  const preventCodes=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','KeyJ','KeyK','KeyU','KeyL','KeyI','Space','ShiftLeft','ShiftRight']);
  const down=k=>keys.has(k)||touchKeys.has(k);
  addEventListener('keydown',e=>{
    const k=mapKey(e.code);
    // Touch-laptop / tablet-with-keyboard: once someone plays with the keyboard, free up the space the on-screen buttons used
    if(k && touchMode && hybridDevice && e.isTrusted){touchMode=false;layout()}
    if(preventCodes.has(e.code))e.preventDefault();
    if(k==='p'&&!e.repeat){e.preventDefault();togglePause();return}
    if(k){
      const wasDown=keys.has(k);
      keys.add(k);
      // Combat actions are edge-triggered: a held key never repeats an attack.
      if(!wasDown && isAction(k)) tryAction(k);
    }
  },{passive:false});
  addEventListener('keyup',e=>{const k=mapKey(e.code);if(k)keys.delete(k)});
  addEventListener('blur',()=>{keys.clear();touchKeys.clear();pointerKeys.clear();document.querySelectorAll('.control.pressed').forEach(b=>b.classList.remove('pressed'))});
  addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();touchKeys.clear();pointerKeys.clear();document.querySelectorAll('.control.pressed').forEach(b=>b.classList.remove('pressed'));if(running&&!gameOver&&!paused)togglePause()}});

  // A real finger touch brings the on-screen controls back (hybrid devices)
  addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&!touchMode){touchMode=true;layout()}},{capture:true,passive:true});
  const isAction=k=>['punch','kick','cane','special','jump','dash'].includes(k);
  document.querySelectorAll('[data-key]').forEach(b=>{
    const k=b.dataset.key;
    const release=(e)=>{
      e.preventDefault();
      const id=e.pointerId;
      if(pointerKeys.get(id)===k)pointerKeys.delete(id);
      // Only remove the key if no other finger is holding that same control.
      let held=false; for(const v of pointerKeys.values())if(v===k){held=true;break}
      if(!held)touchKeys.delete(k);
      b.classList.toggle('pressed',held);
    };
    b.addEventListener('pointerdown',e=>{
      e.preventDefault();
      if(b.setPointerCapture)try{b.setPointerCapture(e.pointerId)}catch(_){}
      pointerKeys.set(e.pointerId,k);
      touchKeys.add(k);
      b.classList.add('pressed');
      if(isAction(k))tryAction(k); // actions are instant; movement stays held
    },{passive:false});
    b.addEventListener('pointerup',release,{passive:false});
    b.addEventListener('pointercancel',release,{passive:false});
    b.addEventListener('lostpointercapture',release,{passive:false});
  });
  const pauseBtn=document.getElementById('pauseBtn');
  if(pauseBtn){
    pauseBtn.addEventListener('pointerdown',e=>{e.preventDefault();togglePause()},{passive:false});
    pauseBtn.addEventListener('keydown',e=>{if(e.code==='Enter'||e.code==='Space'){e.preventDefault();e.stopPropagation()}});
  }
  document.getElementById('pauseBadge').addEventListener('pointerdown',e=>{e.preventDefault();togglePause()},{passive:false});
  document.getElementById('startBtn').onclick=startGame;
  document.getElementById('howBtn').onclick=()=>document.getElementById('howPanel').classList.toggle('hidden');
  // The how-to-play panel is a full-screen overlay now (so it reads well
  // on any layout), which means it can sit on top of the button that
  // opened it. Let a tap anywhere on the panel close it too.
  document.getElementById('howPanel').addEventListener('click',()=>document.getElementById('howPanel').classList.add('hidden'));
  document.getElementById('restartBtn').onclick=()=>{document.getElementById('gameOver').classList.add('hidden');startGame()};

  function reset(){
    player.x=520;player.depth=535;player.vx=0;player.vd=0;player.dir=1;player.jumpH=0;player.jumpV=0;player.state='idle';player.frame=0;player.stateT=0;player.attackHit.clear();player.hp=100;player.meter=25;player.combo=0;player.hurtT=0;player.invT=0;player.dashT=0;player.buffer=[];player.bufferT=0;player.attackCooldown=0;player.moveHeld=0;player.lastMoveDir=0;
    score=0;wave=1;waveTimer=0;cameraX=0;message='WAVE 1';messageT=120;shake=0;hitStop=0;stage=0;spawnTimer=0;gameOver=false;enemies=[];particles=[];floats=[];pickups=[];spawnWave(1);
    document.getElementById('gameOver').classList.add('hidden'); updateOverlay();
  }
  function startGame(){document.getElementById('titleScreen').classList.add('hidden');running=true;paused=false;reset();last=performance.now();requestAnimationFrame(loop)}
  function togglePause(){if(!running||gameOver)return;paused=!paused;document.getElementById('pauseBadge').classList.toggle('hidden',!paused);if(!paused){last=performance.now();requestAnimationFrame(loop)}}
  function setState(s){if(player.state!==s){player.state=s;player.frame=0;player.stateT=0;player.attackHit.clear()}}

  function tryAction(a){
    if(!running||paused||gameOver)return;
    if(['punch','kick','cane','special'].includes(a)){
      const attacking=!!attacks[player.state];
      // A short, explicit input buffer makes rapid button presses reliable
      // without allowing stale inputs to fire seconds later.
      if(attacking){
        // Keep a very small FIFO of intentional attack presses. This supports
        // rapid Punch -> Kick -> Cane input without turning held buttons into
        // automatic attacks. Old inputs expire together with the buffer.
        if(player.buffer.length<2) player.buffer.push(a);
        player.bufferT=.22;
        return;
      }
      if(player.attackCooldown>0)return;
      if(a==='special'&&player.meter<60){showFloat(player.x,player.depth-150,'NEED 60 ENERGY','#d8a7ff');return}
      if(a==='special')player.meter-=60;
      setState(a); player.buffer.length=0; player.bufferT=0;
      return;
    }
    if(a==='jump' && player.jumpH<=0 && player.hurtT<=0 && player.state!=='crouch'){
      player.jumpV=760;setState('jump');burst(player.x,player.depth-2,8,'#bfff32');return;
    }
    if(a==='dash' && player.hurtT<=0 && player.dashT<=0){
      const l=down('left'),r=down('right'),u=down('up'),d=down('down');
      let dx=(r?1:0)-(l?1:0), dd=(d?1:0)-(u?1:0);
      if(dx===0&&dd===0)dx=player.dir;
      const len=Math.hypot(dx,dd)||1; dx/=len;dd/=len;
      player.dashT=.22;player.invT=Math.max(player.invT,.28);player.vx=dx*560;player.vd=dd*250;player.dir=dx<-.1?-1:dx>.1?1:player.dir;
      setState('dash');burst(player.x-dx*25,player.depth,7,'#a735ff');return;
    }
  }

  // Attack controls are intentionally press-triggered. Movement remains
  // level-triggered, while combat uses a short FIFO buffer so rapid deliberate
  // presses chain cleanly without auto-repeating held buttons.
  function spawnWave(n){
    // attackT is a real-seconds countdown (see the .65-1.35s reset in
    // updateEnemy), so enemies must spawn with a small value here too -
    // it must not sit anywhere near the tens-of-seconds range or they'll
    // never land their first hit before the wave is over.
    if(isBossWave(n)){spawnBoss(n);return}
    if(arenaInfo(n).arena==='pigyard'){spawnPigWave(n);return}
    const count=Math.min(3+Math.floor(n*.8),9);
    for(let i=0;i<count;i++){
      const type=(i%4===0||n%4===0&&i===count-1)?'gator':'snake', side=i%2?1:-1, st=enemyStats[type];
      enemies.push({type,x:player.x+side*(500+Math.random()*260),depth:470+Math.random()*92,vx:0,vd:0,dir:-side,hp:st.hp+Math.max(0,n-1)*(type==='gator'?12:8),maxHp:st.hp+Math.max(0,n-1)*(type==='gator'?12:8),state:'walk',stateT:Math.random()*2,attackT:.35+Math.random()*1.15,hitT:0,stunT:0,knockV:0,knockD:0,deadT:0,dead:false,hitReactT:0,hitReactDur:0,hitReactPower:0,hitReactDir:1,hitReactType:'punch',reactionProfile:hitReactionProfiles[type],reactionSeed:Math.random()*Math.PI*2,id:Math.random()});
    }
    if(n%4===0) message='GATOR SWARM';
  }
  function spawnPigWave(n){
    // The Hog Yard is a single-species gauntlet: just the crowned pig,
    // scaled up over its own 10-wave arc (and a little more each time the
    // full swamp+yard loop comes back around).
    const {local}=arenaInfo(n), loop=Math.floor((n-1)/CYCLE_LEN), growth=1+loop*.15;
    const st=enemyStats.pig, count=Math.min(3+Math.floor(local*.85),9);
    const hp=Math.round((st.hp+Math.max(0,local-1)*10)*growth);
    for(let i=0;i<count;i++){
      const side=i%2?1:-1;
      enemies.push({type:'pig',x:player.x+side*(500+Math.random()*260),depth:470+Math.random()*92,vx:0,vd:0,dir:-side,hp,maxHp:hp,state:'walk',stateT:Math.random()*2,attackT:.35+Math.random()*1.15,hitT:0,stunT:0,knockV:0,knockD:0,deadT:0,dead:false,hitReactT:0,hitReactDur:0,hitReactPower:0,hitReactDir:1,hitReactType:'punch',reactionProfile:hitReactionProfiles.pig,reactionSeed:Math.random()*Math.PI*2,id:Math.random()});
    }
    if(local%4===0) message='⚠ HOG STAMPEDE';
  }
  function spawnBoss(n){
    const {key,cycle}=bossInfoForWave(n), base=bossBase[key];
    const growth=1+cycle*.5+Math.max(0,n-5)*.012;
    const st=enemyStats[key]={w:base.w,h:base.h,speed:base.speed*(1+cycle*.1),damage:Math.round(base.damage*growth),range:base.range,color:base.color,lunge:110,spacing:150,engage:170};
    const hp=Math.round(base.hp*growth);
    enemies.push({type:key,isBoss:true,bossName:base.name,x:player.x+560,depth:520,vx:0,vd:0,dir:-1,hp,maxHp:hp,state:'walk',stateT:0,attackT:1+Math.random()*.8,hitT:0,stunT:0,knockV:0,knockD:0,deadT:0,dead:false,hitReactT:0,hitReactDur:0,hitReactPower:0,hitReactDir:1,hitReactType:'punch',reactionProfile:hitReactionProfiles[key],reactionSeed:Math.random()*Math.PI*2,id:Math.random()});
    message='⚠ BOSS: '+base.name;messageT=160;
  }
  function nextWave(){
    const prevArena=arenaInfo(wave).arena;
    wave++;stage++;waveTimer=0;
    const {arena,local}=arenaInfo(wave);
    if(arena!==prevArena){
      message=arena==='pigyard'?'⚠ ENTERING THE HOG YARD':'⚠ BACK TO THE SWAMP';messageT=150;
    } else if(!isBossWave(wave)){
      message=arena==='pigyard'?('WAVE '+local+' · HOG YARD'):(wave%4===0?'⚠ BIG SWAMP WAVE':'WAVE '+wave);messageT=120;
    }
    spawnWave(wave)
  }

  function update(dt){
    if(hitStop>0){hitStop-=dt;return}
    if(finisherT>0){finisherT-=dt;shake=Math.max(shake,7);updateImpact(dt);updateComboBursts(dt);return}
    worldTime+=dt;messageT=Math.max(0,messageT-dt);shake=Math.max(0,shake-dt*20);
    player.invT=Math.max(0,player.invT-dt);player.hurtT=Math.max(0,player.hurtT-dt);player.attackCooldown=Math.max(0,player.attackCooldown-dt);
    if(comboTimer>0)comboTimer-=dt;else player.combo=0;
    updatePlayer(dt);
    for(const e of enemies) updateEnemy(e,dt);
    enemies=enemies.filter(e=>!e.dead || e.deadT>0);
    updateParticles(dt); updatePickups(dt); updateFloats(dt); updateImpact(dt); updateComboBursts(dt);
    if(enemies.every(e=>e.dead)){
      if(waveTimer<=0){waveTimer=1.1;message='AREA CLEAR';messageT=55;}
      else {waveTimer-=dt;if(waveTimer<=0)nextWave()}
    } else waveTimer=0;
    cameraX += ((player.x-540)-cameraX)*Math.min(1,dt*5.5);
    if(player.hp<=0)endGame();
  }

  function updatePlayer(dt){
    if(player.bufferT>0){player.bufferT-=dt;if(player.bufferT<=0)player.buffer.length=0}
    const attack=attacks[player.state];
    if(attack){
      player.stateT+=dt;
      const p=player.stateT/attack.total;
      if(p>=attack.wind&&p<attack.active){
        const lunge=attack.lunge*dt/(attack.active-attack.wind);
        player.x+=player.dir*lunge;
        for(const e of enemies){
          if(e.dead||player.attackHit.has(e.id))continue;
          // A real 2D attack box vs. a compact enemy hurtbox.  This keeps
          // collision aligned with the fighter's facing direction and avoids
          // the old center-point/range test producing hits through enemies.
          if(boxesOverlapPlayerAttack(e,attack)){
            player.attackHit.add(e.id);hitEnemy(e,attack);
          }
        }
      }
      if(p>=1){
        const queued=player.bufferT>0?player.buffer.shift():null;
        if(player.buffer.length===0)player.bufferT=0;
        player.attackCooldown=.035;setState('idle');
        if(queued)tryAction(queued);
      }
    } else if(player.dashT>0){
      player.dashT-=dt;player.x+=player.vx*dt;player.depth+=player.vd*dt;
      if(player.dashT<=0){player.vx*=.25;player.vd*=.25;setState(player.jumpH>0?'jump':'idle')}
    } else if(player.hurtT<=0){
      const left=down('left'),right=down('right'),up=down('up'),downKey=down('down');
      const xInput=(right?1:0)-(left?1:0);
      const depthInput=(downKey?1:0)-(up?1:0);
      const grounded=player.jumpH<=0;

      if(player.jumpH>0){
        // Air control: responsive but lighter than ground movement.
        const airAccel=1500,airMax=down('run')?340:285;
        if(xInput)player.vx=approach(player.vx,xInput*airMax,airAccel*dt);else player.vx=approach(player.vx,0,900*dt);
        if(depthInput)player.vd=approach(player.vd,depthInput*155,900*dt);else player.vd=approach(player.vd,0,900*dt);
        setState('jump');
      } else {
        // Holding a direction first walks, then smoothly ramps into a run.
        if(xInput!==0){
          player.moveHeld += dt;
          if(xInput!==player.lastMoveDir)player.moveHeld=0;
          player.lastMoveDir=xInput;
          player.dir=xInput;
        } else {player.moveHeld=0;player.lastMoveDir=0;}
        const runningFast=down('run')||player.moveHeld>.28;
        const maxX=runningFast?340:220;
        const maxD=runningFast?180:125;
        const accel=runningFast?1750:1450;
        if(xInput)player.vx=approach(player.vx,xInput*maxX,accel*dt);else player.vx=approach(player.vx,0,1900*dt);
        if(depthInput && !(downKey&&!xInput))player.vd=approach(player.vd,depthInput*maxD,1500*dt);else player.vd=approach(player.vd,0,1800*dt);

        if(downKey&&!xInput){
          player.vx=approach(player.vx,0,2400*dt);player.vd=0;setState('crouch');
        } else if(xInput||depthInput){setState('walk')} else {setState('idle')}
      }
    } else {
      player.vx=approach(player.vx,0,800*dt);player.vd=approach(player.vd,0,800*dt);setState('jump');
    }

    // Jump physics are independent from depth movement.
    if(player.jumpH>0||player.jumpV>0){
      player.jumpH+=player.jumpV*dt;
      player.jumpV-=1850*dt;
      if(player.jumpH<=0){player.jumpH=0;player.jumpV=0;if(player.state==='jump')setState('idle');burst(player.x,player.depth,5,'#7bd63f')}
    }

    player.x+=player.vx*dt;player.depth+=player.vd*dt;
    player.x=Math.max(100,Math.min(4300,player.x));
    player.depth=Math.max(DEPTH_MIN,Math.min(DEPTH_MAX,player.depth));
    if(!attacks[player.state]&&player.state!=='dash'){player.stateT+=dt;player.frame=Math.floor(player.stateT*(frameRate[player.state]||8))%animations[player.state].length}
  }

  function approach(v,target,amount){return v<target?Math.min(target,v+amount):Math.max(target,v-amount)}

  function hitEnemy(e,a){
    // Combo escalation is presentation-first: damage and base combat values stay intact,
    // while consecutive hits earn increasingly dramatic feedback.
    player.combo++;
    comboTimer=1.5;
    const comboTier=Math.min(4,player.combo);
    const comboMult=[0,1,1.12,1.28,1.5][comboTier];
    const comboKnock=[0,1,1.03,1.08,1.16][comboTier];
    const comboReact=[0,1,1.08,1.18,1.32][comboTier];
    e.hp-=a.damage;
    e.stunT=a.stun/60;
    e.knockV=a.knock*player.dir*comboKnock;
    e.knockD=(e.depth-player.depth)*1.8*comboKnock;
    e.vx=e.knockV;
    e.vd=e.knockD;
    e.hitT=.13;
    e.hitReactDur=e.isBoss?.34:(a===attacks.special?.28:a===attacks.cane?.23:a===attacks.kick?.19:.15);
    e.hitReactT=e.hitReactDur;
    e.hitReactPower=(e.isBoss?1.35:(a===attacks.special?1.28:(a===attacks.cane?1.12:(a===attacks.kick?.98:.86))))*comboReact;
    e.hitReactDir=player.dir;e.hitReactType=a===attacks.special?'special':a===attacks.cane?'cane':a===attacks.kick?'kick':'punch';
    e.reactionProfile=hitReactionProfiles[e.type]||hitReactionProfiles.snake;
    e.reactionSeed=Math.random()*Math.PI*2;
    e.comboTier=comboTier;
    player.meter=Math.min(100,player.meter+a.meter);
    const points=Math.round((a.score+player.combo*12)*comboMult);
    score+=points;
    triggerImpact(e,a,comboTier);
    burst(e.x,e.depth-45,10+comboTier*3,a===attacks.special?'#eec7ff':'#bfff32');
    showFloat(e.x,e.depth-70,'+'+points,'#ffffff');
    if(comboTier>=2){
      comboBursts.push({x:e.x,y:e.depth-105,t:0,life:.38,tier:comboTier,dir:player.dir});
      if(comboTier===3) burst(e.x,e.depth-45,10,'#ffffff');
      if(comboTier===4){
        burst(e.x,e.depth-45,24,'#eec7ff');
        message='RICO SMASH!';messageT=32;
        // Cinematic finisher: a brief freeze/punch-in layered over the
        // existing combat values. The enemy still uses the same damage and
        // knockback already calculated above.
        finisherLife=.34; finisherT=finisherLife; finisherX=e.x; finisherY=e.depth-70; finisherTier=comboTier;
        hitStop=Math.max(hitStop,.09);
        shake=Math.min(34,shake+15);
        impactFlash=Math.max(impactFlash,.16); impactFlashAlpha=Math.max(impactFlashAlpha,.34);
        impactRings.push({x:e.x,y:e.depth-42,r:10,max:118,t:0,life:.34,fill:'#ffffff'});
        for(let k=0;k<20;k++){const ang=Math.random()*Math.PI*2,sp=260+Math.random()*260;impactStreaks.push({x:e.x,y:e.depth-60,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp,t:0,life:.28+Math.random()*.12,size:3,fill:k%2?'#fff':'#eec7ff'})}
      }
    }
    if(e.isBoss&&!e.enraged&&e.hp>0&&e.hp<e.maxHp*.5){e.enraged=true;enemyStats[e.type].speed*=1.18;message=e.bossName+' IS ENRAGED';messageT=90;showFloat(e.x,e.depth-190,'ENRAGED!','#ff5566')}
    if(e.hp<=0){
      e.dead=true;e.deadT=e.isBoss?2.4:(e.type==='snake'?.95:e.type==='gator'?1.05:e.type==='pig'?1.1:e.type==='boss_frog'?1.35:e.type==='boss_rat'?1.15:.8);e.deathT=e.deadT;e.deathSeed=Math.random()*Math.PI*2;e.deathVx=(e.knockV||0)*(e.isBoss?1.35:1.15)+(Math.random()-.5)*80;e.deathVd=(e.knockD||0)*.55;e.deathRot=(Math.random()-.5)*2.5;burst(e.x,e.depth-40,e.isBoss?34:18,e.isBoss?'#ffcf4d':'#a735ff');if(e.isBoss){hitStop=Math.max(hitStop,.16);shake=Math.min(42,shake+22);impactFlash=Math.max(impactFlash,.22);impactFlashAlpha=Math.max(impactFlashAlpha,.45);}
      if(e.isBoss){score+=1500;message=e.bossName+' DEFEATED';messageT=140;for(let k=0;k<3;k++)pickups.push({x:e.x+(k-1)*40,depth:e.depth,type:k===1?'energy':'heart',t:0});}
      else if(Math.random()<.18)pickups.push({x:e.x,depth:e.depth,type:Math.random()<.5?'energy':'heart',t:0});
    }
  }

  function updateEnemy(e,dt){
    if(e.dead){e.deadT-=dt;const p=Math.max(0,1-e.deadT/e.deathT);e.vx=approach(e.vx,0,(e.isBoss?180:420)*dt);e.vd=approach(e.vd,0,(e.isBoss?90:260)*dt);e.x+=e.vx*dt;e.depth+=e.vd*dt;return}
    e.hitT=Math.max(0,e.hitT-dt);e.hitReactT=Math.max(0,e.hitReactT-dt);
    if(e.stunT>0){e.stunT-=dt;e.vx=approach(e.vx,0,900*dt);e.vd=approach(e.vd,0,900*dt);e.x+=e.vx*dt;e.depth+=e.vd*dt;return}
    const s=enemyStats[e.type],dx=player.x-e.x,dd=player.depth-e.depth,dist=Math.hypot(dx,dd),xDist=Math.abs(dx),aligned=Math.abs(dd)<42;
    e.dir=dx>=0?1:-1;
    if(e.state==='attack'){
      e.stateT+=dt;
      if(e.stateT>.24&&e.stateT<.46){
        const lunge=s.lunge*dt/.22;e.x+=e.dir*lunge;
        if(player.invT<=0&&boxesOverlapEnemyAttack(e,s)){
          player.hp=Math.max(0,player.hp-s.damage);player.invT=.65;player.hurtT=.28;player.vx=e.dir*210;player.vd=(player.depth-e.depth)*2;player.jumpV=260;player.combo=0;comboTimer=0;shake=12;impactFlash=Math.max(impactFlash,.06);impactFlashAlpha=Math.max(impactFlashAlpha,.18);burst(player.x,player.depth-55,8,'#ff6688');
        }
      }
      if(e.stateT>.62){e.state='walk';e.stateT=0;const enraged=e.isBoss&&e.hp<e.maxHp*.5;e.attackT=(enraged?.4:.65)+Math.random()*(enraged?.45:.7)}
      return;
    }
    if(xDist<s.engage&&aligned){e.attackT-=dt;if(e.attackT<=0){e.state='attack';e.stateT=0;e.vx=0;e.vd=0;return}}
    e.state='walk';e.stateT+=dt;
    const spacing=s.spacing;
    if(aligned && xDist<spacing){e.vx=approach(e.vx,0,1000*dt);e.vd=approach(e.vd,0,1000*dt)}
    else {
      const len=dist||1;const slowClose=(e.type==='gator'||e.isBoss)&&dist<230;const targetSpeed=s.speed*(slowClose?.8:1);
      e.vx=approach(e.vx,dx/len*targetSpeed,900*dt);e.vd=approach(e.vd,dd/len*targetSpeed*.68,900*dt);
    }
    e.x+=e.vx*dt;e.depth+=e.vd*dt;e.depth=Math.max(DEPTH_MIN,Math.min(DEPTH_MAX,e.depth));
  }

  function updateParticles(dt){for(const p of particles){p.t-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.g*dt}particles=particles.filter(p=>p.t>0)}
  function updatePickups(dt){for(const p of pickups){p.t+=dt;p.depth=player.depth+Math.sin(p.t*5)*7;if(Math.abs(p.x-player.x)<45&&Math.abs(p.depth-player.depth)<42){if(p.type==='heart')player.hp=Math.min(100,player.hp+25);else player.meter=Math.min(100,player.meter+35);showFloat(p.x,p.depth-30,p.type==='heart'?'+25 HP':'+35 ENERGY','#bfff32');burst(p.x,p.depth,10,'#bfff32');p.dead=true}}pickups=pickups.filter(p=>!p.dead)}
  function updateFloats(dt){for(const f of floats){f.t-=dt;f.y-=25*dt}floats=floats.filter(f=>f.t>0)}
  function updateImpact(dt){
    impactFlash=Math.max(0,impactFlash-dt); impactFlashAlpha=Math.max(0,impactFlashAlpha-dt*3.5);
    for(const r of impactRings){r.t+=dt;r.r=r.max*Math.min(1,r.t/r.life)} impactRings=impactRings.filter(r=>r.t<r.life);
    for(const s of impactStreaks){s.t+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=420*dt} impactStreaks=impactStreaks.filter(s=>s.t<s.life);
  }
  function burst(x,y,n,fill){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=50+Math.random()*220;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,g:480,t:.25+Math.random()*.25,fill,size:2+Math.random()*4})}}
  function showFloat(x,y,text,fill){floats.push({x,y,text,fill,t:.7})}

  function draw(){ctx.clearRect(0,0,W,H);ctx.save();(arenaInfo(wave).arena==='pigyard'?drawBackgroundPigYard:drawBackground)();[...pickups].sort((a,b)=>a.depth-b.depth).forEach(drawPickup);[...enemies].sort((a,b)=>a.depth-b.depth).forEach(drawEnemy);drawPlayer();drawEffects();drawHUD();drawFinisher();ctx.restore()}

  function drawFinisher(){
    if(finisherT<=0)return;
    const p=1-finisherT/finisherLife;
    const inPunch=Math.min(1,p/.12), outPunch=Math.min(1,(1-p)/.5);
    const zoom=1+.045*inPunch*inPunch+.018*outPunch;
    ctx.save();
    ctx.translate(W/2,H/2);ctx.scale(zoom,zoom);ctx.translate(-W/2,-H/2);
    // A tight white/purple vignette makes the moment read even on bright art.
    ctx.globalAlpha=.12*(1-p)+.05;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=.7*(1-p);ctx.strokeStyle='#ffffff';ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(finisherX-cameraX,finisherY,36+150*p,0,Math.PI*2);ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.textAlign='center';ctx.translate(W/2,145-Math.sin(p*Math.PI)*18);
    ctx.globalAlpha=Math.min(1,p/.08)*Math.min(1,(1-p)/.72);
    ctx.font='900 38px monospace';ctx.fillStyle='#ffffff';ctx.strokeStyle='#111';ctx.lineWidth=6;
    ctx.strokeText('SMASH!',0,0);ctx.fillText('SMASH!',0,0);
    ctx.font='900 13px monospace';ctx.fillStyle='#eec7ff';ctx.fillText('FINISHER',0,22);
    ctx.restore();
  }

  function drawBackground(){
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#06151d');g.addColorStop(.55,'#12343a');g.addColorStop(1,'#071114');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.translate(-((cameraX*.13)%W),0);for(let k=-1;k<3;k++){ctx.fillStyle='#0a252b';ctx.beginPath();ctx.moveTo(k*W,0);for(let x=0;x<=W;x+=70)ctx.lineTo(k*W+x,175+Math.sin((x+k*80)*.014)*55);ctx.lineTo(k*W+W,0);ctx.closePath();ctx.fill();ctx.fillStyle='#163f40';for(let x=40;x<W;x+=150){ctx.fillRect(k*W+x,80,22,300);ctx.fillRect(k*W+x-18,125,58,15)}}ctx.restore();
    ctx.save();ctx.translate(-((cameraX*.3)%W),0);for(let k=-1;k<3;k++){ctx.fillStyle='#0b2b2d';for(let x=30;x<W;x+=205){ctx.fillRect(k*W+x,250,18,245);ctx.fillRect(k*W+x-35,290,85,13);ctx.fillRect(k*W+x+10,355,75,12)}}ctx.restore();
    ctx.fillStyle='#07161a';ctx.fillRect(0,430,W,145);ctx.fillStyle='#12322e';ctx.fillRect(0,520,W,55);ctx.fillStyle='#1d5146';for(let x=0;x<W;x+=38)ctx.fillRect(x,548+(x%3)*5,25,3);ctx.fillStyle='#1d5147';ctx.fillRect(0,575,W,H-575);
    for(let x=-((cameraX*.5)%140);x<W;x+=140){ctx.fillStyle='#2a6b59';ctx.fillRect(x,610,80,3);ctx.fillRect(x+40,650,110,3)}
    for(let i=0;i<20;i++){const x=((i*211-worldTime*12)%W+W)%W,y=245+(i*67)%260;ctx.fillStyle='rgba(170,255,80,.55)';ctx.fillRect(x,y,3,3)}
    // Subtle lane markings make the 2.5D depth easier to read without cluttering the art.
    ctx.globalAlpha=.18;ctx.strokeStyle='#72a98a';ctx.lineWidth=1;for(let d=465;d<=565;d+=25){ctx.beginPath();ctx.moveTo(0,d);ctx.lineTo(W,d);ctx.stroke()}ctx.globalAlpha=1;
  }
  // Same layered parallax structure as the swamp, reskinned into a rusty
  // dusk-lit hog yard: warm rust/orange palette, barn silhouettes and fence
  // rails instead of reeds and rocks, drifting embers instead of fireflies.
  function drawBackgroundPigYard(){
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#2b120c');g.addColorStop(.55,'#5a2f1c');g.addColorStop(1,'#170a07');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.translate(-((cameraX*.13)%W),0);for(let k=-1;k<3;k++){ctx.fillStyle='#3a1c12';ctx.beginPath();ctx.moveTo(k*W,0);for(let x=0;x<=W;x+=70)ctx.lineTo(k*W+x,190+Math.sin((x+k*80)*.014)*45);ctx.lineTo(k*W+W,0);ctx.closePath();ctx.fill();ctx.fillStyle='#4a2415';for(let x=60;x<W;x+=260){ctx.fillRect(k*W+x,120,90,220);ctx.beginPath();ctx.moveTo(k*W+x-10,120);ctx.lineTo(k*W+x+45,70);ctx.lineTo(k*W+x+100,120);ctx.closePath();ctx.fill()}}ctx.restore();
    ctx.save();ctx.translate(-((cameraX*.3)%W),0);for(let k=-1;k<3;k++){ctx.fillStyle='#6b3820';for(let x=30;x<W;x+=140){ctx.fillRect(k*W+x,300,10,180);ctx.fillRect(k*W+x-25,330,80,8);ctx.fillRect(k*W+x-25,380,80,8)}}ctx.restore();
    ctx.fillStyle='#241109';ctx.fillRect(0,430,W,145);ctx.fillStyle='#3d2110';ctx.fillRect(0,520,W,55);ctx.fillStyle='#69381d';for(let x=0;x<W;x+=38)ctx.fillRect(x,548+(x%3)*5,25,3);ctx.fillStyle='#5c3018';ctx.fillRect(0,575,W,H-575);
    for(let x=-((cameraX*.5)%140);x<W;x+=140){ctx.fillStyle='#7a4522';ctx.fillRect(x,610,80,3);ctx.fillRect(x+40,650,110,3)}
    for(let i=0;i<20;i++){const x=((i*211-worldTime*12)%W+W)%W,y=245+(i*67)%260;ctx.fillStyle='rgba(255,170,80,.5)';ctx.fillRect(x,y,3,3)}
    ctx.globalAlpha=.18;ctx.strokeStyle='#c98a55';ctx.lineWidth=1;for(let d=465;d<=565;d+=25){ctx.beginPath();ctx.moveTo(0,d);ctx.lineTo(W,d);ctx.stroke()}ctx.globalAlpha=1;
  }
  function sprite(name){return img[name]}
  function drawSprite(name,x,baseY,h,dir=1,flash=false){const im=sprite(name);if(!im)return;const scale=h/im.height,w=im.width*scale;ctx.save();ctx.translate(x,baseY);if(dir<0)ctx.scale(-1,1);if(flash)ctx.globalAlpha=.5;ctx.drawImage(im,-w/2,-h,w,h);ctx.restore()}
  function drawPlayer(){
    if(player.invT>0&&Math.floor(player.invT*18)%2===0)return;
    const anim=animations[player.state]||animations.idle,name=anim[player.frame%anim.length],h=player.state==='crouch'?112:145;
    drawSprite(name,player.x-cameraX,player.depth-player.jumpH,h,player.dir,player.hurtT>0);
    if(player.combo>=2&&comboTimer>0){
      const tier=Math.min(4,player.combo), pulse=1+Math.sin(worldTime*18)*.05*tier;
      ctx.save();ctx.translate(player.x-cameraX-48,player.depth-player.jumpH-25);ctx.scale(pulse,pulse);
      ctx.fillStyle=tier>=4?'#f3d5ff':tier>=3?'#ffffff':'#bfff32';
      ctx.font='900 '+(24+tier*2)+'px monospace';
      ctx.fillText(player.combo+' HIT!',0,0);
      if(tier>=3){ctx.font='900 11px monospace';ctx.fillText(tier>=4?'SMASH!':'KEEP IT GOING!',4,17)}
      ctx.restore();
    }
  }
  function drawEnemy(e){
    const x=e.x-cameraX;if(x<-220||x>W+220)return;const s=enemyStats[e.type];
    let spriteName=e.type;
    if(e.isBoss){
      const bv=bossVisuals[e.type];
      spriteName=e.dead?bv.ko:(e.state==='attack'?bv.attack:bv.walk[Math.floor(e.stateT*bv.frameRate)%bv.walk.length]);
    } else if(gruntVisuals[e.type]){
      const gv=gruntVisuals[e.type];
      spriteName=e.dead?gv.dead:(e.state==='attack'?gv.attack:gv.walk[Math.floor(e.stateT*gv.frameRate)%gv.walk.length]);
    }
    const hr=e.hitReactDur>0&&e.hitReactT>0;let rx=0,ry=0,sx=1,sy=1,rot=0;
    if(e.dead){const p=Math.max(0,Math.min(1,1-e.deadT/e.deathT)),q=Math.sin(p*Math.PI),out=1-Math.pow(1-p,3);rx+=e.deathVx*.42*out;ry-=e.isBoss?150*q:42*q;rot+=e.deathRot*(p*3)+(e.type==='boss_rat'?p*10:e.type==='snake'?Math.sin(p*18)*.7:0);if(e.type==='snake'){sx=1+.28*q;sy=1-.28*q;}else if(e.type==='gator'){sx=1+.16*q;sy=1-.12*q;}else if(e.type==='boss_frog'){sx=1-.18*q;sy=1+.28*q;}else if(e.type==='boss_rat'){sx=1+.12*q;sy=1-.12*q;}else{sx=1+.12*q;sy=1-.1*q;}if(e.isBoss){sx*=1+.18*q;sy*=1+.18*q;}}
    if(hr){
      const p=Math.min(1,1-e.hitReactT/e.hitReactDur), profile=e.reactionProfile||hitReactionProfiles.snake;
      const pulse=Math.sin(p*Math.PI), recoil=8*e.hitReactPower*profile.snap*pulse;
      const wobble=Math.sin((p*3.2+e.reactionSeed))*pulse;
      rx=-e.hitReactDir*recoil;
      ry=-3*e.hitReactPower*pulse;
      // Each enemy has its own physical language when struck.
      if(profile.style==='coil'){
        // Snake: whip sideways, briefly coil/compress, then spring back.
        sx=1+.11*pulse*profile.squash; sy=1-.13*pulse*profile.squash;
        rot=-e.hitReactDir*(.16*pulse+.035*wobble)*profile.spin;
        ry-=4*pulse;
      } else if(profile.style==='stagger'){
        // Gators: heavy body check with a low, chunky stagger.
        sx=1+.045*pulse*profile.squash; sy=1-.035*pulse*profile.squash;
        rot=-e.hitReactDir*(.045*pulse+.018*wobble)*profile.spin;
        ry+=4*pulse;
      } else if(profile.style==='hop'){
        // Frog King: pops upward and rotates as if knocked off balance.
        sx=1-.08*pulse*profile.squash; sy=1+.14*pulse*profile.squash;
        rot=e.hitReactDir*(.09*pulse+.025*wobble)*profile.spin;
        ry=-14*pulse;
      } else {
        // Rat King: nasty head/torso whip.
        sx=1+.10*pulse*profile.squash; sy=1-.075*pulse*profile.squash;
        rot=-e.hitReactDir*(.105*pulse+.035*wobble)*profile.spin;
        ry=-5*pulse;
      }
      // Attack type still matters on top of the species reaction.
      const attackScale=e.hitReactType==='special'?1.22:e.hitReactType==='cane'?1.08:e.hitReactType==='kick'?.94:1;
      sx=1+(sx-1)*attackScale; sy=1+(sy-1)*attackScale; rot*=attackScale; rx*=attackScale;
      if(e.isBoss){sx=1+(sx-1)*1.08;sy=1+(sy-1)*1.08;}
      if(p>.68)rx+=e.hitReactDir*3*e.hitReactPower*profile.snap*((p-.68)/.32);
    }
    const im=sprite(spriteName);if(im){const h=s.h,scale=h/im.height,w=im.width*scale;ctx.save();ctx.translate(x+rx,e.depth-18+ry);if(e.dir<0)ctx.scale(-1,1);ctx.rotate(rot);ctx.scale(sx,sy);if(e.hitT>0)ctx.globalAlpha=.82;ctx.drawImage(im,-w/2,-h,w,h);ctx.restore();}
    if(!e.isBoss){
      if(!e.dead&&e.hp<e.maxHp){ctx.fillStyle='#101518';ctx.fillRect(x-45,e.depth-s.h-18,90,7);ctx.fillStyle=s.color;ctx.fillRect(x-45,e.depth-s.h-18,90*Math.max(0,e.hp/e.maxHp),7)}
      if(e.dead){ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,e.deadT/.35));ctx.fillStyle=e.isBoss?'#ffcf4d':'#bfff32';ctx.font='900 '+(e.isBoss?26:18)+'px monospace';ctx.textAlign='center';ctx.fillText(e.isBoss?'BOSS DEFEATED!':(e.type==='snake'?'COIL!':e.type==='gator'?'BLAST!':e.type==='pig'?'SQUEAL!':e.type==='boss_frog'?'FLOP!':e.type==='boss_rat'?'SPIN OUT!':'K.O.'),x,e.depth-s.h-30-(e.isBoss?35:0));ctx.restore();}
      else if(e.state==='attack'&&e.stateT<.24){ctx.fillStyle='#ffcc45';ctx.font='900 16px monospace';ctx.fillText('!',x-5,e.depth-s.h-30)}
    } else if(!e.dead&&e.state==='attack'&&e.stateT<.24){ctx.fillStyle='#ffcc45';ctx.font='900 20px monospace';ctx.fillText('!',x-6,e.depth-s.h-34)}
  }
  function drawPickup(p){const x=p.x-cameraX;if(x<-50||x>W+50)return;ctx.save();ctx.translate(x,p.depth);ctx.rotate(Math.sin(p.t*4)*.12);ctx.fillStyle=p.type==='heart'?'#ff5577':'#b735ff';ctx.fillRect(-12,-12,24,24);ctx.fillStyle='#fff';ctx.font='900 15px monospace';ctx.textAlign='center';ctx.fillText(p.type==='heart'?'♥':'⚡',0,6);ctx.restore()}
  function drawEffects(){
    for(const r of impactRings){
      const q=1-r.t/r.life; ctx.save();ctx.globalAlpha=Math.max(0,q)*.9;ctx.strokeStyle=r.fill;ctx.lineWidth=4*(1-q)+1;
      ctx.beginPath();ctx.arc(r.x-cameraX,r.y,r.r,0,Math.PI*2);ctx.stroke();ctx.globalAlpha*=.45;ctx.lineWidth=1;ctx.beginPath();ctx.arc(r.x-cameraX,r.y,r.r*.55,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
    for(const s of impactStreaks){ctx.save();ctx.globalAlpha=Math.max(0,1-s.t/s.life);ctx.fillStyle=s.fill;ctx.translate(s.x-cameraX,s.y);ctx.rotate(Math.atan2(s.vy,s.vx));ctx.fillRect(-s.size*2,-s.size/2,s.size*7,s.size);ctx.restore()}
    for(const b of comboBursts){
      const p=b.t/b.life, a=Math.max(0,1-p), grow=1+p*.45;
      ctx.save();ctx.globalAlpha=a;ctx.translate(b.x-cameraX,b.y-p*26);ctx.scale(grow,grow);
      ctx.textAlign='center';ctx.font='900 '+(12+b.tier*4)+'px monospace';ctx.fillStyle=b.tier>=4?'#f3d5ff':'#fff';
      ctx.fillText(b.tier>=4?'SMASH!':b.tier===3?'RUTHLESS!':'CHAIN!',0,0);ctx.restore();
    }
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.t/.5);ctx.fillStyle=p.fill;ctx.fillRect(p.x-cameraX,p.y,p.size,p.size)}ctx.globalAlpha=1;for(const f of floats){ctx.globalAlpha=Math.min(1,f.t*2);ctx.fillStyle=f.fill;ctx.font='900 '+(16*Math.min(hudK,1.6))+'px monospace';ctx.textAlign='center';ctx.fillText(f.text,f.x-cameraX,f.y);ctx.textAlign='left'}ctx.globalAlpha=1}
  function drawHUD(){
    // Everything is scaled by hudK so score/bars/labels stay readable when the
    // 1280px canvas is shown small (portrait phones). hudK === 1 on big screens.
    const k=hudK, fk=Math.min(k,1.6);
    const y1=10+17*k;                              // label baseline
    const barY=y1+12*k, barH=18*k;                 // bar row
    const arenaNow=arenaInfo(wave).arena;
    const stripH=k>1 ? Math.round(Math.max(86,y1+41*k+12)) : 86;
    ctx.fillStyle='#060b0ed9';ctx.fillRect(0,0,W,stripH);
    ctx.textAlign='left';
    ctx.font='900 '+(17*k)+'px monospace';ctx.fillStyle='#fff';
    const hw=Math.round(290-(k-1)*80), ew=Math.round(250-(k-1)*70), hx=24, ex=hx+hw+26, pad=2*Math.min(k,1.5);
    ctx.fillText('TRUTH',hx,y1);
    ctx.fillStyle='#1a2025';ctx.fillRect(hx,barY,hw,barH);ctx.fillStyle='#e04a61';ctx.fillRect(hx+pad,barY+pad,(hw-2*pad)*Math.max(0,player.hp/100),barH-2*pad);
    ctx.fillStyle='#fff';ctx.fillText('ENERGY',ex,y1);
    ctx.fillStyle='#1a2025';ctx.fillRect(ex,barY,ew,barH);ctx.fillStyle='#a735ff';ctx.fillRect(ex+pad,barY+pad,(ew-2*pad)*Math.max(0,Math.min(1,player.meter/100)),barH-2*pad);
    // Right-aligned score block (never collides with the bars)
    ctx.textAlign='right';
    ctx.fillStyle='#9cff00';ctx.fillText('SCORE '+String(score).padStart(7,'0'),W-24,y1);
    ctx.fillStyle='#fff';ctx.fillText('WAVE '+wave,W-24,y1+27*k);
    ctx.font='700 '+(11*k)+'px monospace';ctx.fillStyle=arenaNow==='pigyard'?'#ffb454':'#8fe3c4';
    ctx.fillText(arenaNow==='pigyard'?'HOG YARD':'DEAD SWAMP',W-24,y1+41*k);
    // Keyboard hint only where there's room for it (large stage, no overlap)
    if(k<=1.02 && !touchMode){ctx.textAlign='center';ctx.fillStyle='#b9c5ca';ctx.font='700 12px monospace';ctx.fillText('2.5D MOVE  •  RUN  •  CROUCH  •  AIR CONTROL  •  DASH',W/2,75)}
    ctx.textAlign='left';
    const boss=enemies.find(e=>e.isBoss&&!e.dead);
    if(boss){
      const s=enemyStats[boss.type],bw=520,bx=W/2-bw/2,by=stripH+10+(k>1?14*fk:0),bh=16*Math.min(k,1.5);
      ctx.textAlign='center';ctx.fillStyle=boss.enraged?'#ff5566':'#ffe9a8';ctx.font='900 '+(20*fk)+'px monospace';ctx.fillText((boss.enraged?'⚠ ':'')+boss.bossName+(boss.enraged?' ⚠':''),W/2,by-6);
      ctx.fillStyle='#101518cc';ctx.fillRect(bx,by,bw,bh);ctx.fillStyle=s.color;ctx.fillRect(bx+2,by+2,(bw-4)*Math.max(0,boss.hp/boss.maxHp),bh-4);
      ctx.textAlign='left';
    }
    if(messageT>0){ctx.save();ctx.globalAlpha=Math.min(1,messageT/.25);ctx.fillStyle='#bfff32';ctx.font='900 '+(42*fk)+'px monospace';ctx.textAlign='center';ctx.fillText(message,W/2,Math.max(145,stripH+70*fk));ctx.restore()}
  }
  function endGame(){gameOver=true;running=false;document.getElementById('finalScore').textContent=String(score).padStart(7,'0');document.getElementById('finalWave').textContent=wave;document.getElementById('gameOver').classList.remove('hidden')}
  function updateOverlay(){document.getElementById('pauseBadge').classList.add('hidden')}
  async function init(){
    const bossFrames=Object.values(bossVisuals).flatMap(b=>[...b.walk,b.attack,b.idle,b.ko]);
    const gruntFrames=Object.values(gruntVisuals).flatMap(g=>[...g.walk,g.attack,g.dead]);
    const names=[...new Set(Object.values(animations).flat()),'snake','gator',...bossFrames,...gruntFrames];
    await Promise.all(names.map(load));draw()
  }
  function loop(t){if(!running||paused)return;const dt=Math.min(.033,(t-last)/1000);last=t;update(dt);draw();requestAnimationFrame(loop)}
  init();
})();
