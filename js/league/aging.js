// Saisonwechsel für Spieler: älter werden, Entwicklung, Rücktritt.

import { makePlayer } from '../club/roster.js';
import { SKATER_STATS, GOALIE_STATS, overall } from '../club/training.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function devFor(age, rand) {
  const r = () => Math.floor(rand() * 3);
  if (age <= 21) return 1 + r();          // +1..+3
  if (age <= 24) return r();              // 0..+2
  if (age <= 28) return r() - 1;          // −1..+1
  if (age <= 31) return -r();             // −2..0
  return -1 - r();                        // −3..−1
}

function retireChance(age) {
  if (age >= 37) return 1;
  if (age >= 35) return 0.6;
  if (age >= 33) return 0.25;
  return 0;
}

// team: Teamdaten (players, lines, goalies, subs). newId: () => neue ID.
// Gibt { retired: [{old, young}], changes: [{p, delta}] } zurück.
export function ageTeam(team, rand, newId) {
  const report = { retired: [], changes: [] };
  const skaters = team.players.filter(p => p.pos !== 'G');
  const avg = skaters.length ? skaters.reduce((a, p) => a + overall(p), 0) / skaters.length : 55;
  for (const p of [...team.players]) {
    p.age += 1;
    const d = devFor(p.age, rand);
    const stats = p.pos === 'G' ? GOALIE_STATS : SKATER_STATS;
    const before = overall(p);
    for (const k of stats) p.stats[k] = clamp(p.stats[k] + d + Math.round((rand() - 0.5) * 2), 20, 99);
    if (p.progress) p.progress = {};
    const delta = overall(p) - before;
    if (delta) report.changes.push({ p, delta });
    if (rand() < retireChance(p.age)) {
      const young = makePlayer(rand, p.pos, Math.round(avg - 6), p.number, p.stick);
      young.id = newId();
      young.age = 17 + Math.floor(rand() * 3);
      replacePlayer(team, p, young);
      report.retired.push({ old: p, young });
    }
  }
  return report;
}

export function replacePlayer(team, oldP, newP) {
  const i = team.players.indexOf(oldP);
  team.players[i] = newP;
  for (const l of team.lines) for (const k in l) if (l[k] === oldP.id) l[k] = newP.id;
  team.goalies = team.goalies.map(id => (id === oldP.id ? newP.id : id));
  team.subs = team.subs.map(id => (id === oldP.id ? newP.id : id));
  if (team.reserve) team.reserve = team.reserve.map(id => (id === oldP.id ? newP.id : id));
}

// KI-Team an das Niveau seiner Liga heranführen (nach Auf-/Abstieg)
export function adjustToLevel(team, targetOverall, rand) {
  const sk = team.players.filter(p => p.pos !== 'G');
  const avg = sk.reduce((a, p) => a + overall(p), 0) / sk.length;
  const delta = (targetOverall - avg) * 0.5;
  for (const p of team.players) {
    const stats = p.pos === 'G' ? GOALIE_STATS : SKATER_STATS;
    for (const k of stats) p.stats[k] = clamp(Math.round(p.stats[k] + delta + (rand() - 0.5) * 2), 20, 99);
  }
}
