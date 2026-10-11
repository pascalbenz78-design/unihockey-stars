// Kleine Mathe-Helfer

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// Annähernd normalverteilt, Mittelwert 0, Streuung ~1
export function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;
}

export function distToSegment(px, py, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  const l2 = ex * ex + ey * ey;
  let t = l2 > 1e-9 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + ex * t), py - (ay + ey * t));
}
