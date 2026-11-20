// PROTOTYPE - NOT FOR PRODUCTION
// Question: Does it feel like real snooker, both in how the balls behave and in a frame against a computer that plays like a real opponent at each difficulty?
// Date: 2026-11-19
// Every tuning value lives here, each with value, min, max and step. The game reads them live
// through tune.<name> (index.html); the tweak panel, an add-on, writes them back here.
// Sources for the physics starting values: the snooker and pool physics literature (Han 2005
// cushion model; Alciatore's ball-ball friction fit; Marlow's cue-tip impact; regulation table
// sizes). Every value is a starting point for tuning by feel, not a measurement.
window.CONFIG = {
  seed: 1, // every gameplay random call reads rng(), seeded from this (or ?seed= in the address)
  volume: { value: 0.5, min: 0, max: 1, step: 0.05 },

  // ---- Cloth and balls ----
  mu_slide: { value: 0.2, min: 0.05, max: 0.4, step: 0.01 },        // sliding friction, ball on cloth
  mu_roll: { value: 0.011, min: 0.004, max: 0.03, step: 0.001 },    // rolling resistance (a snooker cloth's pace)
  spin_decel: { value: 12, min: 2, max: 40, step: 1 },              // side-spin decay on the cloth, rad/s^2
  ball_restitution: { value: 0.94, min: 0.8, max: 1, step: 0.01 },  // ball on ball
  throw_mu_min: { value: 0.01, min: 0, max: 0.05, step: 0.001 },     // ball-ball friction at high slip (throw)
  throw_mu_peak: { value: 0.108, min: 0, max: 0.2, step: 0.002 },    // extra ball-ball friction at low slip
  throw_falloff: { value: 1.088, min: 0.2, max: 3, step: 0.05 },     // how fast that extra friction falls with slip speed, s/m
  cushion_restitution: { value: 0.8, min: 0.5, max: 0.95, step: 0.01 },
  cushion_friction: { value: 0.2, min: 0, max: 0.5, step: 0.01 },
  cushion_height: { value: 1.27, min: 1.05, max: 1.6, step: 0.01 },  // cushion nose height, in ball radii above the cloth

  // ---- Pockets (snooker templates: tight, rounded jaws) ----
  corner_throat: { value: 0.086, min: 0.06, max: 0.11, step: 0.001 }, // narrowest gap between the corner jaws, m
  corner_jaw_radius: { value: 0.04, min: 0.005, max: 0.08, step: 0.002 }, // how rounded the corner jaws are, m
  middle_throat: { value: 0.09, min: 0.06, max: 0.12, step: 0.001 },  // narrowest gap between the middle jaws, m
  middle_jaw_radius: { value: 0.016, min: 0.004, max: 0.05, step: 0.002 },
  pocket_fall: { value: 0.012, min: 0, max: 0.04, step: 0.002 },      // how far past the jaws the centre must go to drop, m

  // ---- Cue ----
  cue_mass: { value: 0.5, min: 0.3, max: 0.7, step: 0.01 },          // kg
  cue_end_mass: { value: 0.009, min: 0.003, max: 0.03, step: 0.001 }, // shaft end mass: sets the squirt from side spin, kg
  tip_restitution: { value: 0.75, min: 0.5, max: 0.9, step: 0.01 },
  cue_speed_min: { value: 0.25, min: 0.05, max: 1, step: 0.05 },      // cue speed at the lightest stroke, m/s
  cue_speed_max: { value: 5.2, min: 2, max: 8, step: 0.1 },           // cue speed at full power, m/s
  power_curve: { value: 1.6, min: 1, max: 3, step: 0.1 },             // >1 gives finer control at low power
  tip_max: { value: 0.5, min: 0.2, max: 0.6, step: 0.02 },            // furthest tip offset from centre, in ball radii (miscue beyond)
  physics_substeps: { value: 6, min: 2, max: 16, step: 1 },           // physics substeps per 1/60 s game step
  cue_elev_max: { value: 40, min: 15, max: 80, step: 1 },             // the most the cue can be raised to clear a cushion or ball behind, degrees; a tip spot that needs more can't be played
  cue_reach: { value: 0.35, min: 0.1, max: 0.8, step: 0.01 },         // how far behind the cue ball the shaft must clear things (the bridge's reach), m
  cue_shaft_r: { value: 0.0065, min: 0.004, max: 0.012, step: 0.0005 }, // the cue shaft's radius near the tip, m

  // ---- Controls ----
  aim_drag: { value: 0.12, min: 0.02, max: 0.5, step: 0.01 },        // aim turn per pixel dragged, degrees
  aim_fine: { value: 0.1, min: 0.02, max: 0.5, step: 0.01 },         // Shift multiplies the aim speed by this
  aim_key_speed: { value: 24, min: 4, max: 90, step: 1 },            // arrow-key aim speed, degrees per second
  stroke_pull: { value: 220, min: 80, max: 400, step: 10 },          // pixels of pull-back for full power
  key_power_time: { value: 1.6, min: 0.5, max: 4, step: 0.1 },       // seconds holding Space to reach full power
  spin_key_step: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },   // tip offset per W/A/S/D press, ball radii
  touch_pull_min: { value: 0.05, min: 0, max: 0.3, step: 0.01 },     // phone: the least pull on the cue that strikes; less is let go
  touch_lift_drag: { value: 0.12, min: 0.02, max: 0.5, step: 0.01 }, // phone: degrees the aim view rises per pixel swiped down on the table
  touch_lift_max: { value: 20, min: 0, max: 45, step: 1 },           // phone: the highest the swipe raises the aim view, degrees

  // ---- Camera ----
  cam_dist: { value: 0.95, min: 0.3, max: 3, step: 0.05 },           // aim camera distance behind the cue ball, m
  cam_pitch: { value: 13, min: 2, max: 80, step: 1 },                // aim camera angle above the cloth, degrees
  cam_follow: { value: 9, min: 1, max: 30, step: 0.5 },              // how quickly the camera eases to its target, 1/s
  light_intensity: { value: 2.2, min: 0.2, max: 6, step: 0.05 },      // the canopy lights

  // ---- Assist at the lower difficulties: a bolder aim line, and the cue ball's path and where it
  // stops at the power applied (played out with the same physics) ----
  assist_training_levels: { value: 2, min: 0, max: 8, step: 1 },     // training levels 1..N get it (3 and 4 teach cue-ball control)
  assist_ai_levels: { value: 2, min: 0, max: 4, step: 1 },           // computer difficulties that get it, from the easiest: 2 = Beginner, Amateur
  assist_line_width: { value: 5, min: 2, max: 12, step: 0.5 },        // aim line width with the assist, mm (2.2 without)
  assist_line_opacity: { value: 0.9, min: 0.3, max: 1, step: 0.05 },
  assist_path_time: { value: 12, min: 2, max: 30, step: 1 },          // longest the path plays the shot out, s

  // ---- Computer opponent (one row per difficulty: Beginner, Amateur, Pro, Champion) ----
  ai_beginner_aim_error: { value: 0.9, min: 0, max: 3, step: 0.01 },  // aim error, degrees (1 sigma)
  ai_amateur_aim_error: { value: 0.42, min: 0, max: 3, step: 0.01 },
  ai_pro_aim_error: { value: 0.14, min: 0, max: 3, step: 0.01 },
  ai_champion_aim_error: { value: 0.06, min: 0, max: 3, step: 0.01 },
  ai_beginner_power_error: { value: 0.14, min: 0, max: 0.5, step: 0.01 }, // power error, fraction (1 sigma)
  ai_amateur_power_error: { value: 0.08, min: 0, max: 0.5, step: 0.01 },
  ai_pro_power_error: { value: 0.035, min: 0, max: 0.5, step: 0.005 },
  ai_champion_power_error: { value: 0.02, min: 0, max: 0.5, step: 0.005 },
  ai_beginner_spin_error: { value: 0.1, min: 0, max: 0.3, step: 0.005 },  // tip placement error, ball radii
  ai_amateur_spin_error: { value: 0.06, min: 0, max: 0.3, step: 0.005 },
  ai_pro_spin_error: { value: 0.03, min: 0, max: 0.3, step: 0.005 },
  ai_champion_spin_error: { value: 0.015, min: 0, max: 0.3, step: 0.005 },
  ai_beginner_position: { value: 0, min: 0, max: 2, step: 0.05 },     // how much it plays for the next ball
  ai_amateur_position: { value: 0.35, min: 0, max: 2, step: 0.05 },
  ai_pro_position: { value: 0.9, min: 0, max: 2, step: 0.05 },
  ai_champion_position: { value: 1.2, min: 0, max: 2, step: 0.05 },
  ai_beginner_safety: { value: -0.7, min: -2, max: 1, step: 0.05 },   // bias toward safety play (negative: goes for pots)
  ai_amateur_safety: { value: -0.3, min: -2, max: 1, step: 0.05 },
  ai_pro_safety: { value: 0, min: -2, max: 1, step: 0.05 },
  ai_champion_safety: { value: 0.08, min: -2, max: 1, step: 0.05 },
  ai_sims_per_step: { value: 6, min: 1, max: 40, step: 1 },           // shots the computer tries per game step while it thinks
  ai_think_min: { value: 1.1, min: 0, max: 5, step: 0.1 },            // shortest thinking pause, seconds

  // ---- Referee ----
  miss_attempt_gap: { value: 0.08, min: 0, max: 0.4, step: 0.01 },    // snookered: a failed escape is a fair attempt (no miss) if the cue ball came this close to a ball on, m

  // ---- Training ----
  judge_pause: { value: 1.1, min: 0.2, max: 3, step: 0.1 },           // pause on the result before the next shot, s

  // Training levels: plain data, read once when a level starts. Positions are metres from the
  // table's centre: x toward the black end, y toward the left side as seen from the baulk end.
  // A ball may sit on a line into a pocket ({pocket, dist, angle}); the cue ball may be set for a
  // cut of a given angle ({ball, pocket, cut, dist, side}) or be in hand in the D ('D').
  // Pockets: TL TR (black end), ML MR (middles), BL BR (baulk end); L is the left side.
  levels: [
    { name: 'First Pot', skill: 'A straight red into a corner',
      hint: 'Drag sideways to aim. Then hold the button, pull the mouse down and push it up to strike. Gentle is plenty.',
      hint_touch: 'Swipe sideways to aim. Then pull the cue on the right down a little and let go. Gentle is plenty.',
      guide: 'full', shots: 4, stars: [1, 2], goal: { type: 'pots', count: 1 },
      balls: [{ kind: 'red', pocket: 'TL', dist: 0.42, angle: 0 }],
      cue: { ball: 0, pocket: 'TL', cut: 0, dist: 0.32 } },
    { name: 'The Cut', skill: 'Cut a red into the middle pocket',
      hint: 'Send the cue ball to the ghost ball, not at the red. Right-drag to walk round and check the line.',
      hint_touch: 'Send the cue ball to the ghost ball, not at the red. Two fingers walk you round to check the line.',
      guide: 'full', shots: 4, stars: [1, 2], goal: { type: 'pots', count: 1 },
      balls: [{ kind: 'red', pocket: 'ML', dist: 0.3, angle: 22 }],
      cue: { ball: 0, pocket: 'ML', cut: 30, dist: 0.55, side: 1 } },
    { name: 'Screw Back', skill: 'Back spin brings the cue ball back',
      hint: 'Hit below centre (S, or click low on the cue-ball diagram). Pot the red and stop the cue ball in the ring.',
      hint_touch: 'Tap low on the cue-ball diagram to hit below centre. Pot the red and stop the cue ball in the ring.',
      guide: 'ghost', shots: 4, stars: [1, 2], goal: { type: 'zone', count: 1, zone: { back: 0.42, r: 0.15 } },
      balls: [{ kind: 'red', pocket: 'TR', dist: 0.36, angle: 0 }],
      cue: { ball: 0, pocket: 'TR', cut: 0, dist: 0.62 } },
    { name: 'Red, Then Colour', skill: 'Pot a red, then a colour of your choice',
      hint: 'After a red, any colour is on. Pot one and it goes back on its spot. Think where the cue ball stops.',
      guide: 'ghost', shots: 5, stars: [2, 3], goal: { type: 'pots', count: 2 },
      balls: [{ kind: 'red', pocket: 'TL', dist: 0.3, angle: -14 }, { kind: 'black', spot: true },
        { kind: 'pink', spot: true }, { kind: 'blue', spot: true }],
      cue: { ball: 0, pocket: 'TL', cut: 22, dist: 0.62, side: -1 } },
    { name: 'Escape', skill: 'Hit the red off a cushion, then pot it',
      hint: 'The blue hides the red. Bounce the cue ball off a cushion so it hits the red first. Hitting the blue is a foul.',
      guide: 'line', shots: 4, stars: [2, 3], goal: { type: 'pots', count: 1 },
      balls: [{ kind: 'red', x: 0.62, y: 0.05 }, { kind: 'blue', spot: true }, { kind: 'black', spot: true }],
      cue: { x: -0.55, y: 0.0 } },
    { name: 'The Plant', skill: 'Knock one red into the other to pot it',
      hint: 'Hit the near red so it drives the far red into the corner. Only the far red counts.',
      guide: 'line', shots: 3, stars: [1, 2], goal: { type: 'plant', count: 1 },
      balls: [{ kind: 'red', pocket: 'BL', dist: 0.28, angle: 0 }, { kind: 'red', pocket: 'BL', dist: 0.44, angle: 0 }],
      cue: { ball: 1, ghostOf: 0, pocket: 'BL', cut: 24, dist: 0.5, side: 1 } },
    { name: 'Clear the Colours', skill: 'Yellow to black, in order',
      hint: 'Ball in hand: drag the cue ball anywhere in the D, then Enter. Yellow, green, brown, blue, pink, black.',
      hint_touch: 'Ball in hand: drag the cue ball anywhere in the D, then Place. Yellow, green, brown, blue, pink, black.',
      guide: 'line', shots: 10, stars: [6, 8], goal: { type: 'pots', count: 6 },
      balls: [{ kind: 'yellow', spot: true }, { kind: 'green', spot: true }, { kind: 'brown', spot: true },
        { kind: 'blue', spot: true }, { kind: 'pink', spot: true }, { kind: 'black', spot: true }],
      cue: 'D' },
    { name: 'Break of 30', skill: 'Red, colour, red: keep the break going',
      hint: 'Score 30 in one visit. A missed pot ends the visit. Play each shot for the next one.',
      guide: 'short', shots: 99, stars: [50, 40], goal: { type: 'break', target: 30 },
      balls: [{ kind: 'red', x: 1.05, y: 0.26 }, { kind: 'red', x: 1.16, y: -0.31 }, { kind: 'red', x: 1.3, y: 0.11 },
        { kind: 'red', x: 1.56, y: -0.16 }, { kind: 'red', x: 0.74, y: 0.46 }, { kind: 'red', x: 1.25, y: 0.56 },
        { kind: 'yellow', spot: true }, { kind: 'green', spot: true }, { kind: 'brown', spot: true },
        { kind: 'blue', spot: true }, { kind: 'pink', spot: true }, { kind: 'black', spot: true }],
      cue: { x: 0.55, y: -0.18 } },
  ],
};
