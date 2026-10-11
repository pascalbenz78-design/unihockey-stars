// Ein Match: Teams, Linien, Ball, Spieluhr, Bully, Tore, Wechsel.
// Läuft mit festem Zeitschritt und kennt weder DOM noch Three.js.

import { CONFIG } from '../config.js';
import { Ball, stepBall } from './ball.js';
import { MPlayer } from './player.js';
import {
  GOAL_X, GOAL_HALF_W, HALF_W, boardContact, pushOutOfCrease, inCrease,
  nearestFaceoffSpot, benchGate,
} from './field.js';
import { updateTeamAI } from '../ai/teamAI.js';
import { updateGoalieAI } from '../ai/goalieAI.js';
import { HumanController } from './human.js';
import { clamp, lerp, gauss, distToSegment } from './util.js';

export { gauss, distToSegment };

export const ROLES = ['C', 'LW', 'RW', 'LD', 'RD'];
const T = CONFIG.time;
const PL = CONFIG.player;
const SH = CONFIG.shot;
const PA = CONFIG.pass;
const DU = CONFIG.duel;
const GK = CONFIG.goalie;

export class MTeam {
  constructor(index, data, side, skill, goalieFactor) {
    this.index = index;
    this.data = data;
    this.side = side;               // eigenes Tor: −1 links, +1 rechts
    this.players = new Map(data.players.map(p => [p.id, new MPlayer(p, this)]));
    this.activeLine = 0;
    this.nextLine = 0;
    this.pending = new Set();
    this.onField = {};
    this.goalie = this.players.get(data.goalies[0]);
    this.score = 0;
    this.stats = { shots: 0, onTarget: 0, passes: 0, passesOk: 0, possession: 0, saves: 0, steals: 0 };
    this.skill = skill;
    this.goalieFactor = goalieFactor;
    this.human = false;
    this.ai = { lineCheck: Math.random() };
  }
  get attackDir() { return -this.side; }
  get skaters() { return ROLES.map(r => this.onField[r]); }
  get all() { return [...this.skaters, this.onField.G]; }
  linePlayer(line, role) { return this.players.get(this.data.lines[line][role]); }
  avgStamina() {
    const s = this.skaters;
    return s.reduce((a, p) => a + p.stamina, 0) / s.length;
  }
}

export class Match {
  constructor({ teams, humanTeam = 0, difficulty = 'mittel', settings = {} }) {
    const diff = CONFIG.difficulty[difficulty] || CONFIG.difficulty.mittel;
    this.difficulty = difficulty;
    this.tempo = diff.tempo;
    this.settings = { autoChange: false, autoGoalie: false, ...settings };
    const skill = i => (humanTeam === i ? CONFIG.ai.teammateSkill : diff.skill);
    const gf = i => (humanTeam === i ? 1 : humanTeam == null ? 1 : diff.goalie);
    this.teams = [new MTeam(0, teams[0], -1, skill(0), gf(0)), new MTeam(1, teams[1], 1, skill(1), gf(1))];
    this.ball = new Ball();
    this.time = 0;
    this.period = 1;
    this.clock = T.periodGameSeconds;
    this.state = 'faceoff';
    this.timer = 0;
    this.events = [];
    this.goals = [];
    this.leaving = [];
    this.touches = [];
    this.lastPossTeam = null;
    this.faceoffSpot = { x: 0, y: 0 };
    this.lastEventSound = 0;

    for (const t of this.teams) {
      for (const r of ROLES) this.putOnField(t, r, t.linePlayer(0, r));
      t.goalie.onField = true; t.goalie.role = 'G'; t.onField.G = t.goalie;
    }
    this.human = null;
    if (humanTeam != null) {
      this.teams[humanTeam].human = true;
      this.human = new HumanController(this, this.teams[humanTeam]);
    }
    this.setupFaceoff({ x: 0, y: 0 });
  }

