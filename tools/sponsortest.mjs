// Prüft mehrjährige Sponsorenverträge über mehrere Saisons.
//   node tools/sponsortest.mjs

import { createDefaultClub } from '../js/club/club.js';
import { createCareer, currentEvent, playEvent, startNextSeason } from '../js/league/career.js';
import { signSponsor, dropSponsor } from '../js/league/finance.js';

const club = createDefaultClub();
const c = createCareer(club);
const f = () => c.finance;
const ok = (cond, msg) => { if (!cond) throw new Error(msg); console.log('  ✓', msg); };
const [o1, o2, o3] = f().offers;
ok(signSponsor(c, o1.id, 1).ok && signSponsor(c, o2.id, 2).ok && signSponsor(c, o3.id, 3).ok, 'drei Verträge 1/2/3 Jahre');
ok(f().sponsors[2].amount < o3.amount && f().sponsors[0].amount === o1.amount, '3 Jahre geben weniger pro Saison');
ok(!signSponsor(c, f().offers[3].id, 1).ok, 'vierter Platz gesperrt (Anzeigetafel Stufe 0)');
ok(dropSponsor(c, o1.id).ok && f().sponsors.length === 2, 'Auflösen in der Saison der Unterschrift');
signSponsor(c, o1.id, 1);
const play = () => { while (currentEvent(c).kind !== 'end') playEvent(c, club); startNextSeason(c, club); };
play();
ok(f().sponsors.map(s => s.name).join() === [o2.name, o3.name].join(), 'Saison 2: 1-Jahres-Vertrag ist abgelaufen');
ok(!f().offers.some(o => o.name === o2.name || o.name === o3.name), 'laufende Sponsoren nicht nochmals im Angebot');
ok(!dropSponsor(c, o3.id).ok, 'alter Vertrag lässt sich nicht kündigen');
play();
ok(f().sponsors.map(s => s.name).join() === o3.name, 'Saison 3: nur noch der 3-Jahres-Vertrag');
play();
ok(f().sponsors.length === 0, 'Saison 4: alle Verträge abgelaufen');
console.log('Sponsoren ok');
