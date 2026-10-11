// Ein Match: Teams, Linien, Ball, Spieluhr, Bully, Tore, Wechsel, Strafen,
// Verletzungen, Wiederholung, Jubel, Verlängerung und Penaltyschiessen.
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
import { clamp, lerp, gauss, distToSegment, ROLES } from './util.js';
import { Rules } from './rules.js';
import { Recorder } from './replay.js';
import { Shootout } from './shootout.js';

export { gauss, distToSegment, ROLES };

const T = CONFIG.time;
const PL = CONFIG.player;
const SH = CONFIG.shot;
const PA = CONFIG.pass;
const DU = CONFIG.duel;
const GK = CONFIG.goalie;
const POS_FOR_ROLE = { C: 'C', LW: 'F', RW: 'F', LD: 'D', RD: 'D' };

const injured = p => !!p.injuredNow || !!(p.data.injury && p.data.injury.games > 0);

export class MTeam {
  constructor(index, data, side, skill, goalieFactor) {
    this.index = index;
    this.data = data;
    this.side = side;               // eigenes Tor: −1 links, +1 rechts
    this.players = new Map(data.players.map(p => [p.id, new MPlayer(p, this)]));
    this.lines = data.lines.map(l => ({ ...l }));   // Kopie: Verletzte werden ersetzt
    this.activeLine = 0;
    this.nextLine = 0;
    this.pending = new Set();
    this.vacant = new Set();        // Positionen, die wegen Strafen leer bleiben
    this.penalties = [];
    this.onField = {};
    const gs = data.goalies.map(id => this.players.get(id));
    this.goalie = gs.find(g => !injured(g)) || gs[0];
    this.score = 0;
    this.stats = { shots: 0, onTarget: 0, passes: 0, passesOk: 0, possession: 0, saves: 0, steals: 0, penalties: 0 };
    this.skill = skill;
    this.goalieFactor = goalieFactor;
    this.human = false;
    this.ai = { lineCheck: Math.random() };
  }
  get attackDir() { return -this.side; }
  get skaters() { const s = []; for (const r of ROLES) if (this.onField[r]) s.push(this.onField[r]); return s; }
  get all() { const s = this.skaters; if (this.onField.G) s.push(this.onField.G); return s; }
  linePlayer(line, role) { return this.players.get(this.lines[line][role]); }
  avgStamina() {
    const s = this.skaters;
    return s.length ? s.reduce((a, p) => a + p.stamina, 0) / s.length : 1;
  }
}

