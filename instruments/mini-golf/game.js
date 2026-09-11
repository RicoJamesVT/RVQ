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
          fairway:[[25,625],[78.3,539.5],[177.5,452.7],[301.5,378.3],[437.9,291.5],[574.3,229.5],[723.1,173.7],[896.7,93.1],[975,25],[975,74.5],[964.9,173.7],[822.3,223.3],[673.5,272.9],[524.7,334.9],[382.1,421.7],[251.9,496.1],[134.1,582.9],[47.3,625]],
           sand:[{x:620,y:205,w:100,h:62,r:18}], water:[],
          obstacles:[{type:"tree",x:460,y:270,s:28},{type:"tree",x:540,y:300,s:28},{type:"tree",x:720,y:170,s:27}],
          slopes:[{x:520,y:290,r:140,h:1.0},{x:840,y:115,r:90,h:-0.55}],
          decor:"maple"
        },
        {
          name:"Covered Bridge Bend", par:4, tee:[120,120], cup:[875,515],
          fairway:[[25,35.5],[187.9,25],[361.5,72.7],[522.7,159.5],[646.7,258.7],[770.7,333.1],[975,395.1],[975,581.1],[894.7,625],[708.7,574.9],[572.3,481.9],[442.1,407.5],[311.9,320.7],[175.5,258.7],[26.7,215.3]],
           sand:[{x:290,y:105,w:95,h:58,r:16},{x:705,y:470,w:105,h:62,r:18}],
          water:[{x:520,y:395,w:170,h:100,r:35}],
          obstacles:[{type:"bridge",x:505,y:205,w:120,h:48},{type:"tree",x:780,y:285,s:29}],
          slopes:[{x:430,y:330,r:120,h:0.8},{x:875,y:515,r:85,h:-0.5}],
          decor:"bridge"
        },
        {
          name:"Lake Champlain Putt", par:3, tee:[120,520], cup:[855,150],
          fairway:[[25,619],[107.5,513.6],[256.3,451.6],[392.7,426.8],[516.7,482.6],[640.7,439.2],[777.1,340],[938.3,228.4],[975,79.6],[913.5,25],[777.1,104.4],[628.3,209.8],[504.3,315.2],[367.9,352.4],[237.7,333.8],[119.9,389.6],[25,476.4]],
           sand:[{x:380,y:455,w:100,h:60,r:18}], water:[{x:645,y:95,w:150,h:110,r:35}],
          obstacles:[{type:"rock",x:520,y:400,s:32},{type:"tree",x:730,y:305,s:28},{type:"tree",x:250,y:400,s:27}],
          slopes:[{x:500,y:320,r:130,h:0.7},{x:855,y:150,r:85,h:-0.5}],
          decor:"lake"
        },
        {
          name:"Mad River S-Curve", par:4, tee:[110,115], cup:[885,520],
          fairway:[[25,31.9],[206,25],[404.4,93.9],[466.4,211.7],[379.6,310.9],[230.8,366.7],[206,484.5],[342.4,583.7],[553.2,602.3],[739.2,540.3],[813.6,434.9],[739.2,329.5],[627.6,279.9],[652.4,180.7],[813.6,75.3],[975,62.9],[975,174.5],[900.4,186.9],[764,236.5],[745.4,323.3],[863.2,379.1],[950,453.5],[975,540.3],[975,625],[739.2,625],[491.2,625],[292.8,625],[131.6,540.3],[106.8,403.9],[255.6,292.3],[342.4,217.9],[305.2,143.5],[168.8,100.1],[25,118.7]],
           sand:[{x:500,y:500,w:115,h:58,r:18}],water:[],
          obstacles:[{type:"tree",x:225,y:245,s:28},{type:"tree",x:590,y:470,s:28},{type:"rock",x:455,y:280,s:26}],
          slopes:[{x:450,y:280,r:110,h:0.9},{x:750,y:370,r:110,h:0.9}],
          decor:"river"
        },
        {
          name:"Sugarhouse Switchback", par:4, tee:[150,540], cup:[820,105],
          fairway:[[25,625],[204.5,625],[365.7,561.3],[390.5,443.5],[254.1,350.5],[192.1,232.7],[291.3,133.5],[477.3,71.5],[650.9,114.9],[737.7,220.3],[650.9,325.7],[551.7,400.1],[613.7,499.3],[787.3,586.1],[975,561.3],[975,449.7],[898.9,437.3],[750.1,462.1],[712.9,400.1],[787.3,300.9],[861.7,226.5],[750.1,127.3],[576.5,28.1],[378.1,25],[229.3,90.1],[117.7,201.7],[130.1,313.3],[291.3,400.1],[316.1,474.5],[204.5,536.5],[30.9,536.5]],
           sand:[{x:520,y:115,w:105,h:58,r:18},{x:680,y:480,w:100,h:55,r:16}],
          water:[],
          obstacles:[{type:"tree",x:280,y:175,s:27},{type:"tree",x:760,y:360,s:28},{type:"rock",x:480,y:465,s:27}],
          slopes:[{x:480,y:300,r:130,h:1.0},{x:820,y:105,r:80,h:-0.5}],
          decor:"sugar"
        },
        {
          name:"Green Mountain Summit", par:5, tee:[125,572], cup:[865,120],
          fairway:[[25,612.7],[95.9,587.9],[232.3,513.5],[343.9,414.3],[443.1,321.3],[529.9,228.3],[616.7,153.9],[728.3,91.9],[852.3,25],[975,25],[975,98.1],[939.1,166.3],[839.9,209.7],[728.3,265.5],[666.3,339.9],[715.9,414.3],[839.9,470.1],[975,507.3],[975,594.1],[914.3,625],[728.3,600.3],[591.9,532.1],[492.7,451.5],[412.1,401.9],[325.3,470.1],[232.3,563.1],[95.9,625],[25,625]],
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
      // How many CSS pixels of physical drag are needed to reach full shot power.
      // The old code required a fixed 180 *world* units of pull, which converts to
      // 180*this.sx screen pixels — fine on a small phone canvas, but on a big
      // laptop window (where this.sx is much larger) that could be 250px+ of
      // required mouse travel. Near a course edge there simply isn't that much
      // room on the wall side of the ball, so the shot would cap out weak or feel
      // "stuck". Clamping keeps the physical drag distance reasonable and
      // reachable everywhere on the course, on any screen size.
      this.pullPx = Math.min(Math.max(180*(this.sx+this.sy)/2, 70), 140);
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
          this.drag={id:e.pointerId,sx:sxp,sy:syp};
          this.canvas.setPointerCapture?.(e.pointerId);
          this.ui.help.textContent="Aim with the arrow. Release to putt!";
        }
      });
      this.canvas.addEventListener("pointermove",(e)=>{
        if(!this.drag || this.drag.id!==e.pointerId) return;
        const r=this.canvas.getBoundingClientRect();
        this.drag.sx=e.clientX-r.left; this.drag.sy=e.clientY-r.top;
      });
      const release=(e)=>{
        if(!this.drag || this.drag.id!==e.pointerId) return;
        const r=this.canvas.getBoundingClientRect();
        const psx=e.clientX-r.left, psy=e.clientY-r.top;
        const [bxp,byp]=this.worldToScreen(this.ball.x,this.ball.y);
        // Pull vector measured in screen pixels, capped at this.pullPx (see resize())
        // instead of a fixed 180 world units — this is what makes full power always
        // reachable within a short, predictable drag, even right next to a wall.
        const dxs=bxp-psx, dys=byp-psy;
        const screenDist=Math.hypot(dxs,dys);
        this.drag=null;
        if(screenDist<8) return;
        const dxw=dxs/this.sx, dyw=dys/this.sy;
        const wlen=Math.hypot(dxw,dyw)||1;
        const power=Math.min(screenDist,this.pullPx)/this.pullPx*180;
        const speed=power*3.25;
        this.ball.vx=(dxw/wlen)*speed; this.ball.vy=(dyw/wlen)*speed;
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

      // Move in small substeps so a fast ball cannot tunnel through the
      // fairway boundary between frames.
      const travel=Math.hypot(b.vx,b.vy)*dt;
      const steps=Math.max(1,Math.ceil(travel/10));
      const sx=b.vx*dt/steps, sy=b.vy*dt/steps;
      for(let step=0;step<steps;step++){
        b.x+=sx; b.y+=sy;
        if(!this.pointInFairway(b.x,b.y)) this.reflectFromEdge();
      }

      // Gentle green/sand/water surface friction.
      let friction=this.pointInAnySand(b.x,b.y)?1.65:1.05;
      b.vx*=Math.max(0,1-friction*dt);
      b.vy*=Math.max(0,1-friction*dt);

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
    // Matches the rounded rectangle actually drawn by roundRect(): the old
    // version measured distance to the *unshrunk* box edge, which padded an
    // extra r.r pixels of invisible hazard all the way around the shape
    // (not just at the corners). This uses the standard rounded-rect
    // distance test so the hitbox lines up with what's on screen.
    inRoundRect(x,y,r){
      const halfW=r.w/2, halfH=r.h/2;
      const rr=Math.min(r.r||0,halfW,halfH);
      const cx=r.x+halfW, cy=r.y+halfH;
      const qx=Math.abs(x-cx)-(halfW-rr), qy=Math.abs(y-cy)-(halfH-rr);
      return Math.min(Math.max(qx,qy),0)+Math.hypot(Math.max(qx,0),Math.max(qy,0))<rr;
    }

    // Finds the closest point on the fairway boundary to (x,y), and an outward
    // normal for that edge (oriented using the tee, which is always inside the
    // fairway, as a reference "interior" point).
    nearestFairwayEdge(x,y){
      const poly=this.hole.fairway; let best=null;
      for(let i=0,j=poly.length-1;i<poly.length;j=i++){
        const x1=poly[j][0], y1=poly[j][1], x2=poly[i][0], y2=poly[i][1];
        const dx=x2-x1, dy=y2-y1, lenSq=dx*dx+dy*dy||1;
        let t=((x-x1)*dx+(y-y1)*dy)/lenSq;
        t=Math.max(0,Math.min(1,t));
        const qx=x1+t*dx, qy=y1+t*dy;
        const dist=Math.hypot(x-qx,y-qy);
        if(!best || dist<best.dist){
          const elen=Math.hypot(dx,dy)||1;
          let nx=-dy/elen, ny=dx/elen;
          const toTeeX=this.hole.tee[0]-qx, toTeeY=this.hole.tee[1]-qy;
          if(nx*toTeeX+ny*toTeeY>0){nx=-nx;ny=-ny;} // orient away from the (always-interior) tee
          best={dist,qx,qy,nx,ny};
        }
      }
      return best;
    }

    reflectFromEdge(){
      const b=this.ball;
      const edge=this.nearestFairwayEdge(b.x,b.y);
      if(!edge) return;
      const {qx,qy,nx,ny}=edge;
      // Place the ball just inside the boundary at this edge, rather than nudging
      // it back by a fraction of its velocity — that old approach could leave a
      // slow-moving ball still outside (or embedded in) the wall, where it would
      // come to rest "stuck" and unable to be shot cleanly again.
      let px=qx-nx*(b.r+2), py=qy-ny*(b.r+2);
      // Safety net: at sharp concave notches in a course's shape, the single
      // nearest-edge normal can occasionally undershoot and still land just
      // outside. The tee position is always inside the fairway, so nudge toward
      // it until we're confirmed back in play — with a hard fallback to the tee
      // itself — so the ball can never settle embedded in a wall.
      for(let i=0;i<10 && !this.pointInFairway(px,py);i++){
        px+=(this.hole.tee[0]-px)*0.4;
        py+=(this.hole.tee[1]-py)*0.4;
      }
      if(!this.pointInFairway(px,py)){ px=this.hole.tee[0]; py=this.hole.tee[1]; }
      b.x=px; b.y=py;
      const dot=b.vx*nx+b.vy*ny;
      if(dot>0){ b.vx-=2*dot*nx; b.vy-=2*dot*ny; }
      b.vx*=0.68; b.vy*=0.68;
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
      this.path(c,this.hole.fairway);c.strokeStyle="#467e47";c.lineWidth=12*Math.min(this.sx,this.sy);c.stroke();
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
      const bx=this.ball.x*this.sx,by=this.ball.y*this.sy,dx=bx-this.drag.sx,dy=by-this.drag.sy;
      const len=Math.min(Math.hypot(dx,dy),this.pullPx),ang=Math.atan2(dy,dx);
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
