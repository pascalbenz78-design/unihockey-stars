// Regeln während des Spiels: Fouls mit Vorteil, 2-Minuten-Strafen mit
// Strafbank und Powerplay/Boxplay, Verletzungen.

import { CONFIG } from '../config.js';
import { HALF_W, nearestFaceoffSpot } from './field.js';

const R = CONFIG.rules;

export const FOUL_NAMES = {
  stockschlag: 'Stockschlag', hoherStock: 'Hoher Stock', behinderung: 'Behinderung', halten: 'Halten',
};
export const INJURY_NAMES = { leicht: 'leicht', mittel: 'mittel', schwer: 'schwer' };

// Strafbank zwischen den Spielerbänken: Heim links, Gast rechts der Mitte
export function penaltyBox(team) {
  const x = team.index === 0 ? -1.6 : 1.6;
  return { x, y: HALF_W + 1.0, door: { x, y: HALF_W - 0.6 } };
}

export class Rules {
  constructor(m) {
    this.m = m;
    this.pending = null;        // verzögerte Strafe (Vorteil läuft)
    this.signalUntil = -1;      // Schiedsrichter hebt den Arm
    this.log = [];              // ausgesprochene Strafen
    this.injuries = [];         // neue Verletzungen in diesem Spiel
    this.contactCd = new Map();
  }

  get injuryFactor() { return (CONFIG.difficulty[this.m.difficulty] || CONFIG.difficulty.mittel).injury; }
  get active() { return !this.m.shootout; }

  // ------------------------------------------------------------ Fouls

  // Stockeinsatz von d gegen den Ballführer carrier
  onTackle(d, carrier, success, front) {
    if (!this.active) return;
    const m = this.m;
    let p = R.foulBase * (front < -0.3 ? R.foulBehind : front > 0.3 ? R.foulFront : 1);
    p *= 1 + R.foulTired * (1 - d.stamina);
    p *= 1.4 - 0.8 * d.stat('zweikampf');
    if (!success) p *= R.foulMiss;
    p *= m.isHumanControlled(d) ? R.foulHuman : 1.3 - 0.5 * d.team.skill;
    const foul = Math.random() < p;
    if (foul) this.foul(d, carrier, front < -0.3 && Math.random() < 0.5 ? 'halten' : 'stockschlag');
    const rel = Math.hypot(d.vx - carrier.vx, d.vy - carrier.vy);
    const hard = 0.35 + rel / 9 + (foul ? 0.6 : 0);
    this.injuryCheck(carrier, hard);
    this.injuryCheck(d, hard * 0.4);
  }

  // Hoher Stock: Gegner direkt beim Schützen wird beim Ausholen getroffen
  onShot(p) {
    if (!this.active) return;
    for (const o of this.m.other(p.team).skaters) {
      if (Math.hypot(o.x - p.x, o.y - p.y) > 1.2) continue;
      if (Math.random() < R.highStick) { this.foul(p, o, 'hoherStock'); return; }
    }
  }

  // Körperkontakt zweier Gegner (aus der Kollisionsberechnung)
  onContact(a, b, rel, dt) {
    const m = this.m;
    if (!this.active || m.state !== 'play') return;
    const ball = m.ball;
    if (ball.pass && !ball.owner) {
      for (const [x, y] of [[a, b], [b, a]]) {
        if (ball.pass.to === y && ball.pass.from.team === y.team && Math.random() < R.interference * dt) {
          this.foul(x, y, 'behinderung');
          break;
        }
      }
    }
    if (rel > R.collisionSpeed) {
      const k = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      if ((this.contactCd.get(k) || 0) > m.time) return;
      this.contactCd.set(k, m.time + 0.8);
      this.injuryCheck(a, rel / 7);
      this.injuryCheck(b, rel / 7);
    }
  }

  foul(off, victim, type) {
    const m = this.m;
    if (this.pending || off.inBox || !off.onField || off.isGoalie || m.state !== 'play') return;
    this.pending = { off, victim, type, x: victim.x, y: victim.y, since: m.time };
    this.signalUntil = Infinity;
    m.emit({ type: 'foul', offender: off, victim, foul: type });
    if (victim.onField && !victim.isGoalie && Math.random() < R.fallChance) {
      victim.playAnim('fall');
      victim.fallen = 1.1;
      if (m.ball.owner === victim) {
        m.ball.owner = null;
        m.ball.vx = victim.vx * 0.5; m.ball.vy = victim.vy * 0.5;
        victim.pickupCooldown = 1.1;
      }
    }
    // Vorteil nur, wenn das gefoulte Team den Ball hat
    if (!(m.ball.owner && m.ball.owner.team === victim.team)) this.call();
  }

  tick(dt) {
    const m = this.m;
    if (this.pending) {
      const pd = this.pending, b = m.ball;
      if ((b.owner && b.owner.team === pd.off.team) || m.time - pd.since > R.advantageMax) this.call();
    }
    // Strafzeit läuft mit der Spieluhr
    for (const t of m.teams) {
      for (const pen of t.penalties) if (!pen.waiting) pen.remaining -= dt * m.clockRate;
      for (const pen of t.penalties.filter(p => !p.waiting && p.remaining <= 0)) this.endPenalty(t, pen);
    }
    // Ermüdung: Sprint mit fast leerer Ausdauer kann zu einer Verletzung führen
    for (const t of m.teams) {
      for (const p of t.skaters) {
        if (p.sprinting && p.stamina < 0.15 && Math.random() < R.fatigueInjury * this.injuryFactor * dt) this.injure(p, 0.3);
      }
    }
  }

