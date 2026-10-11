// Goalie-KI: Winkel verkürzen, auf Schüsse reagieren (mit Reaktionszeit),
// freie Bälle im Torraum holen und den gefangenen Ball abwerfen.

import { CONFIG } from '../config.js';
import { GOAL_X, GOAL_HALF_W, inCrease } from '../match/field.js';
import { predictGoalLine } from '../match/ball.js';
import { clamp, lerp } from '../match/util.js';

const GK = CONFIG.goalie;

export function updateGoalieAI(g, m, dt) {
  if (!g) return;
  const team = g.team, side = team.side, ball = m.ball;
  const cx = side * GOAL_X;
  const faceOut = side > 0 ? Math.PI : 0;

  if (ball.owner === g) {
    g.ctrl.mx = 0; g.ctrl.my = 0; g.ctrl.face = faceOut;
    g.holdTime = (g.holdTime || 0) + dt;
    if (!m.isHumanControlled(g) && g.holdTime >= g.holdTimer) {
      m.passTo(g, pickThrowTarget(g, m), false);
    }
    return;
  }

  const pr = !ball.owner && ball.vx * side > 2 ? predictGoalLine(ball, side) : null;
  const threat = pr && Math.abs(pr.y) < GOAL_HALF_W + 0.6 && pr.t < 1.4 && ball.speed > 5;
  if (threat) {
    if (!g.threat) {
      g.threat = true;
      g.reactTimer = lerp(GK.reactionMax, GK.reactionMin, g.stat('reflexe')) / team.goalieFactor;
    }
  } else { g.threat = false; g.reactTimer = 0; }
  g.reactTimer = Math.max(0, g.reactTimer - dt);

  let tx, ty;
  if (threat && g.reactTimer <= 0) {
    const t = Math.max(0, (g.x - ball.x) / (ball.vx || 1e-6));
    tx = g.x;
    ty = clamp(ball.y + ball.vy * t, -GOAL_HALF_W - 0.3, GOAL_HALF_W + 0.3);
  } else if (!ball.owner && ball.speed < 6 && inCrease(ball.x, ball.y, side, 0)) {
    tx = ball.x; ty = ball.y;
  } else {
    const bx = ball.x, by = ball.y;
    if (bx * side > GOAL_X - 0.2) {
      // Ball hinter der Torlinie: an den Pfosten
      tx = side * (GOAL_X - 0.35);
      ty = (Math.sign(by) || 1) * (GOAL_HALF_W - 0.22);
    } else {
      const vx = bx - cx, vy = by, l = Math.hypot(vx, vy) || 1;
      const depth = GK.lineOffset + GK.angleDepth * clamp(l / 14, 0, 1) * (0.5 + 0.5 * g.stat('stellung'));
      tx = cx + vx / l * depth;
      ty = vy / l * depth;
      if (tx * side > GOAL_X - 0.3) tx = side * (GOAL_X - 0.3);
    }
  }
  const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
  const mag = d > 0.25 ? 1 : d / 0.25;
  g.ctrl.mx = d > 0.01 ? dx / d * mag : 0;
  g.ctrl.my = d > 0.01 ? dy / d * mag : 0;
  g.ctrl.sprint = false;
  g.ctrl.face = Math.atan2(ball.y - g.y, ball.x - g.x);
}

function pickThrowTarget(g, m) {
  const team = g.team, opp = m.other(team), d = team.attackDir;
  let best = null, bv = -Infinity;
  for (const r of team.skaters) {
    const open = Math.min(...opp.skaters.map(o => Math.hypot(o.x - r.x, o.y - r.y)));
    const dist = Math.hypot(r.x - g.x, r.y - g.y);
    if (dist < 3) continue;
    const lane = m.laneBlocked(g, r, 1.0) ? -2 : 0;
    const v = Math.min(open, 5) + r.x * d * 0.06 + lane - Math.max(0, dist - 18) * 0.2 + Math.random() * 0.8;
    if (v > bv) { bv = v; best = r; }
  }
  return best || team.skaters[0];
}