export class Match {
  constructor({ teams, humanTeam = 0, difficulty = 'mittel', settings = {} }) {
    const diff = CONFIG.difficulty[difficulty] || CONFIG.difficulty.mittel;
    this.difficulty = difficulty;
    this.tempo = diff.tempo;
    this.settings = { autoChange: false, autoGoalie: false, replays: true, ...settings };
    const skill = i => (humanTeam === i ? CONFIG.ai.teammateSkill : diff.skill);
    const gf = i => (humanTeam === i ? 1 : humanTeam == null ? 1 : diff.goalie);
    this.teams = [new MTeam(0, teams[0], -1, skill(0), gf(0)), new MTeam(1, teams[1], 1, skill(1), gf(1))];
    this.ball = new Ball();
    this.time = 0;
    this.period = 1;
    this.clock = T.periodGameSeconds;
    this.state = 'faceoff';
    this.next = 'period';           // was nach der Pause kommt: period | ot | shootout
    this.timer = 0;
    this.events = [];
    this.goals = [];
    this.leaving = [];
    this.touches = [];
    this.lastPossTeam = null;
    this.faceoffSpot = { x: 0, y: 0 };
    this.result = null;
    this.shootout = null;
    this.replay = null;
    this.celebT = 0;
    this.rules = new Rules(this);
    this.recorder = new Recorder();

    for (const t of this.teams) {
      // verletzte Spieler (aus früheren Spielen) in den Linien ersetzen
      for (let l = 0; l < t.lines.length; l++) {
        for (const r of ROLES) {
          const p = t.linePlayer(l, r);
          if (injured(p)) { const rep = this.findReplacement(t, r, true); if (rep) t.lines[l][r] = rep.id; }
        }
      }
      for (const r of ROLES) this.putOnField(t, r, t.linePlayer(0, r));
      this.putOnField(t, 'G', t.goalie);
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
  get clockRate() { return this.period > T.periods ? T.otGameSeconds / T.otRealSeconds : T.periodGameSeconds / T.periodRealSeconds; }
  get isOT() { return this.period > T.periods; }
  emit(e) { this.events.push(e); }
  takeEvents() { const e = this.events; this.events = []; return e; }
  isHumanControlled(p) { return !!this.human && this.human.controlled === p && this.human.active(p); }

  putOnField(team, role, p) {
    p.onField = true; p.role = role; team.onField[role] = p;
    p.fallen = 0;
  }

  removeFromField(p) {
    const t = p.team;
    if (p.role && t.onField[p.role] === p) t.onField[p.role] = null;
    p.onField = false; p.role = null; p.charge = null;
    if (this.ball.owner === p) this.ball.owner = null;
    if (this.ball.pass && this.ball.pass.to === p) this.ball.pass = null;
    if (this.human) this.human.onRemoved(p);
  }

  // Bester verfügbarer Ersatz für eine Position (Ersatzspieler bevorzugt)
  findReplacement(t, role, setup = false) {
    const inLines = new Set();
    for (const l of t.lines) for (const r of ROLES) inLines.add(l[r]);
    let best = null, bv = -Infinity;
    for (const p of t.players.values()) {
      if (p.isGoalie || p.onField || p.inBox || injured(p)) continue;
      let v = 0;
      if (t.data.subs.includes(p.id)) v += 3;
      if (!inLines.has(p.id)) v += 2;
      if (p.data.pos === POS_FOR_ROLE[role]) v += 2;
      v += setup ? 0 : p.stamina;
      if (v > bv) { bv = v; best = p; }
    }
    return best;
  }

  // Verletzten in allen Linien ersetzen; ist er auf dem Feld, kommt der Ersatz sofort
  replaceInLines(t, p, role) {
    const rep = this.findReplacement(t, role || 'C');
    if (!rep) return;
    for (const l of t.lines) for (const r of ROLES) if (l[r] === p.id) l[r] = rep.id;
    if (role && !t.vacant.has(role)) this.fillRole(t, role, rep);
  }

  fillRole(t, role, p = null) {
    p = p || this.findReplacement(t, role);
    if (!p) return;
    const gate = benchGate(t.side);
    this.leaving = this.leaving.filter(l => l.p !== p);
    p.setPos(gate.x + (Math.random() - 0.5) * 2, gate.y - 0.3, -Math.PI / 2);
    this.putOnField(t, role, p);
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
        this.recorder.tick(this, dt);
        break;
      case 'goal':
        this.timer -= dt;
        this.idleTick(dt, 0.25);
        this.recorder.tick(this, dt);
        if (this.timer <= 0) this.startReplay();
        break;
      case 'replay':
        this.replay.t += dt * T.replaySpeed;
        if (this.replay.t >= this.replay.end) this.startCelebration();
        break;
      case 'celebrate':
        this.timer -= dt;
        this.celebT += dt;
        this.celebrateTick(dt);
        if (this.timer <= 0) this.afterGoal();
        break;
      case 'out':
      case 'penalty':
        this.timer -= dt;
        this.idleTick(dt, 0.3);
        if (this.timer <= 0) {
          const spot = this.state === 'out' ? nearestFaceoffSpot(this.ball.x, this.ball.y) : this.faceoffSpot;
          this.setupFaceoff(spot);
        }
        break;
      case 'shootout':
        this.shootout.tick(dt);
        break;
      default:
        break; // Drittelspause / Ende
    }
  }

  // KI, Physik, Ball – gemeinsam für normales Spiel und Penaltyschiessen
  simTick(dt) {
    const ball = this.ball;
    if (this.human) this.human.preTick(dt);
    for (const t of this.teams) updateTeamAI(t, this, dt);
    for (const t of this.teams) {
      const g = t.onField.G;
      if (g && (!this.isHumanControlled(g) || this.human.goalieAssist)) updateGoalieAI(g, this, dt);
    }
    if (this.human) this.human.postAI(dt);

    const ps = this.allOnField;
    for (const p of ps) p.update(dt, this);
    this.separatePlayers(ps, dt);
    for (const p of ps) p.constrain();

    ball.prevX = ball.x; ball.prevY = ball.y;
    if (ball.owner) this.carryBall();
    else {
      for (const t of this.teams) this.checkGoalieSave(t.onField.G, dt);
      const evs = [];
      stepBall(ball, dt, evs);
      for (const e of evs) this.onBallEvent(e);
      if (this.state !== 'play' && this.state !== 'shootout') return;
      if (this.shootout && this.shootout.phase !== 'run') return;
      this.checkPickups();
    }
    if (ball.owner) this.checkSteals();
  }

  playTick(dt) {
    this.simTick(dt);
    if (this.state !== 'play') return;
    const ball = this.ball;
    if (ball.owner) {
      ball.owner.team.stats.possession += dt;
      this.lastPossTeam = ball.owner.team;
    }
    this.rules.tick(dt);
    if (this.state !== 'play') return;

    this.clock -= dt * this.clockRate;
    if (this.clock <= 0) { this.clock = 0; this.endPeriod(); return; }

    for (const t of this.teams) {
      this.processLineChanges(t, false);
      t.ai.lineCheck -= dt;
      if (t.ai.lineCheck <= 0) { t.ai.lineCheck = 1; this.considerLineChange(t); }
    }
  }

  stepBallOnly(dt) {
    if (!this.ball.owner && !this.ball.out) stepBall(this.ball, dt, []);
  }

  // Unterbruch: alle laufen aus
  idleTick(dt, drift) {
    for (const t of this.teams) {
      for (const p of t.all) {
        const c = p.ctrl;
        c.sprint = false; c.face = null;
        c.mx = p.isGoalie ? 0 : -t.attackDir * drift * (Math.abs(p.x) > 3 ? 1 : 0);
        c.my = 0;
        p.update(dt, this);
      }
    }
    this.separatePlayers(this.allOnField, dt);
    for (const p of this.allOnField) p.constrain();
    this.stepBallOnly(dt);
  }

  // ---------------------------------------------------------------- Tor, Wiederholung, Jubel

  startReplay() {
    const g = this.lastGoal;
    if (!this.settings.replays || !this.recorder.frames.length) { this.startCelebration(); return; }
    const frames = this.recorder.cut(g.time - T.replaySeconds, g.time + T.replayAfter);
    if (frames.length < 5) { this.startCelebration(); return; }
    this.replay = { frames, t: frames[0].t, start: frames[0].t, end: frames[frames.length - 1].t, side: g.side };
    this.state = 'replay';
    this.emit({ type: 'replay' });
  }

  skip() {
    if (this.state === 'replay') this.startCelebration();
    else if (this.state === 'celebrate') this.afterGoal();
  }

  startCelebration() {
    this.replay = null;
    this.state = 'celebrate';
    this.timer = T.celebration;
    this.celebT = 0;
    const g = this.lastGoal;
    const s = g && g.scorerPlayer && g.scorerPlayer.onField ? g.scorerPlayer : null;
    this.celebrator = s;
    if (s) {
      s.playAnim('celebrate', s.data.celebration || 0);
      // Laufrichtung: Richtung Kamera und Feldmitte
      const tx = s.x * 0.5, ty = -6;
      s.celDir = Math.atan2(ty - s.y, tx - s.x);
      s.slide = false;
    }
    this.emit({ type: 'celebrate', player: s });
  }

  celebrateTick(dt) {
    const s = this.celebrator, ct = this.celebT;
    const cel = s ? (s.data.celebration || 0) : -1;
    let k = 0;
    for (const t of this.teams) {
      for (const p of t.all) {
        const c = p.ctrl;
        c.sprint = false; c.face = null; c.mx = 0; c.my = 0;
        if (p === s) {
          let dir = s.celDir, mag = 0;
          if (cel === 1) { if (ct < 0.75) mag = 1; else s.slide = true; }
          else if (cel === 3) { dir = s.celDir + ct * 1.5; mag = 0.65; }
          else if (ct < 0.9) mag = 0.45;
          c.mx = Math.cos(dir) * mag; c.my = Math.sin(dir) * mag;
          if (mag === 0 && cel !== 1) c.face = Math.PI / 2 * -1; // zur Kamera
        } else if (s && t === s.team && !p.isGoalie) {
          // Mitspieler kommen gratulieren (Team-Kreis: eng im Kreis)
          const ang = (k++ / 4) * Math.PI * 2;
          const rad = cel === 7 ? 1.05 : 1.9;
          const tx = s.x + Math.cos(ang) * rad, ty = s.y + Math.sin(ang) * rad;
          const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
          const mag = d > 0.25 ? Math.min(1, d / 2) : 0;
          c.mx = d > 0.01 ? dx / d * mag : 0; c.my = d > 0.01 ? dy / d * mag : 0;
          c.sprint = d > 5;
          c.face = Math.atan2(s.y - p.y, s.x - p.x);
          if (d < 0.6 && ct > 0.6 && p.anim.action !== 'cheer' && (cel === 7 || Math.random() < 0.02)) p.playAnim('cheer');
        } else if (!p.isGoalie) {
          c.mx = -t.attackDir * 0.2;
        }
        p.update(dt, this);
      }
    }
    if (s && cel === 7 && ct > 0.6 && s.anim.action !== 'cheer') { /* Schütze springt im Kreis mit */ }
    this.separatePlayers(this.allOnField, dt);
    for (const p of this.allOnField) p.constrain();
    this.stepBallOnly(dt);
  }

  afterGoal() {
    if (this.celebrator) this.celebrator.slide = false;
    this.celebrator = null;
    if (this.isOT) { this.endGame('ot'); return; }
    this.setupFaceoff({ x: 0, y: 0 });
  }

  // ---------------------------------------------------------------- Bully

  setupFaceoff(spot) {
    this.state = 'faceoff';
    this.timer = T.faceoffDelay;
    this.faceoffSpot = spot;
    this.ball.reset(spot.x, spot.y);
    this.leaving = this.leaving.filter(l => l.box || l.wait > 0);
    for (const t of this.teams) {
      if (!t.pending.size && (!t.human || this.settings.autoChange) && t.avgStamina() < 0.7) this.requestLineChange(t, true);
      this.processLineChanges(t, true);
      this.placeForFaceoff(t, spot);
    }
    if (this.human) this.human.onFaceoff();
    this.emit({ type: 'faceoff' });
  }

  placeForFaceoff(t, s) {
    const d = t.attackDir;
    const local = { C: [-0.85, 0], LW: [-2.6, 3.6], RW: [-2.6, -3.6], LD: [-6.5, 2.8], RD: [-6.5, -2.8] };
    const taker = this.faceoffTaker(t);
    for (const r of ROLES) {
      const p = t.onField[r];
      if (!p) continue;
      const pos = p === taker ? local.C : r === 'C' ? local[taker && taker.role ? taker.role : 'C'] : local[r];
      p.x = s.x + pos[0] * d; p.y = s.y + pos[1] * d;
      for (let i = 0; i < 3; i++) {
        const c = boardContact(p.x, p.y, 0.7);
        if (c) { p.x += c.nx * c.depth; p.y += c.ny * c.depth; }
        pushOutOfCrease(p, p.r + 0.1);
      }
      p.setPos(p.x, p.y, d > 0 ? 0 : Math.PI);
      p.fallen = 0; p.slide = false;
    }
    const g = t.onField.G;
    if (g) { g.setPos(t.side * (GOAL_X - GK.lineOffset), 0, t.side > 0 ? Math.PI : 0); g.holdTimer = 0; }
  }

  faceoffTaker(t) {
    return t.onField.C || t.onField.LW || t.onField.RW || t.onField.LD || t.onField.RD || null;
  }

  dropBall() {
    const [a, b] = this.teams;
    const ca = this.faceoffTaker(a), cb = this.faceoffTaker(b);
    const pa = 0.5 + ((ca ? ca.stat('technik') : 0.5) - (cb ? cb.stat('technik') : 0.5)) * 0.35 + (a.skill - b.skill) * 0.15;
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
    const wt = win === a ? ca : cb, lt = win === a ? cb : ca;
    if (wt) { ball.lastTouch = wt; wt.pickupCooldown = 0.25; wt.playAnim('pass'); }
    if (lt) lt.playAnim('pass');
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
    else if (e.type === 'out') { if (this.shootout) this.emit({ type: 'whistle', kind: 'out' }); else this.onOut(); }
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
        if (p.pickupCooldown > 0 || p.fallen > 0) continue;
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
      if (d.stealCooldown > 0 || d.fallen > 0 || this.isHumanControlled(d)) continue;
      d.stickPoint(sp);
      const dist = Math.min(Math.hypot(sp.x - ball.x, sp.y - ball.y), Math.hypot(d.x - ball.x, d.y - ball.y) * 1.1);
      if (dist > DU.stealRange) continue;
      d.stealCooldown = DU.stealCooldown * (1.4 - 0.5 * opp.skill) * (0.8 + Math.random() * 0.4);
      d.playAnim('poke');
      const front = this.frontness(d, carrier);
      const dir = front > 0.3 ? DU.frontFactor : front < -0.3 ? DU.behindFactor : 1;
      const chance = DU.aiStealChance * dir * (0.5 + 0.7 * opp.skill) * this.duelRatio(d, carrier);
      const ok = Math.random() < chance;
      if (ok) this.doSteal(d, carrier);
      this.rules.onTackle(d, carrier, ok, front);
      if (ok || this.state !== 'play') return;
    }
  }

