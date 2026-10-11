// Steuerung durch den Menschen: wählt den gesteuerten Spieler und setzt
// Eingaben (Bewegung, Schuss, Pass …) in Aktionen um.

import { CONFIG } from '../config.js';
import { GOAL_X, GOAL_HALF_W } from './field.js';
import { predictGoalLine } from './ball.js';

const SH = CONFIG.shot;

export class HumanController {
  constructor(match, team) {
    this.match = match;
    this.team = team;
    this.controlled = team.onField.C;
    this.goalieMode = false;     // Goalie selbst übernommen (Taste G)
    this.autoGoalie = false;     // durch «Goalie automatisch übernehmen»
    this.goalieAssist = true;    // Goalie ohne Eingabe stellt sich selbst
    this.idle = 0;
    this.oneTimerUntil = -1;
    this.input = { mx: 0, my: 0, sprint: false, shootHeld: false };
    this.pressed = {};
  }

  // Wird pro Bild vom Hauptprogramm aufgerufen
  setInput(state, pressed) {
    Object.assign(this.input, state);
    for (const k in pressed) if (pressed[k]) this.pressed[k] = true;
  }

  consume(k) { const v = !!this.pressed[k]; this.pressed[k] = false; return v; }

  active(p) { return p === this.controlled; }

  // Tasten, die auch während des Bullys gelten
  handleMeta() {
    const m = this.match;
    if (m.shootout) { this.pressed = {}; return; }
    if (this.consume('line')) {
      m.requestLineChange(this.team);
      if (m.state === 'faceoff') {
        m.processLineChanges(this.team, true);
        this.controlled = m.faceoffTaker(this.team) || this.fallback();
      }
    }
    if (this.consume('goalie')) this.toggleGoalie();
    if (this.consume('switch')) this.switchToNearest();
    this.pressed.shoot = this.pressed.pass = this.pressed.bank = this.pressed.sprint = false;
  }

  // Ersatz, falls kein Feldspieler verfügbar ist (Penaltyschiessen)
  fallback() { return this.nearestSkater() || this.team.onField.G || this.controlled; }

  toggleGoalie() {
    if (this.match.shootout || !this.team.onField.G) return;
    if (this.controlled.isGoalie) {
      this.goalieMode = false; this.autoGoalie = false;
      this.controlled = this.fallback();
    } else {
      this.goalieMode = true;
      this.controlled = this.team.onField.G;
    }
  }

