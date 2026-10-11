// KI der Feldspieler: Angriff (Positionen, Freilaufen), Verteidigung
// (Pressing, Zonen mit Manndeckung), freie Bälle und Entscheide des
// Ballführers (Schuss, Pass, Bandenpass, Dribbling).
//
// Viele Rechnungen laufen in «lokalen» Koordinaten: ax zeigt Richtung
// gegnerisches Tor, ay ist entsprechend gespiegelt (x = ax·d, y = ay·d).

import { CONFIG } from '../config.js';
import { GOAL_X, GOAL_HALF_W, HALF_W, CREASE_FRONT_X, boardContact, routeAroundCrease, inCrease } from '../match/field.js';
import { clamp, lerp, distToSegment } from '../match/util.js';

const AI = CONFIG.ai;

export function updateTeamAI(team, m, dt) {
  const ball = m.ball, opp = m.other(team), d = team.attackDir;
  const carrier = ball.owner;
  const skaters = team.skaters;
  let mode;
  if (carrier) mode = carrier.team === team ? 'attack' : 'defend';
  else if (ball.pass && ball.pass.to && ball.pass.to.team === team && ball.pass.to.onField) mode = 'attack';
  else mode = 'loose';

  const bax = ball.x * d, bay = ball.y * d;

  // Wer jagt den freien Ball?
  let chaser = null;
  if (!carrier) {
    if (ball.pass && ball.pass.to && ball.pass.to.team === team && ball.pass.to.onField) chaser = ball.pass.to;
    else {
      let bt = Infinity;
      for (const p of skaters) {
        const ip = intercept(p, ball, m);
        if (ip.t < bt) { bt = ip.t; chaser = p; }
      }
      // Ball im gegnerischen Torraum gehört dem Goalie
      if (inCrease(ball.x, ball.y, opp.side, -0.1) && ball.speed < 5) chaser = null;
      if (inCrease(ball.x, ball.y, team.side, -0.1) && ball.speed < 5) chaser = null;
    }
  }

  // Verteidigung: Pressing und Deckung
  let presser = null, helper = null;
  const marks = new Map();
  if (mode === 'defend' && !carrier.isGoalie) {
    const byDist = [...skaters].sort((a, b) => dist(a, carrier) - dist(b, carrier));
    presser = byDist[0];
    const ownGoalDist = Math.abs(carrier.x - team.side * GOAL_X) + Math.abs(carrier.y) * 0.5;
    if (ownGoalDist < 6 + 8 * team.skill) helper = byDist[1];
    assignMarks(team, opp, skaters.filter(p => p !== presser && p !== helper), marks, carrier, bax, bay);
  } else if (mode === 'loose' && m.lastPossTeam && m.lastPossTeam !== team) {
    assignMarks(team, opp, skaters.filter(p => p !== chaser), marks, null, bax, bay);
  }

  const attackShape = mode === 'attack' || (mode === 'loose' && m.lastPossTeam === team);

  for (const p of skaters) {
    const human = m.isHumanControlled(p);
    if (p === carrier) {
      if (!human) carrierAI(p, team, opp, m, dt);
      continue;
    }
    p.charge = null;
    if (p === chaser) {
      if (ball.pass && ball.pass.to === p) receivePass(p, ball, m);
      else {
        const ip = intercept(p, ball, m);
        moveTo(p, ip.x, ip.y, m, { sprint: ip.t > 0.6, arrive: 0.3 });
      }
      continue;
    }
    if (p === presser) {
      // Zwischen Ballführer und eigenes Tor, eng dran
      const gx = team.side * GOAL_X;
      const vx = gx - carrier.x, vy = -carrier.y, l = Math.hypot(vx, vy) || 1;
      const close = 0.65 + (1 - team.skill) * 0.5;
      moveTo(p, carrier.x + vx / l * close + carrier.vx * 0.15, carrier.y + vy / l * close + carrier.vy * 0.15, m,
        { sprint: dist(p, carrier) > 3, arrive: 0.4, face: Math.atan2(carrier.y - p.y, carrier.x - p.x) });
      continue;
    }
    if (p === helper) {
      // Passweg Richtung Tormitte zustellen
      const gx = team.side * (GOAL_X - 3);
      moveTo(p, lerp(carrier.x, gx, 0.45), lerp(carrier.y, 0, 0.55), m, { sprint: false, arrive: 0.8 });
      continue;
    }
    let slot;
    if (attackShape) slot = attackSlot(p, team, opp, m, bax, bay, carrier);
    else slot = defendSlot(p, team, m, bax, bay);
    const mk = marks.get(p);
    if (mk) {
      const gx = team.side * GOAL_X;
      const vx = gx - mk.x, vy = -mk.y, l = Math.hypot(vx, vy) || 1;
      const mx = mk.x + vx / l * 1.3, my = mk.y + vy / l * 1.3;
      const w = 0.45 + 0.3 * team.skill;
      slot = { x: lerp(slot.x, mx, w), y: lerp(slot.y, my, w) };
    }
    const far = dist(p, slot);
    // Sprint bei Konter bzw. wenn man weit hinter dem Spiel ist
    const sprint = far > 6 && p.stamina > 0.35;
    moveTo(p, slot.x, slot.y, m, { sprint, arrive: 1.4 });
  }
}