  // +1 = Verteidiger steht vor dem Ballführer, −1 = dahinter
  frontness(d, carrier) {
    const cx = Math.cos(carrier.facing), cy = Math.sin(carrier.facing);
    return ((d.x - carrier.x) * cx + (d.y - carrier.y) * cy) / (Math.hypot(d.x - carrier.x, d.y - carrier.y) || 1);
  }

  duelRatio(d, carrier) {
    return (0.6 + 0.8 * d.stat('zweikampf')) / (0.6 + 0.8 * carrier.stat('technik')) * (0.8 + 0.4 * d.stamina);
  }

  tryHumanSteal(p) {
    const ball = this.ball, carrier = ball.owner;
    if (p.stealCooldown > 0 || p.fallen > 0) return false;
    p.playAnim('poke');
    p.stealCooldown = DU.stealCooldown;
    if (!carrier || carrier.team === p.team || carrier.isGoalie) return false;
    const sp = p.stickPoint();
    const dist = Math.min(Math.hypot(sp.x - ball.x, sp.y - ball.y), Math.hypot(p.x - ball.x, p.y - ball.y));
    if (dist > DU.stealRange + 0.25) return false;
    const ok = Math.random() < DU.humanStealChance * this.duelRatio(p, carrier);
    if (ok) this.doSteal(p, carrier);
    this.rules.onTackle(p, carrier, ok, this.frontness(p, carrier));
    return ok;
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
    if (g.reactTimer > 0) p -= 0.25;
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
    if (charge > 0.5) this.rules.onShot(p);
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
    if (this.shootout) { this.shootout.onGoal(); this.emit({ type: 'goalHorn' }); return; }
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
    const pp = defending.vacant.size > scoring.vacant.size ? 'PP' : defending.vacant.size < scoring.vacant.size ? 'SH' : null;
    scoring.score++;
    const cancelled = this.rules.onGoal(scoring);
    const goal = {
      team: scoring.index, period: this.period, clock: this.clock, time: this.time, side,
      scorer: ownGoal ? null : scorer.data, assist: assist ? assist.data : null, ownGoal, pp,
      scorerPlayer: ownGoal ? null : scorer,
    };
    this.goals.push(goal);
    this.lastGoal = goal;
    this.state = 'goal';
    this.timer = T.goalLive;
    for (const p of scoring.all) p.charge = null;
    this.emit({ type: 'goal', goal, team: scoring, cancelledPenalty: cancelled });
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
    this.rules.flush();
    this.emit({ type: 'whistle', kind: 'end' });
    const [a, b] = this.teams;
    if (this.period >= T.periods) {
      if (a.score !== b.score) { this.endGame(this.isOT ? 'ot' : 'regular'); return; }
      this.next = this.isOT ? 'shootout' : 'ot';
    } else this.next = 'period';
    this.state = 'intermission';
    this.emit({ type: 'periodEnd', period: this.period, next: this.next });
  }