  other(team) { return this.teams[team.index ^ 1]; }
  get allOnField() { return [...this.teams[0].all, ...this.teams[1].all]; }
  emit(e) { this.events.push(e); }
  takeEvents() { const e = this.events; this.events = []; return e; }
  isHumanControlled(p) { return this.human && this.human.controlled === p && this.human.active(p); }

  putOnField(team, role, p) {
    p.onField = true; p.role = role; team.onField[role] = p;
  }

  // ---------------------------------------------------------------- Ablauf

  step(dt) {
    this.time += dt;
    for (const t of this.teams) {
      for (const p of t.players.values()) if (!p.onField) p.recover(dt);
    }
    this.updateLeaving(dt);

    switch (this.state) {
      case 'faceoff':
        this.timer -= dt;
        if (this.human) this.human.handleMeta();
        for (const p of this.allOnField) { p.ctrl.mx = 0; p.ctrl.my = 0; p.ctrl.sprint = false; p.update(dt, this); }
        this.carryBall();
        if (this.timer <= 0) this.dropBall();
        break;
      case 'play':
        this.playTick(dt);
        break;
      case 'goal':
      case 'out':
        this.timer -= dt;
        this.celebrateTick(dt);
        if (this.timer <= 0) {
          const spot = this.state === 'goal' ? { x: 0, y: 0 } : nearestFaceoffSpot(this.ball.x, this.ball.y);
          this.setupFaceoff(spot);
        }
        break;
      default:
        break; // Drittelspause / Ende: nichts tun
    }
  }

  playTick(dt) {
    const ball = this.ball;
    if (this.human) this.human.preTick(dt);
    for (const t of this.teams) updateTeamAI(t, this, dt);
    for (const t of this.teams) {
      const g = t.onField.G;
      if (!this.isHumanControlled(g) || this.human.goalieAssist) updateGoalieAI(g, this, dt);
    }
    if (this.human) this.human.postAI(dt);

    const ps = this.allOnField;
    for (const p of ps) p.update(dt, this);
    this.separatePlayers(ps);
    for (const p of ps) p.constrain();

    // Ball
    ball.prevX = ball.x; ball.prevY = ball.y;
    if (ball.owner) this.carryBall();
    else {
      for (const t of this.teams) this.checkGoalieSave(t.onField.G, dt);
      const evs = [];
      stepBall(ball, dt, evs);
      for (const e of evs) this.onBallEvent(e);
      if (this.state !== 'play') return;
      this.checkPickups();
    }
    if (ball.owner) this.checkSteals();

    // Ballbesitz-Statistik
    if (ball.owner) {
      ball.owner.team.stats.possession += dt;
      this.lastPossTeam = ball.owner.team;
    }

    // Spieluhr
    this.clock -= dt * T.periodGameSeconds / T.periodRealSeconds;
    if (this.clock <= 0) { this.clock = 0; this.endPeriod(); return; }

    // Wechsel
    for (const t of this.teams) {
      this.processLineChanges(t, false);
      t.ai.lineCheck -= dt;
      if (t.ai.lineCheck <= 0) { t.ai.lineCheck = 1; this.considerLineChange(t); }
    }
  }

  celebrateTick(dt) {
    const ball = this.ball;
    const scorer = this.lastGoal && this.state === 'goal' ? this.lastGoal.scorerPlayer : null;
    for (const t of this.teams) {
      for (const p of t.all) {
        const c = p.ctrl;
        c.sprint = false; c.face = null;
        let tx = p.x, ty = p.y;
        if (scorer && t === scorer.team && !p.isGoalie) {
          if (p === scorer) { tx = scorer.x + Math.cos(scorer.facing) * 2; ty = scorer.y + Math.sin(scorer.facing) * 2; }
          else { tx = scorer.x; ty = scorer.y; }
        } else if (!p.isGoalie) {
          tx = p.x - t.attackDir * 0.6;
        }
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        const want = p === scorer ? 0.5 : d > 1.4 ? Math.min(1, d / 3) * 0.7 : 0;
        c.mx = d > 0.01 ? dx / d * want : 0; c.my = d > 0.01 ? dy / d * want : 0;
        p.update(dt, this);
      }
    }
    this.separatePlayers(this.allOnField);
    for (const p of this.allOnField) p.constrain();
    if (!ball.owner && !ball.out) stepBall(ball, dt, []);
  }