// ------------------------------------------------------------ Positionen

function attackSlot(p, team, opp, m, bax, bay, carrier) {
  const d = team.attackDir;
  const push = clamp((bax + 4) / 14, 0, 1);
  const w = Math.sin(m.time * 0.6 + p.wander) * 1.3;
  const w2 = Math.cos(m.time * 0.45 + p.wander * 1.7) * 1.1;
  let ax, ay;
  switch (p.role) {
    case 'LD': ax = lerp(-13, 3.5, push); ay = 5.2; break;
    case 'RD': ax = lerp(-13, 3.5, push); ay = -5.2; break;
    case 'C': ax = lerp(-5, 9.5, push); ay = 0; break;
    case 'LW': ax = lerp(-1, 12.5, push); ay = 6.3; break;
    default: ax = lerp(-1, 12.5, push); ay = -6.3; break;
  }
  ax += w; ay += w2 + (bay - ay) * 0.15;
  let x = ax * d, y = ay * d;
  // Freilaufen: weg vom nächsten Gegner und nicht direkt neben den Ballführer
  let near = null, nd = Infinity;
  for (const o of opp.skaters) { const dd = Math.hypot(o.x - x, o.y - y); if (dd < nd) { nd = dd; near = o; } }
  if (near && nd < 2.6) {
    const ux = (x - near.x) / (nd || 1), uy = (y - near.y) / (nd || 1);
    x += ux * (2.6 - nd); y += uy * (2.6 - nd);
  }
  if (carrier && carrier !== p) {
    const cd = Math.hypot(carrier.x - x, carrier.y - y);
    if (cd < 3.5) { x += (x - carrier.x) / (cd || 1) * (3.5 - cd); y += (y - carrier.y) / (cd || 1) * (3.5 - cd); }
  }
  return keepInside(x, y);
}

function defendSlot(p, team, m, bax, bay) {
  const d = team.attackDir;
  const deep = clamp((-bax + 4) / 14, 0, 1);
  const shift = clamp(bay * 0.35, -3, 3);
  let ax, ay;
  switch (p.role) {
    case 'LD': ax = lerp(-4, -13.6, deep); ay = 2.6; break;
    case 'RD': ax = lerp(-4, -13.6, deep); ay = -2.6; break;
    case 'C': ax = lerp(1, -10.5, deep); ay = 0; break;
    case 'LW': ax = lerp(4, -8.5, deep); ay = 5; break;
    default: ax = lerp(4, -8.5, deep); ay = -5; break;
  }
  ay += shift;
  return keepInside(ax * d, ay * d);
}

// Jeder Verteidiger übernimmt den gefährlichsten freien Gegner in seiner Nähe
function assignMarks(team, opp, defenders, marks, carrier, bax, bay) {
  const gx = team.side * GOAL_X;
  const attackers = opp.skaters.filter(o => o !== carrier)
    .sort((a, b) => Math.hypot(a.x - gx, a.y) - Math.hypot(b.x - gx, b.y));
  const free = new Set(defenders);
  for (const a of attackers) {
    if (Math.hypot(a.x - gx, a.y) > 20) continue;
    let best = null, bd = 6;
    for (const dd of free) {
      const slot = defendSlot(dd, team, null, bax, bay);
      const v = Math.hypot(slot.x - a.x, slot.y - a.y);
      if (v < bd) { bd = v; best = dd; }
    }
    if (best) { marks.set(best, a); free.delete(best); }
  }
}

// ------------------------------------------------------------ Ballführer