  nearestSkater(exclude = null) {
    const b = this.match.ball;
    let best = null, bd = Infinity;
    for (const p of this.team.skaters) {
      if (p === exclude) continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  switchToNearest() {
    if (this.match.shootout) return;
    const cur = this.controlled;
    let n = this.nearestSkater();
    if (n === cur) n = this.nearestSkater(cur);
    if (!n) return;
    if (cur.isGoalie) { this.goalieMode = false; this.autoGoalie = false; }
    if (this.match.ball.owner === cur && !cur.isGoalie) return; // mit Ball nicht wegschalten
    this.controlled = n;
  }

  onFaceoff() {
    this.goalieMode = false; this.autoGoalie = false;
    this.controlled = this.match.faceoffTaker(this.team) || this.fallback();
    this.pressed = {};
  }

  // Gesteuerter Spieler verlässt das Feld (Strafe, Verletzung)
  onRemoved(p) {
    if (this.controlled !== p) return;
    const n = this.nearestSkater(p);
    if (n) this.controlled = n;
  }

  onPossession(p) {
    if (p.team !== this.team) {
      if (this.autoGoalie && this.controlled.isGoalie) { /* bleibt bis Gefahr vorbei */ }
      return;
    }
    if (p.isGoalie) {
      if (!this.controlled.isGoalie) return; // KI-Goalie wirft selbst ab
      return;
    }
    if (this.controlled.isGoalie && this.goalieMode && !this.autoGoalie) return;
    this.goalieMode = false; this.autoGoalie = false;
    this.controlled = p;
    // Direktschuss vorgemerkt?
    if (this.match.time <= this.oneTimerUntil && p.receivedPass) {
      this.oneTimerUntil = -1;
      this.match.shoot(p, 0.65, this.shotTarget(p), { oneTimer: true });
    }
  }

  onSubstituted(oldP, newP) {
    if (this.controlled === oldP) this.controlled = newP;
  }

  preTick(dt) {
    const m = this.match, b = m.ball, inp = this.input;
    if (!this.controlled.onField) this.controlled = this.fallback();
    if (!m.shootout) this.handleMetaInPlay();
    else { this.pressed.line = this.pressed.goalie = this.pressed.switch = false; }

    // Goalie automatisch übernehmen bei Schuss aufs eigene Tor
    const g = this.team.onField.G;
    if (m.settings.autoGoalie && g && !m.shootout) {
      const threat = !b.owner && b.shot && b.shot.team !== this.team && b.speed > 6 && (() => {
        const pr = predictGoalLine(b, this.team.side);
        return pr && Math.abs(pr.y) < GOAL_HALF_W + 0.5 && pr.t < 1.2;
      })();
      if (threat && !this.controlled.isGoalie) {
        this.autoGoalie = true; this.controlled = g; this.idle = 0;
      } else if (this.autoGoalie && !threat && b.owner !== g && (b.owner || b.speed < 4 || b.vx * this.team.side < 0)) {
        this.autoGoalie = false; this.controlled = this.fallback();
      }
    }

    const p = this.controlled;
    const mag = Math.hypot(inp.mx, inp.my);
    p.ctrl.mx = inp.mx; p.ctrl.my = inp.my; p.ctrl.sprint = inp.sprint; p.ctrl.face = null;
    if (mag > 0.15) this.idle = 0; else this.idle += dt;

    if (p.isGoalie) {
      this.goalieAssist = this.idle > 0.25;
      if (this.consume('sprint') && p.diving <= 0) {
        p.diving = 0.45;
        const dir = Math.sign(inp.my * this.team.side) || 1;
        p.playAnim('save', -dir);
      }
      if (b.owner === p) {
        p.holdTime = (p.holdTime || 0) + dt;
        const wantPass = this.consume('pass') || this.consume('bank');
        const wantLong = this.consume('shoot');
        if (wantPass || wantLong || p.holdTime > CONFIG.goalie.maxHold) {
          const r = wantLong ? this.mostAdvanced() : m.pickReceiver(p, inp.mx, inp.my);
          m.passTo(p, r, false);
        }
      }
      this.consume('shoot'); this.consume('pass'); this.consume('bank');
      return;
    }
    this.goalieAssist = true;

    if (b.owner === p) {
      if (this.pressed.shoot && p.charge == null) { p.charge = 0; this.pressed.shoot = false; }
      if (p.charge != null) {
        p.charge += dt;
        if (!inp.shootHeld || p.charge >= SH.autoRelease) {
          const c = Math.min(1, p.charge / SH.chargeTime);
          m.shoot(p, c, this.shotTarget(p));
        }
      }
      if (b.owner === p && this.consume('pass')) m.passTo(p, m.pickReceiver(p, inp.mx, inp.my), false);
      if (b.owner === p && this.consume('bank')) m.passTo(p, m.pickReceiver(p, inp.mx, inp.my), true);
    } else {
      p.charge = null;
      if (this.consume('shoot')) {
        this.oneTimerUntil = m.time + SH.oneTimerWindow;
        if (b.owner && b.owner.team !== this.team) m.tryHumanSteal(p);
      }
      if (this.consume('pass') || this.consume('bank')) {
        if (b.owner && b.owner.team !== this.team) m.tryHumanSteal(p);
      }
    }
    this.consume('sprint');
  }

  handleMetaInPlay() {
    if (this.consume('line')) this.match.requestLineChange(this.team);
    if (this.consume('goalie')) this.toggleGoalie();
    if (this.consume('switch')) this.switchToNearest();
  }

  // Nach der KI: gesteuerten Spieler wieder auf Eingabe setzen (KI darf nur
  // beim Goalie ohne Eingabe und beim Annehmen eines Passes helfen)
  postAI() {
    const m = this.match, b = m.ball, inp = this.input;
    const p = this.controlled;
    if (p.isGoalie) {
      if (!this.goalieAssist) { p.ctrl.mx = inp.mx; p.ctrl.my = inp.my; p.ctrl.sprint = false; }
      return;
    }
    const mag = Math.hypot(inp.mx, inp.my);
    const incoming = b.pass && b.pass.to === p && !b.owner;
    if (incoming && mag < 0.15) return; // KI läuft dem Pass entgegen
    p.ctrl.mx = inp.mx; p.ctrl.my = inp.my; p.ctrl.sprint = inp.sprint; p.ctrl.face = null;
  }

  shotTarget(p) {
    const m = this.match, inp = this.input;
    const d = this.team.attackDir;
    const gx = d * GOAL_X;
    const dx = gx - p.x, dy = -p.y, dist = Math.hypot(dx, dy);
    const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
    const dot = (fx * dx + fy * dy) / dist;
    if (dot < -0.1 && dist > 9) return { x: p.x + fx * 20, y: p.y + fy * 20 };
    let aimY;
    if (Math.abs(inp.my) > 0.35) aimY = Math.sign(inp.my) * (GOAL_HALF_W - 0.12);
    else {
      const g = m.other(this.team).onField.G;
      aimY = (g.y > 0 ? -1 : 1) * (GOAL_HALF_W - 0.15) * (0.5 + Math.random() * 0.5);
    }
    return { x: gx + d * 0.3, y: aimY };
  }

  mostAdvanced() {
    const d = this.team.attackDir;
    let best = null, bv = -Infinity;
    for (const r of this.team.skaters) {
      const open = Math.min(...this.match.other(this.team).skaters.map(o => Math.hypot(o.x - r.x, o.y - r.y)));
      const v = r.x * d * 0.15 + Math.min(open, 4);
      if (v > bv) { bv = v; best = r; }
    }
    return best;
  }
}
