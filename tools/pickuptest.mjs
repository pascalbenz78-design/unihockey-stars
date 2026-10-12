// Läuft ein Spieler knapp am ruhenden Ball vorbei, soll er ihn mitnehmen
// (auch auf der Rückhandseite, also der Seite ohne Kelle).
//   node tools/pickuptest.mjs
import { Match } from '../js/match/match.js';
import { defaultTeams } from '../js/club/roster.js';

const dt = 1 / 60;
let fails = 0;
for (const off of [-0.6, -0.45, -0.3, 0, 0.3, 0.45, 0.6]) {
  const m = new Match({ teams: defaultTeams(), humanTeam: 0 });
  m.state = 'play';
  const p = m.teams[0].onField.C;
  for (const t of m.teams) for (const q of t.all) if (q !== p) q.setPos(-15, 8);
  p.setPos(-4, off, 0);
  m.ball.reset(0, 0);
  m.human.controlled = p;
  let got = false;
  for (let i = 0; i < 120 && !got; i++) {
    m.human.setInput({ mx: 1, my: 0, sprint: false, shootHeld: false }, {});
    m.step(dt); m.takeEvents();
    got = m.ball.owner === p;
  }
  const side = Math.sign(off) === p.handSign ? 'Kellenseite' : off === 0 ? 'mittig' : 'Rückhand';
  console.log(`Versatz ${off.toFixed(2)} m (${side}): ${got ? 'angenommen' : 'VORBEI'}`);
  if (!got && Math.abs(off) <= 0.45) fails++;
}
if (fails) throw new Error('Ball nicht angenommen');
console.log('Ballannahme ok');
