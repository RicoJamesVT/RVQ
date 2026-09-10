/* RICO1200 v2 — original game-embedded sampler / beat lab.
   Designed for Rico's Vinyl Quest. No external dependencies.
   Usage:
     <div id="rico1200"></div>
     <script src="rico1200.js"></script>
     <script>Rico1200.mountInto(document.getElementById('rico1200'));</script>
*/
(function(global){
"use strict";

class Rico1200 {
  constructor(opts={}) {
    this.container=opts.container;
    this.audio=null; this.master=null;
    this.selected=0; this.bank=0; this.bpm=92; this.swing=0;
    this.playing=false; this.recording=false; this.step=-1; this.timer=null;
    this.pads=Array.from({length:32},()=>this.emptyPad());
    this.pattern=Array.from({length:16},()=>Array(16).fill(false));
    this.samplesTaken=0;
    this.fx={bit:12, filter:"lowpass", freq:12000, drive:0, vinyl:.15, delay:0};
    this.sources=new Set();
  }
  emptyPad(){return {buffer:null,name:"EMPTY",start:0,end:1,pitch:0,gain:1,pan:0,reverse:false,gate:false,loop:false,mute:false,decay:1};}
  mount(){
    if(!this.container) throw Error("Rico1200 needs a container.");
    this.styles(); this.container.innerHTML=this.ui(); this.cache(); this.events();
    this.render(); this.select(0); return this;
  }
  ui(){return `
  <div class="r12">
   <header><div><div class="logo">RICO<span>1200</span></div><small>RICO'S BEAT LAB • CRATE DIGGING MACHINE</small></div>
    <div class="lcd"><div><b>PROJECT</b> RVQ BEAT LAB</div><div><b>BPM</b> <span id="r12-bpm">092</span> <b>MEM</b> <span id="r12-mem">0/32</span></div></div>
   </header>
   <nav class="tabs"><button data-tab="sample" class="active">SAMPLE</button><button data-tab="beat">BEAT</button><button data-tab="mix">MIX</button></nav>
   <main>
    <section class="sampleTab">
     <div class="machine">
      <div class="display">
       <div class="displayTop"><span id="r12-status">READY</span><span id="r12-padname">PAD 01</span></div>
       <div class="wave" id="r12-wave"><div class="wavegrid"></div><div class="wavefill"></div><i class="marker start"></i><i class="marker end"></i><span>IMPORT OR RECORD A SAMPLE</span></div>
       <div class="readout"><span id="r12-time">0.00s</span><span id="r12-mode">12 BIT / CLEAN</span></div>
      </div>
      <div class="transport"><button id="r12-import">IMPORT</button><input id="r12-files" type="file" accept="audio/*" multiple hidden><button id="r12-sample">● SAMPLE</button><button id="r12-stop">■ STOP</button><button id="r12-chop">CHOP 4</button><button id="r12-clear">CLEAR</button></div>
      <div class="editor">
       <label>START <input id="r12-start" type="range" min="0" max="0.99" step=".001"></label>
       <label>END <input id="r12-end" type="range" min=".01" max="1" step=".001" value="1"></label>
       <label>PITCH <input id="r12-pitch" type="range" min="-24" max="24" value="0"></label>
       <label>GAIN <input id="r12-gain" type="range" min="0" max="2" step=".01" value="1"></label>
       <label>PAN <input id="r12-pan" type="range" min="-1" max="1" step=".01"></label>
       <label>DECAY <input id="r12-decay" type="range" min=".05" max="1" step=".01" value="1"></label>
      </div>
      <div class="toggles"><button id="r12-reverse">REVERSE</button><button id="r12-gate">GATE</button><button id="r12-loop">LOOP</button><button id="r12-mute">MUTE</button><button id="r12-save">SAVE PROJECT</button><button id="r12-load">LOAD PROJECT</button><input id="r12-project" type="file" accept=".json" hidden></div>
     </div>
     <div class="padPanel">
      <div class="banks"><button class="bank active" data-bank="0">A</button><button class="bank" data-bank="1">B</button><button class="bank" data-bank="2">C</button><button class="bank" data-bank="3">D</button></div>
      <div class="pads" id="r12-pads"></div>
      <div class="padkeys">KEYS: 1 2 3 4 5 6 7 8 / Q W E R T Y U I</div>
     </div>
    </section>
    <section class="beatTab hidden">
      <div class="beatTop"><div><b>16 STEP PATTERN</b><small>tap pads while recording to build your beat</small></div><div class="beatBtns"><button id="r12-play">▶ PLAY</button><button id="r12-rec">● REC</button><button id="r12-clearpat">CLEAR</button><label>BPM <input id="r12-bpmIn" type="number" min="40" max="220" value="92"></label><label>SWING <input id="r12-swing" type="range" min="0" max=".5" step=".01"></label></div></div>
      <div class="sequencer" id="r12-seq"></div>
    </section>
    <section class="mixTab hidden">
      <div class="mixgrid">
       <label>BIT CRUSH <input id="r12-bit" type="range" min="1" max="12" value="12"><b id="r12-bitv">12</b></label>
       <label>FILTER <select id="r12-filter"><option>lowpass</option><option>highpass</option><option>bandpass</option></select></label>
       <label>FREQ <input id="r12-freq" type="range" min="250" max="18000" value="12000"></label>
       <label>DRIVE <input id="r12-drive" type="range" min="0" max="1" step=".01"></label>
       <label>VINYL DUST <input id="r12-vinyl" type="range" min="0" max="1" step=".01" value=".15"></label>
       <label>SLAP DELAY <input id="r12-delay" type="range" min="0" max=".5" step=".01"></label>
      </div>
      <div class="tips"><b>RICO'S RECIPE</b><p>Load a drum break. Hit CHOP 4. Pitch one chop down. Add a kick and snare. Turn BIT CRUSH down to 10–12 bits, add a little DRIVE and VINYL DUST, then sequence the pads.</p></div>
    </section>
   </main>
   <footer>RICO1200 • SAMPLE • CHOP • FLIP • SEQUENCE • MAKE SOMETHING FROM NOTHING</footer>
  </div>`}
  cache(){
    const q=s=>this.container.querySelector(s);
    this.u={pads:q("#r12-pads"),seq:q("#r12-seq"),wave:q("#r12-wave"),status:q("#r12-status"),name:q("#r12-padname"),time:q("#r12-time"),mode:q("#r12-mode"),mem:q("#r12-mem"),bpm:q("#r12-bpm"),bpmIn:q("#r12-bpmIn"),swing:q("#r12-swing"),
    start:q("#r12-start"),end:q("#r12-end"),pitch:q("#r12-pitch"),gain:q("#r12-gain"),pan:q("#r12-pan"),decay:q("#r12-decay"),files:q("#r12-files"),sample:q("#r12-sample"),play:q("#r12-play"),rec:q("#r12-rec"),
    bit:q("#r12-bit"),bitv:q("#r12-bitv"),filter:q("#r12-filter"),freq:q("#r12-freq"),drive:q("#r12-drive"),vinyl:q("#r12-vinyl"),delay:q("#r12-delay"),project:q("#r12-project")};
  }
  events(){
    this.container.querySelector("#r12-import").onclick=()=>this.u.files.click();
    this.u.files.onchange=e=>this.import(e.target.files);
    this.u.sample.onclick=()=>this.recordMic();
    this.container.querySelector("#r12-stop").onclick=()=>this.stop();
    this.container.querySelector("#r12-clear").onclick=()=>{this.pads[this.selected]=this.emptyPad();this.select(this.selected)};
    this.container.querySelector("#r12-chop").onclick=()=>this.chop(4);
    [["start","start"],["end","end"],["pitch","pitch"],["gain","gain"],["pan","pan"],["decay","decay"]].forEach(([a,b])=>this.u[a].oninput=()=>{this.pads[this.selected][b]=+this.u[a].value;this.render()});
    ["reverse","gate","loop","mute"].forEach(k=>this.container.querySelector("#r12-"+k).onclick=()=>{this.pads[this.selected][k]=!this.pads[this.selected][k];this.render()});
    this.container.querySelectorAll(".bank").forEach(b=>b.onclick=()=>{this.bank=+b.dataset.bank;this.renderPads()});
    this.container.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{this.container.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");["sample","beat","mix"].forEach(t=>this.container.querySelector("."+t+"Tab").classList.toggle("hidden",b.dataset.tab!==t))});
    this.u.play.onclick=()=>this.togglePlay(); this.u.rec.onclick=()=>{this.recording=!this.recording;this.u.rec.classList.toggle("armed",this.recording)};
    this.container.querySelector("#r12-clearpat").onclick=()=>{this.pattern.forEach(x=>x.fill(false));this.renderSeq()};
    this.u.bpmIn.oninput=()=>this.bpm=Math.max(40,Math.min(220,+this.u.bpmIn.value||92));
    this.u.swing.oninput=()=>this.swing=+this.u.swing.value;
    this.u.bit.oninput=()=>{this.fx.bit=+this.u.bit.value;this.u.bitv.textContent=this.fx.bit};
    this.u.filter.onchange=()=>this.fx.filter=this.u.filter.value; this.u.freq.oninput=()=>this.fx.freq=+this.u.freq.value;
    this.u.drive.oninput=()=>this.fx.drive=+this.u.drive.value;this.u.vinyl.oninput=()=>this.fx.vinyl=+this.u.vinyl.value;this.u.delay.oninput=()=>this.fx.delay=+this.u.delay.value;
    this.container.querySelector("#r12-save").onclick=()=>this.saveProject();
    this.container.querySelector("#r12-load").onclick=()=>this.u.project.click();
    this.u.project.onchange=e=>this.loadProject(e.target.files[0]);
    window.addEventListener("keydown",e=>{if(e.repeat)return;const map={"1":0,"2":1,"3":2,"4":3,"5":4,"6":5,"7":6,"8":7,"q":8,"w":9,"e":10,"r":11,"t":12,"y":13,"u":14,"i":15};if(map[e.key]!=null){let i=this.bank*8+map[e.key]%8;this.select(i);this.trigger(i)}});
  }
  async audioInit(){if(!this.audio){this.audio=new (window.AudioContext||window.webkitAudioContext)();this.master=this.audio.createGain();this.master.gain.value=.8;this.master.connect(this.audio.destination)}if(this.audio.state==="suspended")await this.audio.resume()}
  async import(files){await this.audioInit();let i=this.bank*8;for(const f of [...files]){if(i>=this.bank*8+8)break;try{let b=await this.audio.decodeAudioData(await f.arrayBuffer());this.pads[i].buffer=b;this.pads[i].name=f.name.replace(/\.[^/.]+$/,"").toUpperCase();i++}catch(e){console.warn(e)}}this.select(Math.max(this.bank*8,i-1))}
  async recordMic(){await this.audioInit();if(this.recorder){this.recorder.stop();return}if(!navigator.mediaDevices?.getUserMedia){alert("Microphone recording is unavailable.");return}let stream=await navigator.mediaDevices.getUserMedia({audio:true}), chunks=[];this.recorder=new MediaRecorder(stream);this.recorder.ondataavailable=e=>chunks.push(e.data);this.recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());let blob=new Blob(chunks,{type:"audio/webm"});this.pads[this.selected].buffer=await this.audio.decodeAudioData(await blob.arrayBuffer());this.pads[this.selected].name="RICO REC "+(++this.samplesTaken);this.recorder=null;this.u.sample.textContent="● SAMPLE";this.select(this.selected)};this.recorder.start();this.u.sample.textContent="■ STOP SAMPLE"}
  select(i){this.selected=i;let p=this.pads[i];this.u.name.textContent="PAD "+String(i+1).padStart(2,"0")+" • "+p.name;this.u.start.value=p.start;this.u.end.value=p.end;this.u.pitch.value=p.pitch;this.u.gain.value=p.gain;this.u.pan.value=p.pan;this.u.decay.value=p.decay;this.u.time.textContent=p.buffer?(p.buffer.duration*p.start).toFixed(2)+"s — "+(p.buffer.duration*p.end).toFixed(2)+"s":"0.00s";this.renderPads();this.drawWave()}
  async trigger(i){
    let p=this.pads[i];if(!p.buffer)return;await this.audioInit();
    let s=this.audio.createBufferSource(), g=this.audio.createGain(), pan=this.audio.createStereoPanner(), f=this.audio.createBiquadFilter();
    s.buffer=p.buffer;s.playbackRate.value=Math.pow(2,p.pitch/12)*(p.reverse?-1:1);g.gain.value=p.mute?0:p.gain;pan.pan.value=p.pan;f.type=this.fx.filter;f.frequency.value=this.fx.freq;f.Q.value=.8;
    s.connect(f).connect(g).connect(pan).connect(this.master);
    let dur=Math.max(.012,(p.end-p.start)*p.buffer.duration/Math.abs(s.playbackRate.value)), start=p.reverse?p.end*p.buffer.duration:p.start*p.buffer.duration;
    if(p.reverse)s.start(this.audio.currentTime+.005,start,dur);else s.start(this.audio.currentTime+.005,start,dur);
    if(p.gate)s.stop(this.audio.currentTime+.005+Math.min(dur,.35));else if(p.decay<1)g.gain.setTargetAtTime(0,this.audio.currentTime+dur*p.decay,.02);
    this.sources.add(s);s.onended=()=>this.sources.delete(s);
  }
  chop(n){let p=this.pads[this.selected];if(!p.buffer)return;let base=Math.floor(this.selected/8)*8;let first=this.selected-base;for(let k=0;k<n;k++){let i=base+((first+k)%8), a=this.emptyPad();a.buffer=p.buffer;a.name=(p.name+" CHOP "+(k+1));a.start=p.start+(p.end-p.start)*(k/n);a.end=p.start+(p.end-p.start)*((k+1)/n);a.pitch=p.pitch;a.gain=p.gain;a.pan=p.pan;this.pads[i]=a}this.select(base+first)}
  stop(){this.sources.forEach(s=>{try{s.stop()}catch(e){}});this.sources.clear();this.playing=false;clearTimeout(this.timer);this.u.play.textContent="▶ PLAY"}
  togglePlay(){this.playing=!this.playing;this.u.play.textContent=this.playing?"■ STOP":"▶ PLAY";if(this.playing){this.step=-1;this.tick()}else clearTimeout(this.timer)}
  tick(){if(!this.playing)return;this.step=(this.step+1)%16;for(let p=0;p<16;p++)if(this.pattern[p][this.step])this.trigger(p);this.renderSeq();let ms=(60000/this.bpm)/4;let swing=(this.step%2)?(1+this.swing):(1-this.swing);this.timer=setTimeout(()=>this.tick(),ms*swing)}
  render(){this.renderPads();this.renderSeq();this.u.mem.textContent=this.pads.filter(x=>x.buffer).length+"/32";this.u.bpm.textContent=String(this.bpm).padStart(3,"0")}
  renderPads(){if(!this.u)return;this.u.pads.innerHTML="";let base=this.bank*8;for(let n=0;n<8;n++){let i=base+n,p=this.pads[i],b=document.createElement("button");b.className="pad "+(p.buffer?"loaded ":"")+(i===this.selected?"selected ":"")+(p.mute?"muted":"");b.dataset.i=i;b.innerHTML="<span>"+String(n+1).padStart(2,"0")+"</span><b>"+this.esc(p.name.slice(0,14))+"</b>";b.onpointerdown=()=>{this.select(i);this.trigger(i);if(this.recording)this.pattern[i][this.step<0?0:this.step]=true;this.renderSeq()};this.u.pads.appendChild(b)}}
  renderSeq(){if(!this.u?.seq)return;this.u.seq.innerHTML="";for(let p=0;p<16;p++){let row=document.createElement("div");row.className="seqrow";row.innerHTML="<span>"+String(p+1).padStart(2,"0")+"</span>";for(let s=0;s<16;s++){let b=document.createElement("button");b.className="cell "+(this.pattern[p][s]?"on ":"")+(s===this.step?"play":"");b.onclick=()=>{this.pattern[p][s]=!this.pattern[p][s];this.renderSeq()};row.appendChild(b)}this.u.seq.appendChild(row)}}
  drawWave(){let p=this.pads[this.selected];this.u.wave.querySelector(".wavefill").style.width=p.buffer?((p.end-p.start)*100)+"%":"0%";this.u.wave.querySelector(".marker.start").style.left=(p.start*100)+"%";this.u.wave.querySelector(".marker.end").style.left=(p.end*100)+"%";this.u.wave.querySelector("span").textContent=p.buffer?p.name:"IMPORT OR RECORD A SAMPLE";this.u.mode.textContent=this.fx.bit+" BIT / "+this.fx.filter.toUpperCase()}
  saveProject(){let data={version:2,bpm:this.bpm,pattern:this.pattern,fx:this.fx,pads:this.pads.map(p=>({...p,buffer:null})),note:"Audio buffers are intentionally not embedded; re-import source samples to restore audio."};let a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:"application/json"}));a.download="rico1200-project.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  async loadProject(file){if(!file)return;try{let d=JSON.parse(await file.text());this.bpm=d.bpm||92;this.pattern=d.pattern||this.pattern;this.fx={...this.fx,...(d.fx||{})};d.pads?.forEach((p,i)=>{if(i<32)this.pads[i]={...this.emptyPad(),...p,buffer:null}});this.render();this.select(0)}catch(e){alert("Could not load Rico1200 project.")}}
  esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  styles(){if(document.getElementById("r12css"))return;let s=document.createElement("style");s.id="r12css";s.textContent=`
  .r12{max-width:1180px;margin:auto;background:#202020;color:#eee;border:3px solid #111;border-radius:14px;padding:16px;box-shadow:0 18px 50px #000b;font-family:Arial,sans-serif;user-select:none}
  .r12 *{box-sizing:border-box}.r12 button,.r12 input,.r12 select{font:inherit}.r12 header{display:flex;justify-content:space-between;align-items:center;padding:4px 3px 14px}.logo{font-size:34px;font-weight:900;letter-spacing:3px}.logo span{color:#d7c66b}.r12 header small{font:10px monospace;color:#999;letter-spacing:2px}.lcd{background:#a8ad78;color:#151b0d;border:4px inset #111;padding:7px 12px;font:11px monospace;min-width:210px}.lcd div+div{margin-top:5px;display:flex;justify-content:space-between}
  .tabs{display:flex;gap:5px;margin-bottom:10px}.tabs button,.r12 button{background:#3b3b3b;border:1px solid #101010;color:#eee;border-radius:5px;padding:9px 12px;cursor:pointer}.tabs button.active{background:#d7c66b;color:#111}.hidden{display:none!important}
  .sampleTab{display:grid;grid-template-columns:1.45fr .55fr;gap:12px}.machine,.padPanel,.beatTab,.mixTab{background:#292929;border:2px solid #111;border-radius:8px;padding:12px}.display{background:#121212;border:3px inset #555;padding:9px}.displayTop,.readout{display:flex;justify-content:space-between;font:11px monospace;color:#aab07e}.wave{position:relative;height:155px;margin:7px 0;background:repeating-linear-gradient(90deg,#101010 0 4px,#151515 4px 8px);overflow:hidden;border:1px solid #444}.wavegrid{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 24px,#ffffff08 25px)}.wavefill{position:absolute;top:20%;bottom:20%;left:0;background:#d7c66b22}.wave span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#666;font:12px monospace}.marker{position:absolute;top:0;bottom:0;width:3px;background:#7fc46a}.marker.end{background:#d56c65}.transport,.toggles,.editor{display:grid;gap:6px;margin-top:9px}.transport{grid-template-columns:repeat(5,1fr)}.toggles{grid-template-columns:repeat(3,1fr)}.editor{grid-template-columns:repeat(3,1fr)}.editor label,.mixgrid label{font:10px monospace;color:#aaa;display:flex;flex-direction:column;gap:4px}.banks{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:8px}.bank.active{background:#d7c66b;color:#111}.pads{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.pad{min-height:82px;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;text-align:left;background:#151515!important;border:2px solid #4b4b4b!important}.pad.loaded{background:#353535!important}.pad.selected{border-color:#d7c66b!important;box-shadow:inset 0 0 0 1px #d7c66b}.pad span{font:10px monospace;color:#888}.pad b{font:11px monospace}.pad.muted{opacity:.45}.padkeys{font:9px monospace;color:#777;margin-top:10px;text-align:center}
  .beatTop{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px}.beatTop small{display:block;color:#888;font:10px monospace;margin-top:3px}.beatBtns{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.beatBtns label{font:10px monospace}.beatBtns input[type=number]{width:60px;background:#111;color:#fff;border:1px solid #555}.sequencer{display:grid;gap:3px}.seqrow{display:grid;grid-template-columns:28px repeat(16,1fr);gap:3px}.seqrow>span{font:9px monospace;color:#777;display:flex;align-items:center}.cell{height:22px!important;padding:0!important;background:#141414!important;border:1px solid #333!important}.cell.on{background:#d7c66b!important}.cell.play{outline:2px solid #fff}.armed{background:#9e3d38!important}.mixgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.tips{margin-top:25px;padding:18px;border:1px dashed #666;background:#171717;font:12px monospace;color:#bbb}.tips b{color:#d7c66b}.r12 footer{text-align:center;color:#666;font:9px monospace;letter-spacing:2px;padding-top:12px}
  @media(max-width:800px){.sampleTab{grid-template-columns:1fr}.r12 header{align-items:flex-start}.lcd{min-width:150px}.logo{font-size:26px}.editor{grid-template-columns:repeat(2,1fr)}.transport{grid-template-columns:repeat(2,1fr)}.toggles{grid-template-columns:repeat(2,1fr)}.beatTop{flex-direction:column}.mixgrid{grid-template-columns:1fr}.seqrow{grid-template-columns:24px repeat(16,minmax(13px,1fr));gap:2px}.cell{height:18px!important}.r12{padding:9px}}
  `;document.head.appendChild(s)}
  static mountInto(el,opts={}){return new Rico1200({...opts,container:el}).mount()}
}
global.Rico1200=Rico1200;
})(window);