  // ---------------------------------------------------------------- Bully

  setupFaceoff(spot) {
    this.state = 'faceoff';
    this.timer = T.faceoffDelay;
    this.faceoffSpot = spot;
    this.ball.reset(spot.x, spot.y);
    for (const t of this.teams) {
      // Wechsel bei Unterbruch sofort erledigen
      if (!t.pending.size && (!t.human || this.settings.autoChange) && t.avgStamina() < 0.7) this.requestLineChange(t, true);
      this.processLineChanges(t, true);
      this.placeForFaceoff(t, spot);
    }
    this.leaving = [];
    if (this.human) this.human.onFaceoff();
    this.emit({ type: 'faceoff' });
  }

  placeForFaceoff(t, s) {
    const d = t.attackDir;
    const local = { C: [-0.85, 0], LW: [-2.6, 3.6], RW: [-2.6, -3.6], LD: [-6.5, 2.8], RD: [-6.5, -2.8] };
    for (const r of ROLES) {
      const p = t.onField[r];
      const pos = { x: s.x + local[r][0] * d, y: s.y + local[r][1] * d };
      p.x = pos.x; p.y = pos.y;
      for (let i = 0; i < 3; i++) {
        const c = boardContact(p.x, p.y, 0.7);
        if (c) { p.x += c.nx * c.depth; p.y += c.ny * c.depth; }
        pushOutOfCrease(p, p.r + 0.1);
      }
      p.setPos(p.x, p.y, d > 0 ? 0 : Math.PI);
      p.stamina = Math.min(1, p.stamina);
    }
    const g = t.onField.G;
    g.setPos(t.side * (GOAL_X - GK.lineOffset), 0, t.side > 0 ? Math.PI : 0);
    g.holdTimer = 0;
  }

  dropBall() {
    const [a, b] = this.teams;
    const ca = a.onField.C, cb = b.onField.C;
    const pa = 0.5 + (ca.stat('technik') - cb.stat('technik')) * 0.35 + (a.skill - b.skill) * 0.15;
    const win = Math.random() < pa ? a : b;
    const d = win.attackDir;
    const s = this.faceoffSpot;
    const side = Math.random() < 0.5 ? 1 : -1;
    let tx = s.x - d * 4, ty = s.y + side * 1.6;
    const c = boardContact(tx, ty, 1);
    if (c) { tx += c.nx * c.depth; ty += c.ny * c.depth; }
    const dx = tx - s.x, dy = ty - s.y, l = Math.hypot(dx, dy);
    const ball = this.ball;
    ball.vx = dx / l * 6.2; ball.vy = dy / l * 6.2;
    ball.lastTouch = win.onField.C;
    win.onField.C.pickupCooldown = 0.25;
    win.onField.C.playAnim('pass');
    (win === a ? cb : ca).playAnim('pass');
    this.state = 'play';
    this.emit({ type: 'whistle', kind: 'faceoff' });
  }

  // ---------------------------------------------------------------- Ball

  carryBall() {
    const ball = this.ball, p = ball.owner;
    if (!p) return;
    if (p.isGoalie) {
      ball.x = p.x + Math.cos(p.facing) * 0.25; ball.y = p.y + Math.sin(p.facing) * 0.25; ball.z = 0.85;
    } else {
      p.stickPoint(ball); ball.z = 0;
      const c = boardContact(ball.x, ball.y, ball.r + 0.02);
      if (c) { ball.x += c.nx * c.depth; ball.y += c.ny * c.depth; }
    }
    ball.vx = p.vx; ball.vy = p.vy; ball.vz = 0;
  }

  onBallEvent(e) {
    if (e.type === 'goal') this.onGoal(e.side);
    else if (e.type === 'out') this.onOut();
    else this.emit(e);
  }

