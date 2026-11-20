// PROTOTYPE - NOT FOR PRODUCTION
// Question: Does it feel like real snooker, both in how the balls behave and in a frame against a computer that plays like a real opponent at each difficulty?
// Date: 2026-11-19
// Long Pot snooker: the balls and spots, the rules of a frame (reds and colours, fouls, re-spots,
// free ball, the re-spotted black), training-level setup and goals, and the computer opponent,
// which plans with the same physics the player's shots use.
'use strict';
(function () {
  const { SPEC, Sim } = window.LP;
  const R = SPEC.R, HL = SPEC.L / 2, HW = SPEC.W / 2;
  const BAULK_X = -HL + 0.737, D_R = 0.292;

  // Ball ids: 0 cue, 1-15 reds, 16-21 yellow green brown blue pink black.
  const N = 22;
  const COLOURS = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'];
  const VALUE = { red: 1, yellow: 2, green: 3, brown: 4, blue: 5, pink: 6, black: 7 };
  const KIND = ['cue'];
  for (let i = 1; i <= 15; i++) KIND.push('red');
  KIND.push(...COLOURS);
  const ID = { yellow: 16, green: 17, brown: 18, blue: 19, pink: 20, black: 21 };
  const SPOT = {
    yellow: [BAULK_X, -D_R], green: [BAULK_X, D_R], brown: [BAULK_X, 0],
    blue: [0, 0], pink: [HL / 2, 0], black: [HL - 0.324, 0],
  };
  const val = i => VALUE[KIND[i]] || 0;
  const isRed = i => i >= 1 && i <= 15;
  const isColour = i => i >= 16 && i <= 21;
  const NAME = { cue: 'Cue ball', red: 'Red', yellow: 'Yellow', green: 'Green', brown: 'Brown', blue: 'Blue', pink: 'Pink', black: 'Black' };

  /** Inside the D: behind the baulk line, within its radius of the brown spot. */
  function inD(x, y) { return x <= BAULK_X && (x - BAULK_X) ** 2 + y * y <= D_R * D_R; }
  function clampD(x, y) {
    if (x > BAULK_X) x = BAULK_X;
    const dx = x - BAULK_X, d = Math.hypot(dx, y), lim = D_R - 1e-4;
    if (d > lim) { x = BAULK_X + dx / d * lim; y = y / d * lim; }
    return [x, y];
  }

  /** The full rack: 15 reds in a triangle behind the pink, colours on their spots. */
  function rack(sim) {
    for (let i = 0; i < N; i++) sim.remove(i);
    const gap = 2 * R + 0.0002, x0 = SPOT.pink[0] + 2 * R + 0.002;
    let id = 1;
    for (let row = 0; row < 5; row++) for (let j = 0; j <= row; j++) {
      sim.place(id++, x0 + row * gap * Math.sqrt(3) / 2, (j - row / 2) * gap);
    }
    for (const c of COLOURS) sim.place(ID[c], SPOT[c][0], SPOT[c][1]);
  }

  /** Puts a colour back (Section 3 Rule 7): its own spot, else the highest value spot free, else
   *  as near its own spot as it fits between the spot and the top cushion, else (Pink and Black,
   *  Rule 7(h)) as near its own spot as it fits on the line below it. */
  function respot(sim, i) {
    const c = KIND[i];
    const tryAt = (x, y) => { if (sim.free(x, y, i)) { sim.place(i, x, y); return true; } return false; };
    if (tryAt(...SPOT[c])) return;
    for (let k = COLOURS.length - 1; k >= 0; k--) if (tryAt(...SPOT[COLOURS[k]])) return;
    for (let d = 0.001; SPOT[c][0] + d < HL - R; d += 0.001) if (tryAt(SPOT[c][0] + d, SPOT[c][1])) return;
    for (let d = 0.001; SPOT[c][0] - d > -HL + R; d += 0.001) if (tryAt(SPOT[c][0] - d, SPOT[c][1])) return;
  }
  /** Several colours to spot at once: the highest value goes first (Rule 7(f)). */
  function respotAll(sim, list) {
    for (const i of list.slice().sort((A, B) => val(B) - val(A))) respot(sim, i);
  }

  /** Is the straight path of the cue ball's centre to a contact on ball t clear of other balls?
   *  off: where on t, from -1 (one extreme edge) through 0 (full ball) to 1 (the other edge).
   *  skip: balls that do not count as obstructions. */
  function contactClear(sim, t, off, skip) {
    const cx = sim.x[0], cy = sim.y[0], dx = sim.x[t] - cx, dy = sim.y[t] - cy, d = Math.hypot(dx, dy);
    if (d <= 2 * R + 1e-6) return true;
    const lat = off * 2 * R * 0.999, phi = Math.asin(Math.max(-1, Math.min(1, lat / d)));
    const len = d * Math.cos(phi) - Math.sqrt(Math.max(0, 4 * R * R - lat * lat)), a = Math.atan2(dy, dx) + phi;
    return pathClear(sim, cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, [0, t].concat(skip || []), 2 * R - 2e-4);
  }
  const OFFS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  /** Rule 14(c): a clear straight path to any part of ball t. */
  function anyPartClear(sim, t) { return OFFS.some(o => contactClear(sim, t, o)); }
  /** Rule 14(d): full-ball contact available on t: its centre for a colour; for a Red, its full
   *  diameter clear of the colours (other Reds do not count). */
  function fullBallClear(sim, t) {
    if (!isRed(t)) return contactClear(sim, t, 0);
    const reds = []; for (let i = 1; i <= 15; i++) reds.push(i);
    return OFFS.every(o => contactClear(sim, t, o, reds));
  }

  /** The cue ball can reach both edges of ball t in straight lines (no ball in the way, other
   *  than those in skip). */
  function bothEdgesClear(sim, t, skip) {
    const cx = sim.x[0], cy = sim.y[0], dx = sim.x[t] - cx, dy = sim.y[t] - cy, d = Math.hypot(dx, dy);
    if (d <= 2 * R + 1e-6) return true;
    const base = Math.atan2(dy, dx), off = Math.asin(Math.min(1, 2 * R / d)), len = Math.sqrt(Math.max(0, d * d - 4 * R * R));
    for (const s of [-1, 1]) {
      const a = base + s * off * 0.999, ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len;
      if (!pathClear(sim, cx, cy, ex, ey, [0, t].concat(skip || []), 2 * R - 2e-4)) return false;
    }
    return true;
  }
  /** No ball (other than skip) comes within clearance of the segment. */
  function pathClear(sim, ax, ay, bx, by, skip, clearance) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12, c2 = clearance * clearance;
    for (let k = 0; k < sim.n; k++) {
      if (!sim.on[k] || skip.includes(k)) continue;
      let t = ((sim.x[k] - ax) * dx + (sim.y[k] - ay) * dy) / L2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const px = ax + dx * t - sim.x[k], py = ay + dy * t - sim.y[k];
      if (px * px + py * py < c2) return false;
    }
    return true;
  }

  // ---- The frame: who is on what, and how each shot is judged --------------------------------
  class Frame {
    constructor(solo) {
      this.solo = solo; // training: one player, a miss keeps the turn
      this.scores = [0, 0]; this.player = 0; this.brk = 0; this.high = [0, 0];
      this.phase = 'red'; this.freeBall = false; this.inHand = true; this.over = false; this.winner = -1;
      this.canPutBack = false; this.offender = -1; this.blackRespot = false; this.lastShot = null;
      // Foul and a Miss (Section 3 Rule 14): the last foul was a miss, so the balls may be put
      // back; missRun counts misses in a row from the same position with full-ball contact
      // available; warned: the next such miss loses the frame.
      this.canReplace = false; this.missRun = 0; this.warned = false;
    }
    redsOn(sim) { let n = 0; for (let i = 1; i <= 15; i++) if (sim.on[i]) n++; return n; }
    lowest(sim) { for (const c of COLOURS) if (sim.on[ID[c]]) return c; return null; }
    startPhase(sim) { this.phase = this.redsOn(sim) > 0 ? 'red' : (this.lowest(sim) || 'black'); }
    /** Balls the striker may hit first. */
    targets(sim) {
      const out = [];
      for (let i = 1; i < N; i++) {
        if (!sim.on[i]) continue;
        if (this.freeBall) { out.push(i); continue; }
        if (this.phase === 'red' ? isRed(i) : this.phase === 'colour' ? isColour(i) : KIND[i] === this.phase) out.push(i);
      }
      return out;
    }
    onText() {
      const p = this.phase === 'red' ? 'Red' : this.phase === 'colour' ? 'Any colour' : NAME[this.phase];
      return this.freeBall ? `Free ball (${p})` : p;
    }
    pointsLeft(sim) {
      let s = this.redsOn(sim) * 8 + (this.phase === 'colour' ? 7 : 0);
      for (const c of COLOURS) if (sim.on[ID[c]]) s += VALUE[c];
      return s;
    }
    /** Judges a finished shot. rec: the sim's record. ctx (the game's, optional): what the
     *  table was like when the shot was struck, for the touching-ball and miss rules:
     *  { touchOn, push, pushBall, clear, full, attemptOK, needBefore, replay, declared }.
     *  Mutates the frame and re-spots on sim. */
    judge(sim, rec, ctx) {
      const phase = this.phase, fb = this.freeBall, me = this.player, other = 1 - me;
      const first = rec.firstHit, pots = rec.potted.filter(i => i !== 0);
      let foul = false, fv = 4, reason = '', hitFail = false;
      const bump = (v, why) => { foul = true; if (v > fv || !reason) { fv = Math.max(fv, v); reason = reason || why; } };
      // the ball on's value; after a Red the colour is nominated by the first colour hit, or by
      // the colour the cue was aimed at; with none, a foul is 7 (Rule 11(d)(vi))
      const declared = ctx && ctx.declared >= 0 && isColour(ctx.declared) ? ctx.declared : -1;
      const onVal = phase === 'red' ? 1 : phase === 'colour' ? (first > 0 && isColour(first) ? val(first) : declared >= 0 ? val(declared) : 7) : VALUE[phase];
      let nominee = -1; // the colour nominated (after a red) or the free ball
      if (first < 0) {
        // playing away from a touching ball on is not a foul (Rule 8(c))
        if (!(ctx && ctx.touchOn)) { bump(onVal, 'Missed every ball'); hitFail = true; }
      } else if (phase === 'red') {
        if (isRed(first)) { /* legal */ } else if (fb) nominee = first; else { bump(Math.max(onVal, val(first)), `Hit the ${NAME[KIND[first]].toLowerCase()} first`); hitFail = true; }
      } else if (phase === 'colour') {
        // a Red straight after a Red: playing at Reds in successive strokes, 7 (Rule 11(d)(iii))
        if (isColour(first)) nominee = first; else { bump(7, 'Hit a red after a red'); hitFail = true; }
      } else if (KIND[first] !== phase) {
        if (fb) nominee = first; else { bump(Math.max(onVal, val(first)), `Hit the ${NAME[KIND[first]].toLowerCase()} first`); hitFail = true; }
      }
      // moving a touching ball with the stroke is a push stroke (Rules 8(b), 11(b)(v))
      if (ctx && ctx.push) bump(Math.max(onVal, val(ctx.pushBall)), 'Push stroke on a touching ball');
      let pts = 0;
      for (const b of pots) {
        let legal;
        if (phase === 'red') legal = isRed(b) || b === nominee;
        else if (phase === 'colour') legal = b === nominee;
        else legal = KIND[b] === phase || b === nominee;
        if (!legal) bump(Math.max(onVal, val(b)), `Potted the ${NAME[KIND[b]].toLowerCase()}`);
        else if (phase === 'red') pts += 1;
        else if (phase === 'colour') pts = val(nominee);
        else pts = VALUE[phase];
      }
      if (rec.cuePotted) bump(onVal, 'In-off');

      // re-spots: colours go back unless legally potted in the final sequence; the highest
      // value first (Rule 7(f))
      const back = [];
      for (const b of pots) {
        if (!isColour(b)) continue;
        const legalFinal = !foul && phase !== 'red' && phase !== 'colour' && (KIND[b] === phase && b !== nominee);
        if (!legalFinal) back.push(b);
      }
      respotAll(sim, back);
      // a free ball must not leave the opponent snookered behind it after a non-scoring stroke,
      // unless only two object balls remain (Rule 12(b)(ii), as updated in 2022)
      if (fb && nominee >= 0 && !foul && pts === 0 && !rec.cuePotted && this.objectBalls(sim) > 2) {
        const f = Object.assign(Object.create(Frame.prototype), { phase: this.redsOn(sim) > 0 ? 'red' : phase, freeBall: false });
        const tg = f.targets(sim);
        if (tg.length && !tg.some(t => bothEdgesClear(sim, t, tg)) && tg.some(t => bothEdgesClear(sim, t, tg.concat([nominee])))) {
          bump(Math.max(4, onVal), 'Snookered the opponent behind the free ball');
        }
      }
      fv = Math.min(7, fv);
      const res = { foul, foulPts: foul ? fv : 0, reason, pts: foul ? 0 : pts, potted: pots.slice(), player: me, phase, frameOver: false };

      this.freeBall = false; this.canPutBack = false; this.canReplace = false;
      if (foul) {
        if (!this.solo) this.scores[other] += fv;
        this.high[me] = Math.max(this.high[me], this.brk); this.brk = 0;
        this.inHand = rec.cuePotted;
        if (phase !== 'red' && phase !== 'colour' && phase === 'black' && !this.blackRespot) {
          // a foul on the last black ends the frame
          if (this.endFrame(sim)) { res.frameOver = true; return res; }
        }
        if (phase === 'black' && this.blackRespot) { this.over = true; this.winner = other; res.frameOver = true; return res; }
        this.startPhase(sim);
        // Foul and a Miss (Rule 14): failing to hit a ball on first is a miss, unless a player
        // needed snookers before or after the stroke, or (snookered) it was a fair attempt; a
        // repeat from the original position with full-ball contact available is a miss whatever
        // the scores, and after a Warning a further one loses the frame
        let miss = false;
        if (!this.solo && ctx && hitFail) {
          const needAfter = Math.abs(this.scores[0] - this.scores[1]) > this.pointsLeft(sim);
          if (ctx.replay && this.missRun > 0) miss = true;
          else if (ctx.needBefore || needAfter) miss = false;
          else if (ctx.clear) miss = true;
          else miss = !ctx.attemptOK;
        }
        if (miss && ctx.full) {
          this.missRun = (ctx.replay ? this.missRun : 0) + 1;
          if (this.warned && ctx.replay) { this.over = true; this.winner = other; res.miss = true; res.threeMiss = true; res.frameOver = true; return res; }
        } else { this.missRun = 0; this.warned = false; }
        res.miss = miss;
        if (!this.solo) { this.offender = me; this.player = other; this.canPutBack = true; this.canReplace = miss; }
        if (!this.solo) this.freeBall = this.snookered(sim);
        res.freeBall = this.freeBall;
        return res;
      }
      this.missRun = 0; this.warned = false;
      this.inHand = false;
      if (pts > 0) {
        this.scores[me] += pts; this.brk += pts;
        if (phase === 'red') this.phase = 'colour';
        else if (phase === 'colour') this.phase = this.redsOn(sim) > 0 ? 'red' : 'yellow';
        else if (!sim.on[ID[phase]]) { // the ball on went down (a potted free ball alone leaves it on)
          if (phase === 'black') { if (this.endFrame(sim)) { res.frameOver = true; return res; } }
          else this.phase = COLOURS[COLOURS.indexOf(phase) + 1];
        }
        res.continue = true;
        return res;
      }
      // a fair miss: the turn passes
      this.high[me] = Math.max(this.high[me], this.brk); this.brk = 0;
      if (phase === 'colour') this.phase = this.redsOn(sim) > 0 ? 'red' : 'yellow';
      if (!this.solo) this.player = other;
      res.continue = false;
      return res;
    }
    /** The black is gone (or fouled with only it left): the frame ends, unless the scores are
     *  level, when the black is re-spotted and the one who plays first is drawn by lot. */
    endFrame(sim) {
      const [a, b] = this.scores;
      if (this.solo || a !== b) { this.over = true; this.winner = this.solo ? 0 : (a > b ? 0 : 1); return true; }
      respot(sim, ID.black); this.phase = 'black'; this.blackRespot = true; this.inHand = true;
      this.player = window.LP.drawLot ? window.LP.drawLot() : 0;
      return false;
    }
    /** After a foul: is the incoming player unable to hit both edges of any ball on (Section 2
     *  Rule 17)? In hand, only if so from every place in the D (17(a)). */
    snookered(sim) {
      const t = this.targets(sim);
      if (!t.length) return false;
      // only balls not on can snooker: the balls on never block each other
      if (!this.inHand) return !t.some(i => bothEdgesClear(sim, i, t));
      const x0 = sim.x[0], y0 = sim.y[0], on0 = sim.on[0];
      let blocked = true;
      for (let k = 0; k < 36 && blocked; k++) {
        const ang = Math.PI / 2 + Math.PI * (k % 12 + 0.5) / 12, rr = D_R * [0.97, 0.6, 0.25][Math.floor(k / 12)];
        const px = BAULK_X + Math.cos(ang) * rr, py = Math.sin(ang) * rr;
        if (!sim.free(px, py, 0)) continue;
        sim.x[0] = px; sim.y[0] = py; sim.on[0] = 1;
        if (t.some(i => bothEdgesClear(sim, i, t))) blocked = false;
      }
      sim.x[0] = x0; sim.y[0] = y0; sim.on[0] = on0;
      return blocked;
    }
    objectBalls(sim) { let n = 0; for (let i = 1; i < N; i++) if (sim.on[i]) n++; return n; }
    /** The non-offender plays from where the balls lie: a Foul and a Miss sequence ends. */
    playOn() { this.canPutBack = false; this.canReplace = false; this.missRun = 0; this.warned = false; }
    /** The non-offender asked the offender to play again from the position left (Rule 10(h));
     *  a Foul and a Miss sequence ends (14(d)(iii)) and a free ball is void (12(f)). */
    putBack() {
      this.player = this.offender; this.freeBall = false; this.canPutBack = false; this.canReplace = false;
      this.missRun = 0; this.warned = false;
    }
    /** After a Foul and a Miss, the non-offender asked for the balls back (Rule 14(b)): the game
     *  puts every ball where it was; the offender plays again with the ball on as it was before
     *  (before: { phase, inHand }), no free ball, and after a second miss in a row is Warned. */
    replace(before) {
      this.player = this.offender; this.freeBall = false; this.canPutBack = false; this.canReplace = false;
      this.phase = before.phase; this.inHand = before.inHand; this.brk = 0;
      if (this.missRun >= 2) this.warned = true;
    }
  }

  // ---- Training levels -----------------------------------------------------------------------
  /** Sets up a level's balls on sim from its definition. Returns the zone ring, if any. */
  function setupLevel(sim, def, table) {
    for (let i = 0; i < N; i++) sim.remove(i);
    const P = id => table.pockets[id];
    const placed = [];
    let nextRed = 1;
    for (const b of def.balls) {
      let x, y;
      if (b.spot) [x, y] = SPOT[b.kind];
      else if (b.pocket) {
        const pk = P(b.pocket), a = Math.atan2(pk.axis[1], pk.axis[0]) + (b.angle || 0) * Math.PI / 180;
        x = pk.x - Math.cos(a) * b.dist; y = pk.y - Math.sin(a) * b.dist;
      } else { x = b.x; y = b.y; }
      const id = b.kind === 'red' ? nextRed++ : ID[b.kind];
      sim.place(id, x, y); placed.push(id);
    }
    let zone = null;
    const c = def.cue;
    if (c === 'D') { sim.place(0, BAULK_X - 0.12, 0.05); }
    else if (c.ball !== undefined) {
      const t = placed[c.ball], tx = sim.x[t], ty = sim.y[t];
      let px, py;
      if (c.ghostOf !== undefined) {
        const o = placed[c.ghostOf], pk = P(c.pocket), ux = pk.x - sim.x[o], uy = pk.y - sim.y[o], ul = Math.hypot(ux, uy);
        px = sim.x[o] - ux / ul * 2 * R; py = sim.y[o] - uy / ul * 2 * R;
      } else { const pk = P(c.pocket); px = pk.x; py = pk.y; }
      const ux = px - tx, uy = py - ty, ul = Math.hypot(ux, uy), nx = ux / ul, ny = uy / ul;
      const gx = tx - nx * 2 * R, gy = ty - ny * 2 * R;
      const a = Math.atan2(ny, nx) + (c.side || 1) * (c.cut || 0) * Math.PI / 180;
      sim.place(0, gx - Math.cos(a) * c.dist, gy - Math.sin(a) * c.dist);
      if (def.goal.zone) {
        const z = def.goal.zone, back = Math.atan2(sim.y[0] - gy, sim.x[0] - gx);
        zone = { x: gx + Math.cos(back) * z.back, y: gy + Math.sin(back) * z.back, r: z.r };
      }
    } else sim.place(0, c.x, c.y);
    return { zone, placed };
  }

  // ---- The computer opponent -----------------------------------------------------------------
  const LEVELS = ['beginner', 'amateur', 'pro', 'champion'];
  const LEVEL_NAME = { beginner: 'Beginner', amateur: 'Amateur', pro: 'Pro', champion: 'Champion' };
  // How widely each level searches (shape of the search, not tuning numbers for feel).
  // safeFracs, safeSpeeds: the contacts its safeties try, as fractions of a ball's edge (a
  // beginner plays them full and firm, a pro clips them thin and soft); breakOff: D spots its break-off tries (0: no planned
  // break-off, it just hits into the pack).
  const SEARCH = {
    beginner: { cands: 3, speeds: [1.1, 1.7], spins: [0], sideCands: 0, safeTargets: 2, safeFracs: [-0.35, 0, 0.35], safeSpeeds: [1.0, 1.6], kicks: 0, robust: false, place: 4, breakOff: 0 },
    amateur: { cands: 5, speeds: [0.75, 1.2, 1.9], spins: [-0.3, 0, 0.3], sideCands: 0, safeTargets: 3, safeFracs: [-0.6, -0.3, 0, 0.3, 0.6], safeSpeeds: [0.75, 1.1, 1.6, 2.1], kicks: 12, robust: false, place: 8, breakOff: 1 },
    pro: { cands: 7, speeds: [0.6, 0.95, 1.45, 2.2], spins: [-0.42, -0.12, 0.2, 0.42], sideCands: 2, safeTargets: 5, safeFracs: [-0.9, -0.55, 0, 0.55, 0.9], safeSpeeds: [0.55, 0.9, 1.4, 2.1], kicks: 24, robust: true, place: 12, breakOff: 2 },
    champion: { cands: 8, speeds: [0.55, 0.85, 1.3, 1.95, 2.9], spins: [-0.45, -0.18, 0.15, 0.42], sideCands: 3, safeTargets: 6, safeFracs: [-0.9, -0.55, 0, 0.55, 0.9], safeSpeeds: [0.55, 0.9, 1.4, 2.1], kicks: 36, robust: true, place: 16, breakOff: 2 },
  };
  /** A level's aim error (radians, 1 sigma) for one stroke: wider the harder it is struck, the
   *  further the tip is from centre and the more the cue has to be raised (config.js, ai_*). */
  function aimSigma(tune, level, V0, a, b, elev) {
    const base = tune[`ai_${level}_aim_error`] * Math.PI / 180;
    const pace = Math.max(0, Math.min(1, (V0 - tune.cue_speed_min) / (tune.cue_speed_max - tune.cue_speed_min)));
    const tip = Math.min(1, Math.hypot(a, b) / tune.tip_max), raise = Math.min(1, Math.max(0, elev || 0) / (40 * Math.PI / 180));
    return base * (1 + tune.ai_pace_error * pace * pace) * (1 + tune.ai_spin_error_aim * tip) * (1 + tune.ai_raise_error * raise);
  }
  /** The opening shot: every red still in the triangle behind the pink, cue ball in hand. */
  function isBreakOff(frame, sim) {
    if (!frame.inHand || frame.phase !== 'red' || frame.freeBall) return false;
    for (let i = 1; i <= 15; i++) if (!sim.on[i] || sim.x[i] < SPOT.pink[0] + R) return false;
    return true;
  }
  const CHEAP_SIM = 0.2; // a sim that stops at the first contact costs about this much of a full one
  function erf(x) { // Abramowitz-Stegun 7.1.26
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  }
  /** How pottable ball t is into pocket pk from where the cue ball sits, by geometry: the aim
   *  tolerance the pocket leaves, against an aim error sigma (radians). 0 when blocked. */
  function potChance(sim, t, pk, sigma) {
    const cx = sim.x[0], cy = sim.y[0], tx = sim.x[t], ty = sim.y[t];
    const ax = pk.x + pk.axis[0] * 0.006, ay = pk.y + pk.axis[1] * 0.006;
    let ux = ax - tx, uy = ay - ty; const dTP = Math.hypot(ux, uy); ux /= dTP; uy /= dTP;
    const approach = Math.acos(Math.max(-1, Math.min(1, ux * pk.axis[0] + uy * pk.axis[1])));
    const maxA = pk.type === 'corner' ? 0.82 : 0.68;
    if (approach > maxA) return null;
    const gx = tx - ux * 2 * R, gy = ty - uy * 2 * R;
    if (Math.abs(gx) > HL - R || Math.abs(gy) > HW - R) return null;
    let vx = gx - cx, vy = gy - cy; const dCG = Math.hypot(vx, vy); if (dCG < 1e-6) return null;
    vx /= dCG; vy /= dCG;
    const cosCut = vx * ux + vy * uy;
    if (cosCut < 0.14) return null;
    if (!pathClear(sim, tx, ty, ax, ay, [0, t], 2 * R - 1e-4)) return null;
    if (!pathClear(sim, cx, cy, gx, gy, [0, t], 2 * R - 1e-4)) return null;
    const wEff = Math.max(0.002, (pk.width - 2 * R) / 2 * Math.cos(approach) * (pk.type === 'corner' ? 1 : 0.85));
    const tolObj = wEff / dTP; // object-ball direction tolerance
    const tolAim = tolObj * (2 * R * cosCut) / (dCG + 2 * R); // as cue aim tolerance
    const pace = 0.6 + 0.4 * Math.min(1, 1.5 / (dCG + dTP)); // long shots also go wrong on pace
    const p = erf(tolAim / (sigma * Math.SQRT2)) * pace;
    return { p, tol: tolAim, pace, aim: Math.atan2(vy, vx), ux, uy, dCG, dTP, cosCut, gx, gy };
  }
  /** The best geometric pot chance among the given targets (a measure of a position). */
  function bestChance(sim, targets, table, sigma, valueWeight) {
    let best = 0, bestT = -1;
    for (const t of targets) for (const pk of table.pocketList) {
      const c = potChance(sim, t, pk, sigma);
      if (!c) continue;
      const s = c.p * (valueWeight ? 0.55 + 0.45 * val(t) / 7 : 1);
      if (s > best) { best = s; bestT = t; }
    }
    return { best, bestT };
  }

  /** A gaussian from the game's rng. */
  function gauss(rng) { const u = Math.max(1e-9, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /** Plans the computer's shot as a generator: each yield is one simulated shot, so the game can
   *  spread the thinking over frames. The result lands in job.result:
   *  { place: [x, y] | null, ang, V0, a, b, kind: 'pot'|'safety'|'break', target, p, intendedAng }.
   *  It judges its chances with its aim error times ai_<level>_judgement: a beginner thinks it
   *  aims better than it does, so it goes for pots a better player would leave. */
  function* plan(job) {
    const { live, frame, table, tune, level, h } = job;
    const S = SEARCH[level];
    const judgement = tune[`ai_${level}_judgement`];
    const sigma = tune[`ai_${level}_aim_error`] * Math.PI / 180 * judgement; // the aim error it thinks it has
    const posW = tune[`ai_${level}_position`], safeBias = tune[`ai_${level}_safety`];
    const base = new Sim(table, N); base.copyFrom(live);
    const scratch = new Sim(table, N);
    const oppSigma = 0.15 * Math.PI / 180; // how the computer rates the chances it leaves

    // 1. ball in hand: pick a spot in the D
    let place = null;
    if (frame.inHand) {
      let best = -1, bestPos = [BAULK_X - 0.1, 0];
      const tg = frame.targets(base);
      for (let k = 0; k < S.place * 2; k++) {
        const ang = Math.PI / 2 + Math.PI * (k + 0.5) / (S.place * 2), rr = D_R * (k % 2 ? 0.45 : 0.85);
        const px = BAULK_X + Math.cos(ang) * rr, py = Math.sin(ang) * rr;
        if (!base.free(px, py, 0)) continue;
        base.place(0, px, py);
        const b = bestChance(base, tg, table, sigma, frame.phase === 'colour').best;
        if (b > best) { best = b; bestPos = [px, py]; }
      }
      if (best < 0.25) bestPos = [BAULK_X - 0.06, (frame.player ? 1 : -1) * 0.17 * (job.rng() > 0.5 ? 1 : -1)];
      if (!base.free(bestPos[0], bestPos[1], 0)) bestPos = [BAULK_X - 0.15, 0.1];
      base.place(0, bestPos[0], bestPos[1]);
      place = bestPos;
      yield 1;
    }

    // How a shot's result scores for the computer.
    const evalAfter = (sim, rec) => {
      const f = Object.assign(Object.create(Frame.prototype), JSON.parse(JSON.stringify(frame)));
      const r = f.judge(sim, rec);
      if (r.foul) return { s: -1.6 - r.foulPts / 7, pot: false, foul: true };
      if (r.frameOver) return { s: f.winner === frame.player ? 5 : -5, pot: true };
      if (r.pts > 0) {
        const pos = bestChance(sim, f.targets(sim), table, sigma, f.phase === 'colour').best;
        return { s: 1 + 0.25 * r.pts / 7 + posW * pos, pot: true, pts: r.pts };
      }
      const tg = f.targets(sim);
      const opp = bestChance(sim, tg, table, oppSigma, f.phase === 'colour').best;
      const snookered = tg.length && !tg.some(i => bothEdgesClear(sim, i, tg));
      return { s: -0.15 - 0.9 * opp + (snookered ? 0.35 : 0), pot: false, opp };
    };
    const simulate = (ang, V0, a, b, firstOnly) => {
      scratch.copyFrom(base); scratch.onEvent = null;
      scratch.strike(ang, V0, a, b);
      return scratch.run(h, firstOnly ? 4 : 30, firstOnly);
    };

    // 2. pot candidates, by geometry
    const tg = frame.targets(base), cands = [];
    for (const t of tg) for (const pk of table.pocketList) {
      const c = potChance(base, t, pk, sigma);
      if (c && c.p > 0.02) cands.push(Object.assign(c, { t, pk, w: c.p * (frame.phase === 'colour' || frame.freeBall ? 0.5 + 0.5 * val(t) / 7 : 1) }));
    }
    cands.sort((A, B) => B.w - A.w);
    const tried = [];
    let cost = 0;
    const variants = [];
    cands.slice(0, S.cands).forEach((c, ci) => {
      for (const V0 of S.speeds) for (const b of S.spins) variants.push({ c, V0, b, a: 0 });
      if (ci < S.sideCands) for (const V0 of [0.85, 1.3, 1.95]) for (const b of [-0.18, 0.15]) for (const a of [-0.3, 0.3]) variants.push({ c, V0, b, a });
    });
    /** The cue's angle that sends the object ball along the pot line for candidate c, struck at
     *  V0 with tip (a, b) (throw, squirt and swerve included), from ang; null if it can't. */
    function* solveAim(c, V0, a, b, ang) {
      const want = Math.atan2(c.uy, c.ux);
      let err0 = null, ang0 = null;
      for (let it = 0; it < 3; it++) {
        const r = simulate(ang, V0, a, b, true);
        cost += CHEAP_SIM; if (cost >= 1) { cost -= 1; yield 1; }
        if (r.firstHit !== c.t) return null;
        let err = r.firstDir - want; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
        if (Math.abs(err) < 2e-5) break;
        // how the object ball's line turns as the cue's aim turns: measured, else geometric
        let slope = 0;
        if (err0 !== null && Math.abs(ang - ang0) > 1e-9) slope = (err - err0) / (ang - ang0);
        if (!slope || !isFinite(slope) || slope > -1) slope = -(c.dCG + 2 * R) / (2 * R * Math.max(0.2, c.cosCut));
        ang0 = ang; err0 = err;
        ang -= err / slope;
      }
      return ang;
    }
    for (const { c, V0, a, b } of variants) {
      {
        const ang = yield* solveAim(c, V0, a, b, c.aim);
        if (ang === null) continue;
        const rec = simulate(ang, V0, a, b, false), elev = scratch.lastElev || 0; yield 1;
        const ev = evalAfter(scratch, rec);
        tried.push({ ang, V0, a, b, elev, ev, c, kind: 'pot' });
      }
    }
    // 3. turn each pot try into an expected score: its chance of going in at this level's aim,
    // for this stroke (pace, spin and a raised cue all widen it)
    for (const t of tried) {
      t.sigma = aimSigma(tune, level, t.V0, t.a, t.b, t.elev) * judgement;
      t.p = erf(t.c.tol / (t.sigma * Math.SQRT2)) * t.c.pace;
      // and of missing the ball altogether (a foul): on a cut the cue ball's line passes only
      // 2R(1 - sin cut) inside the ball's edge
      const sinCut = Math.sqrt(Math.max(0, 1 - t.c.cosCut * t.c.cosCut));
      const margin = 2 * R * (1 - sinCut) / Math.max(0.05, t.c.dCG);
      const pMiss = Math.min(1 - t.p, 0.5 * (1 - erf(margin / (t.sigma * Math.SQRT2))));
      if (!t.ev.pot) { t.exp = t.ev.s - 0.4; continue; }
      t.exp = t.p * t.ev.s + (1 - t.p - pMiss) * (-0.25 - 0.9 * 0.55) + pMiss * (-1.6 - 4 / 7);
    }
    tried.sort((A, B) => B.exp - A.exp);
    if (S.robust) {
      // check the best few against this level's own wobble: do they still go in?
      for (const t of tried.slice(0, 3)) {
        if (!t.ev.pot) continue;
        let inCount = 1, missS = 0, n = 1;
        for (const d of [-1, 1]) {
          const rec = simulate(t.ang + d * t.sigma * 1.2, t.V0, t.a, t.b, false); yield 1;
          const ev = evalAfter(scratch, rec); n++;
          if (ev.pot) inCount++; else missS += ev.s;
        }
        const pIn = Math.min(t.c.p, 0.25 + 0.75 * inCount / n);
        t.exp = pIn * t.ev.s + (1 - pIn) * (missS ? missS / Math.max(1, n - inCount) : -0.6);
      }
      tried.sort((A, B) => B.exp - A.exp);
    }

    // 4. the break-off (amateur and up): from beside the yellow or the green, clip the end red
    // of the back row thin, so the cue ball comes off the top and side cushions back to baulk
    const safeties = [];
    if (S.breakOff && isBreakOff(frame, base)) {
      const reds = []; for (let i = 1; i <= 15; i++) reds.push(i);
      const backX = Math.max(...reds.map(i => base.x[i]));
      const back = reds.filter(i => base.x[i] > backX - R);
      const ys = S.breakOff > 1 ? [-0.24, -0.16, 0.16, 0.24] : [-0.2, 0.2];
      const fracs = S.breakOff > 1 ? [0.86, 0.94] : [0.9], speeds = S.breakOff > 1 ? [1.8, 2.3, 2.8] : [2.0, 2.5];
      for (const py of ys) {
        const px = BAULK_X - 0.01, side = Math.sign(py);
        if (!base.free(px, py, 0)) continue;
        const t = back.reduce((A, B) => (side * base.y[B] > side * base.y[A] ? B : A));
        const dx = base.x[t] - px, dy = base.y[t] - py, d = Math.hypot(dx, dy), edge = Math.asin(Math.min(1, 2 * R / d));
        for (const f of fracs) for (const a of S.breakOff > 1 ? [0, 0.3, -0.3] : [0]) for (const V0 of speeds) {
          const ang = Math.atan2(dy, dx) + side * f * edge; // passes the red on its outside
          scratch.copyFrom(base); scratch.onEvent = null; scratch.place(0, px, py);
          scratch.strike(ang, V0, a, 0);
          const rec = scratch.run(h, 30, false); yield 1;
          if (!isRed(rec.firstHit)) continue;
          const ev = evalAfter(scratch, rec);
          const home = scratch.on[0] ? Math.max(0, Math.min(1, (BAULK_X - scratch.x[0]) / (BAULK_X + HL))) : 0; // back in baulk, near its cushion
          safeties.push({ ang, V0, a, b: 0, elev: 0, ev, kind: 'break', place: [px, py], exp: ev.s + 0.3 * home + 0.2 });
        }
      }
    }
    // 5. safety: contacts on the balls on (full at the lower levels, thin higher up), and kicks
    // off cushions when hidden
    const bestPot = tried[0];
    const wantSafety = !safeties.length && (!bestPot || bestPot.exp < 0.55 + safeBias * 0.6 || frame.freeBall);
    if (wantSafety) {
      const byDist = tg.slice().sort((A, B) => Math.hypot(base.x[A] - base.x[0], base.y[A] - base.y[0]) - Math.hypot(base.x[B] - base.x[0], base.y[B] - base.y[0]));
      const visible = byDist.filter(i => bothEdgesClear(base, i)).slice(0, S.safeTargets);
      for (const t of visible) {
        const dx = base.x[t] - base.x[0], dy = base.y[t] - base.y[0], d = Math.hypot(dx, dy), baseA = Math.atan2(dy, dx);
        const edge = Math.asin(Math.min(1, 2 * R / d));
        for (const f of S.safeFracs) for (const V0 of S.safeSpeeds) {
          const ang = baseA + f * edge, b = f === 0 ? -0.2 : 0;
          const rec = simulate(ang, V0, 0, b, false), elev = scratch.lastElev || 0; yield 1;
          const ev = evalAfter(scratch, rec);
          safeties.push({ ang, V0, a: 0, b, elev, ev, kind: ev.pot ? 'pot' : 'safety', exp: ev.s + safeBias });
        }
      }
      if (!visible.length || frame.freeBall) {
        const kicks = Math.max(8, S.kicks);
        for (let k = 0; k < kicks; k++) for (const V0 of [1.0, 1.8]) {
          const ang = 2 * Math.PI * k / kicks;
          const rec = simulate(ang, V0, 0, 0, false), elev = scratch.lastElev || 0; yield 1;
          const ev = evalAfter(scratch, rec);
          safeties.push({ ang, V0, a: 0, b: 0, elev, ev, kind: 'safety', exp: ev.s + safeBias });
        }
      }
    }
    const all = tried.concat(safeties).sort((A, B) => B.exp - A.exp);
    let pick = all[0];
    if (!pick) { // nothing found at all: roll toward the nearest ball on
      const t = tg[0] || 1;
      pick = { ang: Math.atan2(base.y[t] - base.y[0], base.x[t] - base.x[0]), V0: 1.2, a: 0, b: 0, elev: 0, kind: 'safety' };
    }
    // 6. this level's hands: the shot as it is actually played, its aim error as wide as this
    // stroke makes it, and now and then (ai_<level>_mishit) a stroke that goes badly wrong
    const rng = job.rng;
    const bad = rng() < tune[`ai_${level}_mishit`] ? tune.ai_mishit_scale : 1;
    const pe = tune[`ai_${level}_power_error`] * bad, se = tune[`ai_${level}_spin_error`] * bad;
    const lim = tune.tip_max;
    const clampTip = (a, b) => { const r = Math.hypot(a, b); return r > lim ? [a / r * lim, b / r * lim] : [a, b]; };
    const [a, b] = clampTip(pick.a + gauss(rng) * se, pick.b + gauss(rng) * se);
    const V0 = Math.max(0.2, pick.V0 * (1 + gauss(rng) * pe));
    // the side it actually puts on squirts the ball: a good player allows for it by feel
    // (ai_<level>_feel: 1 all of it, 0 none, as a beginner who never knows it put side on)
    let ang = pick.ang;
    const feel = tune[`ai_${level}_feel`];
    if (pick.kind === 'pot' && pick.c && feel > 0 && Math.abs(a - pick.a) > 1e-4) {
      const solved = yield* solveAim(pick.c, V0, a, b, pick.ang);
      if (solved !== null) ang += feel * (solved - pick.ang);
    }
    job.result = {
      place: pick.place || place, kind: pick.kind,
      ang: ang + gauss(rng) * aimSigma(tune, level, pick.V0, pick.a, pick.b, pick.elev) * bad,
      V0, a, b,
      intendedAng: pick.ang, target: pick.c ? pick.c.t : -1, p: pick.p === undefined ? 1 : pick.p, mishit: bad > 1,
    };
  }

  /** Should the computer play from here after the player's foul, or put the player back in? */
  function wantsToPlay(live, frame, table, tune, level) {
    if (level === 'beginner') return true;
    if (frame.freeBall || frame.inHand) return true;
    const sigma = tune[`ai_${level}_aim_error`] * Math.PI / 180;
    const c = bestChance(live, frame.targets(live), table, sigma, frame.phase === 'colour').best;
    return c > 0.3 || !frame.targets(live).some(i => !bothEdgesClear(live, i)) && c > 0.12;
  }

  window.LP = Object.assign(window.LP, {
    N, KIND, VALUE, ID, SPOT, COLOURS, NAME, BAULK_X, D_R, val, isRed, isColour,
    inD, clampD, rack, respot, respotAll, Frame, setupLevel, plan, wantsToPlay, LEVELS, LEVEL_NAME, bestChance, pathClear, bothEdgesClear,
    anyPartClear, fullBallClear,
  });
})();
