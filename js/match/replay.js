// Zeichnet die letzten Sekunden auf (Positionen, Animationen, Ball), damit
// nach einem Tor eine Wiederholung in Zeitlupe gezeigt werden kann.

export class Recorder {
  constructor(seconds = 4.5, hz = 30) {
    this.max = Math.ceil(seconds * hz);
    this.dt = 1 / hz;
    this.frames = [];
    this.acc = 0;
  }

  clear() { this.frames = []; this.acc = 0; }

  tick(m, dt) {
    this.acc += dt;
    if (this.acc < this.dt) return;
    this.acc -= this.dt;
    const players = [];
    const add = p => players.push({
      p, x: p.x, y: p.y, f: p.facing, s: p.speed, a: p.anim.action, at: p.anim.t, d: p.anim.dir,
      c: p.charge, h: p.isGoalie && m.ball.owner === p,
    });
    for (const p of m.allOnField) add(p);
    for (const l of m.leaving) add(l.p);
    const b = m.ball;
    this.frames.push({ t: m.time, players, ball: { x: b.x, y: b.y, z: b.z } });
    if (this.frames.length > this.max) this.frames.shift();
  }

  // Ausschnitt [from, to] (Spielzeit) als eigene Liste
  cut(from, to) {
    return this.frames.filter(f => f.t >= from && f.t <= to);
  }
}

// Zwischenbild für die Zeit t (lineare Interpolation)
export function frameAt(frames, t) {
  if (!frames.length) return null;
  let i = 0;
  while (i < frames.length - 2 && frames[i + 1].t < t) i++;
  const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
  const k = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
  const bm = new Map(b.players.map(s => [s.p, s]));
  const players = new Map();
  for (const s of a.players) {
    const n = bm.get(s.p) || s;
    let df = n.f - s.f;
    df = Math.atan2(Math.sin(df), Math.cos(df));
    players.set(s.p, {
      x: s.x + (n.x - s.x) * k, y: s.y + (n.y - s.y) * k, facing: s.f + df * k,
      speed: s.s + (n.s - s.s) * k,
      action: k < 0.5 ? s.a : n.a, t: k < 0.5 ? s.at + (b.t - a.t) * k : n.at - (b.t - a.t) * (1 - k),
      dir: s.d, charge: s.c != null ? s.c : null, holding: s.h,
    });
  }
  const ball = {
    x: a.ball.x + (b.ball.x - a.ball.x) * k, y: a.ball.y + (b.ball.y - a.ball.y) * k, z: a.ball.z + (b.ball.z - a.ball.z) * k,
  };
  return { players, ball };
}
