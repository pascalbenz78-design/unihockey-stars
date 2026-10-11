// Simuliert ganze Matches ohne Grafik (KI gegen KI) und gibt Statistiken aus.
//   node tools/simtest.mjs [Anzahl] [Schwierigkeit]

import { Match } from '../js/match/match.js';
import { defaultTeams } from '../js/club/roster.js';
import { CONFIG } from '../js/config.js';

const n = +process.argv[2] || 3;
const diff = process.argv[3] || 'mittel';
const dt = 1 / CONFIG.physics.tickRate;
const sum = { goals: 0, shots: 0, onTarget: 0, saves: 0, passes: 0, passesOk: 0, changes: 0, outs: 0, steals: 0 };

for (let g = 0; g < n; g++) {
  const m = new Match({ teams: defaultTeams(), humanTeam: null, difficulty: diff });
  let ticks = 0, changes = 0, outs = 0, posts = 0, faceoffs = 0;
  const t0 = Date.now();
  while (m.state !== 'end' && ticks < 60 * 60 * 15) {
    if (m.state === 'intermission') m.nextPeriod();
    m.step(dt);
    for (const e of m.takeEvents()) {
      if (e.type === 'lineChange') changes++;
      if (e.type === 'whistle' && e.kind === 'out') outs++;
      if (e.type === 'post') posts++;
      if (e.type === 'faceoff') faceoffs++;
    }
    ticks++;
    // Plausibilität: Ball und Spieler im Feld
    for (const p of m.allOnField) {
      if (!Number.isFinite(p.x) || Math.abs(p.x) > 20.01 || Math.abs(p.y) > 10.01) throw new Error('Spieler ausserhalb ' + p.x + ',' + p.y);
    }
    if (!Number.isFinite(m.ball.x)) throw new Error('Ball NaN');
  }
  const [a, b] = m.teams;
  console.log(`Spiel ${g + 1}: ${a.data.short} ${a.score}:${b.score} ${b.data.short}  (${(ticks / 60).toFixed(0)} s real, ${Date.now() - t0} ms Rechenzeit)`);
  for (const t of m.teams) {
    const s = t.stats;
    console.log(`  ${t.data.short}: Schüsse ${s.shots}, aufs Tor ${s.onTarget}, Paraden ${s.saves}, Pässe ${s.passesOk}/${s.passes}, Besitz ${s.possession.toFixed(0)} s, Steals ${s.steals}`);
    sum.shots += s.shots; sum.onTarget += s.onTarget; sum.saves += s.saves; sum.passes += s.passes; sum.passesOk += s.passesOk; sum.steals += s.steals;
  }
  console.log(`  Wechsel ${changes}, Ball über Bande ${outs}, Pfosten ${posts}, Bullys ${faceoffs}`);
  console.log('  Tore: ' + m.goals.map(x => `${x.period}. ${m.teams[x.team].data.short} ${x.ownGoal ? 'Eigentor' : x.scorer.lastName}`).join(', '));
  sum.goals += a.score + b.score;
}
console.log(`\nSchnitt pro Spiel: Tore ${(sum.goals / n).toFixed(1)}, Schüsse ${(sum.shots / n).toFixed(1)}, aufs Tor ${(sum.onTarget / n).toFixed(1)}, Paraden ${(sum.saves / n).toFixed(1)}, Pässe ${(sum.passesOk / n).toFixed(0)}/${(sum.passes / n).toFixed(0)}, Steals ${(sum.steals / n).toFixed(0)}`);