  nextPeriod() {
    if (this.state !== 'intermission') return;
    if (this.next === 'shootout') { this.startShootout(); return; }
    this.period++;
    this.clock = this.isOT ? T.otGameSeconds : T.periodGameSeconds;
    for (const t of this.teams) {
      t.side *= -1;
      for (const p of t.players.values()) p.stamina = Math.min(1, p.stamina + 0.5);
    }
    this.setupFaceoff({ x: 0, y: 0 });
  }

  startShootout() {
    this.state = 'shootout';
    this.leaving = [];
    this.shootout = new Shootout(this);
    this.emit({ type: 'shootoutStart' });
  }

  finishShootout(w) {
    this.teams[w].score++;
    this.endGame('so');
  }

  endGame(type) {
    const [a, b] = this.teams;
    const w = a.score > b.score ? 0 : 1;
    const P = CONFIG.points;
    const pts = type === 'regular' ? [P.win, P.loss] : [P.winOT, P.lossOT];
    this.result = { winner: w, type, points: w === 0 ? pts : [pts[1], pts[0]] };
    this.state = 'end';
    this.emit({ type: 'gameEnd', result: this.result });
  }

  // ---------------------------------------------------------------- Wechsel

  requestLineChange(t, quiet = false) {
    if (t.pending.size || this.shootout) return;
    t.nextLine = (t.activeLine + 1) % 3;
    for (const r of ROLES) if (!t.vacant.has(r)) t.pending.add(r);
    if (!quiet) this.emit({ type: 'lineChange', team: t, line: t.nextLine });
  }

