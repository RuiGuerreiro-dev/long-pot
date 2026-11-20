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

  /** Puts a colour back: its own spot, else the highest free spot, else as near its own spot as
   *  it fits, toward the top cushion first. */
  function respot(sim, i) {
    const c = KIND[i];
    const tryAt = (x, y) => { if (sim.free(x, y, i)) { sim.place(i, x, y); return true; } return false; };
    if (tryAt(...SPOT[c])) return;
    for (let k = COLOURS.length - 1; k >= 0; k--) if (tryAt(...SPOT[COLOURS[k]])) return;
    for (let d = 0.001; d < 2 * HL; d += 0.001) {
      if (tryAt(SPOT[c][0] + d, SPOT[c][1])) return;
      if (tryAt(SPOT[c][0] - d, SPOT[c][1])) return;
    }
  }

  /** The cue ball can reach both edges of ball t in straight lines (no ball in the way). */
  function bothEdgesClear(sim, t) {
    const cx = sim.x[0], cy = sim.y[0], dx = sim.x[t] - cx, dy = sim.y[t] - cy, d = Math.hypot(dx, dy);
    if (d <= 2 * R + 1e-6) return true;
    const base = Math.atan2(dy, dx), off = Math.asin(Math.min(1, 2 * R / d)), len = Math.sqrt(Math.max(0, d * d - 4 * R * R));
    for (const s of [-1, 1]) {
      const a = base + s * off * 0.999, ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len;
      if (!pathClear(sim, cx, cy, ex, ey, [0, t], 2 * R - 2e-4)) return false;
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
    /** Judges a finished shot. rec: the sim's record. Mutates the frame and re-spots on sim. */
    judge(sim, rec) {
      const phase = this.phase, fb = this.freeBall, me = this.player, other = 1 - me;
      const first = rec.firstHit, pots = rec.potted.filter(i => i !== 0);
      let foul = false, fv = 4, reason = '';
      const bump = (v, why) => { foul = true; if (v > fv || !reason) { fv = Math.max(fv, v); reason = reason || why; } };
      const onVal = phase === 'red' ? 1 : phase === 'colour' ? (first > 0 && isColour(first) ? val(first) : 4) : VALUE[phase];
      let nominee = -1; // the colour nominated (after a red) or the free ball
      if (first < 0) bump(onVal, 'Missed every ball');
      else if (phase === 'red') {
        if (isRed(first)) { /* legal */ } else if (fb) nominee = first; else bump(Math.max(onVal, val(first)), `Hit the ${NAME[KIND[first]].toLowerCase()} first`);
      } else if (phase === 'colour') {
        if (isColour(first)) nominee = first; else bump(onVal, 'Hit a red, not a colour');
      } else if (KIND[first] !== phase) {
        if (fb) nominee = first; else bump(Math.max(onVal, val(first)), `Hit the ${NAME[KIND[first]].toLowerCase()} first`);
      }
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
      if (phase === 'colour' && pots.filter(b => b === nominee).length && pots.length > 1) { /* other balls made it a foul above */ }
      if (rec.cuePotted) bump(onVal, 'In-off');
      fv = Math.min(7, fv);
      const res = { foul, foulPts: foul ? fv : 0, reason, pts: foul ? 0 : pts, potted: pots.slice(), player: me, phase, frameOver: false };

      // re-spots: colours go back unless legally potted in the final sequence
      for (const b of pots) {
        if (!isColour(b)) continue;
        const legalFinal = !foul && phase !== 'red' && phase !== 'colour' && (KIND[b] === phase && b !== nominee);
        if (!legalFinal) respot(sim, b);
      }
      this.freeBall = false; this.canPutBack = false;
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
        if (!this.solo) { this.offender = me; this.player = other; this.canPutBack = true; }
        if (!this.inHand && !this.solo) this.freeBall = this.snookered(sim);
        res.freeBall = this.freeBall;
        return res;
      }
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
    /** After a foul: is the incoming player unable to hit both edges of any ball on? */
    snookered(sim) {
      const t = this.targets(sim);
      if (!t.length) return false;
      return !t.some(i => bothEdgesClear(sim, i));
    }
    /** The non-offender asked the offender to play again. */
    putBack() {
      this.player = this.offender; this.freeBall = false; this.canPutBack = false;
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
  // How widely each level searches (shape of the search, not tuning numbers for feel)
  const SEARCH = {
    beginner: { cands: 3, speeds: [1.1, 1.7], spins: [0], sideCands: 0, safeTargets: 2, kicks: 0, robust: false, place: 4 },
    amateur: { cands: 5, speeds: [0.75, 1.2, 1.9], spins: [-0.3, 0, 0.3], sideCands: 0, safeTargets: 3, kicks: 12, robust: false, place: 8 },
    pro: { cands: 7, speeds: [0.6, 0.95, 1.45, 2.2], spins: [-0.42, -0.12, 0.2, 0.42], sideCands: 0, safeTargets: 5, kicks: 24, robust: true, place: 12 },
    champion: { cands: 8, speeds: [0.55, 0.85, 1.3, 1.95, 2.9], spins: [-0.45, -0.18, 0.15, 0.42], sideCands: 3, safeTargets: 6, kicks: 36, robust: true, place: 16 },
  };
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
    const p = erf(tolAim / (sigma * Math.SQRT2)) * (0.6 + 0.4 * Math.min(1, 1.5 / (dCG + dTP))); // long shots also go wrong on pace
    return { p, aim: Math.atan2(vy, vx), ux, uy, dCG, dTP, cosCut, gx, gy };
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
   *  { place: [x, y] | null, ang, V0, a, b, kind: 'pot'|'safety', note }. */
  function* plan(job) {
    const { live, frame, table, tune, level, h } = job;
    const S = SEARCH[level];
    const sigma = tune[`ai_${level}_aim_error`] * Math.PI / 180;
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
      const snookered = tg.length && !tg.some(i => bothEdgesClear(sim, i));
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
    for (const { c, V0, a, b } of variants) {
      const want = Math.atan2(c.uy, c.ux);
      {
        // solve the aim so the object ball leaves on the pot line (throw and squirt included)
        let ang = c.aim, err0 = null, ang0 = null, ok = true;
        for (let it = 0; it < 3; it++) {
          const r = simulate(ang, V0, a, b, true);
          cost += CHEAP_SIM; if (cost >= 1) { cost -= 1; yield 1; }
          if (r.firstHit !== c.t) { ok = false; break; }
          let err = r.firstDir - want; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
          if (Math.abs(err) < 2e-5) break;
          // how the object ball's line turns as the cue's aim turns: measured, else geometric
          let slope = 0;
          if (err0 !== null && Math.abs(ang - ang0) > 1e-9) slope = (err - err0) / (ang - ang0);
          if (!slope || !isFinite(slope) || slope > -1) slope = -(c.dCG + 2 * R) / (2 * R * Math.max(0.2, c.cosCut));
          ang0 = ang; err0 = err;
          ang -= err / slope;
        }
        if (!ok) continue;
        const rec = simulate(ang, V0, a, b, false); yield 1;
        const ev = evalAfter(scratch, rec);
        tried.push({ ang, V0, a, b, ev, c, kind: 'pot' });
      }
    }
    // 3. turn each pot try into an expected score: its chance of going in at this level's aim
    for (const t of tried) {
      if (!t.ev.pot) { t.exp = t.ev.s - 0.4; continue; }
      t.p = t.c.p;
      t.exp = t.p * t.ev.s + (1 - t.p) * (-0.25 - 0.9 * 0.55);
    }
    tried.sort((A, B) => B.exp - A.exp);
    if (S.robust) {
      // check the best few against this level's own wobble: do they still go in?
      for (const t of tried.slice(0, 3)) {
        if (!t.ev.pot) continue;
        let inCount = 1, missS = 0, n = 1;
        for (const d of [-1, 1]) {
          const rec = simulate(t.ang + d * sigma * 1.2, t.V0, t.a, t.b, false); yield 1;
          const ev = evalAfter(scratch, rec); n++;
          if (ev.pot) inCount++; else missS += ev.s;
        }
        const pIn = Math.min(t.c.p, 0.25 + 0.75 * inCount / n);
        t.exp = pIn * t.ev.s + (1 - pIn) * (missS ? missS / Math.max(1, n - inCount) : -0.6);
      }
      tried.sort((A, B) => B.exp - A.exp);
    }

    // 4. safety: contacts on the balls on, and kicks off cushions when hidden
    const safeties = [];
    const bestPot = tried[0];
    const wantSafety = !bestPot || bestPot.exp < 0.55 + safeBias * 0.6 || frame.freeBall;
    if (wantSafety) {
      const byDist = tg.slice().sort((A, B) => Math.hypot(base.x[A] - base.x[0], base.y[A] - base.y[0]) - Math.hypot(base.x[B] - base.x[0], base.y[B] - base.y[0]));
      const visible = byDist.filter(i => bothEdgesClear(base, i)).slice(0, S.safeTargets);
      for (const t of visible) {
        const dx = base.x[t] - base.x[0], dy = base.y[t] - base.y[0], d = Math.hypot(dx, dy), baseA = Math.atan2(dy, dx);
        const edge = Math.asin(Math.min(1, 2 * R / d));
        for (const f of [-0.9, -0.55, 0, 0.55, 0.9]) for (const V0 of [0.55, 0.9, 1.4, 2.1]) {
          const ang = baseA + f * edge, b = f === 0 ? -0.2 : 0;
          const rec = simulate(ang, V0, 0, b, false); yield 1;
          const ev = evalAfter(scratch, rec);
          safeties.push({ ang, V0, a: 0, b, ev, kind: ev.pot ? 'pot' : 'safety', exp: ev.s + safeBias });
        }
      }
      if (!visible.length || frame.freeBall) {
        const kicks = Math.max(8, S.kicks);
        for (let k = 0; k < kicks; k++) for (const V0 of [1.0, 1.8]) {
          const ang = 2 * Math.PI * k / kicks;
          const rec = simulate(ang, V0, 0, 0, false); yield 1;
          const ev = evalAfter(scratch, rec);
          safeties.push({ ang, V0, a: 0, b: 0, ev, kind: 'safety', exp: ev.s + safeBias });
        }
      }
    }
    const all = tried.concat(safeties).sort((A, B) => B.exp - A.exp);
    let pick = all[0];
    if (!pick) { // nothing found at all: roll toward the nearest ball on
      const t = tg[0] || 1;
      pick = { ang: Math.atan2(base.y[t] - base.y[0], base.x[t] - base.x[0]), V0: 1.2, a: 0, b: 0, kind: 'safety' };
    }
    // 5. this level's hands: the shot as it is actually played
    const rng = job.rng;
    const pe = tune[`ai_${level}_power_error`], se = tune[`ai_${level}_spin_error`];
    const lim = tune.tip_max;
    const clampTip = (a, b) => { const r = Math.hypot(a, b); return r > lim ? [a / r * lim, b / r * lim] : [a, b]; };
    const [a, b] = clampTip(pick.a + gauss(rng) * se, pick.b + gauss(rng) * se);
    job.result = {
      place, kind: pick.kind,
      ang: pick.ang + gauss(rng) * sigma,
      V0: Math.max(0.2, pick.V0 * (1 + gauss(rng) * pe)),
      a, b,
      intendedAng: pick.ang,
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
    inD, clampD, rack, respot, Frame, setupLevel, plan, wantsToPlay, LEVELS, LEVEL_NAME, bestChance, pathClear, bothEdgesClear,
  });
})();
