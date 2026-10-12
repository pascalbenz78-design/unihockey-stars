// Online zu zweit: Der Gastgeber rechnet das Spiel, der Gast zeigt es nur an.
// Hier steht, wie ein Spielzustand («Schnappschuss»), Ereignisse und die
// Eingaben des Gasts kompakt verpackt werden. Alles ist absoluter Zustand
// (geht ein Paket verloren, gilt einfach das nächste). Reine Logik ohne DOM.
//
// Grenzen des Live-Raums auf claude.ai: ein Präsenz-Objekt höchstens 4 KiB,
// Zeichenketten höchstens 1 KiB → nur Zahlen-Listen, gerundet.

import { MPlayer } from '../match/player.js';
import { MTeam } from '../match/match.js';

const ROLE_LIST = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];
const KEYS = ['shoot', 'pass', 'bank', 'switch', 'goalie', 'line', 'skip', 'sprint'];
// Nur diese Ereignisse braucht der Gast (Ton, Meldungen, Menüs)
const EVENT_TYPES = new Set(['shot', 'pass', 'board', 'post', 'save', 'catch', 'whistle', 'goalHorn', 'goal', 'celebrate',
  'foul', 'penalty', 'penaltyEnd', 'injury', 'shootoutStart', 'shootoutAttempt', 'shootoutResult', 'periodEnd', 'gameEnd', 'lineChange']);

const r2 = v => Math.round(v * 100) / 100;
const r1 = v => Math.round(v * 10) / 10;

// Spieler-Schlüssel: Team * 64 + Position in der Spielerliste (auf beiden Geräten gleich)
function keys(m) {
  if (m._keys) return m._keys;
  const byP = new Map(), byKey = new Map(), byData = new Map();
  m.teams.forEach((t, ti) => {
    let i = 0;
    for (const p of t.players.values()) {
      const k = ti * 64 + i++;
      byP.set(p, k); byKey.set(k, p); byData.set(p.data, k);
    }
  });
  m._keys = { byP, byKey, byData };
  return m._keys;
}
const keyOf = (m, p) => (p ? keys(m).byP.get(p) ?? -1 : -1);
const playerAt = (m, k) => (k >= 0 ? keys(m).byKey.get(k) || null : null);

// ------------------------------------------------------------ Ereignisse

function encGoal(m, g) {
  return [g.team, g.period, Math.ceil(g.clock), r2(g.time), g.side, keyOf(m, g.scorerPlayer) >= 0 ? keyOf(m, g.scorerPlayer) : (g.scorer ? keys(m).byData.get(g.scorer) ?? -1 : -1),
    g.assist ? keys(m).byData.get(g.assist) ?? -1 : -1, g.ownGoal ? 1 : 0, g.pp || 0];
}
function decGoal(m, a) {
  const sp = playerAt(m, a[5]), as = playerAt(m, a[6]);
  return {
    team: a[0], period: a[1], clock: a[2], time: a[3], side: a[4],
    scorer: a[7] ? null : sp && sp.data, assist: as ? as.data : null, ownGoal: !!a[7], pp: a[8] || null,
    scorerPlayer: a[7] ? null : sp,
  };
}

// Verweise auf Spieler, Teams und Tore werden zu kleinen Markern
export function serValue(m, v, depth = 0) {
  if (v == null || typeof v === 'boolean' || typeof v === 'string') return v ?? null;
  if (typeof v === 'number') return Math.round(v * 1000) / 1000;
  if (v instanceof MPlayer) return { P: keyOf(m, v) };
  if (v instanceof MTeam) return { T: v.index };
  if (Array.isArray(v)) return v.map(x => serValue(m, x, depth + 1));
  if (typeof v === 'object') {
    if ('scorerPlayer' in v) return { G: encGoal(m, v) };
    const ti = m.teams.findIndex(t => t.data === v);
    if (ti >= 0) return { TD: ti };
    const dk = keys(m).byData.get(v);
    if (dk != null) return { D: dk };
    if (depth > 3) return null;
    const o = {};
    for (const k in v) if (typeof v[k] !== 'function') o[k] = serValue(m, v[k], depth + 1);
    return o;
  }
  return null;
}

export function deserValue(m, v) {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x => deserValue(m, x));
  if ('P' in v) return playerAt(m, v.P);
  if ('T' in v) return m.teams[v.T];
  if ('G' in v) return decGoal(m, v.G);
  if ('TD' in v) return m.teams[v.TD].data;
  if ('D' in v) { const p = playerAt(m, v.D); return p ? p.data : null; }
  const o = {};
  for (const k in v) o[k] = deserValue(m, v[k]);
  return o;
}

// Ereignis-Protokoll des Gastgebers: die letzten paar Ereignisse mit laufender Nummer
export class EventLog {
  constructor(max = 10) { this.max = max; this.seq = 0; this.list = []; }
  add(m, e) {
    if (!EVENT_TYPES.has(e.type)) return;
    this.list.push([++this.seq, serValue(m, e)]);
    if (this.list.length > this.max) this.list.shift();
  }
}