  processLineChanges(t, immediate) {
    if (!t.pending.size) return;
    for (const r of [...t.pending]) {
      if (t.vacant.has(r)) { t.pending.delete(r); continue; }
      const cur = t.onField[r];
      if (cur && !immediate && (this.ball.owner === cur || cur.fallen > 0)) continue;
      let np = t.linePlayer(t.nextLine, r);
      if (np.onField || np.inBox || injured(np)) np = np === cur ? cur : this.findReplacement(t, r);
      t.pending.delete(r);
      if (!np || np === cur) continue;
      this.leaving = this.leaving.filter(l => l.p !== np);
      if (cur) {
        if (immediate) np.setPos(cur.x, cur.y, cur.facing);
        else this.leaving.push({ p: cur, t: 0 });
        const wasHuman = this.human && this.human.controlled === cur;
        cur.onField = false; cur.role = null; cur.charge = null;
        if (this.ball.pass && this.ball.pass.to === cur) this.ball.pass.to = np;
        if (wasHuman) this.human.onSubstituted(cur, np);
      }
      if (!immediate || !cur) {
        const gate = benchGate(t.side);
        np.setPos(gate.x + (Math.random() - 0.5) * 2.5, gate.y - Math.random() * 0.4, -Math.PI / 2);
      }
      this.putOnField(t, r, np);
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

  // Spieler, die vom Feld gehen (zur Bank oder zur Strafbank)
  updateLeaving(dt) {
    for (const l of this.leaving) {
      const p = l.p;
      l.t += dt;
      if (l.wait > 0) { l.wait -= dt; p.anim.t += dt; continue; }
      const g = l.target || benchGate(p.team.side);
      const dx = g.x - p.x, dy = (g.y + 0.6) - p.y, d = Math.hypot(dx, dy);
      const v = p.injuredNow ? 1.6 : 3.5;
      if (d > 0.05) {
        p.vx = dx / d * v; p.vy = dy / d * v;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.facing = Math.atan2(dy, dx);
      }
      if (p.anim.action !== 'run') { p.anim.action = 'run'; p.anim.t = 0; }
      p.anim.t += dt;
      l.done = d < 0.4 || l.t > 9;
    }
    this.leaving = this.leaving.filter(l => !l.done);
  }

  // ---------------------------------------------------------------- Physik

  separatePlayers(ps, dt = 0) {
    const own = this.ball.owner;
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
        const wa = a.isGoalie ? 0.15 : b.isGoalie ? 0.85 : a === own ? 0.8 : b === own ? 0.2 : 0.5;
        a.x -= nx * push * wa; a.y -= ny * push * wa;
        b.x += nx * push * (1 - wa); b.y += ny * push * (1 - wa);
        if (dt > 0 && a.team !== b.team) {
          const rel = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
          this.rules.onContact(a, b, rel, dt);
        }
      }
    }
  }

  clockText() {
    const s = Math.ceil(this.clock);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  periodLabel() {
    if (this.shootout) return 'Penaltys';
    return this.isOT ? 'Verlängerung' : `${this.period}. Drittel`;
  }
}

export { GOAL_X, GOAL_HALF_W };
