// PROTOTYPE - NOT FOR PRODUCTION
// Question: Does it feel like real snooker, both in how the balls behave and in a frame against a computer that plays like a real opponent at each difficulty?
// Date: 2026-11-19
// Long Pot physics. Balls move on the table plane with full 3D spin. Each substep finds the
// exact time of every contact (ball-ball, cushion, jaw) and resolves them in order; between
// contacts the balls slide (friction turns slip into roll), roll (rolling resistance) and lose
// side spin. Cushions use Han's 2005 model (contact above the ball's centre, so spin and angle
// change the rebound); ball-ball contacts carry speed-dependent friction, so cut and spin throw
// the object ball off the line of centres. The cue tip transfers speed and spin, and side spin
// squirts the cue ball off line. Units: metres, seconds, kilograms, radians.
// Plane coordinates: x toward the black end, y to the left seen from baulk, z up.
'use strict';
(function () {
  const G = 9.81;
  // CUSHION_TOP and RAIL_TOP: heights above the cloth the cue must clear behind the cue ball, m
  const SPEC = { L: 3.569, W: 1.778, R: 0.02625, M: 0.142, CUSHION_W: 0.05, RAIL_W: 0.115, CUSHION_TOP: 0.042, RAIL_TOP: 0.053 };

  /** Builds the table's collision geometry and the outlines the renderer draws from it.
   *  p: corner_throat, corner_jaw_radius, middle_throat, middle_jaw_radius, pocket_fall. */
  function buildTable(p) {
    const HL = SPEC.L / 2, HW = SPEC.W / 2, R = SPEC.R, CW = SPEC.CUSHION_W, S2 = Math.SQRT2;
    const rC = p.corner_jaw_radius, cC = (p.corner_throat + 2 * rC) / S2 - rC;
    const rM = p.middle_jaw_radius, cM = p.middle_throat / 2 + rM;
    const segs = [], circles = [], walls = [], pockets = {}, pieces = [];
    const TH = 0.15; // throat wall length

    // A side of the table: local u runs along the cushion, v points away from the cloth.
    const sides = {
      L: { pt: (u, v) => [u, HW + v], dir: (du, dv) => [du, dv] },      // y = +HW
      R: { pt: (u, v) => [u, -HW - v], dir: (du, dv) => [du, -dv] },    // y = -HW
      T: { pt: (u, v) => [HL + v, u], dir: (du, dv) => [dv, du] },      // x = +HL (black end)
      B: { pt: (u, v) => [-HL - v, u], dir: (du, dv) => [-dv, du] },    // x = -HL (baulk end)
    };
    // The end of a cushion piece, in local coordinates: its jaw circle, its throat start T, the
    // pocket's axis, and the arc from the nose (angle -90 deg) round to T.
    function end(u, sign, type) {
      const r = type === 'corner' ? rC : rM;
      const throatAng = type === 'corner' ? (sign > 0 ? -Math.PI / 4 : -3 * Math.PI / 4) : (sign > 0 ? 0 : -Math.PI);
      const axis = type === 'corner' ? [sign / S2, 1 / S2] : [0, 1];
      const c = [u, r];
      const t = [c[0] + r * Math.cos(throatAng), c[1] + r * Math.sin(throatAng)];
      const k = (CW - t[1]) / axis[1];
      const q = [t[0] + axis[0] * k, t[1] + axis[1] * k]; // where the throat line meets the cushion's back
      return { r, c, t, q, axis, throatAng, e: [Math.cos(throatAng), Math.sin(throatAng)] };
    }
    function piece(side, u0, u1, type0, type1, pocket0, pocket1) {
      const S = sides[side];
      const a = end(u0, -1, type0), b = end(u1, 1, type1);
      // physics: the nose, the two jaw circles and the two throat walls
      const A = S.pt(u0, 0), B = S.pt(u1, 0), n = S.dir(0, -1);
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      segs.push({ ax: A[0], ay: A[1], tx: (B[0] - A[0]) / len, ty: (B[1] - A[1]) / len, len, nx: n[0], ny: n[1] });
      for (const [e, pid] of [[a, pocket0], [b, pocket1]]) {
        const C = S.pt(e.c[0], e.c[1]);
        circles.push({ x: C[0], y: C[1], r: e.r });
        const T = S.pt(e.t[0], e.t[1]), ax = S.dir(e.axis[0], e.axis[1]), en = S.dir(e.e[0], e.e[1]);
        walls.push({ ax: T[0], ay: T[1], tx: ax[0], ty: ax[1], len: TH, nx: en[0], ny: en[1] });
        const P = pockets[pid] || (pockets[pid] = { id: pid, ts: [], qs: [], axis: ax });
        P.ts.push(T); P.qs.push({ side, q: S.pt(e.q[0], e.q[1]) });
      }
      // renderer: the cushion's outline in the plane (throat, jaw arc, nose, jaw arc, throat, back)
      const poly = [];
      const arc = (e, from, to) => { const n = 20; for (let i = 0; i <= n; i++) { const g = from + (to - from) * i / n; poly.push(S.pt(e.c[0] + e.r * Math.cos(g), e.c[1] + e.r * Math.sin(g))); } };
      poly.push(S.pt(a.q[0], a.q[1]));
      arc(a, a.throatAng, -Math.PI / 2);
      arc(b, -Math.PI / 2, b.throatAng);
      poly.push(S.pt(b.q[0], b.q[1]));
      pieces.push({ side, poly });
    }
    piece('R', -HL + cC, -cM, 'corner', 'middle', 'BR', 'MR');
    piece('R', cM, HL - cC, 'middle', 'corner', 'MR', 'TR');
    piece('T', -HW + cC, HW - cC, 'corner', 'corner', 'TR', 'TL');
    piece('L', cM, HL - cC, 'middle', 'corner', 'ML', 'TL');
    piece('L', -HL + cC, -cM, 'corner', 'middle', 'BL', 'ML');
    piece('B', -HW + cC, HW - cC, 'corner', 'corner', 'BR', 'BL');
    for (const id in pockets) {
      const P = pockets[id];
      P.x = (P.ts[0][0] + P.ts[1][0]) / 2; P.y = (P.ts[0][1] + P.ts[1][1]) / 2; // where the jaws are narrowest
      P.type = id[0] === 'M' ? 'middle' : 'corner';
      P.fall = p.pocket_fall;
      P.width = Math.hypot(P.ts[0][0] - P.ts[1][0], P.ts[0][1] - P.ts[1][1]);
      const k = P.type === 'corner' ? 0.03 : 0.035;
      P.cx = P.x + P.axis[0] * k; P.cy = P.y + P.axis[1] * k; // the hole's centre, for drawing
      const q0 = P.qs[0].q;
      P.holeR = Math.hypot(q0[0] - P.cx, q0[1] - P.cy);
    }
    // the rail's inner outline, walking the table anticlockwise: each pocket bites a notch
    const order = [['BR', 'B', 'R'], ['MR', 'R', 'R'], ['TR', 'R', 'T'], ['TL', 'T', 'L'], ['ML', 'L', 'L'], ['BL', 'L', 'B']];
    const railHole = [];
    for (const [id, inSide, outSide] of order) {
      const P = pockets[id];
      let qin, qout;
      if (P.type === 'corner') {
        qin = P.qs.find(o => o.side === inSide).q; qout = P.qs.find(o => o.side === outSide).q;
      } else { // both q points are on the same side: the one met first going anticlockwise
        const [s0, s1] = P.qs.map(o => o.q);
        const along = id === 'MR' ? (q => q[0]) : (q => -q[0]);
        [qin, qout] = along(s0) < along(s1) ? [s0, s1] : [s1, s0];
      }
      const a0 = Math.atan2(qin[1] - P.cy, qin[0] - P.cx), a1 = Math.atan2(qout[1] - P.cy, qout[0] - P.cx);
      const ax = Math.atan2(P.axis[1], P.axis[0]);
      // go from a0 to a1 the way that passes the outward axis
      let d = a1 - a0; while (d <= -Math.PI) d += 2 * Math.PI; while (d > Math.PI) d -= 2 * Math.PI;
      let mid = ax - a0; while (mid <= -Math.PI) mid += 2 * Math.PI; while (mid > Math.PI) mid -= 2 * Math.PI;
      if (Math.sign(mid) !== Math.sign(d)) d = d > 0 ? d - 2 * Math.PI : d + 2 * Math.PI;
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const g = a0 + d * i / n;
        railHole.push([P.cx + P.holeR * Math.cos(g), P.cy + P.holeR * Math.sin(g)]);
      }
      P.arc = [a0, d];
    }
    return { HL, HW, R, CW, segs, circles, walls, pockets, pocketList: Object.values(pockets), pieces, railHole, spec: SPEC };
  }

  /** A table of n balls. Index 0 is the cue ball. Arrays, so a copy for planning is cheap. */
  class Sim {
    constructor(table, n) {
      this.T = table; this.n = n;
      const F = () => new Float64Array(n);
      this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.wx = F(); this.wy = F(); this.wz = F();
      this.on = new Uint8Array(n); this.mov = new Uint8Array(n);
      this.P = null; this.onEvent = null;
      this.clearRec();
    }
    setParams(P) { this.P = P; }
    copyFrom(o) {
      this.x.set(o.x); this.y.set(o.y); this.vx.set(o.vx); this.vy.set(o.vy);
      this.wx.set(o.wx); this.wy.set(o.wy); this.wz.set(o.wz); this.on.set(o.on); this.mov.set(o.mov);
      this.P = o.P; this.T = o.T;
    }
    clearRec() { this.rec = { firstHit: -1, firstDir: 0, potted: [], pockets: [], cuePotted: false, cushions: 0, hits: 0, t: 0 }; }
    place(i, x, y) { this.x[i] = x; this.y[i] = y; this.vx[i] = this.vy[i] = this.wx[i] = this.wy[i] = this.wz[i] = 0; this.on[i] = 1; this.mov[i] = 0; }
    remove(i) { this.on[i] = 0; this.mov[i] = 0; this.vx[i] = this.vy[i] = this.wx[i] = this.wy[i] = this.wz[i] = 0; }
    anyMoving() { for (let i = 0; i < this.n; i++) if (this.on[i] && this.mov[i]) return true; return false; }
    /** True when a ball of radius R fits at (x, y) on the cloth without touching another ball. */
    free(x, y, skip = -1) {
      const R = this.T.R, D = 2 * R + 1e-4;
      if (Math.abs(x) > this.T.HL - R || Math.abs(y) > this.T.HW - R) return false;
      for (let i = 0; i < this.n; i++) if (i !== skip && this.on[i] && (this.x[i] - x) ** 2 + (this.y[i] - y) ** 2 < D * D) return false;
      return true;
    }

    /** The cue's elevation (radians) needed to strike ball 0 along ang at tip offset (a, b): the
     *  shaft has to pass over the cushion, the rail and any ball behind the cue ball, within the
     *  reach of the bridge (P.cue_reach). a and b are in ball radii, in the cue's own frame (what
     *  the player sees looking down the cue). Infinity: no elevation short of vertical clears. */
    cueElevation(ang, a, b) {
      const P = this.P, T = this.T, R = T.R;
      if (!P || P.cue_reach == null) return 0;
      const bx = -Math.cos(ang), by = -Math.sin(ang), rx = Math.sin(ang), ry = -Math.cos(ang);
      const x0 = this.x[0], y0 = this.y[0], reach = P.cue_reach, sr = P.cue_shaft_r;
      const obs = []; // [horizontal distance behind the cue ball's centre, height]
      const exit = (hx, hy) => {
        const tx = bx > 0 ? (hx - x0) / bx : bx < 0 ? (-hx - x0) / bx : Infinity;
        const ty = by > 0 ? (hy - y0) / by : by < 0 ? (-hy - y0) / by : Infinity;
        return Math.min(tx, ty);
      };
      const dc = exit(T.HL, T.HW), dr = exit(T.HL + T.CW, T.HW + T.CW);
      if (dc < reach) obs.push([dc, SPEC.CUSHION_TOP]);
      if (dr < reach) obs.push([dr, SPEC.RAIL_TOP]);
      for (let j = 1; j < this.n; j++) {
        if (!this.on[j]) continue;
        const ox = this.x[j] - x0, oy = this.y[j] - y0, along = ox * bx + oy * by;
        if (along <= 0 || along > reach + R) continue;
        const lat = ox * rx + oy * ry - a * R; // across from the shaft's line
        if (Math.abs(lat) >= R + sr) continue;
        const half = Math.sqrt(Math.max(0, R * R - lat * lat));
        obs.push([along - Math.sqrt(Math.max(0, (R + sr) ** 2 - lat * lat)), R + half]);
      }
      if (!obs.length) return 0;
      const c = Math.sqrt(Math.max(0, 1 - a * a - b * b));
      const clears = th => {
        const se = Math.sin(th), ce = Math.cos(th);
        const pz = R + R * (c * se + b * ce), back = R * (c * ce - b * se); // the tip's contact point
        for (const [d, h] of obs) {
          const run = d - back;
          if (pz + Math.max(0, run) * se / ce < h + sr / ce) return false;
        }
        return true;
      };
      if (clears(0)) return 0;
      const top = 85 * Math.PI / 180;
      if (!clears(top)) return Infinity;
      let lo = 0, hi = top;
      for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (clears(mid)) hi = mid; else lo = mid; }
      return hi;
    }
    /** The tip offset as it can actually be played along ang: unchanged when the cue clears at
     *  P.cue_elev_max or less; else raised toward the top of the ball (and side reduced to stay
     *  within P.tip_max) until it does. */
    reachTip(ang, a, b) {
      const P = this.P;
      if (!P || P.cue_elev_max == null) return [a, b];
      const max = P.cue_elev_max * Math.PI / 180, lim = P.tip_max || 0.5;
      if (this.cueElevation(ang, a, b) <= max) return [a, b];
      for (let nb = b + 0.02; nb <= lim + 1e-9; nb += 0.02) {
        const na = Math.sign(a) * Math.min(Math.abs(a), Math.sqrt(Math.max(0, lim * lim - nb * nb)));
        if (this.cueElevation(ang, na, nb) <= max) return [na, nb];
      }
      return [0, lim];
    }

    /** How far side (a, in ball radii, right positive) squirts the cue ball off the cue's line,
     *  radians: right side sends it left. */
    squirt(a) {
      const m = SPEC.M, c = Math.sqrt(Math.max(0, 1 - a * a));
      return Math.atan((2.5 * a * c) / (1 + m / this.P.cue_end_mass + 2.5 * c * c));
    }

    /** The cue strikes ball 0. ang: the cue's direction; V0: cue speed; a: tip offset to the right
     *  of centre, b: above centre, both in ball radii, in the cue's own frame. The tip is first
     *  brought within reach (reachTip), and the cue raised as cueElevation needs: a raised cue
     *  drives the ball into the cloth (less speed along the table, and the cloth's grip eats
     *  into the spin), and side on a raised cue swerves the ball (spin along its path). A bridge
     *  never holds the cue quite level: it is always raised at least P.cue_elev_min degrees, so
     *  side swerves the ball a little on every shot. */
    strike(ang, V0, a, b) {
      const P = this.P, R = this.T.R, m = SPEC.M, M = P.cue_mass;
      [a, b] = this.reachTip(ang, a, b);
      const elMin = (P.cue_elev_min || 0) * Math.PI / 180;
      const el = P.cue_elev_max == null ? 0 : Math.max(elMin, Math.min(this.cueElevation(ang, a, b), P.cue_elev_max * Math.PI / 180));
      const se = Math.sin(el), ce = Math.cos(el);
      const r2 = a * a + b * b;
      const J = (1 + P.tip_restitution) * V0 / (1 / M + 1 / m + (5 / (2 * m)) * r2);
      const v = J / m;
      const dir = ang + this.squirt(a);
      let vx = v * ce * Math.cos(dir), vy = v * ce * Math.sin(dir);
      const k = 5 * J / (2 * m * R); // spin per radius of offset
      const cA = Math.cos(ang), sA = Math.sin(ang);
      // spin = k (a (right x cue) + b (up' x cue)): level, a gives pure side and b top or back
      let wx = k * (a * cA * se - b * sA), wy = k * (a * sA * se + b * cA);
      const wz = k * a * ce;
      if (el > 0) {
        // the cloth stops the stroke's downward part (impulse J sin el); its friction acts on
        // the slip at the cloth at once, at most enough to end it
        const N = J * se, ux = vx - R * wy, uy = vy + R * wx, us = Math.hypot(ux, uy);
        if (us > 1e-9) {
          const F = Math.min(P.mu_slide * N, 2 / 7 * m * us), fx = -F * ux / us, fy = -F * uy / us, q = 5 / (2 * m * R);
          vx += fx / m; vy += fy / m; wx += q * fy; wy -= q * fx;
        }
      }
      this.vx[0] = vx; this.vy[0] = vy; this.wx[0] = wx; this.wy[0] = wy; this.wz[0] = wz;
      this.lastElev = el;
      this.mov[0] = 1; this.on[0] = 1;
      this.clearRec();
      if (this.onEvent) this.onEvent('cue', 0, -1, V0);
    }

    /** One substep of length h: contacts in time order, pockets, then friction. */
    step(h) {
      const { x, y, vx, vy, on, mov, n } = this, T = this.T, R = T.R, D2 = 4 * R * R;
      let rem = h;
      for (let guard = 0; guard < 80 && rem > 1e-12; guard++) {
        let tMin = rem, type = 0, ia = -1, ib = -1, obj = null;
        for (let i = 0; i < n; i++) {
          if (!on[i] || !mov[i]) continue;
          const xi = x[i], yi = y[i], vxi = vx[i], vyi = vy[i];
          for (let j = 0; j < n; j++) {
            if (j === i || !on[j] || (mov[j] && j < i)) continue;
            const dx = x[j] - xi, dy = y[j] - yi, dvx = vx[j] - vxi, dvy = vy[j] - vyi;
            const b = dx * dvx + dy * dvy;
            if (b >= 0) continue;
            const c = dx * dx + dy * dy - D2;
            let t;
            if (c <= 0) t = 0;
            else {
              const a = dvx * dvx + dvy * dvy, disc = b * b - a * c;
              if (disc < 0) continue;
              t = c / (-b + Math.sqrt(disc));
            }
            if (t < tMin) { tMin = t; type = 1; ia = i; ib = j; }
          }
          // near a cushion at all? (cheap reject for balls in open table)
          const nearEdge = Math.abs(xi) + Math.abs(vxi) * rem > T.HL - R - 0.002 || Math.abs(yi) + Math.abs(vyi) * rem > T.HW - R - 0.002;
          if (!nearEdge) continue;
          for (const list of [T.segs, T.walls]) {
            for (let k = 0; k < list.length; k++) {
              const s = list[k];
              const vn = vxi * s.nx + vyi * s.ny;
              if (vn >= 0) continue;
              const dist = (xi - s.ax) * s.nx + (yi - s.ay) * s.ny - R;
              if (dist < -R) continue; // behind it
              const t = dist <= 0 ? 0 : dist / -vn;
              if (t >= tMin) continue;
              const proj = (xi + vxi * t - s.ax) * s.tx + (yi + vyi * t - s.ay) * s.ty;
              if (proj < 0 || proj > s.len) continue;
              tMin = t; type = 2; ia = i; obj = s;
            }
          }
          for (let k = 0; k < T.circles.length; k++) {
            const C = T.circles[k], rr = R + C.r;
            const dx = xi - C.x, dy = yi - C.y;
            const b = dx * vxi + dy * vyi;
            if (b >= 0) continue;
            const c = dx * dx + dy * dy - rr * rr;
            let t;
            if (c <= 0) t = 0;
            else {
              const a = vxi * vxi + vyi * vyi, disc = b * b - a * c;
              if (disc < 0) continue;
              t = c / (-b + Math.sqrt(disc));
            }
            if (t < tMin) { tMin = t; type = 3; ia = i; obj = C; }
          }
        }
        if (tMin > 0) for (let i = 0; i < n; i++) if (on[i] && mov[i]) { x[i] += vx[i] * tMin; y[i] += vy[i] * tMin; }
        rem -= tMin;
        if (type === 0) break;
        if (type === 1) this.ballBall(ia, ib);
        else if (type === 2) this.cushion(ia, -obj.nx, -obj.ny, obj.len === 0.15 ? 'jaw' : 'cushion');
        else {
          const dx = x[ia] - obj.x, dy = y[ia] - obj.y, d = Math.hypot(dx, dy);
          this.cushion(ia, -dx / d, -dy / d, 'jaw');
        }
      }
      this.pockets();
      this.friction(h);
      this.rec.t += h;
    }

    pockets() {
      const { x, y, on, mov, n } = this, T = this.T;
      for (let i = 0; i < n; i++) {
        if (!on[i] || !mov[i]) continue;
        if (Math.abs(x[i]) < T.HL - 0.12 && Math.abs(y[i]) < T.HW - 0.04) continue;
        for (const P of T.pocketList) {
          const along = (x[i] - P.x) * P.axis[0] + (y[i] - P.y) * P.axis[1];
          const across = Math.abs((x[i] - P.x) * P.axis[1] - (y[i] - P.y) * P.axis[0]);
          if (along > P.fall && across < P.width) { this.pot(i, P); break; }
        }
        // a ball that somehow left the cloth drops in the nearest pocket
        if (on[i] && (Math.abs(x[i]) > T.HL + 0.04 || Math.abs(y[i]) > T.HW + 0.04)) {
          let best = null, bd = 1e9;
          for (const P of T.pocketList) { const d = (x[i] - P.x) ** 2 + (y[i] - P.y) ** 2; if (d < bd) { bd = d; best = P; } }
          this.pot(i, best);
        }
      }
    }
    pot(i, P) {
      const sp = Math.hypot(this.vx[i], this.vy[i]);
      this.remove(i);
      this.rec.potted.push(i); this.rec.pockets.push(P.id);
      if (i === 0) this.rec.cuePotted = true;
      if (this.onEvent) this.onEvent('pot', i, P, sp);
    }

    /** Ball-ball contact: restitution along the line of centres, and friction at the contact point
     *  (speed-dependent, capped at sticking) that throws the object ball and swaps some spin. */
    ballBall(i, j) {
      const P = this.P, R = this.T.R, m = SPEC.M;
      const { x, y, vx, vy, wx, wy, wz } = this;
      let nx = x[j] - x[i], ny = y[j] - y[i]; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
      const vn = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny;
      if (vn <= 0) return;
      const Jn = (1 + P.ball_restitution) / 2 * m * vn;
      const sx = wx[i] + wx[j], sy = wy[i] + wy[j], sz = wz[i] + wz[j];
      let ux = (vx[i] - vx[j]) - R * sz * ny, uy = (vy[i] - vy[j]) + R * sz * nx;
      const uz = R * (sx * ny - sy * nx);
      const un = ux * nx + uy * ny; ux -= un * nx; uy -= un * ny;
      vx[i] -= Jn / m * nx; vy[i] -= Jn / m * ny; vx[j] += Jn / m * nx; vy[j] += Jn / m * ny;
      const ut = Math.hypot(ux, uy, uz);
      if (ut > 1e-9) {
        const mu = P.throw_mu_min + P.throw_mu_peak * Math.exp(-P.throw_falloff * ut);
        const Jt = Math.min(mu * Jn, m * ut / 7);
        const Jx = -Jt * ux / ut, Jy = -Jt * uy / ut, Jz = -Jt * uz / ut;
        vx[i] += Jx / m; vy[i] += Jy / m; vx[j] -= Jx / m; vy[j] -= Jy / m;
        const k = R / (0.4 * m * R * R);
        const cx = ny * Jz, cy = -nx * Jz, cz = nx * Jy - ny * Jx;
        wx[i] += k * cx; wy[i] += k * cy; wz[i] += k * cz;
        wx[j] += k * cx; wy[j] += k * cy; wz[j] += k * cz;
      }
      this.mov[i] = this.mov[j] = 1;
      const rec = this.rec; rec.hits++;
      if (rec.firstHit < 0 && (i === 0 || j === 0)) {
        const o = i === 0 ? j : i;
        rec.firstHit = o; rec.firstDir = Math.atan2(vy[o], vx[o]); rec.firstTime = rec.t;
      }
      if (this.onEvent) this.onEvent('ball', i, j, vn);
    }

    /** Han (2005): the cushion meets the ball above its centre, so the rebound depends on the
     *  angle, the speed and every axis of spin. nIn: unit normal from the ball into the cushion. */
    cushion(i, nIx, nIy, kind) {
      const P = this.P, R = this.T.R, m = SPEC.M;
      const tX = -nIy, tY = nIx;
      const { vx, vy, wx, wy, wz } = this;
      let vX = vx[i] * nIx + vy[i] * nIy, vY = vx[i] * tX + vy[i] * tY;
      let wX = wx[i] * nIx + wy[i] * nIy, wY = wx[i] * tX + wy[i] * tY, wZ = wz[i];
      if (vX <= 0) return;
      const th = Math.asin(Math.min(0.99, P.cushion_height - 1)), sn = Math.sin(th), cs = Math.cos(th);
      const e = P.cushion_restitution, mu = P.cushion_friction;
      const sx = vX * sn + R * wY;
      const sy = -vY - R * wZ * cs + R * wX * sn;
      const c = vX * cs;
      const A = 7 / (2 * m), B = 1 / m;
      const PzE = (1 + e) * c / B, s = Math.hypot(sx, sy), PzS = s / A;
      let PX, PY, PZ;
      if (PzS <= mu * PzE) {
        PX = -sx / A * sn - PzE * cs; PY = sy / A; PZ = sx / A * cs - PzE * sn;
      } else {
        const cp = sx / s, sp = sy / s;
        PX = -mu * PzE * cp * sn - PzE * cs; PY = mu * PzE * sp; PZ = mu * PzE * cp * cs - PzE * sn;
      }
      vX += PX / m; vY += PY / m;
      const II = 0.4 * m * R * R;
      wX += -R / II * PY * sn; wY += R / II * (PX * sn - PZ * cs); wZ += R / II * PY * cs;
      if (vX > -1e-4) vX = -1e-4;
      vx[i] = vX * nIx + vY * tX; vy[i] = vX * nIy + vY * tY;
      wx[i] = wX * nIx + wY * tX; wy[i] = wX * nIy + wY * tY; wz[i] = wZ;
      this.rec.cushions++;
      if (this.onEvent) this.onEvent(kind, i, -1, c);
    }

    /** Cloth friction over h: sliding (slip decays at 7/2 mu g, then the ball rolls), rolling
     *  resistance, and side spin bleeding away. Exact within the step. */
    friction(h) {
      const P = this.P, R = this.T.R;
      const { vx, vy, wx, wy, wz, on, mov, n } = this;
      const mus = P.mu_slide * G, mur = P.mu_roll * G, sd = P.spin_decel * h;
      for (let i = 0; i < n; i++) {
        if (!on[i] || !mov[i]) continue;
        const ux = vx[i] - R * wy[i], uy = vy[i] + R * wx[i], us = Math.hypot(ux, uy);
        let left = h;
        if (us > 1e-6) {
          const tS = 2 * us / (7 * mus), tt = Math.min(h, tS), hx = ux / us, hy = uy / us;
          vx[i] -= mus * hx * tt; vy[i] -= mus * hy * tt;
          const k = 5 * mus / (2 * R) * tt;
          wx[i] -= k * hy; wy[i] += k * hx;
          left = h - tt;
          if (tS <= h) { wx[i] = -vy[i] / R; wy[i] = vx[i] / R; }
        }
        if (left > 0) {
          const sp = Math.hypot(vx[i], vy[i]), dv = mur * left;
          if (sp <= dv) { vx[i] = 0; vy[i] = 0; } else { const f = (sp - dv) / sp; vx[i] *= f; vy[i] *= f; }
          wx[i] = -vy[i] / R; wy[i] = vx[i] / R;
        }
        wz[i] = Math.abs(wz[i]) <= sd ? 0 : wz[i] - Math.sign(wz[i]) * sd;
        if (left > 0 && vx[i] === 0 && vy[i] === 0) { wx[i] = wy[i] = 0; wz[i] = 0; mov[i] = 0; }
        else if (Math.hypot(vx[i], vy[i]) < 2e-4 && Math.hypot(vx[i] - R * wy[i], vy[i] + R * wx[i]) < 2e-4) {
          vx[i] = vy[i] = wx[i] = wy[i] = wz[i] = 0; mov[i] = 0;
        }
      }
    }

    /** Plays the shot out (for planning): substeps until every ball rests, or until the cue
     *  ball first touches a ball when firstOnly is set. */
    run(h, maxT = 30, firstOnly = false) {
      const steps = Math.ceil(maxT / h);
      for (let s = 0; s < steps; s++) {
        this.step(h);
        if (firstOnly && (this.rec.firstHit >= 0 || !this.on[0])) return this.rec;
        if (!this.anyMoving()) break;
      }
      return this.rec;
    }
  }

  window.LP = window.LP || {};
  Object.assign(window.LP, { SPEC, buildTable, Sim, G });
})();
