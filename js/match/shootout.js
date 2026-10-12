// Penaltyschiessen: je 3 Schützen, danach einzeln weiter (Sudden Death).
// Geschossen wird immer aufs rechte Tor. Der Mensch steuert bei eigenen
// Versuchen den Schützen und bei gegnerischen den Goalie.

import { CONFIG } from '../config.js';
import { GOAL_X } from './field.js';
import { ROLES } from './util.js';

const S = CONFIG.shootout;

export class Shootout {
  constructor(m) {
    this.m = m;
    this.order = m.teams.map(t => [...t.players.values()]
      .filter(p => !p.isGoalie && !p.injuredNow && !(p.data.injury && p.data.injury.games > 0))
      .sort((a, b) => b.data.stats.schuss + b.data.stats.technik - a.data.stats.schuss - a.data.stats.technik));
    // Strafen sind vorbei
    m.rules.pending = null;
    for (const t of m.teams) {
      t.penalties = [];
      for (const p of t.players.values()) p.inBox = false;
    }
    this.kicks = [[], []];
    this.n = 0;
    this.winner = null;
    this.setup();
  }

  get shootingTeam() { return this.m.teams[this.n % 2]; }
  goals(i) { return this.kicks[i].filter(Boolean).length; }

  setup() {
    const m = this.m, st = this.shootingTeam, gt = m.other(st);
    const list = this.order[st.index];
    const shooter = list[Math.floor(this.n / 2) % list.length];
    for (const t of m.teams) {
      for (const r of [...ROLES, 'G']) {
        const p = t.onField[r];
        if (p) { p.onField = false; p.role = null; p.charge = null; }
      }
      t.onField = {};
      t.vacant.clear();
      t.pending.clear();
    }
    st.side = -1; gt.side = 1;
    m.putOnField(st, 'C', shooter);
    shooter.setPos(-1, 0, 0);
    shooter.stamina = 1;
    const g = gt.goalie;
    m.putOnField(gt, 'G', g);
    g.setPos(GOAL_X - CONFIG.goalie.lineOffset, 0, Math.PI);
    g.threat = false; g.reactTimer = 0;
    m.leaving = [];
    m.ball.reset(0, 0);
    m.ball.owner = shooter;
    m.ball.lastTouch = shooter;
    shooter.receivedAt = m.time; shooter.receivedPass = false;
    this.shooter = shooter;
    this.goalie = g;
    this.phase = 'ready';
    this.timer = S.readyTime;
    this.released = -1;
    this.plan = null;
    // Menschen: Schütze bzw. Goalie; zu zweit im selben Team abwechselnd
    const turn = Math.floor(this.n / 2);
    for (const side of [true, false]) {
      const hs = m.humans.filter(h => (h.team === st) === side);
      hs.forEach((h, i) => {
        h.controlled = side ? shooter : g;
        h.goalieMode = !side;
        h.benched = i !== turn % hs.length;
        h.pressed = {};
      });
    }
    m.emit({ type: 'shootoutAttempt', team: st, shooter, round: Math.floor(this.n / 2) + 1 });
  }

  tick(dt) {
    const m = this.m, b = m.ball;
    if (this.phase === 'ready') {
      this.timer -= dt;
      for (const p of m.allOnField) { p.ctrl.mx = 0; p.ctrl.my = 0; p.update(dt, m); }
      m.carryBall();
      if (this.timer <= 0) {
        this.phase = 'run';
        this.timer = S.attemptTime;
        m.emit({ type: 'whistle', kind: 'faceoff' });
      }
      return;
    }
    if (this.phase === 'run') {
      m.simTick(dt);
      if (this.phase !== 'run') return; // Tor
      this.timer -= dt;
      if (!b.owner && this.released < 0) this.released = m.time;
      if (b.out || b.owner === this.goalie || (b.lastTouch === this.goalie)) this.finish(false);
      else if (b.x > GOAL_X + 0.4 && !b.inGoal) this.finish(false);
      else if (!b.owner && this.released >= 0 && m.time - this.released > 0.5 && b.speed < 0.8) this.finish(false);
      else if (this.timer <= 0) this.finish(false);
      return;
    }
    // Resultat anzeigen
    this.timer -= dt;
    for (const p of m.allOnField) { p.ctrl.mx = 0; p.ctrl.my = 0; p.ctrl.sprint = false; p.update(dt, m); }
    if (!b.owner) m.stepBallOnly(dt);
    if (this.timer <= 0) this.next();
  }

  // KI-Schütze: anlaufen, seitlich täuschen, in die entfernte Ecke schiessen
  aiShooter(p, dt) {
    const m = this.m, g = this.goalie;
    if (!this.plan) {
      const side = Math.random() < 0.5 ? 1 : -1;
      this.plan = {
        side,
        cutX: GOAL_X - 7 - Math.random() * 2,
        shootX: GOAL_X - 3.6 - Math.random() * 2.4,
        deke: Math.random() < 0.6,
      };
    }
    const pl = this.plan;
    if (p.charge != null) {
      p.charge += dt;
      p.ctrl.mx *= 0.9; p.ctrl.my *= 0.9;
      if (p.charge >= pl.chargeGoal) m.shoot(p, Math.min(1, p.charge / CONFIG.shot.chargeTime), pl.target);
      return;
    }
    let tx, ty;
    if (p.x < pl.cutX) { tx = pl.cutX; ty = pl.side * 1.8; }
    else { tx = pl.shootX + 0.5; ty = pl.deke ? -pl.side * 1.2 : pl.side * 0.6; }
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    p.ctrl.mx = dx / d; p.ctrl.my = dy / d * 1.2; p.ctrl.sprint = false; p.ctrl.face = null;
    if (p.x >= pl.shootX) {
      // in die Ecke, die der Goalie weniger abdeckt
      const aim = g.y > p.y * 0.15 ? -1 : 1;
      pl.target = { x: GOAL_X + 0.3, y: aim * (CONFIG.field.goalWidth / 2 - 0.12) };
      p.charge = 0;
      pl.chargeGoal = (0.25 + Math.random() * 0.35) * CONFIG.shot.chargeTime;
    }
  }

  onGoal() { this.finish(true); }

  finish(scored) {
    if (this.phase !== 'run') return;
    const st = this.shootingTeam;
    this.kicks[st.index].push(scored);
    this.phase = 'result';
    this.timer = S.resultTime;
    if (scored) this.shooter.playAnim('cheer');
    this.m.emit({ type: 'shootoutResult', team: st, shooter: this.shooter, scored });
  }

  next() {
    this.n++;
    const [a, b] = this.kicks;
    const na = a.length, nb = b.length, ga = this.goals(0), gb = this.goals(1);
    const R = S.rounds;
    let w = null;
    if (na <= R && nb <= R) {
      if (ga + (R - na) < gb) w = 1;
      else if (gb + (R - nb) < ga) w = 0;
    } else if (na === nb && ga !== gb) w = ga > gb ? 0 : 1;
    if (w == null && na === R && nb === R && ga !== gb) w = ga > gb ? 0 : 1;
    if (w != null) { this.winner = w; this.m.finishShootout(w); return; }
    this.setup();
  }
}