  recordTouch(p) {
    const last = this.touches[this.touches.length - 1];
    if (!last || last.p !== p) this.touches.push({ p, time: this.time });
    if (this.touches.length > 8) this.touches.shift();
    this.ball.lastTouch = p;
  }

  gainPossession(p) {
    const ball = this.ball;
    const pass = ball.pass;
    if (pass && pass.from.team === p.team && pass.from !== p) p.team.stats.passesOk++;
    ball.owner = p;
    ball.shot = null; ball.pass = null; ball.goalieChecked = null;
    ball.z = 0; ball.vz = 0;
    p.charge = null;
    this.recordTouch(p);
    p.decisionTimer = Math.min(p.decisionTimer, 0.05);
    p.receivedAt = this.time;
    p.receivedPass = !!pass && pass.from.team === p.team;
    this.emit({ type: 'receive', player: p });
    if (this.human) this.human.onPossession(p);
  }

  checkPickups() {
    const ball = this.ball;
    if (ball.inGoal || ball.z > 0.6) return;
    const cands = [];
    const sp = {};
    for (const t of this.teams) {
      for (const p of t.skaters) {
        if (p.pickupCooldown > 0) continue;
        p.stickPoint(sp);
        const d = distToSegment(sp.x, sp.y, ball.prevX, ball.prevY, ball.x, ball.y);
        if (d < PL.controlRadius) cands.push({ p, d });
      }
    }
    if (!cands.length) return;
    cands.sort((a, b) => a.d - b.d);
    for (const { p } of cands) {
      const rel = Math.hypot(ball.vx - p.vx, ball.vy - p.vy);
      const shot = ball.shot;
      if (shot && rel > 11) {
        if (shot.team === p.team) continue;
        shot.blocked = shot.blocked || new Set();
        if (shot.blocked.has(p)) continue;
        shot.blocked.add(p);
        if (Math.random() < PL.blockChance * (0.6 + 0.8 * p.stat('zweikampf'))) {
          this.deflect(p, 0.35, 1.2);
          this.emit({ type: 'block', player: p });
          return;
        }
        continue;
      }
      const maxRel = PL.receiveSpeed * (0.65 + 0.35 * p.stat('technik')) * this.tempo;
      if (rel <= maxRel || Math.random() < (maxRel / rel) ** 2) { this.gainPossession(p); return; }
      this.deflect(p, 0.5, 0.6);
      return;
    }
  }

  deflect(p, keep, spread) {
    const ball = this.ball;
    const sp = ball.speed * keep;
    const a = Math.atan2(-ball.vy, -ball.vx) + (Math.random() - 0.5) * 2 * spread;
    // Abpraller weg vom Spieler, nicht zurück durch ihn hindurch
    const away = Math.atan2(ball.y - p.y, ball.x - p.x);
    const ang = Math.cos(a - away) > -0.2 ? a : away + (Math.random() - 0.5);
    ball.vx = Math.cos(ang) * sp; ball.vy = Math.sin(ang) * sp;
    ball.vz = Math.random() * 1.2;
    ball.shot = null; ball.pass = null;
    p.pickupCooldown = 0.2;
    this.recordTouch(p);
  }

  checkSteals() {
    const ball = this.ball, carrier = ball.owner;
    if (!carrier || carrier.isGoalie) return;
    const opp = this.other(carrier.team);
    const sp = {};
    for (const d of opp.skaters) {
      if (d.stealCooldown > 0 || this.isHumanControlled(d)) continue;
      d.stickPoint(sp);
      const dist = Math.min(Math.hypot(sp.x - ball.x, sp.y - ball.y), Math.hypot(d.x - ball.x, d.y - ball.y) * 1.1);
      if (dist > DU.stealRange) continue;
      d.stealCooldown = DU.stealCooldown * (1.4 - 0.5 * opp.skill) * (0.8 + Math.random() * 0.4);
      d.playAnim('poke');
      // Frontal (Verteidiger steht im Laufweg) klappt der Stockeinsatz viel besser als von hinten
      const cx = Math.cos(carrier.facing), cy = Math.sin(carrier.facing);
      const front = ((d.x - carrier.x) * cx + (d.y - carrier.y) * cy) / (Math.hypot(d.x - carrier.x, d.y - carrier.y) || 1);
      const dir = front > 0.3 ? DU.frontFactor : front < -0.3 ? DU.behindFactor : 1;
      const chance = DU.aiStealChance * dir * (0.5 + 0.7 * opp.skill) * this.duelRatio(d, carrier);
      if (Math.random() < chance) { this.doSteal(d, carrier); return; }
    }
  }