function carrierAI(p, team, opp, m, dt) {
  const ball = m.ball, d = team.attackDir;
  p.ai = p.ai || {};
  const ai = p.ai;
  if (ai.since !== p.receivedAt) {
    ai.since = p.receivedAt;
    ai.lane = (Math.random() - 0.5) * 7;
    ai.dribble = null;
    ai.minHold = null;
  }

  // Schuss wird aufgeladen
  if (p.charge != null) {
    p.charge += dt;
    p.ctrl.mx *= 0.9; p.ctrl.my *= 0.9; p.ctrl.sprint = false;
    if (p.charge >= ai.chargeGoal) m.shoot(p, Math.min(1, p.charge / CONFIG.shot.chargeTime), ai.shotTarget);
    return;
  }

  p.decisionTimer -= dt;
  if (p.decisionTimer <= 0) {
    p.decisionTimer = AI.decisionInterval * (1.35 - 0.5 * team.skill) * (0.7 + Math.random() * 0.6);
    if (decide(p, team, opp, m)) return;
  }
  const tgt = ai.dribble || dribbleTarget(p, team, opp, m);
  moveTo(p, tgt.x, tgt.y, m, { sprint: ai.sprint, arrive: 0.6 });
}

function decide(p, team, opp, m) {
  const ai = p.ai, d = team.attackDir;
  const noise = (1 - team.skill) * 0.35;
  const sv = shotValue(p.x, p.y, team, opp, m) + (Math.random() - 0.5) * noise;
  const fresh = p.receivedPass && m.time - p.receivedAt < 0.2;
  const held = m.time - p.receivedAt;
  const pressure = nearestDist(p, opp.skaters);
  const goalDist = Math.hypot(d * GOAL_X - p.x, p.y);

  if (sv > 0.36 || (fresh && sv > 0.26)) {
    const target = aiShotTarget(p, team, opp, m);
    if (fresh) { m.shoot(p, 0.5 + 0.35 * Math.random(), target, { oneTimer: true }); return true; }
    p.charge = 0;
    ai.chargeGoal = clamp(goalDist / 12, 0.12, 0.85) * CONFIG.shot.chargeTime * (0.7 + Math.random() * 0.5);
    if (pressure < 1.5) ai.chargeGoal *= 0.4;
    ai.shotTarget = target;
    return true;
  }

  ai.minHold = ai.minHold ?? AI.minHold * (0.6 + Math.random() * 0.8);
  const best = held > ai.minHold || pressure < 0.8 ? bestPass(p, team, opp, m) : null;
  if (best) {
    const better = best.v > sv + 0.3 + Math.random() * 0.2;
    const pressed = pressure < AI.passPressure && best.v > 0.1 && Math.random() < 0.6;
    const tooLong = held > 3 + team.skill * 1.5;
    if (better || pressed || tooLong) { m.passTo(p, best.r, best.bank); return true; }
  }
  // Ab und zu einfach abziehen
  if (sv > 0.1 && goalDist < AI.shootRange && Math.random() < 0.12) {
    p.charge = 0; ai.chargeGoal = 0.7 * CONFIG.shot.chargeTime; ai.shotTarget = aiShotTarget(p, team, opp, m);
    return true;
  }
  ai.dribble = dribbleTarget(p, team, opp, m);
  const ahead = opp.skaters.filter(o => (o.x - p.x) * d > 0 && Math.abs(o.y - p.y) < 4).length;
  ai.sprint = ahead <= 1 && p.stamina > 0.35 && (p.x * d) < 10;
  return false;
}

function dribbleTarget(p, team, opp, m) {
  const d = team.attackDir;
  const ax = p.x * d, ay = p.y * d;
  const lane = p.ai ? p.ai.lane : 0;
  let tax, tay;
  if (ax > GOAL_X - 1.2) { tax = GOAL_X - 4.5; tay = (Math.sign(ay) || 1) * 4.2; }
  else if (ax < 5) { tax = ax + 6; tay = lerp(ay, lane, 0.35); }
  else { tax = Math.min(ax + 4, CREASE_FRONT_X - 2.4); tay = clamp(lerp(ay, lane * 0.4, 0.4), -4.5, 4.5); }
  // Gegnern ausweichen
  for (const o of opp.skaters) {
    const oax = o.x * d, oay = o.y * d;
    const rx = oax - ax, ry = oay - ay, dd = Math.hypot(rx, ry);
    if (dd < 3.5 && rx > -0.5) {
      const away = Math.sign(ay - oay) || (Math.random() < 0.5 ? 1 : -1);
      tay += away * (3.5 - dd) * 1.2;
    }
  }
  tay = clamp(tay, -HALF_W + 1, HALF_W - 1);
  return keepInside(tax * d, tay * d);
}

// Wie gut ist ein Schuss von (x,y)? −1 = unmöglich, ab ca. 0.35 gut
export function shotValue(x, y, team, opp, m) {
  const d = team.attackDir;
  const gx = d * GOAL_X;
  if (x * d > GOAL_X - 0.6) return -1;
  const dx = gx - x, dy = -y, dist = Math.hypot(dx, dy);
  if (dist > AI.shootRange) return -1;
  const angle = Math.atan2(Math.abs(dy), Math.abs(dx));
  let v = (1 - dist / AI.shootRange) * Math.pow(Math.cos(angle), 1.4);
  v += dist < AI.goodShotRange ? 0.1 : 0;
  for (const o of opp.skaters) {
    if (distToSegment(o.x, o.y, x, y, gx, 0) < 0.7) v -= 0.22;
  }
  return v;
}

