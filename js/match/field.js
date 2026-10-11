// Geometrie des Spielfelds in 2D: Banden (abgerundetes Rechteck), Torraum,
// Tore und Bully-Punkte. Reine Mathematik, ohne Three.js.

import { CONFIG } from '../config.js';

const F = CONFIG.field;
export const HALF_L = F.length / 2;
export const HALF_W = F.width / 2;
export const GOAL_X = HALF_L - F.goalLineDist;          // 16.5
export const GOAL_HALF_W = F.goalWidth / 2;
export const GOAL_BACK_X = GOAL_X + F.goalDepth;        // 17.15
export const CREASE_BACK_X = HALF_L - F.creaseFromEnd;  // 17.15
export const CREASE_FRONT_X = CREASE_BACK_X - F.creaseDepth; // 13.15
export const CREASE_HALF_W = F.creaseWidth / 2;

// Kontakt mit der Bande für einen Kreis mit Radius r.
// Gibt null zurück oder { nx, ny, depth } mit Normalen ins Feld hinein.
export function boardContact(x, y, r) {
  const R = F.cornerRadius;
  const ax = Math.abs(x), ay = Math.abs(y);
  const qx = ax - (HALF_L - R), qy = ay - (HALF_W - R);
  if (qx > 0 && qy > 0) {
    const d = Math.hypot(qx, qy);
    const depth = d - (R - r);
    if (depth > 0) return { nx: -Math.sign(x) * qx / d, ny: -Math.sign(y) * qy / d, depth };
    return null;
  }
  let best = null;
  const dx = ax - (HALF_L - r);
  if (dx > 0) best = { nx: -Math.sign(x), ny: 0, depth: dx };
  const dy = ay - (HALF_W - r);
  if (dy > 0 && (!best || dy > best.depth)) best = { nx: 0, ny: -Math.sign(y), depth: dy };
  return best;
}

// Liegt der Punkt innerhalb der Banden?
export function insideRink(x, y, margin = 0) {
  return boardContact(x, y, margin) === null;
}

// Torraum der Seite side (+1 rechts, −1 links), um r erweitert
export function creaseRect(side, r = 0) {
  const x0 = side > 0 ? CREASE_FRONT_X : -CREASE_BACK_X;
  const x1 = side > 0 ? CREASE_BACK_X : -CREASE_FRONT_X;
  return { x0: x0 - r, x1: x1 + r, y0: -CREASE_HALF_W - r, y1: CREASE_HALF_W + r };
}

export function inRect(p, rc) {
  return p.x > rc.x0 && p.x < rc.x1 && p.y > rc.y0 && p.y < rc.y1;
}

export function inCrease(x, y, side, r = 0) {
  const rc = creaseRect(side, r);
  return x > rc.x0 && x < rc.x1 && y > rc.y0 && y < rc.y1;
}

// Schiebt einen Punkt (Feldspieler) aus dem Torraum auf den nächsten Rand.
export function pushOutOfCrease(p, r) {
  for (const side of [1, -1]) {
    const rc = creaseRect(side, r);
    if (!inRect(p, rc)) continue;
    const opts = [
      { d: p.x - rc.x0, x: rc.x0, y: p.y },
      { d: rc.x1 - p.x, x: rc.x1, y: p.y },
      { d: p.y - rc.y0, x: p.x, y: rc.y0 },
      { d: rc.y1 - p.y, x: p.x, y: rc.y1 },
    ];
    // Richtung Endbande nur, wenn dort wirklich Platz ist
    opts.sort((a, b) => a.d - b.d);
    p.x = opts[0].x; p.y = opts[0].y;
    return true;
  }
  return false;
}

// Hält einen Punkt im Torraum (Goalie).
export function clampToCrease(p, side, inset = 0.25) {
  const rc = creaseRect(side, -inset);
  p.x = Math.max(rc.x0, Math.min(rc.x1, p.x));
  p.y = Math.max(rc.y0, Math.min(rc.y1, p.y));
}

// Schneidet die Strecke a→b den (erweiterten) Torraum? Dann Umweg über die
// nächste Ecke liefern, sonst b selbst.
export function routeAroundCrease(a, b, r) {
  for (const side of [1, -1]) {
    const rc = creaseRect(side, r + 0.15);
    if (!segmentHitsRect(a, b, rc)) continue;
    if (inRect(a, rc)) return b;
    const corners = [
      { x: rc.x0, y: rc.y0 }, { x: rc.x0, y: rc.y1 },
      { x: rc.x1, y: rc.y0 }, { x: rc.x1, y: rc.y1 },
    ];
    let best = null, bd = Infinity;
    for (const c of corners) {
      // Ecken innerhalb der Bande bevorzugen, kürzester Umweg
      const d = Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y);
      if (d < bd && !segmentHitsRect(a, shrinkTowards(c, rc), rc)) { bd = d; best = c; }
    }
    if (!best) {
      for (const c of corners) {
        const d = Math.hypot(c.x - a.x, c.y - a.y);
        if (d < bd) { bd = d; best = c; }
      }
    }
    // Leicht nach aussen versetzen, damit die Ecke erreichbar bleibt
    const cx = (rc.x0 + rc.x1) / 2;
    return { x: best.x + Math.sign(best.x - cx) * 0.3, y: best.y + Math.sign(best.y) * 0.3 };
  }
  return b;
}

function shrinkTowards(c, rc) {
  const cx = (rc.x0 + rc.x1) / 2, cy = (rc.y0 + rc.y1) / 2;
  return { x: c.x + Math.sign(c.x - cx) * 0.01, y: c.y + Math.sign(c.y - cy) * 0.01 };
}

function segmentHitsRect(a, b, rc) {
  // Liang-Barsky
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - rc.x0, rc.x1 - a.x, a.y - rc.y0, rc.y1 - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 < t1;
}

// Segmente des Torgehäuses (Seitennetze, Rücknetz) für Seite side
export function goalSegments(side) {
  const gx = side * GOAL_X, bx = side * GOAL_BACK_X, w = GOAL_HALF_W;
  return [
    { a: { x: gx, y: -w }, b: { x: bx, y: -w } },
    { a: { x: gx, y: w }, b: { x: bx, y: w } },
    { a: { x: bx, y: -w }, b: { x: bx, y: w } },
  ];
}

export function goalPosts(side) {
  return [{ x: side * GOAL_X, y: -GOAL_HALF_W }, { x: side * GOAL_X, y: GOAL_HALF_W }];
}

export const FACEOFF_SPOTS = (() => {
  const yy = HALF_W - F.faceoffBoardDist;
  return [
    { x: 0, y: 0 },
    { x: 0, y: yy }, { x: 0, y: -yy },
    { x: GOAL_X, y: yy }, { x: GOAL_X, y: -yy },
    { x: -GOAL_X, y: yy }, { x: -GOAL_X, y: -yy },
  ];
})();

export function nearestFaceoffSpot(x, y) {
  let best = FACEOFF_SPOTS[0], bd = Infinity;
  for (const s of FACEOFF_SPOTS) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// Spielerbank-Tür (Seite y > 0) vor der eigenen Verteidigungshälfte.
// defendSide = −1 (linkes Tor) oder +1 (rechtes Tor).
export function benchGate(defendSide) {
  return { x: defendSide * F.benchX, y: HALF_W - 0.7 };
}
