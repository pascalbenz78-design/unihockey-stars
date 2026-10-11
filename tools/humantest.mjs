// Simuliert einen einfachen «Mensch»-Bot gegen die KI, um die Schwierigkeit
// zu prüfen: läuft zum Ball, dribbelt aufs Tor, schiesst aufgeladen.
//   node tools/humantest.mjs [Schwierigkeit] [Sekunden] [Spiele]

import { Match } from '../js/match/match.js';
import { defaultTeams } from '../js/club/roster.js';
import { CONFIG } from '../js/config.js';

const diff = process.argv[2] || 'mittel';
const secs = +process.argv[3] || 180;
const games = +process.argv[4] || 4;
const dt = 1 / CONFIG.physics.tickRate;
let pensH = 0, pensK = 0;
let tot = { for: 0, against: 0, shots: 0, oppShots: 0, steals: 0, saves: 0 };
const shotLog = [];

for (let g = 0; g < games; g++) {
  const m = new Match({ teams: defaultTeams(), humanTeam: 0, difficulty: diff });
  const h = m.human;
  let charging = 0;
  const origShoot = m.shoot.bind(m);
  m.shoot = (p, c, t, o) => {
    if (p.team === h.team) {
      const gx = 16.5 * h.team.attackDir;
      shotLog.push({ d: Math.hypot(gx - p.x, p.y), y: p.y, c });
    }
    origShoot(p, c, t, o);
  };
  for (let i = 0; i < secs / dt; i++) {
    if (m.state === 'intermission') m.nextPeriod();
    if (m.state === 'end') break;
    const p = h.controlled, b = m.ball;
    let mx = 0, my = 0, shootHeld = false;
    const pressed = {};
    if (i % 2 === 0) {
      if (b.owner === p) {
        const gx = 16.5 * h.team.attackDir;
        const dx = gx - p.x, dy = -p.y, d = Math.hypot(dx, dy);
        mx = dx / d; my = dy / d;
        if (d < 9 || charging > 0) { charging++; shootHeld = charging < 14; if (charging === 1) pressed.shoot = true; }
      } else {
        charging = 0;
        const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
        mx = dx / d; my = dy / d;
        if (b.owner && b.owner.team !== h.team && d < 1.2 && i % 20 === 0) pressed.pass = true;
        if (i % 90 === 0) pressed.switch = true;
      }
      h.setInput({ mx, my, sprint: false, shootHeld }, pressed);
    }
    m.step(dt);
    m.takeEvents();
  }
  pensH += m.rules.log.filter(x => x.team === 0).length; pensK += m.rules.log.filter(x => x.team === 1).length;
  const [a, b] = m.teams;
  console.log(`Spiel ${g + 1}: Mensch ${a.score}:${b.score} KI  Schüsse ${a.stats.shots}:${b.stats.shots}  Paraden KI-Goalie ${b.stats.saves}  Steals KI ${b.stats.steals}`);
  tot.for += a.score; tot.against += b.score; tot.shots += a.stats.shots; tot.oppShots += b.stats.shots; tot.saves += b.stats.saves; tot.steals += b.stats.steals;
}
console.log(`Schnitt: ${(tot.for / games).toFixed(1)}:${(tot.against / games).toFixed(1)}, Schüsse ${(tot.shots / games).toFixed(1)}:${(tot.oppShots / games).toFixed(1)}, Paraden KI ${(tot.saves / games).toFixed(1)}, Steals KI ${(tot.steals / games).toFixed(1)}`);
const avgD = shotLog.reduce((s, x) => s + x.d, 0) / (shotLog.length || 1);
console.log(`Mensch-Schüsse: ${shotLog.length}, mittlere Distanz ${avgD.toFixed(1)} m`);
console.log(`Strafen pro Spiel: Mensch-Team ${(pensH / games).toFixed(1)}, KI ${(pensK / games).toFixed(1)}`);
