/*
 * GREEN MOUNTAIN MINI GOLF
 * Self-contained canvas mini-golf game.
 *
 * Drop this file into an existing page and call:
 *   GreenMountainMiniGolf.mount(document.getElementById("game"));
 *
 * It creates its own responsive canvas/UI, uses no external assets,
 * and supports mouse, trackpad, touch, and pen input.
 *
 * Inspired by the mechanics of classic mini-golf / Open Golf.
 * Original Open Golf project: MIT licensed by Michael Gerdes.
 */

(function (global) {
  "use strict";

  const GMMG = {
    mount(host, options) {
      if (!host) throw new Error("GreenMountainMiniGolf.mount(): host element required");
      return new MiniGolf(host, options || {});
    }
  };

  class MiniGolf {
    constructor(host, options) {
      this.host = host;
      this.options = options;
      this.host.innerHTML = "";
      // The extra padding keeps the playable canvas a little inset from the true
      // edges of the screen. On phones, the OS reserves a thin strip at the very
      // edge of the display for system gestures (edge-swipe-back, pull-to-refresh,
      // home-indicator swipe), which can steal a touch before the page ever sees
      // it. Without this buffer, a ball resting near a course edge is touchable
      // only in that same danger zone.
      this.host.style.cssText += ";position:relative;min-height:520px;width:100%;box-sizing:border-box;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));overflow:hidden;background:#dff0dc;border-radius:18px;touch-action:none;";

      this.root = document.createElement("div");
      this.root.className = "gmmg-root";
      this.root.innerHTML = `
        <style>
          .gmmg-root{position:relative;width:100%;height:100%;min-height:520px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;user-select:none;-webkit-user-select:none}
          .gmmg-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
          .gmmg-hud{position:absolute;left:14px;right:14px;top:12px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;pointer-events:none}
          .gmmg-card{pointer-events:none;background:rgba(250,247,235,.94);border:2px solid rgba(36,83,47,.16);box-shadow:0 7px 24px rgba(25,58,31,.15);border-radius:14px;padding:9px 12px;color:#21482c}
          .gmmg-title{font-weight:900;letter-spacing:.04em;font-size:14px}
          .gmmg-sub{font-size:11px;opacity:.75;margin-top:2px}
          .gmmg-stats{display:flex;gap:12px;font-size:12px;font-weight:800}
          .gmmg-btn{pointer-events:auto;border:0;border-radius:10px;padding:8px 10px;background:#2f6b3d;color:#fff;font-weight:800;cursor:pointer}
          .gmmg-btn:active{transform:translateY(1px)}
          .gmmg-bottom{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);background:rgba(250,247,235,.94);color:#21482c;border-radius:999px;padding:8px 14px;font-size:12px;font-weight:800;box-shadow:0 5px 18px rgba(25,58,31,.13);pointer-events:none;white-space:nowrap}
          @media(max-width:620px){.gmmg-root{min-height:460px}.gmmg-title{font-size:12px}.gmmg-stats{gap:7px;font-size:11px}.gmmg-card{padding:8px 9px}.gmmg-bottom{font-size:11px;bottom:9px}}
        </style>
        <canvas class="gmmg-canvas"></canvas>
        <div class="gmmg-hud">
          <div class="gmmg-card">
            <div class="gmmg-title">GREEN MOUNTAIN MINI GOLF</div>
            <div class="gmmg-sub" data-hole-name>Stowe Maple Loop</div>
          </div>
          <div class="gmmg-card">
            <div class="gmmg-stats">
              <span>Hole <b data-hole>1</b>/6</span>
              <span>Strokes <b data-strokes>0</b></span>
              <span>Score <b data-score>0</b></span>
              <button class="gmmg-btn" data-reset>Reset</button>
            </div>
          </div>
        </div>
        <div class="gmmg-bottom" data-help>Drag from the ball opposite your shot, then release.</div>
      `;
      this.host.appendChild(this.root);

      this.canvas = this.root.querySelector(".gmmg-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.ui = {
        hole: this.root.querySelector("[data-hole]"),
        strokes: this.root.querySelector("[data-strokes]"),
        score: this.root.querySelector("[data-score]"),
        name: this.root.querySelector("[data-hole-name]"),
        help: this.root.querySelector("[data-help]")
      };
      this.root.querySelector("[data-reset]").addEventListener("click", (e) => {
        e.stopPropagation();
        this.resetHole();
      });

      this.holes = this.makeHoles();
      this.SLOPE_FORCE = 7000; // strength of downhill acceleration from elevation
      this.holeIndex = 0;
      this.totalScore = 0;
      this.lastTime = performance.now();
      this.drag = null;
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host);
      this.resize();
      this.loadHole();
      this.bindInput();
      requestAnimationFrame((t) => this.loop(t));
    }

    makeHoles() {
      // Course coordinates are normalized 0..1000 x 0..650.
      return [
        {
          name:"Stowe Maple Loop", par:3, tee:[130,530], cup:[840,115],
          fairway:[[90,570],[160,500],[240,430],[340,370],[450,300],[560,250],[680,205],[820,140],[900,80],[930,125],[875,205],[760,245],[640,285],[520,335],[405,405],[300,465],[205,535],[135,590]],
          sand:[{x:620,y:205,w:100,h:62,r:18}], water:[],
          obstacles:[{type:"tree",x:460,y:270,s:28},{type:"tree",x:540,y:300,s:28},{type:"tree",x:720,y:170,s:27}],
          slopes:[{x:520,y:290,r:140,h:1.0},{x:840,y:115,r:90,h:-0.55}],
          decor:"maple"
        },
        {
          name:"Covered Bridge Bend", par:4, tee:[120,120], cup:[875,515],
          fairway:[[90,90],[250,80],[390,120],[520,190],[620,270],[720,330],[900,380],[925,530],[820,575],[670,525],[560,450],[455,390],[350,320],[240,270],[120,235]],
          sand:[{x:290,y:105,w:95,h:58,r:16},{x:705,y:470,w:105,h:62,r:18}],
          water:[{x:520,y:395,w:170,h:100,r:35}],
          obstacles:[{type:"bridge",x:505,y:205,w:120,h:48},{type:"tree",x:780,y:285,s:29}],
          slopes:[{x:430,y:330,r:120,h:0.8},{x:875,y:515,r:85,h:-0.5}],
          decor:"bridge"
        },
        {
          name:"Lake Champlain Putt", par:3, tee:[120,520], cup:[855,150],
          fairway:[[80,565],[180,480],[300,430],[410,410],[510,455],[610,420],[720,340],[850,250],[910,130],[830,80],[720,150],[600,235],[500,320],[390,350],[285,335],[190,380],[110,450]],
          sand:[{x:380,y:455,w:100,h:60,r:18}], water:[{x:645,y:95,w:150,h:110,r:35}],
          obstacles:[{type:"rock",x:520,y:400,s:32},{type:"tree",x:730,y:305,s:28},{type:"tree",x:250,y:400,s:27}],
          slopes:[{x:500,y:320,r:130,h:0.7},{x:855,y:150,r:85,h:-0.5}],
          decor:"lake"
        },
        {
          name:"Mad River S-Curve", par:4, tee:[110,115], cup:[885,520],
          fairway:[[80,90],[270,75],[430,140],[480,235],[410,315],[290,360],[270,455],[380,535],[550,550],[700,500],[760,415],[700,330],[610,290],[630,210],[760,125],[910,115],[940,205],[830,215],[720,255],[705,325],[800,370],[870,430],[930,500],[900,575],[700,600],[500,590],[340,570],[210,500],[190,390],[310,300],[380,240],[350,180],[240,145],[100,160]],
          sand:[{x:500,y:500,w:115,h:58,r:18}],water:[],
          obstacles:[{type:"tree",x:225,y:245,s:28},{type:"tree",x:590,y:470,s:28},{type:"rock",x:455,y:280,s:26}],
          slopes:[{x:450,y:280,r:110,h:0.9},{x:750,y:370,r:110,h:0.9}],
          decor:"river"
        },
        {
          name:"Sugarhouse Switchback", par:4, tee:[150,540], cup:[820,105],
          fairway:[[100,580],[260,590],[390,520],[410,425],[300,350],[250,255],[330,175],[480,125],[620,160],[690,245],[620,330],[540,390],[590,470],[730,540],[900,520],[925,430],[820,420],[700,440],[670,390],[730,310],[790,250],[700,170],[560,90],[400,80],[280,140],[190,230],[200,320],[330,390],[350,450],[260,500],[120,500]],
          sand:[{x:520,y:115,w:105,h:58,r:18},{x:680,y:480,w:100,h:55,r:16}],
          water:[],
          obstacles:[{type:"tree",x:280,y:175,s:27},{type:"tree",x:760,y:360,s:28},{type:"rock",x:480,y:465,s:27}],
          slopes:[{x:480,y:300,r:130,h:1.0},{x:820,y:105,r:80,h:-0.5}],
          decor:"sugar"
        },
        {
          name:"Green Mountain Summit", par:5, tee:[105,525], cup:[865,120],
          fairway:[[70,570],[190,550],[300,490],[390,410],[470,335],[540,260],[610,200],[700,150],[800,95],[920,90],[945,155],[870,210],[790,245],[700,290],[650,350],[690,410],[790,455],[900,485],[925,555],[850,590],[700,560],[590,505],[510,440],[445,400],[375,455],[300,530],[190,595],[90,600]],
          sand:[{x:580,y:235,w:105,h:58,r:17}],water:[{x:710,y:470,w:140,h:80,r:30}],
          obstacles:[{type:"tree",x:355,y:330,s:28},{type:"tree",x:615,y:390,s:29},{type:"tree",x:810,y:330,s:28},{type:"rock",x:470,y:230,s:25}],
          slopes:[{x:650,y:300,r:180,h:1.3},{x:865,y:120,r:85,h:-0.5}],
          decor:"mountain"
        }
      ];
    }

    loadHole() {
      this.hole = this.holes[this.holeIndex];
      this.strokes = 0;
      this.ball = {x:this.hole.tee[0],y:this.hole.tee[1],vx:0,vy:0,r:11,stopped:true};
      this.finished = false;
      this.messageTimer = 0;
      this.ui.hole.textContent = this.holeIndex + 1;
      this.ui.strokes.textContent = 0;
      this.ui.score.textContent = this.totalScore;
      this.ui.name.textContent = this.hole.name;
      this.ui.help.textContent = "Drag from the ball opposite your shot, then release.";
    }

    resetHole() { this.loadHole(); }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.max(1, Math.floor(rect.width*dpr));
      this.canvas.height = Math.max(1, Math.floor(rect.height*dpr));
      this.w = rect.width; this.h = rect.height;
      this.sx = this.w/1000; this.sy = this.h/650;
    }

    worldToScreen(x,y){ return [x*this.sx,y*this.sy]; }
    screenToWorld(x,y){ return [x/this.sx,y/this.sy]; }

    pointerPos(e) {
      const r = this.canvas.getBoundingClientRect();
      return this.screenToWorld(e.clientX-r.left,e.clientY-r.top);
    }

    bindInput() {
      this.canvas.addEventListener("pointerdown",(e)=>{
        if (this.finished || !this.ball.stopped) return;
        // Hit-test in screen pixels (not world units) so the touch target stays a
        // consistent, finger-friendly size no matter how the course is scaled down
        // to fit the device, and no matter where on the course the ball sits.
        const r=this.canvas.getBoundingClientRect();
        const sxp=e.clientX-r.left, syp=e.clientY-r.top;
        const [bxp,byp]=this.worldToScreen(this.ball.x,this.ball.y);
        const d=Math.hypot(sxp-bxp,syp-byp);
        const grabRadius=e.pointerType==="touch"?54:34;
        if(d<grabRadius){
          const p=this.screenToWorld(sxp,syp);
          this.drag={id:e.pointerId,x:p[0],y:p[1]};
          this.canvas.setPointerCapture?.(e.pointerId);
          this.ui.help.textContent="Aim with the arrow. Release to putt!";
        }
      });
      this.canvas.addEventListener("pointermove",(e)=>{
        if(!this.drag || this.drag.id!==e.pointerId) return;
        const p=this.pointerPos(e); this.drag.x=p[0]; this.drag.y=p[1];
      });
      const release=(e)=>{
        if(!this.drag || this.drag.id!==e.pointerId) return;
        const p=this.pointerPos(e);
        const dx=this.ball.x-p[0], dy=this.ball.y-p[1];
        const dist=Math.hypot(dx,dy);
        this.drag=null;
        if(dist<10) return;
        const power=Math.min(dist,180);
        const speed=power*3.25;
        this.ball.vx=dx/dist*speed; this.ball.vy=dy/dist*speed;
        this.ball.stopped=false;
        this.strokes++;
        this.ui.strokes.textContent=this.strokes;
        this.ui.help.textContent="Nice! Watch the break and settle.";
      };
      this.canvas.addEventListener("pointerup",release);
      this.canvas.addEventListener("pointercancel",release);
    }

    loop(t) {
      const dt=Math.min((t-this.lastTime)/1000,0.032);
      this.lastTime=t;
      this.update(dt);
      this.draw();
      requestAnimationFrame((n)=>this.loop(n));
    }

    pointInFairway(x,y) {
      // Canvas point-in-polygon.
      const poly=this.hole.fairway; let inside=false;
      for(let i=0,j=poly.length-1;i<poly.length;j=i++){
        const xi=poly[i][0], yi=poly[i][1], xj=poly[j][0], yj=poly[j][1];
        const hit=((yi>y)!=(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi);
        if(hit) inside=!inside;
      }
      return inside;
    }

    // Elevation at a point: sum of smooth radial hills (h>0) and basins (h<0).
    heightAt(x,y){
      let z=0;
      for(const s of this.hole.slopes||[]){
        const d=Math.hypot(x-s.x,y-s.y);
        if(d<s.r) z += s.h*0.5*(1+Math.cos(Math.PI*d/s.r));
      }
      return z;
    }

    // Numeric gradient of the heightfield — points uphill; ball accelerates opposite it.
    slopeGradient(x,y){
      const e=6;
      const gx=(this.heightAt(x+e,y)-this.heightAt(x-e,y))/(2*e);
      const gy=(this.heightAt(x,y+e)-this.heightAt(x,y-e))/(2*e);
      return [gx,gy];
    }

    update(dt) {
      if(this.ball.stopped || this.finished) return;
      const b=this.ball;

      // Gravity: accelerate downhill along the terrain's slope.
      const [gx,gy]=this.slopeGradient(b.x,b.y);
      b.vx-=gx*this.SLOPE_FORCE*dt;
      b.vy-=gy*this.SLOPE_FORCE*dt;

      b.x+=b.vx*dt; b.y+=b.vy*dt;

      // Gentle green/sand/water surface friction.
      let friction=this.pointInAnySand(b.x,b.y)?1.65:1.05;
      b.vx*=Math.max(0,1-friction*dt);
      b.vy*=Math.max(0,1-friction*dt);

      // Course edge: bounce if outside playable polygon.
      if(!this.pointInFairway(b.x,b.y)){
        b.x-=b.vx*dt*1.25; b.y-=b.vy*dt*1.25;
        this.reflectFromEdge();
        b.vx*=0.68; b.vy*=0.68;
      }

      // Water: drop ball back toward tee with a penalty stroke.
      if(this.pointInAnyWater(b.x,b.y)){
        b.x=this.hole.tee[0]; b.y=this.hole.tee[1]; b.vx=b.vy=0; b.stopped=true;
        this.strokes++;
        this.ui.strokes.textContent=this.strokes;
        this.ui.help.textContent="Splash! One penalty stroke — back to the tee.";
        return;
      }

      // Obstacles.
      for(const o of this.hole.obstacles) this.collideObstacle(o);

      // Cup.
      const d=Math.hypot(b.x-this.hole.cup[0],b.y-this.hole.cup[1]);
      if(d<17 && Math.hypot(b.vx,b.vy)<105){
        b.x=this.hole.cup[0]; b.y=this.hole.cup[1]; b.vx=b.vy=0; b.stopped=true;
        this.finishHole();
        return;
      }

      const onSlope=Math.hypot(gx,gy)>0.0015;
      if(Math.hypot(b.vx,b.vy)<8 && !onSlope){
        b.vx=b.vy=0; b.stopped=true;
        this.ui.help.textContent="Drag from the ball opposite your shot, then release.";
      }
    }

    pointInAnySand(x,y){return this.hole.sand.some(s=>this.inRoundRect(x,y,s));}
    pointInAnyWater(x,y){return this.hole.water.some(s=>this.inRoundRect(x,y,s));}
    inRoundRect(x,y,r){
      const cx=Math.max(r.x,Math.min(x,r.x+r.w)), cy=Math.max(r.y,Math.min(y,r.y+r.h));
      const rr=r.r||0; return Math.hypot(x-cx,y-cy)<rr;
    }

    reflectFromEdge(){
      const cx=this.hole.tee[0], cy=this.hole.tee[1];
      // Practical arcade reflection: reverse the component pointing outwards.
      const ang=Math.atan2(this.ball.y-cy,this.ball.x-cx);
      const nx=Math.cos(ang), ny=Math.sin(ang);
      const dot=this.ball.vx*nx+this.ball.vy*ny;
      if(dot>0){this.ball.vx-=2*dot*nx; this.ball.vy-=2*dot*ny;}
    }

    collideObstacle(o){
      let cx=o.x,cy=o.y,rad=o.s||25;
      if(o.type==="bridge"){ // rectangular collision
        const qx=Math.max(o.x-o.w/2,Math.min(this.ball.x,o.x+o.w/2));
        const qy=Math.max(o.y-o.h/2,Math.min(this.ball.y,o.y+o.h/2));
        const dx=this.ball.x-qx,dy=this.ball.y-qy,d=Math.hypot(dx,dy);
        if(d<this.ball.r+3){const nx=dx/(d||1),ny=dy/(d||1);this.ball.x=qx+nx*(this.ball.r+4);this.ball.y=qy+ny*(this.ball.r+4);const dot=this.ball.vx*nx+this.ball.vy*ny;this.ball.vx-=2*dot*nx;this.ball.vy-=2*dot*ny;this.ball.vx*=.78;this.ball.vy*=.78;}
        return;
      }
      const d=Math.hypot(this.ball.x-cx,this.ball.y-cy), min=this.ball.r+rad*.55;
      if(d<min){
        const nx=(this.ball.x-cx)/(d||1),ny=(this.ball.y-cy)/(d||1);
        this.ball.x=cx+nx*min;this.ball.y=cy+ny*min;
        const dot=this.ball.vx*nx+this.ball.vy*ny;
        if(dot<0){this.ball.vx-=2*dot*nx;this.ball.vy-=2*dot*ny;this.ball.vx*=.8;this.ball.vy*=.8;}
      }
    }

    finishHole(){
      const delta=this.strokes-this.hole.par;
      this.totalScore+=delta;
      this.ui.score.textContent=this.totalScore>0?`+${this.totalScore}`:this.totalScore;
      const label=delta<0?`Birdie! ${this.strokes} strokes.`:delta===0?`Par! ${this.strokes} strokes.`:`${this.strokes} strokes.`;
      if(this.holeIndex<this.holes.length-1){
        this.ui.help.textContent=`${label} Tap or click anywhere to play the next Vermont hole.`;
        this.finished=true;
        const next=()=>{this.canvas.removeEventListener("pointerup",next);this.holeIndex++;this.loadHole();};
        setTimeout(()=>this.canvas.addEventListener("pointerup",next,{once:true}),50);
      }else{
        this.ui.help.textContent=`Course complete — ${this.totalScore>0?"+"+this.totalScore:this.totalScore} overall. Tap Reset to play again.`;
        this.finished=true;
      }
    }

    draw(){
      const c=this.ctx,dpr=Math.min(devicePixelRatio||1,2);
      c.setTransform(dpr,0,0,dpr,0,0);
      c.clearRect(0,0,this.w,this.h);
      this.drawBackdrop(c);
      this.drawCourse(c);
      this.drawDecor(c);
      this.drawCup(c);
      this.drawBall(c);
      if(this.drag) this.drawAim(c);
      if(this.finished && this.holeIndex===this.holes.length-1) this.drawFinish(c);
    }

    path(c,poly){
      c.beginPath(); poly.forEach((p,i)=>i?c.lineTo(p[0]*this.sx,p[1]*this.sy):c.moveTo(p[0]*this.sx,p[1]*this.sy)); c.closePath();
    }

    drawBackdrop(c){
      c.fillStyle="#d9efdc";c.fillRect(0,0,this.w,this.h);
      // Distant Green Mountains.
      c.beginPath();c.moveTo(0,this.h*.33);
      for(let i=0;i<=10;i++){const x=this.w*i/10;const peak=this.h*(.12+((i*37)%100)/500);c.lineTo(x,this.h*.33-peak);}
      c.lineTo(this.w,this.h*.55);c.lineTo(0,this.h*.55);c.closePath();c.fillStyle="#a9d0ae";c.fill();
      c.fillStyle="#c8dfc6";c.fillRect(0,this.h*.52,this.w,this.h*.48);
      // Vermont sky puffs.
      c.fillStyle="rgba(255,255,255,.58)";
      for(let i=0;i<5;i++){const x=(i*231+80)%this.w,y=55+(i%3)*26;c.beginPath();c.arc(x,y,22,0,Math.PI*2);c.arc(x+24,y+4,17,0,Math.PI*2);c.arc(x-22,y+7,16,0,Math.PI*2);c.fill();}
    }

    drawCourse(c){
      this.path(c,this.hole.fairway);
      c.save();c.shadowColor="rgba(27,75,38,.20)";c.shadowBlur=18;c.shadowOffsetY=8;
      c.fillStyle="#69a85e";c.fill();c.restore();
      // subtle mowing stripes
      c.save();this.path(c,this.hole.fairway);c.clip();
      c.globalAlpha=.12;c.fillStyle="#fff";
      for(let x=-700;x<1500;x+=70){c.save();c.translate(x,0);c.rotate(-.12);c.fillRect(0,0,28,700);c.restore();}
      c.restore();
      // inner edge
      this.path(c,this.hole.fairway);c.strokeStyle="#467e47";c.lineWidth=8*this.sx;c.stroke();
      // elevation contours (hills = warm rings, basins = cool rings)
      c.save();this.path(c,this.hole.fairway);c.clip();
      for(const s of this.hole.slopes||[]){
        const rings=5;
        for(let i=rings;i>=1;i--){
          const rr=s.r*(i/rings);
          const alpha=0.05+0.045*(rings-i);
          c.beginPath();
          c.ellipse(s.x*this.sx,s.y*this.sy,rr*this.sx,rr*this.sy,0,0,Math.PI*2);
          c.fillStyle = s.h>0 ? `rgba(214,181,110,${alpha})` : `rgba(58,102,138,${alpha})`;
          c.fill();
        }
      }
      c.restore();
      // sand
      for(const s of this.hole.sand){this.roundRect(c,s.x,s.y,s.w,s.h,s.r,"#d8c486");c.save();c.globalAlpha=.22;for(let i=0;i<12;i++){c.fillStyle="#fff";c.fillRect((s.x+8+i*19)*this.sx,(s.y+13+(i*7)%35)*this.sy,2,2)}c.restore();}
      // water
      for(const s of this.hole.water){this.roundRect(c,s.x,s.y,s.w,s.h,s.r,"#6aaeb8");c.save();c.strokeStyle="rgba(255,255,255,.35)";c.lineWidth=2;for(let y=s.y+18;y<s.y+s.h-8;y+=18){c.beginPath();c.moveTo((s.x+10)*this.sx,y*this.sy);c.quadraticCurveTo((s.x+s.w/2)*this.sx,(y-6)*this.sy,(s.x+s.w-10)*this.sx,y*this.sy);c.stroke()}c.restore();}
    }

    roundRect(c,x,y,w,h,r,fill){c.beginPath();c.roundRect(x*this.sx,y*this.sy,w*this.sx,h*this.sy,r*this.sx);c.fillStyle=fill;c.fill();}

    drawDecor(c){
      for(const o of this.hole.obstacles){
        const x=o.x*this.sx,y=o.y*this.sy;
        if(o.type==="tree"){
          c.fillStyle="#735334";c.fillRect(x-5*this.sx,y+13*this.sy,10*this.sx,24*this.sy);
          c.fillStyle="#2f6f42";c.beginPath();c.arc(x,y, o.s*this.sx*.58,0,Math.PI*2);c.fill();
          c.fillStyle="#438650";c.beginPath();c.arc(x-12*this.sx,y-10*this.sy,o.s*this.sx*.38,0,Math.PI*2);c.arc(x+12*this.sx,y-7*this.sy,o.s*this.sx*.4,0,Math.PI*2);c.fill();
        } else if(o.type==="rock"){
          c.fillStyle="#777b70";c.beginPath();c.ellipse(x,y,o.s*this.sx*.75,o.s*this.sy*.48,-.2,0,Math.PI*2);c.fill();
          c.fillStyle="#9a9d92";c.beginPath();c.ellipse(x-7*this.sx,y-5*this.sy,o.s*this.sx*.25,o.s*this.sy*.13,-.2,0,Math.PI*2);c.fill();
        } else if(o.type==="bridge"){
          this.roundRect(c,o.x-o.w/2,o.y-o.h/2,o.w,o.h,8,"#8c4f32");
          c.fillStyle="#5e3626";for(let i=-2;i<=2;i++)c.fillRect((o.x+i*20-3)*this.sx,(o.y-o.h/2+4)*this.sy,6*this.sx,(o.h-8)*this.sy);
          c.fillStyle="#e6d4ae";c.font=`700 ${Math.max(10,12*this.sx)}px system-ui`;c.textAlign="center";c.fillText("VERMONT",(o.x*this.sx),(o.y+4)*this.sy);
        }
      }
      // Maple leaves / tiny flag.
      const t=this.hole.cup; c.fillStyle="#b33b32";
      for(let i=0;i<3;i++){const a=i*2.1;c.beginPath();c.arc((t[0]+Math.cos(a)*45)*this.sx,(t[1]+Math.sin(a)*28)*this.sy,4*this.sx,0,Math.PI*2);c.fill();}
    }

    drawCup(c){
      const x=this.hole.cup[0]*this.sx,y=this.hole.cup[1]*this.sy;
      c.fillStyle="#173c24";c.beginPath();c.ellipse(x,y,16*this.sx,9*this.sy,0,0,Math.PI*2);c.fill();
      c.fillStyle="#111";c.beginPath();c.ellipse(x,y,10*this.sx,6*this.sy,0,0,Math.PI*2);c.fill();
      c.strokeStyle="#eee";c.lineWidth=2*this.sx;c.beginPath();c.moveTo(x,y);c.lineTo(x,y-58*this.sy);c.stroke();
      c.fillStyle="#b33b32";c.beginPath();c.moveTo(x,y-58*this.sy);c.lineTo(x+30*this.sx,y-48*this.sy);c.lineTo(x,y-38*this.sy);c.closePath();c.fill();
      c.fillStyle="#fff";c.font=`800 ${Math.max(9,11*this.sx)}px system-ui`;c.fillText("VT",x+4*this.sx,y-45*this.sy);
    }

    drawBall(c){
      const x=this.ball.x*this.sx,y=this.ball.y*this.sy,r=this.ball.r*this.sx;
      c.save();c.shadowColor="rgba(0,0,0,.3)";c.shadowBlur=8;c.shadowOffsetY=5;
      c.fillStyle="#fff";c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.restore();
      c.fillStyle="rgba(80,80,80,.16)";c.beginPath();c.arc(x-3*this.sx,y-4*this.sy,2*this.sx,0,Math.PI*2);c.arc(x+4*this.sx,y+2*this.sy,1.5*this.sx,0,Math.PI*2);c.fill();
    }

    drawAim(c){
      const bx=this.ball.x*this.sx,by=this.ball.y*this.sy,dx=bx-this.drag.x*this.sx,dy=by-this.drag.y*this.sy;
      const len=Math.min(Math.hypot(dx,dy),180*this.sx),ang=Math.atan2(dy,dx);
      c.save();c.globalAlpha=.9;c.strokeStyle="#f6f2dd";c.lineWidth=4;c.setLineDash([8,7]);
      c.beginPath();c.moveTo(bx,by);c.lineTo(bx+Math.cos(ang)*len,by+Math.sin(ang)*len);c.stroke();c.setLineDash([]);
      c.fillStyle="#b33b32";c.beginPath();c.moveTo(bx+Math.cos(ang)*len,by+Math.sin(ang)*len);c.lineTo(bx+Math.cos(ang+2.65)*12,by+Math.sin(ang+2.65)*12);c.lineTo(bx+Math.cos(ang-2.65)*12,by+Math.sin(ang-2.65)*12);c.closePath();c.fill();
      c.restore();
    }

    drawFinish(c){
      c.fillStyle="rgba(22,61,34,.18)";c.fillRect(0,0,this.w,this.h);
      c.fillStyle="#faf7eb";c.beginPath();c.roundRect(this.w*.16,this.h*.33,this.w*.68,this.h*.30,22);c.fill();
      c.fillStyle="#21482c";c.textAlign="center";c.font=`900 ${Math.max(20,this.w*.035)}px system-ui`;c.fillText("GREEN MOUNTAIN FINISH",this.w/2,this.h*.43);
      c.font=`700 ${Math.max(14,this.w*.021)}px system-ui`;c.fillText(`Final score: ${this.totalScore>0?"+"+this.totalScore:this.totalScore}`,this.w/2,this.h*.51);
      c.font=`600 ${Math.max(11,this.w*.014)}px system-ui`;c.fillText("Press Reset to play the Vermont course again.",this.w/2,this.h*.57);
    }

    destroy(){this.resizeObserver?.disconnect();this.root.remove();}
  }

  global.GreenMountainMiniGolf = GMMG;
})(window);
