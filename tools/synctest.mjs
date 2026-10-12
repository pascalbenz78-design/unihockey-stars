// Online zu zweit ohne Netz: Ein «Gastgeber»-Match rechnet, ein «Gast»-Match
// bekommt nur Schnappschüsse. Prüft Grösse (≤ 4 KiB), Positionen, Tore,
// Ereignisse und Schlussdaten; zusätzlich die Eingabe-Zähler und Stückelung.
//   node tools/synctest.mjs

import { Match } from '../js/match/match.js';
import { defaultTeams } from '../js/club/roster.js';
import { CONFIG } from '../js/config.js';
import { encodeSnapshot, applySnapshot, EventLog, deserValue, InputEncoder, InputDecoder, splitText, ChunkReceiver } from '../js/net/sync.js';

const dt = 1 / CONFIG.physics.tickRate;
const teams = defaultTeams();
const host = new Match({ teams, humans: [0, 1], difficulty: 'mittel' });
const guest = new Match({ teams: JSON.parse(JSON.stringify(teams)), humans: [0, 1], difficulty: 'mittel' });
guest.human = guest.humans[1];
const log = new EventLog();
let maxLen = 0, snaps = 0, lastSeq = 0, goalEvents = 0, events = 0;
for (let i = 0; i < 40 * 60 / dt; i++) {
  if (host.state === 'intermission') { if (host.period === 3) { host.teams[1].score = host.teams[0].score; host.next = 'shootout'; } host.nextPeriod(); }
  if (host.state === 'end') break;
  if (host.state === 'play' && i % 3000 === 2999) host.clock = 0.01;
  for (const h of host.humans) h.setInput({ mx: Math.sin(i / 50 + h.slot), my: Math.cos(i / 70), sprint: false, shootHeld: false }, i % 40 === 0 ? { shoot: true } : {});
  host.step(dt);
  for (const e of host.takeEvents()) log.add(host, e);
  if (i % 3 === 0) {
    const s = JSON.parse(JSON.stringify(encodeSnapshot(host, log)));
    maxLen = Math.max(maxLen, JSON.stringify(s).length);
    snaps++;
    applySnapshot(guest, s);
    for (const [seq, e] of s.ev) if (seq > lastSeq) { lastSeq = seq; events++; const ev = deserValue(guest, e); if (ev.type === 'goal') { goalEvents++; if (!ev.goal || !ev.team) throw new Error('Torereignis kaputt'); } }
    if (s.p) for (const e of s.p) {
      const k = e[0], hp = [...host.teams[k >> 6].players.values()][k & 63], gp = [...guest.teams[k >> 6].players.values()][k & 63];
      if (Math.abs(hp.x - gp.x) > 0.01 || hp.role !== gp.role) throw new Error('Position/Rolle weicht ab');
    }
  }
}
const s = JSON.parse(JSON.stringify(encodeSnapshot(host, log)));
applySnapshot(guest, s);
console.log(`Schnappschüsse ${snaps}, grösster ${maxLen} Bytes, Ereignisse beim Gast ${events}, Torereignisse ${goalEvents}`);
console.log(`Gastgeber ${host.teams.map(t => t.score).join(':')} (${host.result.type}), Gast ${guest.teams.map(t => t.score).join(':')} (${guest.result && guest.result.type}), Tore in Liste ${guest.goals.length}/${host.goals.length}, Strafen ${guest.rules.log.length}/${host.rules.log.length}`);
if (maxLen > 3800) throw new Error('Schnappschuss zu gross');
if (guest.goals.length !== host.goals.length || guest.result.type !== host.result.type) throw new Error('Schlussdaten weichen ab');

const enc = new InputEncoder(), dec = new InputDecoder();
dec.decode(enc.encode({ mx: 0, my: 0 }, {}));
const r = dec.decode(enc.encode({ mx: 0.5, my: -1, sprint: true, shootHeld: true }, { pass: true, skip: true }));
if (!r.pressed.pass || !r.pressed.skip || r.pressed.shoot || r.state.mx !== 0.5) throw new Error('Eingabe falsch');
if (Object.keys(dec.decode(enc.encode({ mx: 0, my: 0 }, {})).pressed).length) throw new Error('Taste doppelt');

const text = 'x'.repeat(2500) + 'ende';
const parts = splitText(text), rc = new ChunkReceiver();
let got = null;
for (let i = parts.length - 1; i >= 0; i--) got = rc.add(['a1', parts.length, i, parts[i]]) || got;
if (got !== text) throw new Error('Stückelung falsch');
console.log('Synchronisation ok');
