/* FIND BALANCE W/ QSD
   Roll the marble around the open floor of a board without crossing the solid artwork.

   Boards live in boards.js (window.QSD_BOARDS). Each board is:
     artwork (PNG data URI) + collision mask (run-length, 1 = open floor) + start points + theme + ball style.
   Everything is embedded, so the game works offline and straight from a double-clicked index.html.
   (tools/make_boards.py rebuilds boards.js from the source artwork.)
*/
(() => {
  "use strict";

  const BOARDS = window.QSD_BOARDS || [];

  // ---------------------------------------------------------------- DOM
  const $ = id => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const stage = $("stage");
  const overlay = $("overlay");
  const startBtn = $("startBtn");
  const resumeBtn = $("resumeBtn");
  const restartBtn = $("restartBtn");
  const boardsBtn = $("boardsBtn");
  const tiltBtn = $("tiltBtn");
  const sensBtn = $("sensBtn");
  const soundBtn = $("soundBtn");
  const statusLabel = $("statusLabel");
  const timeLabel = $("timeLabel");
  const pauseHint = $("pauseHint");
  const hintEl = $("hint");
  const boardGrid = $("boardGrid");
  const boardBlurb = $("boardBlurb");

  // ---------------------------------------------------------------- physics constants (unchanged from the original game)
  const BALL_R = 14;
  const ACCEL = 1850;
  const MAX_SPEED = 650;
  const FRICTION = 0.985;
  const WALL_BOUNCE = 0.30;
  const PROBES = 32;
  const COLLISION_PASSES = 5;

  const SENS = [
    { label: "Low", mult: .65 },
    { label: "Med", mult: 1 },
    { label: "High", mult: 1.35 }
  ];

  // ---------------------------------------------------------------- safe storage (file://, private mode…)
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  };

  let sensIndex = Number(store.get("qsd_sens") ?? 1);
  if (!Number.isFinite(sensIndex) || sensIndex < 0 || sensIndex >= SENS.length) sensIndex = 1;

  // ---------------------------------------------------------------- state
  let state = "loading";              // loading | menu | playing | paused
  let elapsed = 0;
  let soundOn = true;
  let audioCtx = null;
  let lastBeep = 0;

  let boardIndex = -1, board = null;
  let bw = 1024, bh = 1024;           // logical board size
  let mask = null;                    // Uint8Array bw*bh, 1 = open floor
  let boardImg = null, boardReady = false;
  let loadToken = 0;
  const maskCache = Object.create(null);
  let gameBoardIndex = -1;            // board the current run (if any) is on
  let hasRun = false;

  const ball = { x: 512, y: 185, vx: 0, vy: 0 };

  // layout
  let rot = 0;                        // 1 = board turned 90° clockwise to fit a portrait screen
  let scale = 1;                      // css px per board unit
  let kx = 1;                         // device px per board unit
  let dpr = 1;
  let bgCanvas = null;

  // input
  let sensorEnabled = false, calibrated = false, gotSensor = false;
  let baseRoll = 0, basePitch = 0, lastAngle = -1;
  let sensorX = 0, sensorY = 0;
  const keys = Object.create(null);
  let dragging = false, dragX = 0, dragY = 0, dragStart = null;
  let offlineReady = false;
  let wakeLock = null;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  // ---------------------------------------------------------------- theme
  function lum(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return 0;
    const n = parseInt(m[1], 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  function applyTheme(t) {
    const root = document.documentElement.style;
    root.setProperty("--bg", t.bg);
    root.setProperty("--stage", t.stage);
    root.setProperty("--accent", t.accent);
    root.setProperty("--accent2", t.accent2);
    root.setProperty("--ink", t.ink);
    root.setProperty("--text", t.text);
    root.setProperty("--canvas", t.canvas);
    root.setProperty("--on-accent", lum(t.accent) > .45 ? "#000" : "#fff");
    root.setProperty("--on-accent2", lum(t.accent2) > .45 ? "#000" : "#fff");
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", t.stage);
  }

  // ---------------------------------------------------------------- mask + collision
  function decodeMask(b64, w, h) {
    const bin = atob(b64);
    const out = new Uint8Array(w * h);
    let pos = 0, val = 0, i = 0;
    while (i < bin.length) {
      let r = 0, shift = 0;
      for (;;) {
        const b = bin.charCodeAt(i++);
        r |= (b & 0x7f) << shift;
        if (b < 0x80) break;
        shift += 7;
      }
      if (val && r) out.fill(1, pos, pos + r);
      pos += r; val ^= 1;
    }
    return out;
  }

  function isOpenPixel(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= bw || y >= bh) return false;
    return mask[y * bw + x] === 1;
  }

  function circleIsClear(x, y) {
    if (!isOpenPixel(x, y)) return false;
    for (let i = 0; i < PROBES; i++) {
      const a = (i / PROBES) * Math.PI * 2;
      if (!isOpenPixel(x + Math.cos(a) * (BALL_R + 1), y + Math.sin(a) * (BALL_R + 1))) return false;
    }
    return true;
  }

  function collisionNormal(x, y) {
    // Approximate the local wall normal by looking at open space around us.
    const d = BALL_R + 5;
    let gx = 0, gy = 0;
    const samples = 16;
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      if (isOpenPixel(x + Math.cos(a) * d, y + Math.sin(a) * d)) { gx += Math.cos(a); gy += Math.sin(a); }
    }
    const len = Math.hypot(gx, gy);
    if (len < .001) return { x: 0, y: -1 };
    return { x: gx / len, y: gy / len };            // points toward open area
  }

  function resolveCollision(oldX, oldY) {
    if (circleIsClear(ball.x, ball.y)) return false;

    // Restore the last safe position, then nudge toward open space.
    ball.x = oldX; ball.y = oldY;
    const n = collisionNormal(oldX, oldY);
    let pushed = false;
    for (let d = 1; d <= BALL_R * 2 + 8; d += 1) {
      const tx = oldX + n.x * d, ty = oldY + n.y * d;
      if (circleIsClear(tx, ty)) { ball.x = tx; ball.y = ty; pushed = true; break; }
    }
    if (!pushed) {
      let found = null;
      for (let r = 2; r <= BALL_R * 2 + 12 && !found; r += 2) {
        for (let i = 0; i < 24; i++) {
          const a = i * Math.PI * 2 / 24;
          const tx = oldX + Math.cos(a) * r, ty = oldY + Math.sin(a) * r;
          if (circleIsClear(tx, ty)) { found = { x: tx, y: ty }; break; }
        }
      }
      if (found) { ball.x = found.x; ball.y = found.y; }
    }
    // Remove velocity into the wall, keep a little bounce.
    const vn = ball.vx * n.x + ball.vy * n.y;
    if (vn < 0) {
      ball.vx -= (1 + WALL_BOUNCE) * vn * n.x;
      ball.vy -= (1 + WALL_BOUNCE) * vn * n.y;
    }
    ball.vx *= .72; ball.vy *= .72;
    return true;
  }

  function safeStart() {
    if (!mask) return;
    const cands = (board && board.starts) || [];
    for (const [x, y] of cands) if (circleIsClear(x, y)) { ball.x = x; ball.y = y; ball.vx = ball.vy = 0; return; }
    // Fallback: scan the whole board for the first legal spot nearest the top-centre.
    let best = null, bestD = Infinity;
    for (let y = 40; y < bh - 40; y += 8) for (let x = 40; x < bw - 40; x += 8) {
      if (circleIsClear(x, y)) {
        const d = Math.hypot(x - bw / 2, y - bh * .2);
        if (d < bestD) { bestD = d; best = [x, y]; }
      }
    }
    if (best) { ball.x = best[0]; ball.y = best[1]; }
    ball.vx = ball.vy = 0;
  }

  // ---------------------------------------------------------------- audio / wake lock
  function beep(freq, dur) {
    if (!soundOn) return;
    const now = performance.now();
    if (now - lastBeep < 45) return;
    lastBeep = now;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "triangle"; o.frequency.value = freq; g.gain.value = .07;
      o.connect(g); g.connect(audioCtx.destination); o.start();
      g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur);
    } catch (_) {}
  }

  async function keepAwake() {
    try {
      if (navigator.wakeLock && document.visibilityState === "visible" && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      }
    } catch (_) { wakeLock = null; }
  }

  // ---------------------------------------------------------------- game flow
  function setStatus(s) { statusLabel.textContent = s; }

  function startGame() {
    if (!boardReady || !mask) return;
    safeStart();
    ball.vx = ball.vy = 0;
    elapsed = 0;
    timeLabel.textContent = "0.0s";
    gameBoardIndex = boardIndex;
    hasRun = true;
    state = "playing";
    setStatus("ROLLING");
    overlay.classList.add("hidden");
    pauseHint.classList.add("hidden");
    keepAwake();
  }
  const resetGame = () => { if (state !== "loading") startGame(); };

  function pauseGame() {
    if (state !== "playing") return;
    state = "paused"; setStatus("PAUSED"); pauseHint.classList.remove("hidden");
  }
  function resumeGame() {
    if (state === "paused" || (state === "menu" && hasRun && gameBoardIndex === boardIndex)) {
      state = "playing"; setStatus("ROLLING");
      pauseHint.classList.add("hidden"); overlay.classList.add("hidden");
      keepAwake();
    }
  }
  function togglePause() { state === "playing" ? pauseGame() : state === "paused" && resumeGame(); }

  function openMenu() {
    if (state === "playing") { /* keep run for RESUME */ }
    pauseHint.classList.add("hidden");
    state = "menu";
    setStatus(boardReady ? "READY" : "LOADING");
    refreshMenu();
    overlay.classList.remove("hidden");
  }
  function refreshMenu() {
    const canResume = hasRun && gameBoardIndex === boardIndex && boardReady;
    resumeBtn.classList.toggle("hidden", !canResume);
    startBtn.textContent = boardReady ? (canResume ? "RESTART" : "START ROLLING") : "LOADING BOARD…";
    startBtn.disabled = !boardReady;
    boardBlurb.textContent = board ? board.blurb : "";
    [...boardGrid.children].forEach((el, i) => {
      const on = i === boardIndex;
      el.classList.toggle("selected", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  // ---------------------------------------------------------------- board selection
  function buildPicker() {
    boardGrid.textContent = "";
    BOARDS.forEach((b, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "board-card";
      el.setAttribute("role", "option");
      const th = document.createElement("span");
      th.className = "thumb";
      th.style.background = b.theme.canvas;
      const img = document.createElement("img");
      img.alt = ""; img.src = b.thumb; img.draggable = false;
      th.appendChild(img);
      const nm = document.createElement("span");
      nm.className = "name"; nm.textContent = b.name;
      el.append(th, nm);
      el.addEventListener("click", () => { if (i !== boardIndex) selectBoard(i); });
      boardGrid.appendChild(el);
    });
  }

  function selectBoard(i) {
    if (!BOARDS[i]) return;
    const changed = i !== boardIndex;
    boardIndex = i; board = BOARDS[i];
    store.set("qsd_board", board.id);
    applyTheme(board.theme);
    bw = board.w; bh = board.h;
    mask = maskCache[board.id] || (maskCache[board.id] = decodeMask(board.mask, bw, bh));
    if (changed) { boardImg = null; bgCanvas = null; }
    boardReady = false;
    if (state !== "menu") { state = "menu"; overlay.classList.remove("hidden"); pauseHint.classList.add("hidden"); }
    setStatus("LOADING");
    safeStart();
    layout();
    refreshMenu();

    const token = ++loadToken;
    const im = new Image();
    im.onload = () => {
      if (token !== loadToken) return;
      boardImg = im; boardReady = true;
      buildBg();
      if (state === "menu") setStatus("READY");
      refreshMenu();
    };
    im.onerror = () => {
      if (token !== loadToken) return;
      boardReady = false; setStatus("BOARD FAILED TO LOAD");
      startBtn.disabled = true; startBtn.textContent = "BOARD FAILED TO LOAD";
    };
    im.src = board.art;
    timeLabel.textContent = "0.0s";
  }

  // ---------------------------------------------------------------- layout (any size, any orientation)
  function layout() {
    if (!board) return;
    const cs = getComputedStyle(stage);
    const pw = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const ph = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availW = Math.max(60, stage.clientWidth - pw);
    const availH = Math.max(60, stage.clientHeight - ph);
    const s0 = Math.min(availW / bw, availH / bh);          // as drawn
    const s1 = Math.min(availW / bh, availH / bw);          // turned 90°
    rot = s1 > s0 * 1.3 ? 1 : 0;                             // wide board on a tall screen -> turn it
    scale = rot ? s1 : s0;
    const cw = (rot ? bh : bw) * scale, ch = (rot ? bw : bh) * scale;
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pxW = Math.max(1, Math.round(cw * dpr)), pxH = Math.max(1, Math.round(ch * dpr));
    if (canvas.width !== pxW || canvas.height !== pxH) { canvas.width = pxW; canvas.height = pxH; }
    kx = pxW / (rot ? bh : bw);
    buildBg();
    updateHint();
  }

  function boardTransform(c) {
    // board units -> device pixels
    if (rot) c.setTransform(0, kx, -kx, 0, canvas.width, 0);
    else c.setTransform(kx, 0, 0, kx, 0, 0);
  }

  function buildBg() {
    if (!board) return;
    if (!bgCanvas) bgCanvas = document.createElement("canvas");
    if (bgCanvas.width !== canvas.width || bgCanvas.height !== canvas.height) {
      bgCanvas.width = canvas.width; bgCanvas.height = canvas.height;
    }
    const c = bgCanvas.getContext("2d", { alpha: false });
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = board.theme.canvas;
    c.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    if (boardImg) {
      boardTransform(c);
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
      c.drawImage(boardImg, 0, 0, bw, bh);
    }
  }

  function updateHint() {
    if (!board) return;
    let t = board.hint;
    if (rot) t += " Board turned to fit your screen \u2014 rotate your phone for the upright view.";
    if (offlineReady) t += " \u2022 Offline ready";
    hintEl.textContent = t;
  }

  // ---------------------------------------------------------------- rendering
  // Convert a screen-space offset (dx right, dy down) into board space.
  const s2b = (dx, dy) => rot ? [dy, -dx] : [dx, dy];

  function drawBall() {
    const st = board.ball;
    ctx.save();
    boardTransform(ctx);
    if (st.shadow) {
      const [ox, oy] = s2b(4, 6);
      ctx.beginPath();
      ctx.ellipse(ball.x + ox, ball.y + oy, BALL_R * .9, BALL_R * .55, rot ? Math.PI / 2 : 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0," + st.shadow + ")"; ctx.fill();
    }
    if (st.glow) { ctx.shadowColor = st.glow; ctx.shadowBlur = BALL_R * kx * 1.1; }
    const [hx, hy] = s2b(-BALL_R * .35, -BALL_R * .4);
    const grad = ctx.createRadialGradient(ball.x + hx, ball.y + hy, 2, ball.x, ball.y, BALL_R);
    grad.addColorStop(0, st.hi);
    grad.addColorStop(.42, st.mid);
    grad.addColorStop(1, st.lo);
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
    ctx.lineWidth = 2; ctx.strokeStyle = st.stroke; ctx.stroke();
    ctx.restore();
  }

  function draw() {
    if (!board) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0);
    else { ctx.fillStyle = board.theme.canvas; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    if (boardReady) drawBall();
  }

  // ---------------------------------------------------------------- input
  function keyTilt() {
    let x = 0, y = 0;
    if (keys.ArrowLeft || keys.a || keys.A) x--;
    if (keys.ArrowRight || keys.d || keys.D) x++;
    if (keys.ArrowUp || keys.w || keys.W) y--;
    if (keys.ArrowDown || keys.s || keys.S) y++;
    return { x, y };
  }

  // Screen-space tilt (x right, y down) -> board-space tilt.
  function combinedTilt() {
    const k = keyTilt();
    const sx = clamp(sensorX + k.x + dragX, -1, 1);
    const sy = clamp(sensorY + k.y + dragY, -1, 1);
    return rot ? { x: sy, y: -sx } : { x: sx, y: sy };
  }

  window.addEventListener("keydown", e => {
    keys[e.key] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    if (e.key === " ") { if (state === "playing" || state === "paused") togglePause(); }
    else if (e.key === "b" || e.key === "B") { if (state !== "menu") openMenu(); }
    else if (e.key === "Escape") {
      if (state === "menu") resumeGame(); else togglePause();
    }
  }, { passive: false });
  window.addEventListener("keyup", e => { keys[e.key] = false; });
  window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

  // Drag anywhere on the play area: tilt = finger offset from where you touched.
  stage.addEventListener("pointerdown", e => {
    if (state !== "playing" || e.target.closest("#overlay, #pauseHint")) return;
    dragging = true; dragX = dragY = 0;
    dragStart = { x: e.clientX, y: e.clientY };
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  });
  stage.addEventListener("pointermove", e => {
    if (!dragging) return;
    const span = 130 * scale;                       // 130 board units of finger travel = full tilt (as before)
    dragX = clamp((e.clientX - dragStart.x) / span, -1, 1);
    dragY = clamp((e.clientY - dragStart.y) / span, -1, 1);
  });
  const endDrag = () => { dragging = false; dragX = 0; dragY = 0; };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("gesturestart", e => e.preventDefault());

  // ---- device tilt -----------------------------------------------------------
  // We work out which way gravity points in the device frame (this stays well-behaved in landscape,
  // unlike raw beta/gamma), rotate it into the SCREEN frame using the current screen angle, then
  // measure roll/pitch relative to the pose you were holding when tilt was enabled.
  function screenAngle() {
    let a = 0;
    if (screen.orientation && typeof screen.orientation.angle === "number") a = screen.orientation.angle;
    else if (typeof window.orientation === "number") a = window.orientation;
    return ((a % 360) + 360) % 360;
  }
  const wrap180 = a => ((a + 540) % 360) - 180;

  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    gotSensor = true;
    const b = e.beta * D2R, g = e.gamma * D2R;
    // gravity ("down") in the device frame: x right, y up, z out of the screen
    const dx = Math.cos(b) * Math.sin(g), dy = -Math.sin(b), dz = -Math.cos(b) * Math.cos(g);
    const ang = screenAngle();
    let sx, sy;                                     // screen frame: x right, y down
    switch (ang) {
      case 90:  sx = -dy; sy = -dx; break;
      case 180: sx = -dx; sy =  dy; break;
      case 270: sx =  dy; sy =  dx; break;
      default:  sx =  dx; sy = -dy;
    }
    const roll = Math.asin(clamp(sx, -1, 1)) * R2D;  // + = right side down
    const pitch = Math.atan2(sy, -dz) * R2D;         // + = top raised (ball rolls toward you)
    if (!calibrated || ang !== lastAngle) { baseRoll = roll; basePitch = pitch; calibrated = true; lastAngle = ang; }
    sensorX = clamp((roll - baseRoll) / 25, -1, 1);
    sensorY = clamp(wrap180(pitch - basePitch) / 25, -1, 1);
  }
  function enableTilt() {
    calibrated = false; gotSensor = false;
    if (!sensorEnabled) window.addEventListener("deviceorientation", onOrientation);
    sensorEnabled = true;
    tiltBtn.textContent = "Recalibrate";
    setTimeout(() => {
      if (!gotSensor && sensorEnabled) {
        window.removeEventListener("deviceorientation", onOrientation);
        sensorEnabled = false; sensorX = sensorY = 0;
        tiltBtn.textContent = "No tilt sensor";
        hintEl.textContent = "No motion sensor found (tilt needs a phone/tablet over https). Drag the screen or use the arrow keys / WASD.";
      }
    }, 2000);
  }
  const recalibrate = () => { calibrated = false; };
  tiltBtn.onclick = async () => {
    if (sensorEnabled) { recalibrate(); return; }
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r === "granted") enableTilt();
        else alert("Tilt permission was denied. Arrow keys, WASD, and drag still work.");
      } catch (_) { enableTilt(); }
    } else {
      enableTilt();
    }
  };
  // holding the phone differently after a rotate is a new "flat" for the player
  const onRotate = () => { calibrated = false; setTimeout(layout, 60); setTimeout(layout, 350); };
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener("change", onRotate);
  window.addEventListener("orientationchange", onRotate);

  // ---------------------------------------------------------------- buttons
  function applySens() {
    sensBtn.textContent = "Sens: " + SENS[sensIndex].label;
    store.set("qsd_sens", String(sensIndex));
  }
  applySens();
  sensBtn.onclick = () => { sensIndex = (sensIndex + 1) % SENS.length; applySens(); };
  soundBtn.onclick = () => { soundOn = !soundOn; soundBtn.textContent = soundOn ? "🔊" : "🔇"; };
  startBtn.onclick = startGame;
  resumeBtn.onclick = resumeGame;
  restartBtn.onclick = resetGame;
  boardsBtn.onclick = openMenu;
  pauseHint.addEventListener("click", resumeGame);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") pauseGame();
    else if (state === "playing") keepAwake();
  });

  // ---------------------------------------------------------------- main loop
  function update(dt) {
    if (state !== "playing" || !boardReady) return;
    elapsed += dt;
    timeLabel.textContent = elapsed.toFixed(1) + "s";

    const t = combinedTilt();
    const accel = ACCEL * SENS[sensIndex].mult;
    const steps = 4, sub = dt / steps;

    for (let s = 0; s < steps; s++) {
      ball.vx += t.x * accel * sub;
      ball.vy += t.y * accel * sub;
      const damp = Math.pow(FRICTION, sub * 60);
      ball.vx *= damp; ball.vy *= damp;

      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > MAX_SPEED) { ball.vx = ball.vx / sp * MAX_SPEED; ball.vy = ball.vy / sp * MAX_SPEED; }

      const oldX = ball.x, oldY = ball.y;
      ball.x += ball.vx * sub; ball.y += ball.vy * sub;

      let hit = false;
      for (let pass = 0; pass < COLLISION_PASSES; pass++) {
        if (resolveCollision(oldX, oldY)) hit = true; else break;
      }
      if (hit) beep(115, 0.025);
    }

    // Never let the marble end up somewhere illegal.
    if (!circleIsClear(ball.x, ball.y)) safeStart();
  }

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    dt = clamp(dt, 0, 1 / 30);
    update(dt); draw();
    requestAnimationFrame(frame);
  }

  let layoutQueued = false;
  function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => { layoutQueued = false; layout(); });
  }
  window.addEventListener("resize", queueLayout);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", queueLayout);
  if (window.ResizeObserver) new ResizeObserver(queueLayout).observe(stage);

  // ---------------------------------------------------------------- offline (service worker; needs http/https)
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.ready.then(() => { offlineReady = true; updateHint(); }).catch(() => {});
  }

  // ---------------------------------------------------------------- boot
  if (!BOARDS.length) {
    setStatus("NO BOARDS FOUND");
    startBtn.textContent = "boards.js missing"; startBtn.disabled = true;
    return;
  }
  buildPicker();
  const savedId = store.get("qsd_board");
  let first = BOARDS.findIndex(b => b.id === savedId);
  if (first < 0) first = 0;
  selectBoard(first);
  requestAnimationFrame(frame);

  // small hook for automated tests / debugging
  window.QSD_DEBUG = {
    get state() { return state; }, get rot() { return rot; }, get board() { return board && board.id; },
    get ball() { return { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy }; },
    get ready() { return boardReady; }, get scale() { return scale; },
    isClear: circleIsClear, onOrientation, get sensor() { return { x: sensorX, y: sensorY }; },
    get size() { return { w: bw, h: bh }; }
  };
})();
