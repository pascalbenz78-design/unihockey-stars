// Spieler während eines Matches: Position, Bewegung, Ausdauer, Kelle.

import { CONFIG, rating } from '../config.js';
import { boardContact, pushOutOfCrease, clampToCrease } from './field.js';

const PL = CONFIG.player;
const ST = CONFIG.stamina;

export class MPlayer {
  constructor(data, team) {
    this.data = data;
    this.id = data.id;
    this.team = team;
    this.role = null;           // 'C','LW','RW','LD','RD','G' solange auf dem Feld
    this.isGoalie = data.pos === 'G';
    this.onField = false;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = 0;
    this.stamina = 1;
    this.r = PL.radius;
    // Steuerwunsch (von KI oder Mensch): Bewegung −1..1, Sprint, Blickrichtung
    this.ctrl = { mx: 0, my: 0, sprint: false, face: null };
    this.charge = null;         // Sekunden Schuss-Aufladung (null = nicht am Laden)
    this.pickupCooldown = 0;
    this.stealCooldown = 0;
    this.decisionTimer = Math.random() * 0.2;
    this.holdTimer = 0;         // Goalie hält den Ball
    this.oneTimerUntil = -1;
    this.diving = 0;            // Goalie-Hechtsprung
    this.reactTimer = 0;        // Goalie-Reaktion
    this.anim = { action: 'idle', t: 0, dir: 0 };
    this.fallen = 0;            // gestürzt: kann sich kurz nicht bewegen
    this.slide = false;         // Knierutscher beim Jubel
    this.inBox = false;         // sitzt auf der Strafbank
    this.injuredNow = null;     // in diesem Spiel verletzt
    this.sprinting = false;
    this.wander = Math.random() * 100;
    // Statistik
    this.goals = 0; this.assists = 0; this.shots = 0;
  }

  get s() { return this.data.stats; }
  stat(name) { return rating(this.data.stats[name]); }
  get handSign() { return this.data.stickSide === 'L' ? 1 : -1; }
  get speed() { return Math.hypot(this.vx, this.vy); }

  // Position der Kelle (Ball wird dort geführt)
  stickPoint(out = {}) {
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    const side = PL.stickSide * this.handSign;
    out.x = this.x + c * PL.stickOffset - s * side;
    out.y = this.y + s * PL.stickOffset + c * side;
    return out;
  }

  // Höchstgeschwindigkeit unter Berücksichtigung von Tempo, Müdigkeit, Sprint
  maxSpeed(match) {
    if (this.isGoalie) return CONFIG.goalie.speed * (0.85 + 0.3 * this.stat('reflexe'));
    let v = PL.maxSpeed * (PL.minSpeedFactor + (1 - PL.minSpeedFactor) * this.stat('tempo'));
    v *= 1 - ST.tiredSpeedLoss * (1 - this.stamina);
    v *= match.tempo;
    if (this.sprinting) v *= PL.sprintFactor;
    if (match.ball.owner === this) v *= PL.carryFactor;
    return v;
  }

  setPos(x, y, facing = this.facing) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.facing = facing;
    this.charge = null; this.anim.action = 'idle';
  }

  update(dt, match) {
    this.pickupCooldown -= dt;
    this.stealCooldown -= dt;
    this.diving = Math.max(0, this.diving - dt);
    this.anim.t += dt;

    const c = this.ctrl;
    let mx = c.mx, my = c.my;
    if (this.fallen > 0) { this.fallen -= dt; mx = 0; my = 0; }
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    this.sprinting = !!c.sprint && mag > 0.3 && this.stamina > 0.04 && !this.isGoalie;
    const vmax = this.maxSpeed(match);
    const tx = mx * vmax, ty = my * vmax;
    let dvx = tx - this.vx, dvy = ty - this.vy;
    const dv = Math.hypot(dvx, dvy);
    const acc = (this.slide ? 2.2 : this.isGoalie ? 26 : PL.accel) * match.tempo * dt;
    if (dv > acc) { dvx *= acc / dv; dvy *= acc / dv; }
    this.vx += dvx; this.vy += dvy;
    this.x += this.vx * dt; this.y += this.vy * dt;

    // Blickrichtung
    let want = null;
    const sp = this.speed;
    if (c.face != null && (sp < 1.8 || this.isGoalie)) want = c.face;
    else if (sp > 0.4) want = Math.atan2(this.vy, this.vx);
    if (want != null) {
      let d = want - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const maxTurn = PL.turnRate * dt;
      this.facing += Math.max(-maxTurn, Math.min(maxTurn, d));
    }

    // Ausdauer
    if (!this.isGoalie) {
      const effort = this.sprinting ? ST.sprintFactor : sp > 1.5 ? 1 : ST.idleFactor;
      this.stamina -= ST.drainPerSec * effort * (1 - ST.ausdauerEffect * this.stat('ausdauer')) * dt;
      if (this.stamina < 0) this.stamina = 0;
    }

    // Animation: Laufen/Stehen, solange keine Aktion läuft
    const a = this.anim;
    const busy = (a.action === 'shoot' && a.t < 0.45) || (a.action === 'pass' && a.t < 0.35) ||
      (a.action === 'save' && a.t < 0.6) || a.action === 'cheer' || a.action === 'celebrate' || a.action === 'signal' ||
      (a.action === 'fall' && (a.t < 1.2 || this.fallen > 0)) ||
      (a.action === 'throw' && a.t < 0.5);
    if (!busy) {
      const next = this.charge != null ? 'charge' : sp > 0.5 ? 'run' : 'idle';
      if (a.action !== next) { a.action = next; a.t = 0; }
    }
  }

  constrain() {
    const c = boardContact(this.x, this.y, this.r);
    if (c) {
      this.x += c.nx * c.depth; this.y += c.ny * c.depth;
      const vn = this.vx * c.nx + this.vy * c.ny;
      if (vn < 0) { this.vx -= vn * c.nx; this.vy -= vn * c.ny; }
    }
    if (this.isGoalie) clampToCrease(this, this.team.side, 0.2);
    else if (pushOutOfCrease(this, this.r)) {
      // Geschwindigkeit nicht in den Torraum hinein
    }
  }

  recover(dt) {
    this.stamina = Math.min(1, this.stamina + ST.recoverBench * dt);
  }

  playAnim(action, dir = 0) {
    this.anim.action = action; this.anim.t = 0; this.anim.dir = dir;
  }
}
