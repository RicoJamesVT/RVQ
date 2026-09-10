/* ============================================================
   RICO'S MINI DAW - a tiny Bitwig-style clip launcher / groovebox
   Drop this file in as game.js and include it with:
     <script src="game.js"></script>
   It builds its own canvas and UI - no HTML setup needed.
   ============================================================ */
(function () {
  "use strict";

  // ---------- Layout constants ----------
  var CANVAS_W = 980, CANVAS_H = 560;
  var NUM_TRACKS = 4, NUM_SCENES = 4, NUM_STEPS = 16;
  var MARGIN = 20;

  var ROW_LABEL_W = 140;
  var TRACK_COL_W = 190;   // includes gap
  var CELL_W = 180;

  var TRANSPORT_Y = 20, TRANSPORT_H = 44;
  var HEADER_Y = 84, HEADER_H = 64;
  var GRID_Y = 160, ROW_H = 48;
  var GRID_BOTTOM = GRID_Y + NUM_SCENES * ROW_H;
  var STEP_LABEL_Y = GRID_BOTTOM + 20;
  var STEP_Y = STEP_LABEL_Y + 24, STEP_H = 50;
  var STEP_W = 55, STEP_GAP = 4;
  var INSTR_Y = STEP_Y + STEP_H + 26;

  function headerX(trackIndex) {
    return MARGIN + ROW_LABEL_W + trackIndex * TRACK_COL_W;
  }

  // ---------- Track definitions ----------
  var TRACK_DEFS = [
    { name: "Kick", color: "#ff6b4a", type: "kick" },
    { name: "Snare", color: "#4ecdc4", type: "snare" },
    { name: "Hi-Hat", color: "#ffd93d", type: "hihat" },
    { name: "Synth", color: "#a78bfa", type: "synth" }
  ];

  var SCALE = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];

  // ---------- State ----------
  var state = {
    bpm: 120,
    isPlaying: false,
    tracks: TRACK_DEFS.map(function (td) {
      return {
        name: td.name,
        color: td.color,
        type: td.type,
        mute: false,
        volume: 0.8,
        gainNode: null,
        activeScene: null,
        patterns: Array.from({ length: NUM_SCENES }, function () {
          return new Array(NUM_STEPS).fill(false);
        })
      };
    }),
    selected: { track: 0, scene: 0 }
  };

  // ---------- Audio ----------
  var audioCtx = null;
  var noiseBuffer = null;
  var currentStep16 = 0;
  var displayStep = 0;
  var nextNoteTime = 0.0;
  var LOOKAHEAD_MS = 25.0;
  var SCHEDULE_AHEAD = 0.1;
  var timerID = null;

  function createNoiseBuffer(ctx) {
    var bufferSize = ctx.sampleRate * 1;
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuffer = createNoiseBuffer(audioCtx);
    state.tracks.forEach(function (t) {
      t.gainNode = audioCtx.createGain();
      t.gainNode.gain.value = t.mute ? 0 : t.volume;
      t.gainNode.connect(audioCtx.destination);
    });
  }

  function playKick(time, gainNode) {
    var osc = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);
    g.gain.setValueAtTime(1, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.connect(g);
    g.connect(gainNode);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  function playSnare(time, gainNode) {
    var noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    var filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    var ng = audioCtx.createGain();
    ng.gain.setValueAtTime(1, time);
    ng.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    noise.connect(filter);
    filter.connect(ng);
    ng.connect(gainNode);
    noise.start(time);
    noise.stop(time + 0.2);

    var osc = audioCtx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 180;
    var og = audioCtx.createGain();
    og.gain.setValueAtTime(0.7, time);
    og.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    osc.connect(og);
    og.connect(gainNode);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  function playHihat(time, gainNode) {
    var noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    var filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(0.5, time);
    g.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
    noise.connect(filter);
    filter.connect(g);
    g.connect(gainNode);
    noise.start(time);
    noise.stop(time + 0.05);
  }

  function playSynth(time, gainNode, step) {
    var freq = SCALE[step % SCALE.length];
    var osc = audioCtx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    var filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2000;
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(0.4, time);
    g.gain.exponentialRampToValueAtTime(0.01, time + 0.35);
    osc.connect(filter);
    filter.connect(g);
    g.connect(gainNode);
    osc.start(time);
    osc.stop(time + 0.35);
  }

  function triggerSound(track, time, step) {
    if (track.type === "kick") playKick(time, track.gainNode);
    else if (track.type === "snare") playSnare(time, track.gainNode);
    else if (track.type === "hihat") playHihat(time, track.gainNode);
    else if (track.type === "synth") playSynth(time, track.gainNode, step);
  }

  function scheduleNote(stepNumber, time) {
    state.tracks.forEach(function (track) {
      if (track.mute) return;
      if (track.activeScene === null) return;
      var pattern = track.patterns[track.activeScene];
      if (pattern[stepNumber]) triggerSound(track, time, stepNumber);
    });
  }

  function advanceNote() {
    var secondsPerBeat = 60.0 / state.bpm;
    nextNoteTime += 0.25 * secondsPerBeat; // 16th notes
    currentStep16 = (currentStep16 + 1) % NUM_STEPS;
  }

  function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
      displayStep = currentStep16;
      scheduleNote(currentStep16, nextNoteTime);
      advanceNote();
    }
    timerID = setTimeout(scheduler, LOOKAHEAD_MS);
  }

  function togglePlay() {
    initAudio();
    if (audioCtx.state === "suspended") audioCtx.resume();
    state.isPlaying = !state.isPlaying;
    if (state.isPlaying) {
      currentStep16 = 0;
      displayStep = 0;
      nextNoteTime = audioCtx.currentTime + 0.05;
      scheduler();
    } else {
      clearTimeout(timerID);
    }
  }

  // ---------- Canvas / UI ----------
  var canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.style.display = "block";
  canvas.style.margin = "20px auto";
  canvas.style.maxWidth = "100%";
  canvas.style.background = "#1b1d23";
  canvas.style.borderRadius = "8px";
  canvas.style.cursor = "pointer";
  document.body.style.background = "#0f1013";

  function mount() {
    document.body.appendChild(canvas);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  var ctx = canvas.getContext("2d");

  // Colors
  var BG = "#1b1d23";
  var PANEL = "#24262e";
  var PANEL_LIGHT = "#2f323c";
  var TEXT = "#e8e8ec";
  var SUBTEXT = "#8a8d98";
  var ACCENT = "#ff9f43";

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawTransport() {
    // Play/Stop button
    roundRect(20, TRANSPORT_Y, 90, TRANSPORT_H, 6);
    ctx.fillStyle = state.isPlaying ? ACCENT : PANEL_LIGHT;
    ctx.fill();
    ctx.fillStyle = state.isPlaying ? "#1b1d23" : TEXT;
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(state.isPlaying ? "STOP" : "PLAY", 20 + 45, TRANSPORT_Y + TRANSPORT_H / 2);

    // BPM controls
    roundRect(130, TRANSPORT_Y, 36, TRANSPORT_H, 6);
    ctx.fillStyle = PANEL_LIGHT;
    ctx.fill();
    ctx.fillStyle = TEXT;
    ctx.fillText("-", 130 + 18, TRANSPORT_Y + TRANSPORT_H / 2);

    ctx.fillStyle = SUBTEXT;
    ctx.font = "14px sans-serif";
    ctx.fillText(state.bpm + " BPM", 130 + 36 + 50, TRANSPORT_Y + TRANSPORT_H / 2);

    roundRect(266, TRANSPORT_Y, 36, TRANSPORT_H, 6);
    ctx.fillStyle = PANEL_LIGHT;
    ctx.fill();
    ctx.fillStyle = TEXT;
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("+", 266 + 18, TRANSPORT_Y + TRANSPORT_H / 2);

    // Title
    ctx.textAlign = "right";
    ctx.fillStyle = TEXT;
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("RICO'S MINI DAW", CANVAS_W - 20, TRANSPORT_Y + TRANSPORT_H / 2);
  }

  function drawTrackHeaders() {
    state.tracks.forEach(function (track, i) {
      var x = headerX(i);
      roundRect(x, HEADER_Y, CELL_W, HEADER_H, 6);
      ctx.fillStyle = PANEL;
      ctx.fill();

      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = track.color;
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(track.name, x + 8, HEADER_Y + 20);

      // Mute button
      var mx = x + CELL_W - 26, my = HEADER_Y + 6;
      roundRect(mx, my, 20, 20, 4);
      ctx.fillStyle = track.mute ? "#e74c3c" : PANEL_LIGHT;
      ctx.fill();
      ctx.fillStyle = TEXT;
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("M", mx + 10, my + 11);

      // Volume slider
      var sx = x + 8, sy = HEADER_Y + 40, sw = CELL_W - 16, sh = 8;
      roundRect(sx, sy, sw, sh, 4);
      ctx.fillStyle = PANEL_LIGHT;
      ctx.fill();
      roundRect(sx, sy, sw * track.volume, sh, 4);
      ctx.fillStyle = track.color;
      ctx.fill();
    });
  }

  function drawGrid() {
    for (var s = 0; s < NUM_SCENES; s++) {
      var y = GRID_Y + s * ROW_H;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = SUBTEXT;
      ctx.font = "13px sans-serif";
      ctx.fillText("Scene " + (s + 1), MARGIN, y + ROW_H / 2);

      state.tracks.forEach(function (track, i) {
        var x = headerX(i);
        var cy = y + 4, ch = ROW_H - 8;
        var hasContent = track.patterns[s].some(function (v) { return v; });
        var isActive = track.activeScene === s;
        var isSelected = state.selected.track === i && state.selected.scene === s;

        roundRect(x, cy, CELL_W, ch, 6);
        ctx.fillStyle = hasContent ? track.color : PANEL;
        ctx.globalAlpha = hasContent ? (isActive ? 1.0 : 0.35) : 1.0;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        if (isActive && state.isPlaying) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          roundRect(x, cy, CELL_W, ch, 6);
          ctx.stroke();
        }
        if (isSelected) {
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 2;
          roundRect(x + 1, cy + 1, CELL_W - 2, ch - 2, 5);
          ctx.stroke();
        }

        ctx.fillStyle = hasContent ? "#1b1d23" : SUBTEXT;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(isActive ? "\u25B6 clip" : (hasContent ? "clip" : "empty"), x + CELL_W / 2, cy + ch / 2);
      });
    }
  }

  function drawStepEditor() {
    var sel = state.selected;
    var track = state.tracks[sel.track];
    var pattern = track.patterns[sel.scene];

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = TEXT;
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("Editing: " + track.name + " \u2014 Scene " + (sel.scene + 1), MARGIN, STEP_LABEL_Y + 12);

    // Clear button
    var cx = CANVAS_W - MARGIN - 70, cy = STEP_LABEL_Y - 2, cw = 70, ch = 20;
    roundRect(cx, cy, cw, ch, 4);
    ctx.fillStyle = PANEL_LIGHT;
    ctx.fill();
    ctx.fillStyle = TEXT;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Clear", cx + cw / 2, cy + ch / 2);

    for (var i = 0; i < NUM_STEPS; i++) {
      var x = MARGIN + i * (STEP_W + STEP_GAP);
      var on = pattern[i];
      roundRect(x, STEP_Y, STEP_W, STEP_H, 5);
      ctx.fillStyle = on ? track.color : PANEL;
      ctx.fill();

      if (i % 4 === 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        roundRect(x, STEP_Y, STEP_W, STEP_H, 5);
        ctx.stroke();
      }

      if (track.activeScene === sel.scene && state.isPlaying && displayStep === i) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        roundRect(x + 1, STEP_Y + 1, STEP_W - 2, STEP_H - 2, 4);
        ctx.stroke();
      }

      ctx.fillStyle = on ? "#1b1d23" : SUBTEXT;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), x + STEP_W / 2, STEP_Y + STEP_H - 8);
    }
  }

  function drawInstructions() {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = SUBTEXT;
    ctx.font = "12px sans-serif";
    ctx.fillText(
      "Click a grid cell to select + launch/stop its clip. Click steps below to toggle notes. Drag on a volume bar to set level. Space = Play/Stop.",
      MARGIN, INSTR_Y
    );
  }

  function render() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    drawTransport();
    drawTrackHeaders();
    drawGrid();
    drawStepEditor();
    drawInstructions();
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  // ---------- Input ----------
  function getMousePos(evt) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY
    };
  }

  function pointInRect(px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  var draggingVolumeTrack = -1;

  function handleVolumeDrag(px, trackIndex) {
    var x = headerX(trackIndex) + 8, w = CELL_W - 16;
    var frac = (px - x) / w;
    frac = Math.max(0, Math.min(1, frac));
    var track = state.tracks[trackIndex];
    track.volume = frac;
    if (track.gainNode) track.gainNode.gain.value = track.mute ? 0 : track.volume;
  }

  canvas.addEventListener("mousedown", function (evt) {
    var pos = getMousePos(evt);
    var px = pos.x, py = pos.y;

    // Transport
    if (pointInRect(px, py, 20, TRANSPORT_Y, 90, TRANSPORT_H)) {
      togglePlay();
      return;
    }
    if (pointInRect(px, py, 130, TRANSPORT_Y, 36, TRANSPORT_H)) {
      state.bpm = Math.max(60, state.bpm - 5);
      return;
    }
    if (pointInRect(px, py, 266, TRANSPORT_Y, 36, TRANSPORT_H)) {
      state.bpm = Math.min(220, state.bpm + 5);
      return;
    }

    // Track headers
    for (var i = 0; i < NUM_TRACKS; i++) {
      var x = headerX(i);
      var track = state.tracks[i];

      var mx = x + CELL_W - 26, my = HEADER_Y + 6;
      if (pointInRect(px, py, mx, my, 20, 20)) {
        track.mute = !track.mute;
        if (track.gainNode) track.gainNode.gain.value = track.mute ? 0 : track.volume;
        return;
      }

      var sx = x + 8, sy = HEADER_Y + 40, sw = CELL_W - 16, sh = 8;
      if (pointInRect(px, py, sx, sy - 6, sw, sh + 12)) {
        draggingVolumeTrack = i;
        handleVolumeDrag(px, i);
        return;
      }
    }

    // Grid cells
    if (py >= GRID_Y && py < GRID_BOTTOM) {
      var sceneIdx = Math.floor((py - GRID_Y) / ROW_H);
      for (var t = 0; t < NUM_TRACKS; t++) {
        var gx = headerX(t);
        if (pointInRect(px, py, gx, GRID_Y + sceneIdx * ROW_H, CELL_W, ROW_H)) {
          state.selected = { track: t, scene: sceneIdx };
          var tr = state.tracks[t];
          tr.activeScene = tr.activeScene === sceneIdx ? null : sceneIdx;
          return;
        }
      }
    }

    // Step editor clear button
    var ccx = CANVAS_W - MARGIN - 70, ccy = STEP_LABEL_Y - 2, ccw = 70, cch = 20;
    if (pointInRect(px, py, ccx, ccy, ccw, cch)) {
      var selTrack = state.tracks[state.selected.track];
      selTrack.patterns[state.selected.scene] = new Array(NUM_STEPS).fill(false);
      return;
    }

    // Step editor steps
    if (py >= STEP_Y && py <= STEP_Y + STEP_H) {
      for (var s = 0; s < NUM_STEPS; s++) {
        var stepX = MARGIN + s * (STEP_W + STEP_GAP);
        if (pointInRect(px, py, stepX, STEP_Y, STEP_W, STEP_H)) {
          var selT = state.tracks[state.selected.track];
          var pat = selT.patterns[state.selected.scene];
          pat[s] = !pat[s];
          return;
        }
      }
    }
  });

  window.addEventListener("mousemove", function (evt) {
    if (draggingVolumeTrack >= 0) {
      var pos = getMousePos(evt);
      handleVolumeDrag(pos.x, draggingVolumeTrack);
    }
  });

  window.addEventListener("mouseup", function () {
    draggingVolumeTrack = -1;
  });

  window.addEventListener("keydown", function (evt) {
    if (evt.code === "Space") {
      evt.preventDefault();
      togglePlay();
    }
  });
})();