  duelRatio(d, carrier) {
    return (0.6 + 0.8 * d.stat('zweikampf')) / (0.6 + 0.8 * carrier.stat('technik')) * (0.8 + 0.4 * d.stamina);
  }

  tryHumanSteal(p) {
    const ball = this.ball, carrier = ball.owner;
    if (p.stealCooldown > 0) return false;
    p.playAnim('poke');
    p.stealCooldown = DU.stealCooldown;
    if (!carrier || carrier.team === p.team || carrier.isGoalie) return false;
    const sp = p.stickPoint();
    const dist = Math.min(Math.hypot(sp.x - ball.x, sp.y - ball.y), Math.hypot(p.x - ball.x, p.y - ball.y));
    if (dist > DU.stealRange + 0.25) return false;
    if (Math.random() < DU.humanStealChance * this.duelRatio(p, carrier)) { this.doSteal(p, carrier); return true; }
    return false;
  }

  doSteal(d, carrier) {
    const ball = this.ball;
    carrier.pickupCooldown = 0.45;
    carrier.charge = null;
    d.team.stats.steals++;
    this.emit({ type: 'steal', player: d });
    if (Math.random() < DU.loseBallChance) {
      ball.owner = null;
      const a = Math.atan2(ball.y - d.y, ball.x - d.x) + (Math.random() - 0.5) * 1.6;
      const s = 2.5 + Math.random() * 3;
      ball.vx = Math.cos(a) * s; ball.vy = Math.sin(a) * s;
      ball.shot = null; ball.pass = null;
      d.pickupCooldown = 0.15;
      this.recordTouch(d);
    } else {
      this.gainPossession(d);
    }
  }

  // ---------------------------------------------------------------- Goalie

  checkGoalieSave(g, dt) {
    const ball = this.ball;
    if (ball.owner || ball.inGoal || !g) return;
    if (g.pickupCooldown > 0) return;
    const side = g.team.side;
    const speed = ball.speed;
    // Langsamer Ball im Torraum: aufnehmen
    if (speed < 7 && ball.z < 0.8 && Math.hypot(g.x - ball.x, g.y - ball.y) < 0.6 && inCrease(ball.x, ball.y, side, 0.1)) {
      this.goalieCatch(g);
      return;
    }
    if (ball.goalieChecked === g || ball.vx * side < 2 || ball.z > 1.35) return;
    const nx = ball.x + ball.vx * dt, ny = ball.y + ball.vy * dt;
    const reach = (GK.bodyReach + GK.diveReach * g.stat('reflexe') + (g.diving > 0 ? GK.humanDiveBonus : 0)) * (0.8 + 0.2 * g.team.goalieFactor);
    const d = distToSegment(g.x, g.y, ball.x, ball.y, nx, ny);
    if (d > reach) return;
    ball.goalieChecked = g;
    const speedPen = clamp((speed - GK.speedPenFrom) / 40, 0, 0.25);
    const offPen = (d / reach) ** 2 * 0.25;
    let p = GK.baseSave + 0.22 * (g.stat('reflexe') - 0.5) + 0.15 * (g.stat('stellung') - 0.5) - speedPen - offPen;
    if (ball.shot && ball.shot.oneTimer) p -= 0.08;
    if (g.reactTimer > 0) p -= 0.25; // noch nicht reagiert
    p = clamp(p * g.team.goalieFactor, 0.08, 0.96);
    const dir = Math.sign((ball.y - g.y) * side) || 1;
    g.playAnim('save', dir);
    if (Math.random() < p) {
      const shooterTeam = ball.shot ? ball.shot.team : null;
      if (shooterTeam) shooterTeam.stats.onTarget++;
      g.team.stats.saves++;
      this.emit({ type: 'save', player: g, speed });
      if (speed < 24 && Math.random() < GK.catchChance * (0.6 + 0.5 * g.stat('reflexe'))) {
        this.goalieCatch(g);
      } else {
        // Abpraller nach vorne
        const base = side > 0 ? Math.PI : 0;
        const a = base + (Math.random() - 0.5) * 2.2;
        const s = speed * (0.22 + Math.random() * 0.2);
        ball.vx = Math.cos(a) * s; ball.vy = Math.sin(a) * s; ball.vz = Math.random() * 2;
        ball.x = g.x + Math.cos(a) * 0.5; ball.y = g.y + Math.sin(a) * 0.5;
        ball.shot = null; ball.pass = null;
        g.pickupCooldown = 0.5;
        this.recordTouch(g);
      }
    }
  }

