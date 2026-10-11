// Simuliert mehrere Karriere-Saisons komplett (eigene Spiele simuliert).
//   node tools/careertest.mjs [Saisons]

import { createDefaultClub } from '../js/club/club.js';
import {
  createCareer, currentEvent, playEvent, ownFixture, eventLabel, standings, startNextSeason, getTeam,
  ownLeague, leagueName, OWN,
} from '../js/league/career.js';
import { teamStrength } from '../js/league/sim.js';

const seasons = +process.argv[2] || 3;
const club = createDefaultClub();
const c = createCareer(club);
const name = id => getTeam(c, club, id).short;
let games = 0, goals = 0, ot = 0, so = 0;
console.log('Ligen:', c.leagues.map((l, L) => `${leagueName(L)} Ø${Math.round(l.reduce((a, id) => a + teamStrength(getTeam(c, club, id)).total, 0) / 8)}`).join(' | '));
for (let s = 0; s < seasons; s++) {
  console.log(`\n=== Saison ${c.season} (${c.year}) – ${club.short} in ${leagueName(ownLeague(c))}, Ziel: ${c.goal.text}`);
  let events = 0, own = 0;
  while (currentEvent(c).kind !== 'end') {
    if (ownFixture(c)) own++;
    const r = playEvent(c, club);
    for (const g of r.games) { games++; goals += g.gh + g.ga; if (g.type === 'ot') ot++; if (g.type === 'so') so++; }
    events++;
    if (events > 200) throw new Error('Endlosschleife: ' + eventLabel(c));
  }
  const sum = c.summary;
  const tab = standings(c, sum.ownLeague);
  console.log(`  ${events} Ereignisse, eigene Spiele ${own}. Rang ${sum.ownRank}: ${tab.map(r => `${name(r.id)} ${r.pts}`).join(', ')}`);
  console.log(`  Meister: ${sum.champions.map((id, L) => `L${L + 1} ${name(id)}`).join(', ')} · Cup: ${name(sum.cup.winner)} (Final gegen ${name(sum.cup.runnerUp)})`);
  console.log(`  Wechsel: ${sum.moves.map(m => `${name(m.id)} ${m.from + 1}→${m.to + 1} (${m.why})`).join(', ')}`);
  console.log(`  Barragen: ${c.barrages.series.map(b => `${name(b.a)}-${name(b.b)} ${b.wins.join(':')}`).join(', ')}`);
  console.log(`  Topskorer: ${sum.scorers.slice(0, 3).map(x => `${x.p.lastName} (${name(x.team)}) ${x.g}+${x.a}`).join(', ')}`);
  console.log(`  Ziel: ${sum.goal.met ? 'erreicht' : 'verpasst'} – ${sum.goal.verdict}`);
  startNextSeason(c, club);
  console.log(`  Rücktritte eigener Verein: ${c.lastAging.retired.map(r => `${r.old} (${r.age})`).join(', ') || 'keine'}`);
  for (const L of c.leagues) if (L.length !== 8 || new Set(L).size !== 8) throw new Error('Liga kaputt ' + L);
  const ids = new Set(club.players.map(p => p.id));
  for (const l of club.lines) for (const k in l) if (!ids.has(l[k])) throw new Error('Linie zeigt auf fehlenden Spieler');
  for (const g of club.goalies.concat(club.subs)) if (!ids.has(g)) throw new Error('Goalie/Ersatz fehlt');
}
console.log(`\nSchnitt: ${(goals / games).toFixed(2)} Tore/Spiel, n.V. ${(ot / games * 100).toFixed(0)} %, n.P. ${(so / games * 100).toFixed(0)} %`);
console.log('JSON-Grösse Karriere:', (JSON.stringify(c).length / 1024).toFixed(0), 'KB');