  // Pfiff: Strafe aussprechen
  call() {
    const m = this.m, pd = this.pending;
    if (!pd) return;
    this.pending = null;
    const off = pd.off, t = off.team;
    const pen = { player: off, type: pd.type, remaining: R.penaltyGameSeconds, role: null, waiting: false };
    if (t.penalties.filter(p => !p.waiting).length >= R.maxPenalized) pen.waiting = true;
    this.sendToBox(off, pen);
    t.penalties.push(pen);
    this.log.push({ team: t.index, player: off.data, type: pd.type, period: m.period, clock: m.clock });
    this.signalUntil = m.time + 2.6;
    m.emit({ type: 'penalty', team: t, player: off, foul: pd.type });
    m.emit({ type: 'whistle', kind: 'penalty' });
    if (m.state === 'play') {
      m.state = 'penalty';
      m.timer = CONFIG.time.penaltyPause;
      m.faceoffSpot = nearestFaceoffSpot(pd.x, pd.y);
    }
  }

  sendToBox(off, pen) {
    const m = this.m, t = off.team;
    let role = off.onField ? off.role : null;
    if (off.onField) m.removeFromField(off);
    off.inBox = true;
    off.charge = null;
    const box = penaltyBox(t);
    m.leaving = m.leaving.filter(l => l.p !== off);
    m.leaving.push({ p: off, t: 0, target: box.door, box: true });
    if (pen.waiting) {
      if (role) m.fillRole(t, role);
      return;
    }
    if (!role) {
      // Täter sass schon auf der Bank: ein anderer Feldspieler geht raus
      role = ['RW', 'LW', 'C', 'RD', 'LD'].find(r => t.onField[r]);
      const pl = t.onField[role];
      m.removeFromField(pl);
      m.leaving.push({ p: pl, t: 0 });
    }
    t.vacant.add(role);
    t.pending.delete(role);
    pen.role = role;
  }

  endPenalty(t, pen) {
    const m = this.m;
    t.penalties.splice(t.penalties.indexOf(pen), 1);
    if (!t.penalties.some(p => p.player === pen.player)) pen.player.inBox = false;
    m.emit({ type: 'penaltyEnd', team: t, player: pen.player });
    const waiting = t.penalties.find(p => p.waiting);
    if (waiting) { waiting.waiting = false; waiting.role = pen.role; return; }
    if (!pen.role) return;
    t.vacant.delete(pen.role);
    let np = pen.player;
    if (np.injuredNow || np.onField || np.inBox) np = m.findReplacement(t, pen.role);
    if (!np) return;
    const door = penaltyBox(t).door;
    m.leaving = m.leaving.filter(l => l.p !== np);
    np.setPos(door.x, door.y, -Math.PI / 2);
    m.putOnField(t, pen.role, np);
  }

  // Tor gefallen: Vorteil/Powerplay auswerten
  onGoal(scoring) {
    const m = this.m;
    let cancelled = false;
    if (this.pending) {
      if (this.pending.off.team !== scoring) {
        this.pending = null; this.signalUntil = -1; cancelled = true;
      } else this.call();
    }
    // Powerplay-Tor beendet die Strafe mit der kürzesten Restzeit
    const opp = m.other(scoring);
    if (opp.vacant.size > scoring.vacant.size) {
      const pen = opp.penalties.filter(p => !p.waiting).sort((a, b) => a.remaining - b.remaining)[0];
      if (pen) this.endPenalty(opp, pen);
    }
    return cancelled;
  }

  // Drittelsende: offene Strafe sofort aussprechen
  flush() { if (this.pending) this.call(); }

  // ------------------------------------------------------------ Verletzungen

  injuryCheck(p, hard) {
    if (!this.active || !p.onField || p.isGoalie || p.injuredNow) return;
    const risk = R.injuryBase * hard * (1 + R.injuryTired * (1 - p.stamina) ** 2) * this.injuryFactor;
    if (Math.random() < risk) this.injure(p, hard);
  }

  injure(p, hard) {
    const m = this.m;
    if (!p.onField || p.isGoalie || p.injuredNow) return;
    const s = Math.random() * 0.6 + Math.min(1, hard) * 0.25 + (1 - p.stamina) * 0.3;
    const level = s < 0.5 ? 'leicht' : s < 0.82 ? 'mittel' : 'schwer';
    const [a, b] = R.injuryGames[level];
    const games = a + Math.floor(Math.random() * (b - a + 1));
    p.injuredNow = { level, games };
    this.injuries.push({ team: p.team.data, player: p.data, level, games });
    const role = p.role, t = p.team;
    if (m.ball.owner === p) { m.ball.owner = null; p.pickupCooldown = 2; }
    m.removeFromField(p);
    p.playAnim('fall');
    m.leaving = m.leaving.filter(l => l.p !== p);
    m.leaving.push({ p, t: 0, wait: 1.4 });
    m.replaceInLines(t, p, role);
    m.emit({ type: 'injury', player: p, team: t, level, games });
  }
}