  goalieCatch(g) {
    const ball = this.ball;
    if (ball.pass && ball.pass.from.team === g.team) g.team.stats.passesOk++;
    ball.owner = g;
    ball.shot = null; ball.pass = null; ball.goalieChecked = null;
    g.holdTimer = lerp(GK.holdMin, GK.holdMax, Math.random());
    g.holdTime = 0;
    this.recordTouch(g);
    this.emit({ type: 'catch', player: g });
    if (this.human) this.human.onPossession(g);
  }

  // ---------------------------------------------------------------- Aktionen

  shoot(p, charge, target, opts = {}) {
    const ball = this.ball;
    if (ball.owner !== p) return;
    const t = p.team;
    const aimMul = t.human ? 1 : 1.5 - 0.6 * t.skill;
    const spread = (SH.baseSpread + SH.chargeSpread * charge + SH.fatigueSpread * (1 - p.stamina) +
      SH.skillSpread * (1 - p.stat('schuss'))) * aimMul;
    const ang = Math.atan2(target.y - ball.y, target.x - ball.x) + gauss() * spread;
    let speed = lerp(SH.minSpeed, SH.maxSpeed, 0.2 + 0.8 * charge) * (0.82 + 0.18 * p.stat('schuss')) * this.tempo;
    if (opts.oneTimer) speed *= SH.oneTimerBonus;
    ball.owner = null;
    ball.vx = Math.cos(ang) * speed; ball.vy = Math.sin(ang) * speed;
    ball.vz = Math.random() * SH.maxLift * (0.25 + 0.75 * charge);
    ball.shot = { shooter: p, team: t, time: this.time, oneTimer: !!opts.oneTimer };
    ball.pass = null; ball.goalieChecked = null;
    p.pickupCooldown = PL.pickupCooldown;
    p.charge = null;
    p.shots++;
    t.stats.shots++;
    this.recordTouch(p);
    p.playAnim('shoot');
    this.emit({ type: 'shot', player: p, power: charge, speed });
  }

