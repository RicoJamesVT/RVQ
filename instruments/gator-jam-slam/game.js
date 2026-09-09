/*!
 * Gator Jam Slam — standalone vanilla-JS build
 * Self-contained: no build step, no framework, no external deps.
 * Drop this file in as `game.js` and include it with a <script> tag,
 * or `import` it as an ES module — both work (see bottom of file).
 *
 * Usage:
 *   <div id="gator-jam-root"></div>
 *   <script src="game.js"></script>
 *   // Auto-mounts into #gator-jam-root, or document.body if that id
 *   // isn't found. To control mounting yourself:
 *   //   GatorJam.mount(document.getElementById('my-container'));
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.GatorJam = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ============================================================
  // ENGINE — core simulation for Gator Jam: 2-on-2 arcade
  // basketball, side view. Pure logic, no DOM.
  // ============================================================

  const WORLD = { w: 1500, d: 320 };
  const HOOP = { z: 100, inset: 90 };
  const GAME_SECONDS = 150;

  const NAMES = [
    ["CHOMP", "BAYOU"],
    ["SWAMPY", "HISS"],
  ];

  function hoopX(team) {
    // team 0 attacks the right hoop
    return team === 0 ? WORLD.w - HOOP.inset : HOOP.inset;
  }

  function mkPlayer(id, team, y) {
    return {
      id,
      team,
      name: NAMES[team][id % 2],
      x: team === 0 ? WORLD.w * 0.4 : WORLD.w * 0.6,
      y,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      face: team === 0 ? 1 : -1,
      airborne: false,
      charging: false,
      stun: 0,
      cool: 0,
      dunking: 0,
      streak: 0,
      onFire: false,
      turbo: 1,
      score: 0,
    };
  }

  function createGame() {
    const players = [
      mkPlayer(0, 0, 110),
      mkPlayer(1, 0, 220),
      mkPlayer(2, 1, 110),
      mkPlayer(3, 1, 220),
    ];
    const ball = {
      x: WORLD.w / 2,
      y: WORLD.d / 2,
      z: 40,
      vx: 0,
      vy: 0,
      vz: 0,
      holder: null,
      flight: null,
      pass: null,
    };
    return {
      players,
      ball,
      score: [0, 0],
      clock: GAME_SECONDS,
      flashes: [],
      shake: 0,
      over: false,
      controlled: 0,
      lastAction: [false, false, false, false],
      restartLock: 0,
    };
  }

  function dist2d(a, b) {
    const dx = a.x - b.x;
    const dy = (a.y - b.y) * 1.6;
    return Math.hypot(dx, dy);
  }

  function say(g, text, big) {
    g.flashes.push({ text, t: 0, big: !!big });
    if (g.flashes.length > 4) g.flashes.shift();
  }

  function giveBall(g, id) {
    g.ball.holder = id;
    g.ball.flight = null;
    g.ball.pass = null;
  }

  function inbound(g, team) {
    // team gets the ball near their own basket
    const p = g.players.find((q) => q.team === team);
    p.x = team === 0 ? HOOP.inset + 140 : WORLD.w - HOOP.inset - 140;
    p.y = WORLD.d / 2;
    p.z = 0;
    p.vz = 0;
    p.airborne = false;
    giveBall(g, p.id);
    const mate = g.players.find((q) => q.team === team && q.id !== p.id);
    mate.x = p.x + (team === 0 ? 60 : -60);
    mate.y = WORLD.d / 2 + 90;
    for (const o of g.players) if (o.team !== team) o.x = WORLD.w / 2 + (o.team === 0 ? -80 : 80);
  }

  function shotValue(p) {
    const hx = hoopX(p.team);
    const d = Math.abs(p.x - hx);
    return d > 470 ? 3 : 2;
  }

  function defenderPressure(g, p) {
    let press = 0;
    for (const o of g.players) {
      if (o.team === p.team) continue;
      const d = dist2d(o, p);
      if (d < 130) press += (1 - d / 130) * (o.z > 20 ? 1.35 : 0.8);
    }
    return Math.min(press, 1.6);
  }

  function launchShot(g, p) {
    const hx = hoopX(p.team);
    const d = Math.hypot(p.x - hx, (p.y - WORLD.d / 2) * 1.2);
    const dunk = d < 190 && p.z > 10;
    const press = defenderPressure(g, p);
    let chance = dunk ? 0.94 : 0.86 - d / 1100 - press * 0.3;
    if (p.onFire) chance += 0.28;
    chance = Math.max(0.12, Math.min(0.99, chance));
    const made = Math.random() < chance;
    const pts = dunk ? 2 : shotValue(p);
    g.ball.holder = null;
    g.ball.pass = null;
    g.ball.flight = {
      fx: p.x,
      fy: p.y,
      fz: p.z + 60,
      tx: hx,
      ty: WORLD.d / 2,
      tz: HOOP.z,
      t: 0,
      dur: dunk ? 0.42 : 0.55 + d / 1400,
      made,
      peak: dunk ? 40 : 120 + d * 0.18,
      shooter: p.id,
      pts,
      dunk,
    };
    if (dunk) {
      p.dunking = 0.45;
      p.vx = (hx - p.x) * 2.1;
      p.vz = Math.max(p.vz, 320);
    }
  }

  function resolveFlight(g) {
    const f = g.ball.flight;
    const shooter = g.players[f.shooter];
    g.ball.flight = null;
    g.ball.x = f.tx;
    g.ball.y = f.ty;
    g.ball.z = f.tz;
    if (f.made) {
      g.score[shooter.team] += f.pts;
      shooter.score += f.pts;
      shooter.streak++;
      if (shooter.streak >= 3 && !shooter.onFire) {
        shooter.onFire = true;
        say(g, "HE'S ON FIRE!", true);
      } else if (f.dunk) say(g, "BOOMSHAKALAKA!", true);
      else if (f.pts === 3) say(g, "FROM DOWNTOWN!", true);
      else say(g, "SLAM!");
      g.shake = f.dunk ? 1 : 0.5;
      inbound(g, shooter.team === 0 ? 1 : 0);
    } else {
      shooter.streak = 0;
      shooter.onFire = false;
      say(g, "OFF THE RIM!");
      g.ball.vx = (shooter.team === 0 ? -1 : 1) * (120 + Math.random() * 120);
      g.ball.vy = (Math.random() - 0.5) * 160;
      g.ball.vz = 120;
    }
  }

  function aiIntent(g, p) {
    const it = { mx: 0, my: 0, turbo: false, shoot: false, action: false };
    const b = g.ball;
    const hx = hoopX(p.team);
    const hasBall = b.holder === p.id;
    const teamHasBall = b.holder !== null && g.players[b.holder].team === p.team;

    if (hasBall) {
      const d = Math.hypot(p.x - hx, (p.y - WORLD.d / 2) * 1.2);
      const press = defenderPressure(g, p);
      if (d < 175 || (d < 520 && press < 0.35 && Math.random() < 0.02) || p.onFire) {
        if (p.cool <= 0 && (d < 175 || Math.random() < 0.5)) {
          it.shoot = true;
          return it;
        }
      }
      if (press > 1 && Math.random() < 0.03) it.action = true; // pass out
      it.mx = Math.sign(hx - p.x);
      it.my = Math.sign(WORLD.d / 2 - p.y) * (Math.abs(p.y - WORLD.d / 2) > 30 ? 1 : 0);
      it.turbo = press > 0.5;
    } else if (teamHasBall) {
      const spot = { x: hx + (p.team === 0 ? -260 : 260), y: p.id % 2 === 0 ? 80 : 240 };
      it.mx = Math.abs(p.x - spot.x) > 25 ? Math.sign(spot.x - p.x) : 0;
      it.my = Math.abs(p.y - spot.y) > 20 ? Math.sign(spot.y - p.y) : 0;
    } else if (b.holder === null) {
      // loose ball: both defenders scrambling for it is correct, no marking needed
      const chase = { x: b.x, y: b.y };
      it.mx = Math.abs(p.x - chase.x) > 12 ? Math.sign(chase.x - p.x) : 0;
      it.my = Math.abs(p.y - chase.y) > 12 ? Math.sign(chase.y - p.y) : 0;
      it.turbo = true;
    } else {
      // man-to-man: each defender guards the opponent in the same lane
      // (matching id%2, same pairing the offense uses for spacing) so the
      // two defenders naturally stay apart instead of both beelining for
      // the ball handler and stacking on top of each other.
      const myMark = g.players.find((q) => q.team !== p.team && q.id % 2 === p.id % 2);
      const holder = g.players[b.holder];
      const markHasBall = myMark.id === holder.id;
      let tx, ty;
      if (markHasBall) {
        tx = myMark.x;
        ty = myMark.y;
      } else {
        // sag toward the ball to help deny the pass, but stay closer to
        // your own mark so you don't collapse onto your teammate
        tx = myMark.x * 0.65 + holder.x * 0.35;
        ty = myMark.y * 0.65 + holder.y * 0.35;
      }
      it.mx = Math.abs(p.x - tx) > 12 ? Math.sign(tx - p.x) : 0;
      it.my = Math.abs(p.y - ty) > 12 ? Math.sign(ty - p.y) : 0;
      it.turbo = true;
      const d = dist2d(p, holder);
      if (markHasBall && d < 60 && Math.random() < 0.035) it.action = true;
      if (markHasBall && holder.z > 30 && d < 80 && Math.random() < 0.06) it.shoot = true;
    }
    return it;
  }

  const ACCEL = 2100;
  const MAXV = 300;
  const GRAV = 900;

  function step(g, dt, human) {
    if (g.over) return;
    g.clock = Math.max(0, g.clock - dt);
    if (g.clock <= 0) {
      g.over = true;
      g.restartLock = 0.8;
      return;
    }
    g.shake = Math.max(0, g.shake - dt * 2.5);
    for (const f of g.flashes) f.t += dt;
    g.flashes = g.flashes.filter((f) => f.t < 1.8);

    // choose the controlled gator: whoever on team 0 is closest to the action
    const b = g.ball;
    if (b.holder !== null && g.players[b.holder].team === 0) {
      g.controlled = b.holder;
    } else {
      const anchor = b.holder !== null ? g.players[b.holder] : b;
      const mine = g.players.filter((p) => p.team === 0);
      mine.sort((a, c) => dist2d(a, anchor) - dist2d(c, anchor));
      g.controlled = mine[0].id;
    }

    for (const p of g.players) {
      const it = p.id === g.controlled ? human : aiIntent(g, p);
      const prevAction = g.lastAction[p.id];
      g.lastAction[p.id] = it.action;
      const actionEdge = it.action && !prevAction;

      p.cool = Math.max(0, p.cool - dt);
      p.stun = Math.max(0, p.stun - dt);
      p.dunking = Math.max(0, p.dunking - dt);

      const turboOn = it.turbo && p.turbo > 0.05 && (it.mx !== 0 || it.my !== 0);
      p.turbo = Math.max(0, Math.min(1, p.turbo + (turboOn ? -dt * 0.35 : dt * 0.22)));
      const speed = (p.onFire ? 1.22 : 1) * (turboOn ? 1.55 : 1) * (p.stun > 0 ? 0.2 : 1);

      if (p.dunking <= 0 && p.stun <= 0) {
        const len = Math.hypot(it.mx, it.my) || 1;
        p.vx += (it.mx / len) * ACCEL * dt;
        p.vy += (it.my / len) * ACCEL * dt;
        if (it.mx !== 0) p.face = it.mx > 0 ? 1 : -1;
      }
      // damping (frame-rate independent)
      const k = p.airborne ? 0.7 : 9;
      p.vx *= Math.exp(-k * dt);
      p.vy *= Math.exp(-k * dt);
      const cap = MAXV * speed;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > cap) {
        p.vx = (p.vx / sp) * cap;
        p.vy = (p.vy / sp) * cap;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.x = Math.max(40, Math.min(WORLD.w - 40, p.x));
      p.y = Math.max(30, Math.min(WORLD.d - 20, p.y));

      // jump / shoot
      const hasBall = b.holder === p.id;
      if (it.shoot && !p.airborne && p.stun <= 0 && p.cool <= 0) {
        p.airborne = true;
        p.charging = hasBall;
        p.vz = hasBall ? 420 : 470;
        p.cool = 0.25;
        if (hasBall) {
          const d = Math.hypot(p.x - hoopX(p.team), (p.y - WORLD.d / 2) * 1.2);
          if (d < 190) launchShot(g, p); // dunk launches immediately
        }
      }
      if (p.airborne) {
        p.vz -= GRAV * dt;
        p.z += p.vz * dt;
        if (p.charging && b.holder === p.id && (!it.shoot || p.vz < 0)) {
          launchShot(g, p);
          p.charging = false;
        }
        if (p.z <= 0) {
          p.z = 0;
          p.vz = 0;
          p.airborne = false;
          if (p.charging && b.holder === p.id) {
            launchShot(g, p);
            p.charging = false;
          }
          p.charging = false;
        }
      }

      // action button: pass or steal/shove
      if (actionEdge && p.stun <= 0) {
        if (hasBall) {
          const mate = g.players.find((q) => q.team === p.team && q.id !== p.id);
          b.holder = null;
          b.pass = { to: mate.id, t: 0, dur: Math.max(0.18, dist2d(p, mate) / 1200), fx: p.x, fy: p.y, fz: p.z + 40 };
        } else {
          for (const o of g.players) {
            if (o.team === p.team) continue;
            if (dist2d(o, p) < 70) {
              o.stun = 0.5;
              o.vx += p.face * 260;
              g.shake = Math.max(g.shake, 0.35);
              if (b.holder === o.id) {
                b.holder = null;
                b.x = o.x + p.face * 30;
                b.y = o.y;
                b.z = 45;
                b.vx = p.face * 150;
                b.vy = (Math.random() - 0.5) * 100;
                b.vz = 90;
                o.streak = 0;
                o.onFire = false;
                say(g, "SHOVED!");
              }
              break;
            }
          }
        }
      }
    }

    // ball
    if (b.holder !== null) {
      const h = g.players[b.holder];
      b.x = h.x + h.face * 22;
      b.y = h.y;
      b.z = h.z + (h.airborne ? 70 : 45);
    } else if (b.flight) {
      const f = b.flight;
      f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      b.x = f.fx + (f.tx - f.fx) * u;
      b.y = f.fy + (f.ty - f.fy) * u;
      b.z = f.fz + (f.tz - f.fz) * u + Math.sin(u * Math.PI) * f.peak;
      // block check
      if (u > 0.15 && u < 0.7 && !f.dunk) {
        for (const o of g.players) {
          if (o.team === g.players[f.shooter].team || o.z < 25) continue;
          if (Math.hypot(o.x - b.x, (o.y - b.y) * 1.4, o.z + 70 - b.z) < 60) {
            b.flight = null;
            b.vx = (o.x < b.x ? 1 : -1) * 260;
            b.vy = (Math.random() - 0.5) * 120;
            b.vz = 200;
            g.players[f.shooter].streak = 0;
            g.players[f.shooter].onFire = false;
            say(g, "REJECTED!", true);
            g.shake = 0.6;
            break;
          }
        }
      }
      if (b.flight && u >= 1) resolveFlight(g);
    } else if (b.pass) {
      const p = b.pass;
      const to = g.players[p.to];
      p.t += dt;
      const u = Math.min(1, p.t / p.dur);
      b.x = p.fx + (to.x - p.fx) * u;
      b.y = p.fy + (to.y - p.fy) * u;
      b.z = p.fz + (to.z + 45 - p.fz) * u + Math.sin(u * Math.PI) * 20;
      if (u >= 1) {
        b.pass = null;
        giveBall(g, to.id);
      }
    } else {
      b.vz -= GRAV * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (b.z <= 12) {
        b.z = 12;
        b.vz = -b.vz * 0.55;
        b.vx *= 0.7;
        b.vy *= 0.7;
        if (Math.abs(b.vz) < 40) b.vz = 0;
      }
      b.x = Math.max(30, Math.min(WORLD.w - 30, b.x));
      b.y = Math.max(25, Math.min(WORLD.d - 15, b.y));
      // pickup
      for (const p of g.players) {
        if (p.stun > 0) continue;
        if (Math.hypot(p.x - b.x, (p.y - b.y) * 1.4) < 55 && Math.abs(p.z + 45 - b.z) < 95) {
          giveBall(g, p.id);
          break;
        }
      }
    }
  }

  // ============================================================
  // RENDER — canvas drawing. Pure function of GameState + View.
  // ============================================================

  const SKY_TOP = "#1b2d20";
  const SKY_BOT = "#3d5a34";
  const FLOOR_A = "#6b4a2a";
  const FLOOR_B = "#7d5730";
  const LINE = "rgba(226, 240, 200, 0.55)";
  const TEAM_COLORS = [
    { body: "#5d8b3a", belly: "#c9d98a", jersey: "#e0761f", trim: "#2e4a1d" },
    { body: "#3f7d78", belly: "#a8d5cf", jersey: "#8a3fb0", trim: "#20423f" },
  ];

  function makeView(g, w, h) {
    const portrait = h > w;
    // In portrait, a width-only zoom (tuned for wide landscape screens)
    // clamps to a tiny minimum and leaves the court as a thin sliver in
    // the middle of a tall screen. Zoom in more on narrow/tall screens
    // instead, trading off how much court width is visible at once for
    // a bigger, screen-filling view of the actual action.
    const zoom = portrait
      ? Math.min(Math.max(w / 460, 0.62), 1.6)
      : Math.min(Math.max(w / 1050, 0.42), 1.15);
    const half = w / 2 / zoom;
    let camX = g.ball.x;
    camX = Math.max(half, Math.min(WORLD.w - half, camX));
    if (WORLD.w * zoom < w) camX = WORLD.w / 2;
    const topY = portrait ? h * 0.34 : h * 0.4;
    return { w, h, zoom, camX, topY };
  }

  const sx = (v, x) => (x - v.camX) * v.zoom + v.w / 2;
  const sy = (v, y, z) => v.topY + y * v.zoom * 0.58 - (z || 0) * v.zoom;

  function draw(ctx, g, v, time) {
    const shake = g.shake * 8;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    drawBackground(ctx, v, time);
    drawFloor(ctx, v);
    drawHoop(ctx, v, 1, true); // far-ish decorations first
    drawHoop(ctx, v, 0, true);

    // shadows
    for (const p of g.players) {
      ctx.save();
      ctx.globalAlpha = 0.28 - Math.min(0.2, p.z / 700);
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(sx(v, p.x), sy(v, p.y), 26 * v.zoom, 9 * v.zoom, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(sx(v, g.ball.x), sy(v, g.ball.y), 10 * v.zoom, 4 * v.zoom, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const order = [...g.players].sort((a, b) => a.y - b.y);
    const ballDepth = g.ball.y;
    let ballDrawn = false;
    for (const p of order) {
      if (!ballDrawn && ballDepth < p.y) {
        drawBall(ctx, g, v, time);
        ballDrawn = true;
      }
      drawGator(ctx, p, v, time, g.controlled === p.id);
    }
    if (!ballDrawn) drawBall(ctx, g, v, time);

    drawHoop(ctx, v, 0, false);
    drawHoop(ctx, v, 1, false);
    ctx.restore();
  }

  function drawBackground(ctx, v, time) {
    const grad = ctx.createLinearGradient(0, 0, 0, v.h);
    grad.addColorStop(0, SKY_TOP);
    grad.addColorStop(0.55, SKY_BOT);
    grad.addColorStop(1, "#26361f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, v.w, v.h);

    // hanging moss / cypress silhouettes with slow parallax
    const px = -v.camX * v.zoom * 0.25;
    ctx.fillStyle = "rgba(12, 24, 14, 0.85)";
    for (let i = -2; i < 14; i++) {
      const x = ((px + i * 260) % (v.w + 520)) - 260;
      const h = 70 + ((i * 53) % 60);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 40, h);
      ctx.lineTo(x + 90, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x + 60, 0, 6, h * 0.8 + Math.sin(time + i) * 4);
    }

    // bleachers behind the court
    const top = sy(v, -140);
    const front = sy(v, -8);
    ctx.fillStyle = "#3a2a19";
    ctx.fillRect(0, top, v.w, front - top);
    for (let r = 0; r < 6; r++) {
      const y = top + ((front - top) / 6) * r;
      ctx.fillStyle = r % 2 ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.04)";
      ctx.fillRect(0, y, v.w, (front - top) / 6);
      // crowd dots
      for (let i = 0; i < v.w / 22; i++) {
        const seed = r * 97 + i * 31;
        const bob = Math.sin(time * 3 + seed) * 2;
        ctx.fillStyle = ["#c7d68a", "#e0761f", "#8fbf6a", "#d9c27a", "#6f9f5e"][seed % 5];
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(11 + i * 22 + (r % 2) * 8, y + 8 + bob, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawFloor(ctx, v) {
    const y0 = sy(v, 0);
    const y1 = sy(v, WORLD.d);
    const x0 = sx(v, 0);
    const x1 = sx(v, WORLD.w);
    const grad = ctx.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, FLOOR_A);
    grad.addColorStop(1, FLOOR_B);
    ctx.fillStyle = grad;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    // plank lines
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD.w; x += 60) {
      ctx.beginPath();
      ctx.moveTo(sx(v, x), y0);
      ctx.lineTo(sx(v, x), y1);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    for (let y = 0; y < WORLD.d; y += 40) ctx.fillRect(x0, sy(v, y), x1 - x0, 2);

    // markings
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3 * v.zoom;
    ctx.strokeRect(x0 + 6, y0 + 4, x1 - x0 - 12, y1 - y0 - 8);
    ctx.beginPath();
    ctx.moveTo(sx(v, WORLD.w / 2), y0);
    ctx.lineTo(sx(v, WORLD.w / 2), y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(sx(v, WORLD.w / 2), (y0 + y1) / 2, 90 * v.zoom, 52 * v.zoom, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (const t of [0, 1]) {
      const hx = hoopX(t);
      const dir = t === 0 ? -1 : 1;
      ctx.beginPath();
      ctx.ellipse(sx(v, hx + dir * 30), (y0 + y1) / 2, 470 * v.zoom, (WORLD.d / 2 - 6) * v.zoom * 0.58, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(
        sx(v, t === 0 ? hx - 250 : hx + 30),
        sy(v, WORLD.d * 0.22),
        220 * v.zoom,
        WORLD.d * 0.56 * v.zoom * 0.58,
      );
    }
    // center logo
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#d7e8a8";
    ctx.font = `bold ${34 * v.zoom}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.fillText("GATOR JAM", sx(v, WORLD.w / 2), (y0 + y1) / 2 + 10 * v.zoom);
    ctx.restore();
  }

  function drawHoop(ctx, v, team, behind) {
    const hx = hoopX(team);
    const cy = WORLD.d / 2;
    const dir = team === 0 ? 1 : -1;
    const bx = sx(v, hx + dir * 40);
    const rimY = sy(v, cy, HOOP.z);
    const poleBase = sy(v, cy);
    if (behind) {
      // pole + backboard
      ctx.strokeStyle = "#5a5f52";
      ctx.lineWidth = 8 * v.zoom;
      ctx.beginPath();
      ctx.moveTo(bx + dir * 26 * v.zoom, poleBase);
      ctx.lineTo(bx + dir * 26 * v.zoom, rimY - 40 * v.zoom);
      ctx.stroke();
      ctx.fillStyle = "rgba(240, 246, 230, 0.9)";
      ctx.fillRect(bx + dir * 12 * v.zoom, rimY - 62 * v.zoom, 10 * v.zoom, 62 * v.zoom);
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(bx - 34 * v.zoom * dir, rimY - 66 * v.zoom, 46 * v.zoom * dir, 62 * v.zoom);
      ctx.strokeStyle = "#e0761f";
      ctx.lineWidth = 3 * v.zoom;
      ctx.strokeRect(bx - 34 * v.zoom * dir, rimY - 66 * v.zoom, 46 * v.zoom * dir, 62 * v.zoom);
      return;
    }
    // rim + net
    ctx.strokeStyle = "#e0761f";
    ctx.lineWidth = 5 * v.zoom;
    ctx.beginPath();
    ctx.ellipse(sx(v, hx), rimY, 30 * v.zoom, 11 * v.zoom, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(sx(v, hx) + Math.cos(a) * 30 * v.zoom, rimY + Math.sin(a) * 11 * v.zoom);
      ctx.lineTo(sx(v, hx) + Math.cos(a) * 12 * v.zoom, rimY + 34 * v.zoom);
      ctx.stroke();
    }
  }

  function drawBall(ctx, g, v, time) {
    const b = g.ball;
    const x = sx(v, b.x);
    const y = sy(v, b.y, b.z);
    const r = 11 * v.zoom * (0.9 + (b.y / WORLD.d) * 0.2);
    const onFire = b.holder !== null && g.players[b.holder].onFire;
    if (onFire || b.flight) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = onFire ? "#ff8b1f" : "rgba(255,235,180,0.5)";
      ctx.beginPath();
      ctx.arc(x, y, r * (2.1 + Math.sin(time * 18) * 0.25), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#d8752a";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a1d08";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
  }

  function drawGator(ctx, p, v, time, active) {
    const c = TEAM_COLORS[p.team];
    const s = v.zoom * (0.85 + (p.y / WORLD.d) * 0.35);
    const x = sx(v, p.x);
    const y = sy(v, p.y, p.z);
    const run = Math.hypot(p.vx, p.vy) > 30 ? Math.sin(time * 14) : 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(p.face * s, s);
    if (p.stun > 0) ctx.rotate(Math.sin(time * 30) * 0.12);

    if (p.onFire) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 5; i++) {
        const fh = 40 + Math.sin(time * 12 + i) * 16;
        ctx.fillStyle = i % 2 ? "#ffb43d" : "#ff6a1a";
        ctx.beginPath();
        ctx.ellipse(-14 + i * 7, -34, 9, fh * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // tail
    ctx.fillStyle = c.body;
    ctx.beginPath();
    ctx.moveTo(-10, -30);
    ctx.quadraticCurveTo(-46, -26 + run * 3, -58, -6);
    ctx.quadraticCurveTo(-38, -18, -8, -18);
    ctx.closePath();
    ctx.fill();

    // legs
    ctx.strokeStyle = c.body;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-6, -16);
    ctx.lineTo(-8 + run * 7, 0);
    ctx.moveTo(6, -16);
    ctx.lineTo(8 - run * 7, 0);
    ctx.stroke();

    // body
    ctx.fillStyle = c.jersey;
    ctx.beginPath();
    ctx.ellipse(0, -30, 15, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.belly;
    ctx.beginPath();
    ctx.ellipse(2, -24, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.trim;
    ctx.fillRect(-15, -34, 30, 3);

    // arms
    ctx.strokeStyle = c.body;
    ctx.lineWidth = 6;
    const armUp = p.airborne || p.charging || p.dunking > 0;
    ctx.beginPath();
    ctx.moveTo(4, -40);
    if (armUp) ctx.lineTo(18, -62);
    else ctx.lineTo(16, -30 + run * 5);
    ctx.moveTo(-4, -40);
    if (armUp) ctx.lineTo(8, -60);
    else ctx.lineTo(-14, -30 - run * 5);
    ctx.stroke();

    // head
    ctx.fillStyle = c.body;
    ctx.beginPath();
    ctx.ellipse(2, -52, 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    // snout
    ctx.beginPath();
    ctx.moveTo(8, -58);
    ctx.quadraticCurveTo(34, -56, 34, -49);
    ctx.quadraticCurveTo(30, -44, 8, -46);
    ctx.closePath();
    ctx.fill();
    // teeth
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(14 + i * 5, -49);
      ctx.lineTo(17 + i * 5, -49);
      ctx.lineTo(15.5 + i * 5, -45);
      ctx.closePath();
      ctx.fill();
    }
    // eyes
    ctx.fillStyle = "#f6ffe8";
    ctx.beginPath();
    ctx.arc(6, -62, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#12200f";
    ctx.beginPath();
    ctx.arc(8, -62, 3, 0, Math.PI * 2);
    ctx.fill();
    // headband
    ctx.fillStyle = c.jersey;
    ctx.fillRect(-10, -60, 20, 4);
    ctx.restore();

    if (active) {
      ctx.save();
      ctx.strokeStyle = "#ffe07a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y - 82 * s);
      ctx.lineTo(x - 8 * s, y - 94 * s);
      ctx.lineTo(x + 8 * s, y - 94 * s);
      ctx.closePath();
      ctx.fillStyle = "#ffe07a";
      ctx.fill();
      ctx.restore();
    }
  }

  // ============================================================
  // MOUNT — wires the engine + renderer to the DOM: builds the
  // canvas, HUD, touch controls, keyboard input and the
  // fullscreen button, then runs the game loop.
  // ============================================================

  function el(tag, style, parent) {
    const e = document.createElement(tag);
    if (style) Object.assign(e.style, style);
    if (parent) parent.appendChild(e);
    return e;
  }

  async function requestFullscreen(target) {
    try {
      if (!document.fullscreenElement && target.requestFullscreen) {
        await target.requestFullscreen({ navigationUI: "hide" });
      } else if (!document.fullscreenElement && target.webkitRequestFullscreen) {
        // Safari / older WebKit
        await target.webkitRequestFullscreen();
      }
    } catch (e) {
      // Fullscreen is optional; the game still fills the viewport via CSS.
    }
  }

  function exitFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen)
        document.webkitExitFullscreen();
    } catch (e) {
      // ignore
    }
  }

  function mount(container, opts) {
    container = container || document.body;
    opts = opts || {};

    // --- root wrapper: always fills the viewport, fullscreen or not ---
    const wrap = el("div", {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100dvh",
      overflow: "hidden",
      background: "#182a1d",
      userSelect: "none",
      WebkitUserSelect: "none",
      touchAction: "none",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    }, container);

    const canvas = el("canvas", { display: "block", width: "100%", height: "100%" }, wrap);
    const ctx = canvas.getContext("2d");

    // --- fullscreen toggle button ---
    const fsBtn = el("button", {
      position: "absolute",
      top: "10px",
      right: "10px",
      zIndex: "20",
      width: "40px",
      height: "40px",
      borderRadius: "10px",
      border: "2px solid rgba(224,118,31,0.85)",
      background: "rgba(20,30,20,0.72)",
      color: "#f2f7e4",
      fontSize: "18px",
      lineHeight: "1",
      cursor: "pointer",
    }, wrap);
    fsBtn.textContent = "⛶";
    fsBtn.title = "Toggle fullscreen";
    fsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (document.fullscreenElement || document.webkitFullscreenElement) exitFullscreen();
      else requestFullscreen(wrap);
    });

    // --- scoreboard ---
    const board = el("div", {
      position: "absolute",
      left: "0",
      right: "0",
      top: "0",
      display: "flex",
      justifyContent: "center",
      padding: "8px",
      pointerEvents: "none",
      zIndex: "10",
    }, wrap);
    const boardInner = el("div", {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      borderRadius: "12px",
      border: "2px solid rgba(224,118,31,0.7)",
      background: "rgba(20,30,20,0.9)",
      padding: "8px 16px",
      fontSize: "18px",
      letterSpacing: "0.08em",
      color: "#eaf6d8",
      boxShadow: "0 4px 10px rgba(0,0,0,0.4)",
    }, board);
    const homeEl = el("span", { color: "#7ec24a", fontWeight: "900" }, boardInner);
    const clockEl = el("span", {
      background: "rgba(224,118,31,0.2)",
      borderRadius: "4px",
      padding: "1px 8px",
    }, boardInner);
    const awayEl = el("span", { color: "#c76fe0", fontWeight: "900" }, boardInner);

    // --- turbo meter ---
    const turboWrap = el("div", {
      position: "absolute",
      left: "12px",
      top: "70px",
      width: "120px",
      zIndex: "10",
      pointerEvents: "none",
    }, wrap);
    el("div", {
      fontSize: "10px",
      letterSpacing: "0.15em",
      color: "rgba(234,246,216,0.8)",
      marginBottom: "4px",
    }, turboWrap).textContent = "TURBO";
    const turboTrack = el("div", {
      height: "10px",
      borderRadius: "999px",
      border: "1px solid rgba(224,118,31,0.6)",
      background: "rgba(20,30,20,0.8)",
      overflow: "hidden",
    }, turboWrap);
    const turboFill = el("div", {
      height: "100%",
      width: "100%",
      background: "#5d8b3a",
      transition: "width 0.1s linear, background 0.15s linear",
    }, turboTrack);

    // --- flash text ---
    const flashEl = el("div", {
      position: "absolute",
      left: "0",
      right: "0",
      top: "25%",
      textAlign: "center",
      pointerEvents: "none",
      zIndex: "10",
      fontWeight: "900",
      letterSpacing: "0.06em",
      color: "#ff6a1a",
      textShadow: "0 3px 0 rgba(0,0,0,0.6)",
      display: "none",
    }, wrap);

    // --- title / game-over overlay ---
    const overlay = el("div", {
      position: "absolute",
      inset: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "16px",
      padding: "24px",
      textAlign: "center",
      background: "rgba(20,30,20,0.85)",
      backdropFilter: "blur(2px)",
      zIndex: "30",
    }, wrap);
    const titleEl = el("h1", {
      fontSize: "clamp(2rem, 8vw, 4.5rem)",
      fontWeight: "900",
      letterSpacing: "-0.02em",
      color: "#ff6a1a",
      textShadow: "0 4px 0 rgba(0,0,0,0.6)",
      margin: "0",
    }, overlay);
    titleEl.textContent = "GATOR JAM";
    const subEl = el("p", {
      maxWidth: "480px",
      fontSize: "14px",
      lineHeight: "1.6",
      color: "rgba(234,246,216,0.85)",
      margin: "0",
    }, overlay);
    const startBtn = el("button", {
      borderRadius: "12px",
      border: "2px solid #ff6a1a",
      background: "#ff6a1a",
      color: "#182a1d",
      fontWeight: "900",
      fontSize: "18px",
      padding: "12px 32px",
      cursor: "pointer",
    }, overlay);

    // --- touch joystick + buttons ---
    // Sizes use clamp() so the whole control cluster shrinks to fit
    // narrow phone screens instead of the stick and buttons overlapping.
    const stick = el("div", {
      position: "absolute",
      bottom: "clamp(8px, 3vw, 16px)",
      left: "clamp(8px, 3vw, 16px)",
      height: "clamp(88px, 26vw, 128px)",
      width: "clamp(88px, 26vw, 128px)",
      borderRadius: "50%",
      border: "2px solid rgba(224,118,31,0.5)",
      background: "rgba(20,30,20,0.5)",
      zIndex: "15",
      display: "none",
      touchAction: "none",
    }, wrap);
    const knob = el("div", {
      position: "absolute",
      left: "50%",
      top: "50%",
      height: "44%",
      width: "44%",
      borderRadius: "50%",
      background: "rgba(93,139,58,0.9)",
      transform: "translate(-50%, -50%)",
      pointerEvents: "none",
    }, stick);

    const btnRow = el("div", {
      position: "absolute",
      bottom: "clamp(10px, 3.5vw, 20px)",
      right: "clamp(8px, 3vw, 16px)",
      display: "none",
      alignItems: "flex-end",
      gap: "clamp(6px, 2vw, 12px)",
      zIndex: "15",
    }, wrap);
    function touchBtn(size, bg, border, label) {
      const b = el("button", {
        height: size,
        width: size,
        borderRadius: "50%",
        border: `2px solid ${border}`,
        background: bg,
        color: "#eaf6d8",
        fontSize: "clamp(9px, 2.4vw, 11px)",
        fontWeight: "700",
        touchAction: "none",
        flex: "none",
      }, btnRow);
      b.innerHTML = label;
      return b;
    }
    const turboBtn = touchBtn("clamp(46px, 14vw, 64px)", "rgba(20,30,20,0.7)", "rgba(224,118,31,0.6)", "TURBO");
    const actionBtn = touchBtn("clamp(56px, 17vw, 80px)", "rgba(138,63,176,0.7)", "rgba(224,118,31,0.6)", "PASS/<br>SHOVE");
    const shootBtn = touchBtn("clamp(66px, 20vw, 96px)", "rgba(255,106,26,0.8)", "#ff6a1a", "JUMP/<br>SHOOT");

    // ================= game state / input =================
    let gameState = createGame();
    const intent = { mx: 0, my: 0, turbo: false, shoot: false, action: false, shootTouch: false, actionTouch: false, turboTouch: false };
    const keys = {};
    const stickState = { id: -1, targetX: 0, targetY: 0, dx: 0, dy: 0 };
    let phase = "title"; // "title" | "playing" | "over"

    function setPhase(p) {
      phase = p;
      if (p === "playing") {
        overlay.style.display = "none";
        stick.style.display = "block";
        btnRow.style.display = "flex";
      } else {
        overlay.style.display = "flex";
        stick.style.display = "none";
        btnRow.style.display = "none";
        if (p === "over") {
          const home = gameState.score[0];
          const away = gameState.score[1];
          subEl.textContent =
            (home > away ? "GATORS WIN!" : home === away ? "DEAD HEAT!" : "RIVALS TAKE IT") +
            ` ${home}-${away}`;
          startBtn.textContent = "REMATCH";
        }
      }
    }

    function start() {
      gameState = createGame();
      setPhase("playing");
      requestFullscreen(wrap);
    }

    subEl.innerHTML =
      "2-on-2 swamp hoops. Drain three in a row to catch fire, get close to slam it.<br>" +
      '<span style="color:#7ec24a">Keys:</span> arrows/WASD move &middot; SPACE jump &amp; shoot &middot; J pass / shove &middot; SHIFT turbo';
    startBtn.textContent = "TIP OFF";
    startBtn.addEventListener("click", start);

    // keyboard
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      keys[k] = true;
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if (e.key === " " && phase !== "playing") start();
    };
    const onKeyUp = (e) => {
      keys[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // touch joystick
    function updateStickTarget(cx, cy) {
      const r = stick.getBoundingClientRect();
      const radius = Math.max(1, Math.min(r.width, r.height) / 2 - 18);
      let dx = cx - (r.left + r.width / 2);
      let dy = cy - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      const nx = dx / radius;
      const ny = dy / radius;
      const magnitude = Math.hypot(nx, ny);
      const deadZone = 0.1;
      const response = magnitude <= deadZone ? 0 : Math.min(1, (magnitude - deadZone) / (1 - deadZone));
      const eased = response * response * (3 - 2 * response);
      stickState.targetX = magnitude === 0 ? 0 : (nx / magnitude) * eased;
      stickState.targetY = magnitude === 0 ? 0 : (ny / magnitude) * eased;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
    stick.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      stickState.id = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      updateStickTarget(e.clientX, e.clientY);
    });
    stick.addEventListener("pointermove", (e) => {
      if (stickState.id !== e.pointerId) return;
      e.preventDefault();
      updateStickTarget(e.clientX, e.clientY);
    });
    function stickEnd(e) {
      if (stickState.id !== e.pointerId) return;
      stickState.id = -1;
      stickState.targetX = 0;
      stickState.targetY = 0;
      knob.style.transform = "translate(-50%, -50%)";
      try {
        stick.releasePointerCapture(e.pointerId);
      } catch (err) {
        /* already released */
      }
    }
    stick.addEventListener("pointerup", stickEnd);
    stick.addEventListener("pointercancel", stickEnd);

    function bindTouchBtn(btn, key) {
      const down = (e) => {
        e.preventDefault();
        intent[key] = true;
      };
      const up = () => {
        intent[key] = false;
      };
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointerleave", up);
      btn.addEventListener("pointercancel", up);
    }
    bindTouchBtn(turboBtn, "turboTouch");
    bindTouchBtn(actionBtn, "actionTouch");
    bindTouchBtn(shootBtn, "shootTouch");

    // resize
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("fullscreenchange", resize);
    document.addEventListener("webkitfullscreenchange", resize);

    // ================= main loop =================
    let raf = 0;
    let last = performance.now();
    let hudTick = 0;
    setPhase("title");

    function loop(now) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      // smooth the analog stick
      const stickEase = 1 - Math.exp(-18 * dt);
      stickState.dx += (stickState.targetX - stickState.dx) * stickEase;
      stickState.dy += (stickState.targetY - stickState.dy) * stickEase;
      if (Math.abs(stickState.dx) < 0.004 && Math.abs(stickState.targetX) < 0.004) stickState.dx = 0;
      if (Math.abs(stickState.dy) < 0.004 && Math.abs(stickState.targetY) < 0.004) stickState.dy = 0;

      const kx = (keys["arrowright"] || keys["d"] ? 1 : 0) - (keys["arrowleft"] || keys["a"] ? 1 : 0);
      const ky = (keys["arrowdown"] || keys["s"] ? 1 : 0) - (keys["arrowup"] || keys["w"] ? 1 : 0);
      intent.mx = kx !== 0 ? kx : stickState.dx;
      intent.my = ky !== 0 ? ky : stickState.dy;
      intent.turbo = !!keys["shift"] || !!keys["z"] || !!intent.turboTouch;
      intent.shoot = !!keys[" "] || !!keys["k"] || !!intent.shootTouch;
      intent.action = !!keys["j"] || !!keys["f"] || !!intent.actionTouch;

      if (phase === "playing") {
        step(gameState, dt, intent);
        if (gameState.over) setPhase("over");
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      draw(ctx, gameState, makeView(gameState, w, h), now / 1000);

      hudTick += dt;
      if (hudTick > 0.1) {
        hudTick = 0;
        const me = gameState.players[gameState.controlled];
        homeEl.textContent = "GATORS " + gameState.score[0];
        awayEl.textContent = gameState.score[1] + " RIVALS";
        const mm = Math.floor(gameState.clock / 60);
        const ss = Math.floor(gameState.clock % 60);
        clockEl.textContent = mm + ":" + String(ss).padStart(2, "0");
        turboFill.style.width = me.turbo * 100 + "%";
        turboFill.style.background = me.onFire ? "#ff8b1f" : "#5d8b3a";

        const f = gameState.flashes[gameState.flashes.length - 1];
        if (f && f.t < 1.2 && phase === "playing") {
          flashEl.style.display = "block";
          flashEl.style.fontSize = f.big ? "clamp(1.25rem, 6vw, 3.5rem)" : "clamp(1rem, 3.5vw, 1.75rem)";
          flashEl.textContent = f.text;
        } else {
          flashEl.style.display = "none";
        }
      }
    }
    raf = requestAnimationFrame(loop);

    return {
      destroy() {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("resize", resize);
        document.removeEventListener("fullscreenchange", resize);
        document.removeEventListener("webkitfullscreenchange", resize);
        wrap.remove();
      },
      requestFullscreen: () => requestFullscreen(wrap),
      exitFullscreen,
      get phase() {
        return phase;
      },
    };
  }

  // ============================================================
  // Auto-mount on load, unless the host page opts out by setting
  // `window.GATOR_JAM_NO_AUTO_MOUNT = true` before this script runs.
  // ============================================================
  function autoMount() {
    if (window.GATOR_JAM_NO_AUTO_MOUNT) return;
    const target = document.getElementById("gator-jam-root") || document.body;
    mount(target);
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", autoMount);
    } else {
      autoMount();
    }
  }

  return { mount, createGame, step, draw, makeView, WORLD, HOOP, GAME_SECONDS };
});
