// Prüft die einzelnen Aktionen des Menschen auf Fehler und Wirkung.
import { Match } from '../js/match/match.js';
import { defaultTeams } from '../js/club/roster.js';

const dt = 1 / 60;
const m = new Match({ teams: defaultTeams(), humanTeam: 0, difficulty: 'mittel', settings: { autoGoalie: true } });
const h = m.human;
const log = (...a) => console.log(...a);
const run = (sec, inp = {}, pressed = {}) => {
  for (let i = 0; i < sec / dt; i++) { h.setInput({ mx: 0, my: 0, sprint: false, shootHeld: false, ...inp }, i === 0 ? pressed : {}); m.step(dt); }
  return m.takeEvents();
};
run(1.5);
log('Zustand nach Bully:', m.state);
// Ball dem gesteuerten Spieler geben
const giveBall = () => { const p = h.controlled.isGoalie ? h.team.onField.C : h.controlled; h.controlled = p; m.ball.owner = null; m.gainPossession(p); return p; };
let p = giveBall();
let ev = run(0.1, {}, { pass: true });
log('Pass:', ev.filter(e => e.type === 'pass').length === 1 ? 'ok' : 'FEHLT', '→ Empfänger', m.ball.pass && m.ball.pass.to.role);
run(1.2);
log('  angekommen bei', m.ball.owner ? m.ball.owner.team.index + '/' + m.ball.owner.role : 'niemand', 'gesteuert:', h.controlled.role);
p = giveBall();
ev = run(0.1, {}, { bank: true });
log('Bandenpass:', ev.some(e => e.type === 'pass' && e.bank) ? 'ok' : 'FEHLT');
run(1.5);
log('  Bandenkontakt/Empfang:', m.ball.owner ? 'Ball bei ' + m.ball.owner.team.index + '/' + m.ball.owner.role : 'frei');
p = giveBall();
ev = run(0.6, { shootHeld: true }, { shoot: true });
log('Aufladen:', p.charge != null ? p.charge.toFixed(2) + ' s' : 'nicht am Laden');
ev = run(0.1, { shootHeld: false });
log('Schuss:', ev.some(e => e.type === 'shot') ? 'ok' : 'FEHLT', m.ball.speed.toFixed(1), 'm/s');
run(1);
ev = run(0.1, {}, { switch: true });
log('Wechsel E: gesteuert', h.controlled.role);
ev = run(0.1, {}, { goalie: true });
log('Goalie G:', h.controlled.isGoalie ? 'ok' : 'FEHLT');
run(0.5, { my: 1 });
log('  Goalie bewegt y=', h.controlled.y.toFixed(2));
run(0.1, {}, { goalie: true });
log('  zurück:', h.controlled.isGoalie ? 'FEHLT' : 'ok ' + h.controlled.role);
const before = h.team.activeLine;
ev = run(0.1, {}, { line: true });
run(3);
log('Linie Q:', before, '→', h.team.activeLine, h.team.pending.size ? '(noch offen ' + h.team.pending.size + ')' : '', 'Leaving', m.leaving.length);
// Direktschuss: Pass von Mitspieler auf gesteuerten Spieler, dann Schuss kurz vorher
m.ball.owner = null; const mate = h.team.onField.LW; m.gainPossession(mate);
const target = h.team.onField.C; h.controlled = target;
m.passTo(mate, target, false);
let one = false;
for (let i = 0; i < 120; i++) {
  const d = Math.hypot(m.ball.x - target.x, m.ball.y - target.y);
  h.setInput({ mx: 0, my: 0 }, d < 3 && !one ? { shoot: true } : {});
  if (d < 3) one = true;
  m.step(dt);
  const e = m.takeEvents().find(e => e.type === 'shot');
  if (e) { log('Direktschuss:', m.ball.shot && m.ball.shot.oneTimer ? 'ok' : 'normaler Schuss', e.speed.toFixed(1), 'm/s'); break; }
  if (i === 119) log('Direktschuss: FEHLT (Ball bei', m.ball.owner && m.ball.owner.role, ')');
}
// Auto-Goalie: Gegnerschuss aufs eigene Tor
run(1);
const opp = m.teams[1]; const shooter = opp.onField.C;
shooter.x = h.team.side * 9; shooter.y = 0; m.ball.owner = null; m.gainPossession(shooter); h.controlled = h.team.onField.C;
m.shoot(shooter, 0.5, { x: h.team.side * 16.8, y: 0.4 });
run(1 / 60);
log('Auto-Goalie:', h.controlled.isGoalie ? 'ok' : 'FEHLT');
run(2);
log('  danach gesteuert:', h.controlled.isGoalie ? 'Goalie' : h.controlled.role, 'Zustand', m.state);
// Ganzes Spiel mit Pausen
let ends = 0;
for (let i = 0; i < 60 * 600 && m.state !== 'end'; i++) { if (m.state === 'intermission') { ends++; m.nextPeriod(); } m.step(dt); m.takeEvents(); }
log('Spielende erreicht:', m.state, 'Drittelspausen', ends, 'Resultat', m.teams.map(t => t.score).join(':'));
