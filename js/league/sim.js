// Simulation von Spielen ohne Grafik, anhand der Teamstärke.
// Liefert Tore, Spielart (regulär / n.V. / n.P.) und Torschützen.

import { overall } from '../club/training.js';

const ROLES = ['C', 'LW', 'RW', 'LD', 'RD'];
const healthy = p => p && !(p.injury && p.injury.games > 0);

// Aktuelle Aufstellung ohne Verletzte (Ersatz rückt nach)
export function availableLines(team) {
  const byId = new Map(team.players.map(p => [p.id, p]));
  const used = new Set();
  const bench = team.players.filter(p => p.pos !== 'G' && healthy(p));
  const lines = team.lines.map(l => {
    const out = {};
    for (const r of ROLES) {
      let p = byId.get(l[r]);
      if (!healthy(p) || used.has(p.id)) p = bench.find(b => !used.has(b.id) && !Object.values(out).includes(b)) || p;
      out[r] = p; used.add(p.id);
    }
    return out;
  });
  const goalie = team.goalies.map(id => byId.get(id)).find(healthy) || byId.get(team.goalies[0]);
  return { lines, goalie };
}

export function teamStrength(team) {
  const { lines, goalie } = availableLines(team);
  const w = [0.45, 0.33, 0.22];
  let att = 0;
  lines.forEach((l, i) => { att += w[i] * ROLES.reduce((a, r) => a + overall(l[r]), 0) / 5; });
  const g = overall(goalie);
  return { att, def: att * 0.6 + g * 0.4, total: att * 0.75 + g * 0.25 };
}

function poisson(lambda, rand) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
}

// Torschütze (gewichtet nach Schuss und Linie) und Assist (nach Pass)
function pickScorer(team, rand) {
  const { lines } = availableLines(team);
  const lw = [3, 2, 1.2];
  const cand = [];
  lines.forEach((l, i) => ROLES.forEach(r => {
    const p = l[r];
    const pos = r === 'LD' || r === 'RD' ? 0.45 : 1;
    cand.push({ p, w: lw[i] * pos * (p.stats.schuss / 50) ** 2, a: lw[i] * (p.stats.pass / 50) ** 2 });
  }));
  const pick = key => {
    const tot = cand.reduce((s, c) => s + c[key], 0);
    let x = rand() * tot;
    for (const c of cand) { x -= c[key]; if (x <= 0) return c; }
    return cand[0];
  };
  const s = pick('w');
  let a = rand() < 0.75 ? pick('a') : null;
  if (a && a.p === s.p) a = null;
  return { scorer: s.p.id, assist: a ? a.p.id : null };
}

// Ein Spiel simulieren. Immer entschieden (Verlängerung/Penaltys wie im Spiel).
export function simulateGame(home, away, rand = Math.random, homeAdv = 1.07) {
  const sh = teamStrength(home), sa = teamStrength(away);
  const base = 2.9;
  const lh = base * Math.pow(sh.att / sa.def, 3) * homeAdv;
  const la = base * Math.pow(sa.att / sh.def, 3) / homeAdv;
  let gh = poisson(lh, rand), ga = poisson(la, rand);
  let type = 'regular';
  const goals = [];
  for (let i = 0; i < gh; i++) goals.push({ team: home.id, ...pickScorer(home, rand) });
  for (let i = 0; i < ga; i++) goals.push({ team: away.id, ...pickScorer(away, rand) });
  if (gh === ga) {
    // Verlängerung: Tor mit Wahrscheinlichkeit ~55 %, sonst Penaltys
    const ph = lh / (lh + la);
    if (rand() < 0.55) {
      type = 'ot';
      if (rand() < ph) { gh++; goals.push({ team: home.id, ...pickScorer(home, rand), ot: true }); }
      else { ga++; goals.push({ team: away.id, ...pickScorer(away, rand), ot: true }); }
    } else {
      type = 'so';
      if (rand() < 0.5 + (ph - 0.5) * 0.4) gh++; else ga++;
    }
  }
  return { gh, ga, type, goals };
}