  // Pass (oder Goalie-Abwurf) an Mitspieler r, optional über die Bande
  passTo(p, r, bank = false) {
    const ball = this.ball;
    if (ball.owner !== p || !r) return;
    const throwing = p.isGoalie;
    let tx = r.x, ty = r.y, speed = 10;
    for (let i = 0; i < 2; i++) {
      const d = Math.hypot(tx - ball.x, ty - ball.y) * (bank ? 1.15 : 1);
      speed = clamp(d * 0.8 + 7, PA.minSpeed, PA.maxSpeed);
      const t = d / (speed * 0.85);
      tx = r.x + r.vx * t * PA.leadFactor;
      ty = r.y + r.vy * t * PA.leadFactor;
    }
    let ax = tx, ay = ty;
    if (bank) {
      // Spiegelpunkt an der näheren Längsbande
      const sgn = (ball.y + ty) / 2 >= 0 ? 1 : -1;
      const B = sgn * (HALF_W - ball.r);
      ay = 2 * B - ty;
      speed = Math.min(PA.maxSpeed * 1.25, speed * PA.bankExtra);
    }
    const spread = PA.spread * (1.4 - 0.8 * p.stat('pass')) * (1 + (1 - p.stamina) * 0.6) * (p.team.human ? 1 : 1.4 - 0.5 * p.team.skill);
    const ang = Math.atan2(ay - ball.y, ax - ball.x) + gauss() * spread;
    speed *= this.tempo;
    ball.owner = null;
    ball.vx = Math.cos(ang) * speed; ball.vy = Math.sin(ang) * speed;
    ball.vz = throwing ? 1.6 : 0;
    ball.pass = { from: p, to: r, time: this.time, bank };
    ball.shot = null; ball.goalieChecked = null;
    p.pickupCooldown = PL.pickupCooldown;
    p.charge = null;
    p.team.stats.passes++;
    this.recordTouch(p);
    p.playAnim(throwing ? 'throw' : 'pass');
    this.emit({ type: 'pass', player: p, bank });
  }

  // Bester Passempfänger in Richtung (dx,dy); ohne Richtung frei gewählt
  pickReceiver(p, dx, dy) {
    const mag = Math.hypot(dx, dy);
    if (mag < 0.3) { dx = Math.cos(p.facing); dy = Math.sin(p.facing); }
    else { dx /= mag; dy /= mag; }
    let best = null, bs = -Infinity;
    for (const r of p.team.skaters) {
      if (r === p) continue;
      const vx = r.x - p.x, vy = r.y - p.y, d = Math.hypot(vx, vy);
      if (d < 1.2) continue;
      const cos = (vx * dx + vy * dy) / d;
      const s = cos * 2.2 - d * 0.035 - (this.laneBlocked(p, r) ? 0.5 : 0);
      if (s > bs) { bs = s; best = r; }
    }
    return best;
  }