// ------------------------------------------------------------ Schnappschuss

export function encodeSnapshot(m, log) {
  const leaving = new Set(m.leaving.map(l => l.p));
  const quiet = m.state === 'intermission' || m.state === 'end';
  const s = {
    t: r2(m.time), st: m.state, pe: m.period, cl: r1(m.clock), nx: m.next,
    tm: m.teams.map(t => [t.score, t.activeLine, t.nextLine, t.pending.size + t.changes.length, [...t.vacant].join(','),
      t.penalties.map(p => [keyOf(m, p.player), Math.round(p.remaining), p.waiting ? 1 : 0])]),
    adv: m.rules.pending ? m.rules.pending.victim.team.index : -1,
    sig: r1(m.rules.signalUntil || 0),
    hu: m.humans.map(h => [keyOf(m, h.controlled), h.benched ? 1 : 0]),
    ce: keyOf(m, m.celebrator),
    ev: log ? log.list : [],
  };
  if (!quiet) {
    const pl = [], box = [];
    m.teams.forEach(t => {
      for (const p of t.players.values()) {
        if (p.inBox) box.push(keyOf(m, p));
        if (!p.onField && !leaving.has(p)) continue;
        pl.push([keyOf(m, p), r2(p.x), r2(p.y), r2(p.facing), r1(p.speed), p.anim.action, r2(p.anim.t), p.anim.dir || 0,
          p.charge == null ? -1 : r2(p.charge), p.onField ? ROLE_LIST.indexOf(p.role) : -1,
          (leaving.has(p) ? 1 : 0) | (p.injuredNow ? 2 : 0), Math.round(p.stamina * 100)]);
      }
    });
    const b = m.ball;
    s.p = pl;
    s.bx = box;
    s.b = [r2(b.x), r2(b.y), r2(b.z), r1(b.vx), r1(b.vy), keyOf(m, b.owner), b.shot ? 1 : 0, b.pass ? keyOf(m, b.pass.to) : -1];
  }
  if (m.replay) s.rp = [r2(m.replay.start), r2(m.replay.end), r2(m.replay.t), m.replay.side];
  if (m.shootout) s.so = m.shootout.kicks.map(k => k.map(x => (x ? 1 : 0)));
  if (quiet) {
    // Für Pausen- und Schlussanzeige: Statistik, Tore, Strafen, Verletzungen, Resultat
    s.fin = {
      stats: m.teams.map(t => { const o = {}; for (const k in t.stats) o[k] = r1(t.stats[k]); return o; }),
      goals: m.goals.map(g => encGoal(m, g)),
      log: m.rules.log.map(l => [l.team, keys(m).byData.get(l.player) ?? -1, l.type]),
      inj: m.rules.injuries.map(i => [m.teams.findIndex(t => t.data === i.team), keys(m).byData.get(i.player) ?? -1, i.level, i.games]),
      res: m.result ? [m.result.winner, m.result.type] : null,
    };
  }
  return s;
}

const lerpAng = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };

