/* =====================================================================
 * RVQ GAMEPAD BRIDGE  (lib/gamepad-bridge.js)
 *
 * Every mini-game / instrument in Rico's Vinyl Quest runs inside its own
 * <iframe>.  The main game's gamepad layer (pollGamepad() in game.js) only
 * drives the overworld; once an iframe is open the controller used to go
 * dead unless that particular page had its own gamepad code.
 *
 * This single file is included by every instrument page and gives each
 * one a controller layer with two cooperating halves:
 *
 *   1. KEY MAPPING  - buttons / sticks are turned into real KeyboardEvents
 *      (key + code + keyCode) so every game that already works with a
 *      keyboard works with a pad, using a per-game profile (PROFILES).
 *
 *   2. VIRTUAL CURSOR - a stick drives an on-screen pointer that sends real
 *      pointer / mouse events (down, move, up, click, drag), plus special
 *      handling for <input type=range> and <select>, and scrolling.  This
 *      makes every mouse/touch-only page (menus, pads, knobs, sliders,
 *      chess, mini golf, ...) usable with no per-page work.
 *
 * SELECT / BACK always exits the mini-game: that is handled by the parent
 * (game.js), which keeps listening for button 8 while an overlay is open.
 *
 * Nothing here does anything until a gamepad is connected and used, so
 * keyboard, mouse and touch (portrait + landscape) are unaffected.
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__rvqGamepadBridge) return;
  window.__rvqGamepadBridge = true;
  if (!navigator.getGamepads) return;

  // ------------------------------------------------------------ profiles
  var AR = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  function ar(extra) {
    var o = {}, k;
    for (k in AR) o[k] = AR[k];
    for (k in (extra || {})) o[k] = extra[k];
    return o;
  }

  // stick:  'cursor' (default) left stick = mouse pointer
  //         'keys'   left stick = the d-pad keys, right stick = pointer
  //         'none'   page reads the pad itself; right stick = pointer
  // map:    button name -> key (see spec()).  Names: a b x y lb rb lt rt
  //         l3 r3 start up down left right rsUp rsDown rsLeft rsRight
  // click:  buttons that click the pointer (default: a + rt, minus any that
  //         are mapped to keys)
  // auto:   false = START does not press the "primary" on-screen button
  var PROFILES = {
    // ---- arcade / action: stick plays, right stick is the menu pointer
    'claw-machine':      { stick: 'keys', map: ar({ a: 'Space' }), hint: 'Stick / D-pad: move claw  •  A: drop  •  START: play' },
    'dig-dash':          { stick: 'keys', map: ar({ a: 'Space' }), hint: 'Stick / D-pad: lanes, jump (up), duck (down)  •  A: jump' },
    'digger':            { stick: 'keys', map: ar({ a: 'Enter', y: 'Escape' }), hint: 'Stick / D-pad: dig  •  Y: restart level  •  A: retry when stuck' },
    'dustracing':        { stick: 'keys', map: ar({ x: 'KeyP', y: 'KeyR' }), hint: 'Stick / D-pad: steer & throttle  •  X: pause  •  Y: reset' },
    'gator-grooves':     { stick: 'keys', map: ar({ a: 'Space', x: 'KeyF', b: 'KeyJ' }), hint: 'Stick: move  •  A: jump  •  X / B: bite  •  START: play' },
    'gator-jam-slam':    { stick: 'keys', map: ar({ a: 'Space', x: 'KeyF', b: 'KeyJ', y: 'KeyK', lb: 'KeyZ', rb: 'ShiftLeft' }), hint: 'Stick: move  •  A: start / jump  •  X Y B: action buttons' },
    'humble-treasures':  { stick: 'keys', map: ar({ a: 'Space', b: 'Space' }), hint: 'Stick / D-pad: move  •  A: jump' },
    'qsd-balance':       { stick: 'keys', map: ar({ a: 'Space', y: 'KeyB', b: 'Escape' }), hint: 'Stick / D-pad: tilt  •  A: pause  •  Y: menu' },
    'sunny-side-diner':  { stick: 'keys', map: ar({ a: 'Enter', b: 'Enter', x: 'Enter' }), hint: 'Stick / D-pad: move  •  A: cook / serve' },
    'swamp-cave-summer': { stick: 'keys', map: { left: 'ArrowLeft', right: 'ArrowRight', up: 'Space', a: 'Space', x: 'ArrowLeft', b: 'ArrowRight', y: 'KeyR' }, hint: 'Stick: flippers  •  A: launch  •  Y: restart' },
    'syrup-roads':       { stick: 'keys', map: ar({ a: 'ArrowUp' }), hint: 'Stick / D-pad: hop  •  START: play' },
    'vinyl-snake':       { stick: 'keys', map: ar({ a: 'Space' }), hint: 'Stick / D-pad: steer  •  A: pause' },
    'vt-dirt':           { stick: 'keys', map: ar({ a: 'ArrowUp' }), hint: 'Stick / D-pad: gas, brake, lean' },
    'truth-knocks':      { stick: 'keys', map: ar({ a: 'KeyI', x: 'KeyJ', y: 'KeyK', b: 'KeyU', rt: 'KeyL', rb: 'ShiftLeft', lb: 'ShiftLeft', lt: 'Space' }), startKey: 'KeyP',
                            hint: 'Stick: move  •  A: jump  •  X: punch  •  Y: kick  •  B: cane  •  RT: special  •  LT: dash  •  RB: run  •  START: pause' },
    'penalty-kings':     { stick: 'keys', map: ar({ a: 'Space', b: 'Enter', x: 'Digit1', y: 'Digit2', lb: 'Digit3' }), hint: 'Stick / D-pad: aim & menus  •  A: shoot / confirm' },
    'hyperswim':         { stick: 'cursor', map: { a: 'Space', x: 'KeyZ', b: 'KeyX', lb: 'KeyZ', rb: 'KeyX', lt: 'KeyZ', rt: 'KeyX', left: 'ArrowLeft', right: 'ArrowRight' }, click: ['r3'],
                            hint: 'Alternate X / B (or LB / RB) to swim  •  A: start' },
    'linus-tug-of-war':  { stick: 'cursor', map: { a: 'Space', b: 'Space', x: 'Space', y: 'Space', lb: 'Space', rb: 'Space', lt: 'Space', rt: 'Space' }, click: ['r3'],
                            hint: 'MASH any button to pull!  •  START: play' },
    'home-run-derby':    { stick: 'cursor', map: { a: 'Space', b: 'Space', x: 'Space' }, click: ['rt'], hint: 'A / X / B: swing' },
    'precision-points':  { stick: 'cursor', map: { a: 'Space', x: 'KeyR', y: 'KeyM' }, click: ['rt'], hint: 'Stick: aim cursor  •  Hold A: shot, release to hit  •  X: reset  •  Y: sound' },
    'scoop-beats':       { stick: 'cursor', map: { a: 'Space', x: 'KeyD', y: 'KeyF', b: 'KeyJ', rb: 'KeyK', lb: 'Space' }, click: ['rt'], hint: 'A X Y B / bumpers: tap the beat  •  RT: click' },

    // ---- instruments: pads on the shoulder buttons & d-pad, pointer on stick
    'frequency-altar':   { stick: 'cursor', map: { a: 'KeyA', b: 'KeyS', x: 'KeyD', y: 'KeyF', lb: 'KeyG', rb: 'KeyH', lt: 'KeyJ', rt: 'KeyK', up: 'Space' }, click: ['r3'],
                            hint: 'A B X Y LB RB LT RT: the 8 stones  •  D-pad up: drone  •  R3: click' },
    'rico-pocket-sampler': { stick: 'cursor', map: { lb: 'KeyA', rb: 'KeyS', lt: 'KeyD', rt: 'KeyF', up: 'KeyG', right: 'KeyH', down: 'KeyJ', left: 'KeyK' }, hint: 'Shoulders / triggers / D-pad: the 8 pads  •  Stick + A: menus' },
    'rico1200':          { stick: 'cursor', map: { lb: 'Digit1', rb: 'Digit2', lt: 'Digit3', rt: 'Digit4', up: 'Digit5', right: 'Digit6', down: 'Digit7', left: 'Digit8' }, hint: 'Shoulders / triggers / D-pad: the 8 pads  •  Stick + A: menus' },
    'bayou-break-station': { stick: 'cursor', map: { lb: 'Digit1', rb: 'Digit2', lt: 'Digit3', rt: 'Digit4', up: 'Digit5', right: 'Digit6', down: 'Digit7', left: 'Digit8', y: 'Space' }, hint: 'Shoulders / triggers / D-pad: drum pads  •  Y: preview  •  Stick + A: everything else' },
    'santos-drum-kit':   { stick: 'cursor', map: { lb: 'KeyZ', rb: 'KeyX', lt: 'KeyB', rt: 'Space', x: 'KeyQ', y: 'KeyW', b: 'KeyK', up: 'KeyJ', left: 'KeyD', right: 'KeyF', down: 'KeyA', l3: 'Enter' },
                            hint: 'RT: kick  •  LT: kick  •  X Y B: bass / hit / floor  •  D-pad: toms & snare  •  L3: loop' },
    'skank-riot':        { stick: 'cursor', map: { x: 'Digit1', y: 'Digit2', b: 'Digit3', a: 'Digit4', lb: 'Digit5', rb: 'Digit6', rt: 'ArrowDown', lt: 'ArrowUp', up: 'ArrowUp', down: 'ArrowDown' }, click: ['r3'],
                            hint: 'X Y B A LB RB: chords  •  RT / D-pad down: down-strum  •  LT / D-pad up: up-strum  •  R3: click' },
    'rico-keys':         { stick: 'cursor', map: { lb: 'KeyZ', rb: 'KeyX' }, hint: 'LB / RB: octave  •  Stick + hold A: play keys (drag to glide)' },
    'rico-daw':          { stick: 'cursor', map: { y: 'Space' }, hint: 'Y: play / stop  •  Stick + A: everything else' },
    'ricos-filter-lab':  { stick: 'cursor', map: { x: 'Space', y: 'KeyR' }, hint: 'X: start / stop  •  Y: randomize  •  Stick + A: sliders' },

    // ---- pages that already read the pad themselves: pointer on RIGHT stick
    'dig-on':            { stick: 'none', click: ['rt'], hint: 'Right stick + RT: menu pointer' },
    'kangaiden':         { stick: 'none', click: ['rt'], hint: 'Right stick + RT: menu pointer' },
    'johnnyslides':      { stick: 'none', click: ['rt'], auto: false, hint: 'Right stick + RT: menu pointer' },
    'j2s-pro-skater':    { stick: 'none', click: ['rt'], auto: false, hint: 'Right stick + RT: menu pointer' }
  };

  var DEFAULT_HINT = 'Left stick: pointer  •  A: click / hold to drag  •  D-pad: nudge sliders  •  Right stick: scroll  •  START: play';

  var folder = window.RVQ_GAMEPAD_NAME || ((location.pathname.match(/instruments\/([^\/]+)\//) || [])[1]) || '';
  var P = PROFILES[folder] || {};
  var user = window.RVQ_GAMEPAD || {};
  for (var uk in user) P[uk] = user[uk];
  var MAP = P.map || {};
  var STICK = P.stick || 'cursor';
  var CURSOR_STICK = STICK === 'cursor' ? 'left' : 'right';
  var HINT = P.hint || DEFAULT_HINT;

  var BTN = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, start: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15 };
  var CLICKERS = (P.click || ['a', 'rt']).filter(function (n) { return !MAP[n]; });

  // ------------------------------------------------------------ keys
  var KC = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13, Escape: 27, Tab: 9, Backspace: 8 };
  function spec(s) {
    if (s === 'Space') return { key: ' ', code: 'Space', keyCode: 32 };
    if (s === 'ShiftLeft') return { key: 'Shift', code: 'ShiftLeft', keyCode: 16 };
    if (KC[s]) return { key: s, code: s, keyCode: KC[s] };
    var m = /^Key([A-Z])$/.exec(s);
    if (m) return { key: m[1].toLowerCase(), code: s, keyCode: m[1].charCodeAt(0) };
    m = /^Digit([0-9])$/.exec(s);
    if (m) return { key: m[1], code: s, keyCode: 48 + Number(m[1]) };
    return { key: s, code: s, keyCode: 0 };
  }
  function keyTarget() {
    var a = document.activeElement;
    if (a && a !== document.body && a !== document.documentElement && !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return a;
    return document.body || document;
  }
  var held = {}; // key spec string -> reference count
  function keyEvent(type, s) {
    var d = spec(s);
    var ev = new KeyboardEvent(type, { key: d.key, code: d.code, bubbles: true, cancelable: true, composed: true, view: window });
    try {
      Object.defineProperty(ev, 'keyCode', { get: function () { return d.keyCode; } });
      Object.defineProperty(ev, 'which', { get: function () { return d.keyCode; } });
    } catch (e) { /* ignore */ }
    keyTarget().dispatchEvent(ev);
  }
  function keyAdd(s) { held[s] = (held[s] || 0) + 1; if (held[s] === 1) keyEvent('keydown', s); }
  function keyRemove(s) {
    if (!held[s]) return;
    held[s] -= 1;
    if (held[s] === 0) { delete held[s]; keyEvent('keyup', s); }
  }
  function releaseAll() {
    for (var s in held) { delete held[s]; try { keyEvent('keyup', s); } catch (e) { /* ignore */ } }
    ctl = {};
    if (isDown) pointerUp();
  }

  // ------------------------------------------------------------ pointer
  var PID = 4242; // synthetic pointer id (patched below so capture calls don't throw)
  (function patchCapture() {
    try {
      var E = Element.prototype;
      var set = E.setPointerCapture, rel = E.releasePointerCapture, has = E.hasPointerCapture;
      E.setPointerCapture = function (id) { if (id === PID) return; return set.apply(this, arguments); };
      E.releasePointerCapture = function (id) { if (id === PID) return; return rel.apply(this, arguments); };
      E.hasPointerCapture = function (id) { if (id === PID) return isDown; return has.apply(this, arguments); };
    } catch (e) { /* ignore */ }
  })();

  var cur = null, curX = 0, curY = 0, curVisible = false, curInit = false;
  var isDown = false, downTarget = null, lastOver = null, rangeDrag = null;

  function ensureCursor() {
    if (cur || !document.body) return;
    cur = document.createElement('div');
    cur.setAttribute('aria-hidden', 'true');
    cur.style.cssText = 'position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;display:none;' +
      'filter:drop-shadow(0 2px 3px rgba(0,0,0,.75));will-change:transform;';
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.7 L11 13.3 L18 13 Z" ' +
      'fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cur);
  }
  function drawCursor() {
    if (!cur) return;
    cur.style.display = curVisible ? 'block' : 'none';
    cur.style.transform = 'translate(' + (curX - 4) + 'px,' + (curY - 2) + 'px) scale(' + (isDown ? 0.82 : 1) + ')';
  }
  function showCursor() {
    ensureCursor();
    if (!cur) return;
    if (!curInit) { curX = innerWidth / 2; curY = innerHeight / 2; curInit = true; }
    curVisible = true;
    drawCursor();
  }
  function hideCursor() { curVisible = false; drawCursor(); }

  function under() { return document.elementFromPoint(curX, curY) || document.body; }

  function pEv(type, el, buttons) {
    var o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: curX, clientY: curY, screenX: curX, screenY: curY,
      button: 0, buttons: buttons, pointerId: PID, pointerType: 'mouse', isPrimary: true, width: 1, height: 1, pressure: buttons ? 0.5 : 0 };
    try { return el.dispatchEvent(new PointerEvent(type, o)); } catch (e) { return true; }
  }
  function mEv(type, el, buttons) {
    return el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view: window, clientX: curX, clientY: curY,
      screenX: curX, screenY: curY, button: 0, buttons: buttons, detail: type === 'click' ? 1 : 0 }));
  }
  function isRange(el) { return el && el.tagName === 'INPUT' && el.type === 'range'; }
  function isSelect(el) { return el && el.tagName === 'SELECT'; }
  function closestControl(el) {
    while (el && el !== document.body) {
      if (isRange(el) || isSelect(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function fire(el, name) { el.dispatchEvent(new Event(name, { bubbles: true })); }
  function setRangeFromPoint(el) {
    var r = el.getBoundingClientRect();
    var min = Number(el.min || 0), max = Number(el.max || 100), step = Number(el.step) || 1;
    var vertical = r.height > r.width * 1.5;
    var t = vertical ? 1 - (curY - r.top) / r.height : (curX - r.left) / r.width;
    t = Math.max(0, Math.min(1, t));
    var v = min + t * (max - min);
    v = Math.round((v - min) / step) * step + min;
    v = Math.max(min, Math.min(max, v));
    if (String(v) !== el.value) { el.value = v; fire(el, 'input'); }
  }
  function nudge(el, dir) {
    if (isRange(el)) {
      var min = Number(el.min || 0), max = Number(el.max || 100), step = Number(el.step) || (max - min) / 50 || 1;
      var v = Math.max(min, Math.min(max, Number(el.value) + dir * step));
      el.value = v; fire(el, 'input'); fire(el, 'change');
    } else if (isSelect(el)) {
      var n = el.options.length;
      if (!n) return;
      el.selectedIndex = (el.selectedIndex + dir + n) % n;
      fire(el, 'input'); fire(el, 'change');
      toast(el.options[el.selectedIndex].text);
    }
  }

  function moveOver(el) {
    if (el !== lastOver) {
      if (lastOver && lastOver.isConnected) { pEv('pointerout', lastOver, isDown ? 1 : 0); mEv('mouseout', lastOver, isDown ? 1 : 0); }
      pEv('pointerover', el, isDown ? 1 : 0); mEv('mouseover', el, isDown ? 1 : 0);
      lastOver = el;
    }
  }
  function pointerMove() {
    var el = isDown && downTarget && downTarget.isConnected ? downTarget : under();
    if (!isDown) moveOver(el);
    pEv('pointermove', el, isDown ? 1 : 0);
    mEv('mousemove', el, isDown ? 1 : 0);
    if (rangeDrag) setRangeFromPoint(rangeDrag);
  }
  function pointerDown() {
    var el = under();
    isDown = true; downTarget = el;
    var cont = pEv('pointerdown', el, 1);
    if (cont !== false) mEv('mousedown', el, 1);
    var ctrl = closestControl(el);
    if (isRange(ctrl)) { rangeDrag = ctrl; setRangeFromPoint(ctrl); }
    else if (isSelect(ctrl)) { nudge(ctrl, 1); }
    var f = el; // focus the nearest focusable thing, like a real click does
    while (f && f !== document.body) {
      if (f.matches && f.matches('input,textarea,select,button,[tabindex]')) { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } break; }
      f = f.parentElement;
    }
    drawCursor();
  }
  function commonAncestor(a, b) {
    if (!a || !b) return null;
    for (var n = a; n; n = n.parentElement) if (n.contains(b)) return n;
    return null;
  }
  function pointerUp() {
    var down = downTarget;
    var el = down && down.isConnected ? down : under();
    var upEl = under();
    isDown = false; downTarget = null;
    pEv('pointerup', el, 0);
    mEv('mouseup', el, 0);
    if (rangeDrag) { fire(rangeDrag, 'change'); rangeDrag = null; }
    else {
      var tgt = commonAncestor(down || el, upEl);
      if (tgt && !isSelect(closestControl(tgt))) mEv('click', tgt, 0);
    }
    drawCursor();
  }

  function scrollable(el) {
    for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (n.scrollHeight > n.clientHeight + 2 || n.scrollWidth > n.clientWidth + 2)) return n;
    }
    return document.scrollingElement || document.documentElement;
  }
  function doScroll(dx, dy) {
    var el = under();
    try { el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: curX, clientY: curY, deltaX: dx, deltaY: dy })); } catch (e) { /* ignore */ }
    var s = scrollable(el);
    s.scrollTop += dy;
    s.scrollLeft += dx;
  }

  // "START" presses the most obvious on-screen play/continue button.
  var TIER1 = /^\W*(start|play|begin|tip off|launch|new game|let'?s go|go|enter|swim|serve|lets? dig|drop)\b/i;
  var TIER2 = /^\W*(retry|try again|play again|again|next|continue|resume|ok|got it|done)\b/i;
  function visibleEl(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1 || cs.pointerEvents === 'none') return false;
    var hit = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
    return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
  }
  // Title / "tap to start" screens often have a custom label ("WAKE THE SWAMP").
  // If a full-screen overlay is on top, press the first usable button inside it.
  function overlayButton() {
    var top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    for (var n = top; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      var r = n.getBoundingClientRect();
      if (r.width < innerWidth * 0.8 || r.height < innerHeight * 0.8) continue;
      var bs = n.querySelectorAll('button,[role=button],a[href],input[type=button],input[type=submit]');
      for (var i = 0; i < bs.length; i++) if (visibleEl(bs[i])) return bs[i];
    }
    return null;
  }
  function clickPrimary() {
    var list = document.querySelectorAll('button,[role=button],a[href],input[type=button],input[type=submit],.btn,[onclick]');
    var t1 = null, t2 = null;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var txt = (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').trim();
      if (!txt) continue;
      var is1 = TIER1.test(txt), is2 = !is1 && TIER2.test(txt);
      if (!is1 && !is2) continue;
      if (!visibleEl(el)) continue;
      if (is1 && !t1) t1 = el;
      if (is2 && !t2) t2 = el;
    }
    var pick = t1 || t2;
    if (!pick) pick = overlayButton();
    if (pick) { pick.click(); return true; }
    return false;
  }

  // ------------------------------------------------------------ hint toast
  var toastEl = null, toastTimer = 0;
  function toast(text, ms) {
    if (!document.body) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('aria-hidden', 'true');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:2147483646;pointer-events:none;' +
        'max-width:92vw;padding:7px 14px;border-radius:999px;background:rgba(10,8,14,.88);color:#fff;font:600 13px/1.3 system-ui,sans-serif;' +
        'text-align:center;box-shadow:0 4px 18px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);transition:opacity .25s;opacity:0;';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = '\uD83C\uDFAE ' + text;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.opacity = '0'; }, ms || 2200);
  }

  // ------------------------------------------------------------ polling
  var ctl = {};          // virtual control name -> pressed
  var seen = false;      // has the pad been touched yet?
  var DZ = 0.22, TH = 0.5;
  var repeatAt = {};     // nudge auto-repeat timers

  function activePad() {
    var pads = navigator.getGamepads() || [];
    var best = null;
    for (var i = 0; i < pads.length; i++) {
      var g = pads[i];
      if (g && g.connected && g.buttons && g.buttons.length) { if (!best || g.mapping === 'standard') best = g; if (best.mapping === 'standard') break; }
    }
    return best;
  }
  function axis(gp, i) { var v = gp.axes[i] || 0; return Math.abs(v) < DZ ? 0 : v; }
  function stickVec(gp, ix) {
    var x = gp.axes[ix] || 0, y = gp.axes[ix + 1] || 0;
    var m = Math.sqrt(x * x + y * y);
    if (m < DZ) return { x: 0, y: 0, m: 0 };
    var k = Math.min(1, (m - DZ) / (1 - DZ)) / m;
    return { x: x * k, y: y * k, m: Math.min(1, (m - DZ) / (1 - DZ)) };
  }

  function setCtl(name, on, now) {
    var was = !!ctl[name];
    if (on === was) return;
    ctl[name] = on;
    if (MAP[name]) { if (on) keyAdd(MAP[name]); else keyRemove(MAP[name]); }
    else if (on) onFree(name, now);
    if (!on) delete repeatAt[name];
  }

  // pressed edge of a control with no key mapped to it
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  function onFree(name, now) {
    if (CLICKERS.indexOf(name) >= 0) {
      if (!curVisible) showCursor();
      var ctrl = closestControl(under());
      if (isSelect(ctrl)) { nudge(ctrl, 1); return; }
      pointerDown();
      return;
    }
    if (name === 'start' && P.auto !== false) {
      if (!clickPrimary() && P.startKey) { keyAdd(P.startKey); setTimeout(function () { keyRemove(P.startKey); }, 80); }
      return;
    }
    if (DIRS[name]) { nudgeHover(name, now); repeatAt[name] = now + 380; }
  }
  function nudgeHover(name) {
    if (!curVisible) return;
    var ctrl = closestControl(under());
    if (!ctrl) return;
    var d = DIRS[name];
    nudge(ctrl, (d[0] > 0 || d[1] < 0) ? 1 : -1);
  }

  var lastT = 0, primed = false, stale = {};
  function tick(t) {
    requestAnimationFrame(tick);
    var gp;
    try { gp = activePad(); } catch (e) { return; }
    if (!gp) return;
    var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;

    var b = gp.buttons;
    function bp(i) {
      var x = b[i], on = !!x && (x.pressed || x.value > 0.5);
      // a button still held from the moment this page opened (e.g. the A that
      // launched the mini-game) is ignored until it is released
      if (stale[i]) { if (on) return false; delete stale[i]; }
      return on;
    }
    if (!primed) { primed = true; for (var s = 0; s < b.length; s++) if (b[s] && (b[s].pressed || b[s].value > 0.5)) stale[s] = true; }

    var ls = stickVec(gp, 0), rs = stickVec(gp, 2);
    var active = ls.m > 0 || rs.m > 0;
    for (var i = 0; i < 16 && !active; i++) if (i !== 8 && bp(i)) active = true;
    if (active && !seen) {
      seen = true;
      try { window.focus(); } catch (e) { /* ignore */ }
      toast(HINT, 6500);
    }
    if (!seen) return;

    // ---- buttons -> controls
    for (var name in BTN) {
      var on = bp(BTN[name]);
      if (name === 'up' || name === 'down' || name === 'left' || name === 'right') {
        // the left stick doubles as the d-pad when it isn't the pointer
        if (STICK !== 'cursor') {
          var sx = ls.x, sy = ls.y;
          if (name === 'left' && sx < -TH) on = true;
          if (name === 'right' && sx > TH) on = true;
          if (name === 'up' && sy < -TH) on = true;
          if (name === 'down' && sy > TH) on = true;
        }
      }
      setCtl(name, on, t);
    }
    // right stick as four extra buttons, only if the profile maps them
    var rsx = rs.x, rsy = rs.y;
    setCtl('rsLeft', rsx < -TH, t); setCtl('rsRight', rsx > TH, t);
    setCtl('rsUp', rsy < -TH, t); setCtl('rsDown', rsy > TH, t);

    // ---- release click
    var anyClick = false;
    for (var c = 0; c < CLICKERS.length; c++) if (ctl[CLICKERS[c]]) anyClick = true;
    if (isDown && !anyClick) pointerUp();

    // ---- d-pad nudge auto-repeat while hovering a slider / select
    for (var dn in repeatAt) {
      if (t >= repeatAt[dn]) { nudgeHover(dn, t); repeatAt[dn] = t + 70; }
    }

    // ---- pointer + scroll
    var pv = CURSOR_STICK === 'left' ? ls : rs;
    if (pv.m > 0) {
      showCursor();
      var sp = 1000 * pv.m * pv.m + 90 * pv.m; // px/s: fine near the deadzone, fast at full tilt
      var nx = pv.x / pv.m, ny = pv.y / pv.m;
      curX = Math.max(0, Math.min(innerWidth - 1, curX + nx * sp * dt));
      curY = Math.max(0, Math.min(innerHeight - 1, curY + ny * sp * dt));
      drawCursor();
      pointerMove();
    }
    if (CURSOR_STICK === 'left' && STICK === 'cursor' && !MAP.rsUp && !MAP.rsDown && (rs.m > 0)) {
      if (!curVisible) showCursor();
      doScroll(rs.x * 900 * dt, rs.y * 900 * dt);
    }
  }

  // ------------------------------------------------------------ lifecycle
  window.addEventListener('mousemove', function (e) { if (e.isTrusted && curVisible) hideCursor(); }, true);
  window.addEventListener('touchstart', function (e) { if (e.isTrusted && curVisible) hideCursor(); }, true);
  window.addEventListener('blur', releaseAll);
  window.addEventListener('pagehide', releaseAll);
  document.addEventListener('visibilitychange', function () { if (document.hidden) releaseAll(); });
  window.addEventListener('gamepadconnected', function () { try { window.focus(); } catch (e) { /* ignore */ } });
  requestAnimationFrame(tick);
})();