  laneBlocked(a, b, margin = 0.8) {
    for (const o of this.other(a.team).skaters) {
      if (distToSegment(o.x, o.y, a.x, a.y, b.x, b.y) < margin) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- Ereignisse

  onGoal(side) {
    const ball = this.ball;
    const defending = this.teams.find(t => t.side === side);
    const scoring = this.other(defending);
    let scorer = ball.lastTouch;
    const ownGoal = !scorer || scorer.team !== scoring;
    let assist = null;
    if (!ownGoal) {
      for (let i = this.touches.length - 2; i >= 0; i--) {
        const tc = this.touches[i];
        if (tc.p === scorer) continue;
        if (tc.p.team === scoring && this.time - tc.time < 10) assist = tc.p;
        break;
      }
      scorer.goals++;
      if (assist) assist.assists++;
    }
    if (ball.shot && ball.shot.team === scoring) scoring.stats.onTarget++;
    scoring.score++;
    const goal = {
      team: scoring.index, period: this.period, clock: this.clock,
      scorer: ownGoal ? null : scorer.data, assist: assist ? assist.data : null, ownGoal,
      scorerPlayer: ownGoal ? null : scorer,
    };
    this.goals.push(goal);
    this.lastGoal = goal;
    this.state = 'goal';
    this.timer = T.goalPause;
    for (const p of scoring.all) p.charge = null;
    if (!ownGoal) scorer.playAnim('cheer');
    this.emit({ type: 'goal', goal, team: scoring });
  }

  onOut() {
    this.state = 'out';
    this.timer = T.outOfPlayPause;
    this.emit({ type: 'whistle', kind: 'out' });
    const s = nearestFaceoffSpot(this.ball.x, this.ball.y);
    this.ball.reset(s.x, s.y);
    this.ball.out = false;
  }

  endPeriod() {
    for (const p of this.allOnField) p.charge = null;
    if (this.period >= T.periods) {
      this.state = 'end';
      this.emit({ type: 'gameEnd' });
    } else {
      this.state = 'intermission';
      this.emit({ type: 'periodEnd', period: this.period });
    }
    this.emit({ type: 'whistle', kind: 'end' });
  }

  nextPeriod() {
    if (this.state !== 'intermission') return;
    this.period++;
    this.clock = T.periodGameSeconds;
    for (const t of this.teams) {
      t.side *= -1;
      for (const p of t.players.values()) p.stamina = Math.min(1, p.stamina + 0.5);
    }
    this.setupFaceoff({ x: 0, y: 0 });
  }

  // ---------------------------------------------------------------- Wechsel

  requestLineChange(t, quiet = false) {
    if (t.pending.size) return;
    t.nextLine = (t.activeLine + 1) % 3;
    for (const r of ROLES) t.pending.add(r);
    if (!quiet) this.emit({ type: 'lineChange', team: t, line: t.nextLine });
  }

  processLineChanges(t, immediate) {
    if (!t.pending.size) return;
    for (const r of [...t.pending]) {
      const cur = t.onField[r];
      if (!immediate && this.ball.owner === cur) continue;
      const np = t.linePlayer(t.nextLine, r);
      this.leaving = this.leaving.filter(l => l.p !== np);
      if (immediate) {
        np.setPos(cur.x, cur.y, cur.facing);
      } else {
        const gate = benchGate(t.side);
        np.setPos(gate.x + (Math.random() - 0.5) * 2.5, gate.y - Math.random() * 0.4, -Math.PI / 2);
        this.leaving.push({ p: cur, t: 0 });
      }
      cur.onField = false; cur.role = null; cur.charge = null;
      this.putOnField(t, r, np);
      if (this.ball.pass && this.ball.pass.to === cur) this.ball.pass.to = np;
      if (this.human) this.human.onSubstituted(cur, np);
      t.pending.delete(r);
    }
    if (!t.pending.size) t.activeLine = t.nextLine;
  }

  considerLineChange(t) {
    if (t.pending.size) return;
    if (t.human && !this.settings.autoChange) return;
    const ball = this.ball;
    const ownGoalX = t.side * GOAL_X;
    const danger = Math.abs(ball.x - ownGoalX) < 13 && (!ball.owner || ball.owner.team !== t);
    if (t.avgStamina() < CONFIG.stamina.autoChangeBelow && !danger) this.requestLineChange(t);
  }

  updateLeaving(dt) {
    for (const l of this.leaving) {
      const g = benchGate(l.p.team.side);
      const dx = g.x - l.p.x, dy = (g.y + 0.6) - l.p.y, d = Math.hypot(dx, dy);
      const v = 3.5;
      l.t += dt;
      if (d > 0.05) {
        l.p.vx = dx / d * v; l.p.vy = dy / d * v;
        l.p.x += l.p.vx * dt; l.p.y += l.p.vy * dt;
        l.p.facing = Math.atan2(dy, dx);
      }
      l.p.anim.action = 'run'; l.p.anim.t += dt;
      l.done = d < 0.4 || l.t > 6;
    }
    this.leaving = this.leaving.filter(l => !l.done);
  }

  // ---------------------------------------------------------------- Physik

  separatePlayers(ps) {
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (min - d);
        const nx = dx / d, ny = dy / d;
        // Goalie steht fest, Ballführer kann Verteidiger nicht wegschieben
        const own = this.ball.owner;
        const wa = a.isGoalie ? 0.15 : b.isGoalie ? 0.85 : a === own ? 0.8 : b === own ? 0.2 : 0.5;
        a.x -= nx * push * wa; a.y -= ny * push * wa;
        b.x += nx * push * (1 - wa); b.y += ny * push * (1 - wa);
      }
    }
  }

  // Spielstand als Text für die Anzeige
  clockText() {
    const s = Math.ceil(this.clock);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}

export { GOAL_X, GOAL_HALF_W };