function aiShotTarget(p, team, opp, m) {
  const d = team.attackDir;
  const g = opp.onField.G;
  const side = g.y > 0.05 ? -1 : g.y < -0.05 ? 1 : (Math.random() < 0.5 ? -1 : 1);
  return { x: d * (GOAL_X + 0.3), y: side * (GOAL_HALF_W - 0.14) };
}

function bestPass(p, team, opp, m) {
  const d = team.attackDir;
  let best = null;
  for (const r of team.skaters) {
    if (r === p) continue;
    const dd = dist(p, r);
    if (dd < 2.2 || dd > 24) continue;
    let bank = false;
    if (m.laneBlocked(p, r, 0.95)) {
      if (!bankLaneFree(p, r, opp)) continue;
      bank = true;
    }
    const open = Math.min(4, nearestDist(r, opp.skaters));
    if (open < 0.9) continue;
    const adv = (r.x - p.x) * d;
    let v = 0.3 * open / 4 + 0.5 * Math.max(0, shotValue(r.x, r.y, team, opp, m)) + 0.02 * adv - dd * 0.008 - (bank ? 0.1 : 0);
    if (adv < -8) v -= 0.2;
    if (!best || v > best.v) best = { r, v, bank };
  }
  return best;
}

function bankLaneFree(p, r, opp) {
  const sgn = (p.y + r.y) / 2 >= 0 ? 1 : -1;
  const B = sgn * HALF_W;
  const my = 2 * B - r.y;
  const t = (B - p.y) / (my - p.y);
  if (!(t > 0 && t < 1)) return false;
  const bx = p.x + (r.x - p.x) * t;
  if (Math.abs(bx) > 17) return false; // Ecken sind rund
  for (const o of opp.skaters) {
    if (distToSegment(o.x, o.y, p.x, p.y, bx, B) < 1) return false;
    if (distToSegment(o.x, o.y, bx, B, r.x, r.y) < 1) return false;
  }
  return true;
}

// ------------------------------------------------------------ Bewegung

function receivePass(p, ball, m) {
  const sp = ball.speed;
  if (sp < 1) { moveTo(p, ball.x, ball.y, m, { arrive: 0.3 }); return; }
  const ux = ball.vx / sp, uy = ball.vy / sp;
  const t = (p.x - ball.x) * ux + (p.y - ball.y) * uy;
  if (t < 0.3) { const ip = intercept(p, ball, m); moveTo(p, ip.x, ip.y, m, { sprint: true, arrive: 0.3 }); return; }
  const px = ball.x + ux * t, py = ball.y + uy * t;
  moveTo(p, px, py, m, { arrive: 0.25, face: Math.atan2(-uy, -ux) });
}

export function intercept(p, ball, m) {
  const vmax = Math.max(2, p.maxSpeed(m) * 1.05);
  const k = CONFIG.physics.ballDrag;
  let t = 0, x = ball.x, y = ball.y;
  for (let i = 0; i < 4; i++) {
    const f = (1 - Math.exp(-k * t)) / k;
    x = ball.x + ball.vx * f; y = ball.y + ball.vy * f;
    t = Math.hypot(x - p.x, y - p.y) / vmax;
  }
  const c = keepInside(x, y, 0.3);
  return { x: c.x, y: c.y, t };
}

export function moveTo(p, tx, ty, m, { sprint = false, arrive = 1.2, face = null } = {}) {
  const tgt = p.isGoalie ? { x: tx, y: ty } : routeAroundCrease(p, { x: tx, y: ty }, p.r);
  const dx = tgt.x - p.x, dy = tgt.y - p.y, d = Math.hypot(dx, dy);
  const mag = d > arrive ? 1 : d / arrive;
  p.ctrl.mx = d > 0.02 ? dx / d * mag : 0;
  p.ctrl.my = d > 0.02 ? dy / d * mag : 0;
  p.ctrl.sprint = sprint && d > 2.5 && p.stamina > 0.2;
  const b = m.ball;
  p.ctrl.face = face != null ? face : Math.atan2(b.y - p.y, b.x - p.x);
}

function keepInside(x, y, r = 0.6) {
  const c = boardContact(x, y, r);
  if (c) { x += c.nx * c.depth; y += c.ny * c.depth; }
  return { x, y };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function nearestDist(p, list) {
  let best = Infinity;
  for (const o of list) { const dd = dist(p, o); if (dd < best) best = dd; }
  return best;
}