// Schnappschuss auf das (nicht selbst rechnende) Match des Gasts übertragen.
// a = älterer, b = neuerer Schnappschuss, k = 0..1 dazwischen, extra = Zeit seit a
export function applySnapshot(m, a, b = a, k = 0) {
  const t = a.t + (b.t - a.t) * k;
  const dtA = t - a.t;
  m.time = t;
  m.state = a.st; m.period = a.pe; m.next = a.nx;
  m.clock = a.cl + (b.cl - a.cl) * (b.pe === a.pe ? k : 0);
  a.tm.forEach((x, i) => {
    const tm = m.teams[i];
    tm.score = x[0]; tm.activeLine = x[1]; tm.nextLine = x[2];
    tm.pending = new Set(x[3] ? ['C'] : []);
    tm.vacant = new Set(x[4] ? x[4].split(',') : []);
    tm.penalties = x[5].map(p => ({ player: playerAt(m, p[0]), remaining: p[1], waiting: !!p[2] })).filter(p => p.player);
  });
  m.rules.pending = a.adv >= 0 ? { victim: { team: m.teams[a.adv] } } : null;
  m.rules.signalUntil = a.sig;
  if (a.p) {
    const nb = new Map((b.p || a.p).map(e => [e[0], e]));
    for (const tm of m.teams) {
      tm.onField = {};
      for (const p of tm.players.values()) { p.onField = false; p.role = null; p.inBox = false; }
    }
    m.leaving = [];
    for (const e of a.p) {
      const p = playerAt(m, e[0]);
      if (!p) continue;
      const n = nb.get(e[0]) || e;
      p.x = e[1] + (n[1] - e[1]) * k; p.y = e[2] + (n[2] - e[2]) * k;
      p.facing = lerpAng(e[3], n[3], k);
      const sp = e[4] + (n[4] - e[4]) * k;
      p.vx = Math.cos(p.facing) * sp; p.vy = Math.sin(p.facing) * sp;
      if (k < 0.5 || n[5] === e[5]) { p.anim.action = e[5]; p.anim.t = e[6] + dtA; } else { p.anim.action = n[5]; p.anim.t = Math.max(0, n[6] - (b.t - t)); }
      p.anim.dir = e[7];
      p.charge = e[8] < 0 ? null : e[8];
      if (e[9] >= 0) { p.onField = true; p.role = ROLE_LIST[e[9]]; p.team.onField[p.role] = p; }
      if (e[10] & 1) m.leaving.push({ p, t: 0 });
      p.injuredNow = e[10] & 2 ? (p.injuredNow || { level: 'leicht' }) : null;
      p.stamina = e[11] / 100;
    }
    for (const kb of a.bx || []) { const p = playerAt(m, kb); if (p) p.inBox = true; }
    const bl = m.ball, x = a.b, y = b.b || x;
    bl.x = x[0] + (y[0] - x[0]) * k; bl.y = x[1] + (y[1] - x[1]) * k; bl.z = x[2] + (y[2] - x[2]) * k;
    bl.vx = x[3]; bl.vy = x[4];
    bl.owner = playerAt(m, x[5]);
    bl.shot = x[6] ? { team: null } : null;
    const pt = playerAt(m, x[7]);
    bl.pass = pt ? { to: pt } : null;
  }
  a.hu.forEach((h, i) => {
    const hc = m.humans[i];
    if (!hc) return;
    const p = playerAt(m, h[0]);
    if (p) hc.controlled = p;
    hc.benched = !!h[1];
  });
  m.celebrator = playerAt(m, a.ce);
  if (a.rp) {
    if (!m.replay || m.replay.start !== a.rp[0]) {
      m.replay = { frames: m.recorder.cut(a.rp[0], a.rp[1]), start: a.rp[0], end: a.rp[1], t: a.rp[2], side: a.rp[3] };
      if (m.replay.frames.length < 5) m.replay.frames = [];
    }
    m.replay.t = a.rp[2] + ((b.rp ? b.rp[2] : a.rp[2]) - a.rp[2]) * k;
  } else m.replay = null;
  m.shootout = a.so ? { kicks: a.so.map(r => r.map(Boolean)) } : null;
  if (a.fin) {
    const f = a.fin;
    f.stats.forEach((s, i) => Object.assign(m.teams[i].stats, s));
    m.goals = f.goals.map(g => decGoal(m, g));
    m.rules.log = f.log.map(l => ({ team: l[0], player: (playerAt(m, l[1]) || {}).data, type: l[2] })).filter(l => l.player);
    m.rules.injuries = f.inj.map(i => ({ team: m.teams[i[0]].data, player: (playerAt(m, i[1]) || {}).data, level: i[2], games: i[3] })).filter(i => i.player);
    m.result = f.res ? { winner: f.res[0], type: f.res[1] } : null;
  }
}

// ------------------------------------------------------------ Eingabe des Gasts

// Zustand + Zähler je Taste (statt «gedrückt»: so geht kein Tastendruck verloren)
export class InputEncoder {
  constructor() { this.cnt = KEYS.map(() => 0); }
  encode(state, pressed) {
    KEYS.forEach((k, i) => { if (pressed[k]) this.cnt[i]++; });
    return [Math.round(state.mx * 100), Math.round(state.my * 100), state.sprint ? 1 : 0, state.shootHeld ? 1 : 0, ...this.cnt];
  }
}

export class InputDecoder {
  constructor() { this.last = null; }
  decode(arr) {
    if (!Array.isArray(arr) || arr.length < 4 + KEYS.length) return null;
    const cnt = arr.slice(4, 4 + KEYS.length).map(v => v | 0);
    const pressed = {};
    if (this.last) KEYS.forEach((k, i) => { if (cnt[i] !== this.last[i]) pressed[k] = true; });
    this.last = cnt;
    const c = v => Math.max(-1, Math.min(1, (+v || 0) / 100));
    return { state: { mx: c(arr[0]), my: c(arr[1]), sprint: !!arr[2], shootHeld: !!arr[3] }, pressed };
  }
}

// ------------------------------------------------------------ Mannschaften übertragen

// Lange Texte (Teamdaten) in Stücke à 900 Zeichen, damit sie in die Präsenz passen
export const CHUNK = 900;
export function splitText(s) { const out = []; for (let i = 0; i < s.length; i += CHUNK) out.push(s.slice(i, i + CHUNK)); return out.length ? out : ['']; }

export class ChunkReceiver {
  constructor() { this.id = null; this.parts = []; }
  // c = [id, anzahl, index, text, (index2, text2)]; liefert den ganzen Text, sobald vollständig
  add(c) {
    if (!Array.isArray(c) || c.length < 4) return null;
    if (c[0] !== this.id) { this.id = c[0]; this.parts = new Array(c[1]).fill(null); }
    for (let i = 2; i + 1 < c.length; i += 2) if (c[i] >= 0 && c[i] < this.parts.length) this.parts[c[i]] = String(c[i + 1]);
    return this.parts.every(p => p != null) ? this.parts.join('') : null;
  }
}
