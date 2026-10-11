// Ball: 2D-Bewegung auf dem Feld plus Höhe z. Abpraller an Bande, Pfosten
// und Netz, Torerkennung und «Ball über die Bande».

import { CONFIG } from '../config.js';
import { boardContact, goalSegments, goalPosts, GOAL_X, GOAL_HALF_W, HALF_L, HALF_W } from './field.js';

const P = CONFIG.physics;
const F = CONFIG.field;

export class Ball {
  constructor() {
    this.r = P.ballRadius;
    this.reset(0, 0);
  }

  reset(x, y) {
    this.x = x; this.y = y; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.owner = null;        // Spieler, der den Ball führt
    this.lastTouch = null;    // letzter Spieler am Ball
    this.shot = null;         // { shooter, team, time } solange ein Schuss unterwegs ist
    this.pass = null;         // { from, to, time }
    this.inGoal = 0;          // Seite des Tors, in dem der Ball liegt
    this.out = false;
    this.goalieChecked = null; // Goalie, der diesen Schuss schon zu halten versucht hat
  }

  get speed() { return Math.hypot(this.vx, this.vy); }

  release() {
    this.owner = null;
  }
}

// Ein Zeitschritt für den freien Ball. events: Array, in das Ereignisse kommen.
export function stepBall(ball, dt, events) {
  if (ball.owner) return;
  const sp = Math.hypot(ball.vx, ball.vy, ball.vz);
  const n = Math.min(16, Math.max(1, Math.ceil(sp * dt / P.maxSubstep)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    substep(ball, h, events);
    if (ball.out) return;
  }
}

function substep(ball, h, events) {
  const px = ball.x, py = ball.y;

  // Höhe und Schwerkraft
  if (ball.z > 0 || ball.vz > 0) {
    ball.vz -= P.gravity * h;
    ball.z += ball.vz * h;
    if (ball.z <= 0) {
      ball.z = 0;
      if (ball.vz < -0.9) ball.vz = -ball.vz * P.floorBounce;
      else ball.vz = 0;
    }
  }

  // Reibung (in der Luft viel weniger)
  const onFloor = ball.z < 0.02;
  const drag = onFloor ? P.ballDrag : P.ballDrag * 0.25;
  const f = Math.exp(-drag * h);
  ball.vx *= f; ball.vy *= f;
  if (onFloor) {
    const s = Math.hypot(ball.vx, ball.vy);
    if (s > 0) {
      const ns = Math.max(0, s - P.ballRollDecel * h);
      ball.vx *= ns / s; ball.vy *= ns / s;
    }
  }

  ball.x += ball.vx * h;
  ball.y += ball.vy * h;

  // Tor: Ball muss die Torlinie ganz überquert haben
  if (!ball.inGoal) {
    for (const side of [1, -1]) {
      const lineX = GOAL_X + ball.r;
      const before = side * px, after = side * ball.x;
      if (before < lineX && after >= lineX) {
        const t = (lineX - before) / (after - before);
        const yc = py + (ball.y - py) * t;
        if (Math.abs(yc) < GOAL_HALF_W - ball.r) {
          if (ball.z < F.goalHeight - ball.r) {
            ball.inGoal = side;
            events.push({ type: 'goal', side });
          } else if (ball.z < F.goalHeight + ball.r * 1.5) {
            // Latte
            ball.x = side * (GOAL_X - ball.r);
            ball.vx = -ball.vx * 0.5;
            ball.vz = -Math.abs(ball.vz) * 0.4 - 0.5;
            events.push({ type: 'post', speed: Math.abs(ball.vx) * 2 });
          }
        }
      }
    }
  }

  // Torgehäuse (nur unterhalb der Latte)
  if (ball.z < F.goalHeight && Math.abs(ball.x) > GOAL_X - 0.3 && Math.abs(ball.y) < GOAL_HALF_W + 0.3) {
    const side = Math.sign(ball.x);
    for (const post of goalPosts(side)) {
      const dx = ball.x - post.x, dy = ball.y - post.y;
      const d = Math.hypot(dx, dy), min = ball.r + F.postRadius;
      if (d < min && d > 1e-6) {
        const nx = dx / d, ny = dy / d;
        ball.x = post.x + nx * min; ball.y = post.y + ny * min;
        const vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) {
          ball.vx -= (1 + P.postRestitution) * vn * nx;
          ball.vy -= (1 + P.postRestitution) * vn * ny;
          events.push({ type: 'post', speed: -vn });
        }
      }
    }
    for (const seg of goalSegments(side)) {
      collideSegment(ball, seg, P.netRestitution, events);
    }
  }

  // Bande
  const c = boardContact(ball.x, ball.y, ball.r);
  if (c) {
    if (ball.z < F.boardHeight) {
      ball.x += c.nx * c.depth; ball.y += c.ny * c.depth;
      const vn = ball.vx * c.nx + ball.vy * c.ny;
      if (vn < 0) {
        const tx = -c.ny, ty = c.nx;
        const vt = ball.vx * tx + ball.vy * ty;
        const nvn = -vn * P.boardRestitution, nvt = vt * P.boardFriction;
        ball.vx = c.nx * nvn + tx * nvt;
        ball.vy = c.ny * nvn + ty * nvt;
        events.push({ type: 'board', speed: -vn });
      }
    } else if (Math.abs(ball.x) > HALF_L + 0.2 || Math.abs(ball.y) > HALF_W + 0.2 || c.depth > 0.3) {
      ball.out = true;
      events.push({ type: 'out', x: ball.x, y: ball.y });
    }
  }
}

function collideSegment(ball, seg, rest, events) {
  const ax = seg.a.x, ay = seg.a.y, bx = seg.b.x, by = seg.b.y;
  const ex = bx - ax, ey = by - ay;
  const len2 = ex * ex + ey * ey;
  let t = ((ball.x - ax) * ex + (ball.y - ay) * ey) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + ex * t, cy = ay + ey * t;
  const dx = ball.x - cx, dy = ball.y - cy;
  const d = Math.hypot(dx, dy), min = ball.r + 0.02;
  if (d < min && d > 1e-6) {
    const nx = dx / d, ny = dy / d;
    ball.x = cx + nx * min; ball.y = cy + ny * min;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= (1 + rest) * vn * nx;
      ball.vy -= (1 + rest) * vn * ny;
      ball.vx *= 0.6; ball.vy *= 0.6;
      events.push({ type: 'net', speed: -vn });
    }
  }
}

// Wo überquert der Ball (bei aktueller Richtung, ohne Reibung) die Torlinie
// der Seite side? → { y, t } oder null
export function predictGoalLine(ball, side) {
  const vx = ball.vx * side;
  if (vx <= 0.5) return null;
  const dist = GOAL_X - ball.x * side;
  if (dist < -0.2) return null;
  const t = Math.max(0, dist) / vx;
  return { y: ball.y + ball.vy * t, t };
}
