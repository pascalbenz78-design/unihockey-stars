// Zwei Menschen in einem Match: gegeneinander ([0, 1]) und zusammen ([0, 0]).
// Einfache Bots steuern beide; geprüft wird, dass nichts abstürzt, zu zweit im
// selben Team nie beide denselben Spieler steuern und das Penaltyschiessen klappt.
//   node tools/multitest.mjs [Spiele]

import { Match } from '../js/match/match.js';
import { defaultTeams } from '../js/club/roster.js';
import { CONFIG } from '../js/config.js';

const games = +process.argv[2] || 2;
const dt = 1 / CONFIG.physics.tickRate;

function bot(m, h, i, st) {
  if (i % 2) return;
  const p = h.controlled, b = m.ball;
  let mx = 0, my = 0, shootHeld = false;
  const pressed = {};
  if (b.owner === p) {
    const gx = 16.5 * h.team.attackDir;
    const dx = gx - p.x, dy = -p.y, d = Math.hypot(dx, dy);
    mx = dx / d; my = dy / d;
    if (d < 9 || st.c > 0) { st.c++; shootHeld = st.c < 14; if (st.c === 1) pressed.shoot = true; }
    else if (h.partners().length && i % 50 === 0) pressed.pass = true;
  } else {
    st.c = 0;
    const tx = h.slot && b.owner && b.owner.team === h.team ? 8 * h.team.attackDir : b.x;
    const ty = h.slot && b.owner && b.owner.team === h.team ? 3 : b.y;
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    mx = d > 0.5 ? dx / d : 0; my = d > 0.5 ? dy / d : 0;
    if (b.owner && b.owner.team !== h.team && d < 1.2 && i % 20 === 0) pressed.pass = true;
    if (i % 90 === 0) pressed.switch = true;
    if (i % 1500 === 7) pressed.line = true;
    if (i % 2400 === 11) pressed.goalie = true;
  }
  h.setInput({ mx, my, sprint: i % 300 < 60, shootHeld }, pressed);
}

function run(humans, label, forceShootout = false) {
  const m = new Match({ teams: defaultTeams(), humans, difficulty: 'mittel' });
  const st = m.humans.map(() => ({ c: 0 }));
  let clash = 0, ticks = 0;
  for (let i = 0; i < 20 * 60 / dt; i++) {
    if (m.state === 'intermission') {
      if (forceShootout && m.next !== 'shootout') { m.period = 3; m.teams[1].score = m.teams[0].score; m.next = 'shootout'; }
      m.nextPeriod();
    }
    if (m.state === 'end') break;
    if (forceShootout && m.period < 3 && m.state === 'play' && i > 600) { m.clock = 0.01; }
    m.humans.forEach((h, k) => bot(m, h, i, st[k]));
    m.step(dt);
    m.takeEvents();
    if (m.state === 'play' && humans[0] === humans[1]) {
      ticks++;
      const [a, b] = m.humans;
      if (!a.benched && !b.benched && a.controlled === b.controlled) clash++;
    }
  }
  const [a, b] = m.teams;
  console.log(`${label}: ${a.score}:${b.score} (${m.result ? m.result.type : m.state})  Schüsse ${a.stats.shots}:${b.stats.shots}` +
    (humans[0] === humans[1] ? `  gleicher Spieler gesteuert: ${clash} von ${ticks} Ticks` : '') +
    (m.shootout ? `  Penaltys ${m.shootout.kicks.map(k => k.filter(Boolean).length).join(':')}` : ''));
  if (m.state !== 'end') throw new Error('Spiel nicht fertig');
  if (clash > 0) throw new Error('beide steuern denselben Spieler');
  return m;
}

for (let g = 0; g < games; g++) {
  run([0, 1], `Gegeneinander ${g + 1}`);
  run([0, 0], `Zusammen ${g + 1}`);
}
run([0, 0], 'Zusammen mit Penaltyschiessen', true);
run([0, 1], 'Gegeneinander mit Penaltyschiessen', true);
console.log('Mehrspieler ok');
