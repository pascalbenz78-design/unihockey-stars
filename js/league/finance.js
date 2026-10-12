// Geld, Halle, Sponsoren, Transfers und Nachwuchs in der Karriere.
// Beträge in Franken. Reine Logik ohne DOM.

import { makePlayer } from '../club/roster.js';
import { overall } from '../club/training.js';
import { replacePlayer } from './aging.js';

export const MAX_ROSTER = 26;
export const MIN_ROSTER = 20;
const LEAGUE_FACTOR = [4, 2.5, 1.6, 1.2, 1];   // Prämien je Liga
const TICKET = [18, 15, 12, 10, 8];            // Eintrittspreis
const DEMAND = [1600, 1000, 650, 420, 300];     // Grundnachfrage pro Heimspiel
const SPONSOR_BASE = [40000, 25000, 14000, 8000, 5000];

// Ausbaustufen: Kosten der nächsten Stufe, Wirkung
export const FACILITIES = {
  stands: { label: 'Tribünen', costs: [40000, 110000, 260000, 600000], max: 4,
    effect: l => `${CAPACITY[l].toLocaleString('de-CH')} Plätze` },
  scoreboard: { label: 'Anzeigetafel', costs: [15000, 45000, 100000], max: 3,
    effect: l => (l ? `+${l * 6} % Zuschauereinnahmen, ${l + 3} Sponsorenplätze` : '3 Sponsorenplätze') },
  locker: { label: 'Garderobe', costs: [20000, 55000, 120000], max: 3,
    effect: l => (l ? `+${l * 15} % Erholung auf der Bank und in den Pausen` : 'einfache Garderobe') },
  physio: { label: 'Physiotherapie', costs: [15000, 40000, 90000], max: 3,
    effect: l => (l ? `Verletzungen ${l * 15} % kürzer` : 'kein Physiotherapeut') },
  youth: { label: 'Nachwuchsabteilung', costs: [20000, 60000, 150000], max: 3,
    effect: l => `${2 + l} Junioren pro Saison, Niveau ${['tief', 'mittel', 'gut', 'sehr gut'][l]}` },
};
export const CAPACITY = [600, 1200, 2500, 4500, 8000];
const UPKEEP = { stands: 60, scoreboard: 40, locker: 40, physio: 120, youth: 100 };   // pro Runde und Stufe

export const SPONSOR_POOL = [
  { name: 'Bergkäse AG', bg: '#ffd84d', fg: '#7a3b00' }, { name: 'VELO BLITZ', bg: '#1d1d1d', fg: '#ffe600' },
  { name: 'Schoggi Moser', bg: '#5b2d12', fg: '#ffffff' }, { name: 'Alpen-Mobil', bg: '#0b62c4', fg: '#ffffff' },
  { name: 'Bäckerei Zopf', bg: '#ffffff', fg: '#c0392b' }, { name: 'Seeblick Hotel', bg: '#13806b', fg: '#ffffff' },
  { name: 'TURBO SPORT', bg: '#e8332a', fg: '#ffffff' }, { name: 'Gipfelbank', bg: '#ffffff', fg: '#0b3a6e' },
  { name: 'Holzbau Tanner', bg: '#8b5a2b', fg: '#fff2d6' }, { name: 'Frischmilch Hof', bg: '#e9f6ff', fg: '#1f5fbf' },
  { name: 'Garage Rapid', bg: '#222222', fg: '#ff7f27' }, { name: 'Pizza Bellavista', bg: '#1f8f4e', fg: '#ffffff' },
  { name: 'Elektro Funke', bg: '#ffd400', fg: '#111111' }, { name: 'Sportshop Kelle', bg: '#7d3cff', fg: '#ffffff' },
  { name: 'Reisebüro Fernweh', bg: '#00a3b4', fg: '#ffffff' }, { name: 'Malerei Farbtopf', bg: '#ff4fa3', fg: '#ffffff' },
];

export const chf = n => `${Math.round(n).toLocaleString('de-CH')} Fr.`;

// ------------------------------------------------------------ Spieler

export function wageOf(p) {
  return Math.max(40, Math.round(0.1 * Math.pow(Math.max(0, overall(p) - 30), 2.2) / 10) * 10);
}

export function valueOf(p) {
  const o = overall(p);
  const age = p.age <= 21 ? 1.45 : p.age <= 25 ? 1.2 : p.age <= 29 ? 1 : p.age <= 32 ? 0.6 : 0.35;
  return Math.max(1000, Math.round(1000 * Math.pow(1.13, o - 40) * age / 500) * 500);
}

export const wageBill = club => club.players.reduce((a, p) => a + wageOf(p), 0);

// ------------------------------------------------------------ Aufbau

export function initFinance(c, club, rand = Math.random) {
  c.finance = {
    balance: 50000,
    facilities: { stands: 0, scoreboard: 0, locker: 0, physio: 0, youth: 0 },
    sponsors: [], offers: [], juniors: [], market: [], marketAge: 0,
    season: emptyTotals(), ledger: [],
  };
  club.reserve = club.reserve || [];
  newSeasonFinance(c, club, rand);
}

function emptyTotals() {
  return { tickets: 0, sponsors: 0, premiums: 0, sales: 0, wages: 0, upkeep: 0, build: 0, buys: 0 };
}

export function book(c, cat, amount, label) {
  const f = c.finance;
  f.balance += amount;
  f.season[cat] = (f.season[cat] || 0) + Math.abs(amount);
  f.ledger.unshift({ season: c.season, label, amount: Math.round(amount) });
  if (f.ledger.length > 40) f.ledger.length = 40;
}

export const sponsorSlots = c => 3 + c.finance.facilities.scoreboard;

// Vertragsdauer: länger = sicher, dafür etwas weniger pro Saison
export const SPONSOR_YEARS = { 1: 1, 2: 0.95, 3: 0.9 };
export const contractAmount = (o, years) => Math.round(o.amount * SPONSOR_YEARS[years] / 100) * 100;

// Neue Saison: Sponsorenangebote, Junioren, Markt
export function newSeasonFinance(c, club, rand = Math.random) {
  const f = c.finance;
  f.lastSeason = f.season;
  f.season = emptyTotals();
  const L = c.leagues.findIndex(l => l.includes('OWN'));
  // Laufende Verträge bleiben, abgelaufene fallen weg (alte Spielstände: Vertrag = 1 Saison)
  f.sponsors = (f.sponsors || []).filter(s => (s.until ?? -1) >= c.season);
  const busy = new Set(f.sponsors.map(s => s.name));
  const pool = SPONSOR_POOL.filter(s => !busy.has(s.name)).sort(() => rand() - 0.5).slice(0, 7);
  f.offers = pool.map((s, i) => {
    const amount = Math.round(SPONSOR_BASE[L] * (0.6 + rand() * 0.8) / 500) * 500;
    return { ...s, id: `${c.season}-${i}`, amount, winBonus: Math.round(amount / 25 / 50) * 50 };
  });
  makeJuniors(c, rand);
  refreshMarket(c, club, rand, true);
}

// ------------------------------------------------------------ Halle

export const hallOf = (c, teamId) => {
  if (teamId === 'OWN') return { stands: c.finance.facilities.stands, scoreboard: c.finance.facilities.scoreboard };
  const L = c.leagues.findIndex(l => l.includes(teamId));
  return { stands: [4, 3, 2, 1, 1][L], scoreboard: [3, 2, 1, 1, 0][L] };
};

export function build(c, key) {
  const f = c.finance, fac = FACILITIES[key];
  const lvl = f.facilities[key];
  if (lvl >= fac.max) return { ok: false, msg: 'Höchste Stufe erreicht' };
  const cost = fac.costs[lvl];
  if (f.balance < cost) return { ok: false, msg: `Zu wenig Geld (${chf(cost)} nötig)` };
  book(c, 'build', -cost, `Ausbau ${fac.label} Stufe ${lvl + 1}`);
  f.facilities[key] = lvl + 1;
  return { ok: true };
}

// ------------------------------------------------------------ Zuschauer

export function attendance(c, ownRank, kind, oppLeague) {
  const f = c.finance;
  const L = c.leagues.findIndex(l => l.includes('OWN'));
  let d = DEMAND[L] * (1.25 - (ownRank - 1) * 0.06);
  if (kind === 'playoff' || kind === 'barrage') d *= 1.5;
  if (kind === 'cup') d *= 1.1 + Math.max(0, L - oppLeague) * 0.25;
  d *= 1 + f.facilities.stands * 0.15;            // schönere Halle lockt mehr Leute
  return Math.round(Math.min(CAPACITY[f.facilities.stands], d * (0.9 + Math.random() * 0.2)));
}

export function ticketIncome(c, spectators) {
  const L = c.leagues.findIndex(l => l.includes('OWN'));
  return spectators * TICKET[L] * (1 + c.finance.facilities.scoreboard * 0.06);
}

// Nach jedem Ereignis: Einnahmen und Ausgaben verbuchen
export function financeAfterEvent(c, club, ev, played, ownRank) {
  if (!c.finance) return;
  const own = played.find(g => g.h === 'OWN' || g.a === 'OWN');
  const L = c.leagues.findIndex(l => l.includes('OWN'));
  if (own && own.h === 'OWN') {
    const oppL = c.leagues.findIndex(l => l.includes(own.a));
    const sp = attendance(c, ownRank, ev.kind, oppL);
    own.spectators = sp;
    book(c, 'tickets', ticketIncome(c, sp), `Zuschauer (${sp.toLocaleString('de-CH')})`);
  }
  if (ev.kind === 'league') {
    const spons = c.finance.sponsors.reduce((a, s) => a + s.amount / 14, 0);
    if (spons) book(c, 'sponsors', spons, 'Sponsoren');
    if (own) {
      const won = (own.h === 'OWN' ? own.gh > own.ga : own.ga > own.gh);
      const bonus = won ? c.finance.sponsors.reduce((a, s) => a + s.winBonus, 0) : 0;
      if (bonus) book(c, 'sponsors', bonus, 'Siegprämie Sponsoren');
    }
    book(c, 'wages', -wageBill(club), 'Löhne');
    const up = Object.entries(c.finance.facilities).reduce((a, [k, l]) => a + l * UPKEEP[k], 0);
    if (up) book(c, 'upkeep', -up, 'Unterhalt Halle und Staff');
    c.finance.marketAge++;
    if (c.finance.marketAge >= 2) refreshMarket(c, club, Math.random, false);
  }
  if (ev.kind === 'cup' && own) {
    const won = (own.h === 'OWN' ? own.gh > own.ga : own.ga > own.gh);
    if (won) book(c, 'premiums', [1500, 2000, 3000, 4500, 7000, 11000, 22000][ev.round] * LEAGUE_FACTOR[L] / 2, `Cupprämie ${ev.round === 6 ? 'Cupsieg' : 'Runde ' + (ev.round + 1)}`);
  }
  // Playoff-/Barrage-Prämien bei Serienende
  if ((ev.kind === 'playoff' || ev.kind === 'barrage') && own && own.f && own.f.series && own.f.series.winner) {
    const s = own.f.series;
    if (ev.kind === 'playoff') {
      if (ev.stage === 'sf') book(c, 'premiums', (s.winner === 'OWN' ? 6000 : 3000) * LEAGUE_FACTOR[L], s.winner === 'OWN' ? 'Prämie Playoff-Final erreicht' : 'Prämie Playoff-Halbfinal');
      else if (s.winner === 'OWN') book(c, 'premiums', 15000 * LEAGUE_FACTOR[L], 'Meisterprämie');
    }
  }
}

// Saisonende: Aufstieg und Saisonziel
export function financeSeasonEnd(c, summary) {
  if (!c.finance) return;
  const L = summary.ownLeague;
  if (summary.ownMove && summary.ownMove.to < L) book(c, 'premiums', 12000 * LEAGUE_FACTOR[L - 1], 'Aufstiegsprämie');
  if (summary.goal.met) book(c, 'premiums', 5000 * LEAGUE_FACTOR[L], 'Bonus Vorstand: Saisonziel erreicht');
}

// ------------------------------------------------------------ Sponsoren

// Vertrag für 1, 2 oder 3 Saisons abschliessen
export function signSponsor(c, id, years) {
  const f = c.finance;
  years = SPONSOR_YEARS[years] ? +years : 1;
  if (f.sponsors.some(s => s.id === id)) return { ok: false, msg: 'Schon unter Vertrag' };
  if (f.sponsors.length >= sponsorSlots(c)) return { ok: false, msg: `Nur ${sponsorSlots(c)} Sponsorenplätze (mehr mit besserer Anzeigetafel)` };
  const o = f.offers.find(s => s.id === id);
  if (!o) return { ok: false, msg: 'Angebot nicht mehr da' };
  f.sponsors.push({ ...o, base: o.amount, amount: contractAmount(o, years), years, signed: c.season, until: c.season + years - 1 });
  return { ok: true };
}

// Kündigen geht nur in der Saison, in der unterschrieben wurde
export function dropSponsor(c, id) {
  const f = c.finance;
  const s = f.sponsors.find(x => x.id === id);
  if (!s) return { ok: true };
  if ((s.signed ?? c.season) !== c.season) return { ok: false, msg: 'Laufende Verträge aus früheren Saisons lassen sich nicht kündigen' };
  f.sponsors = f.sponsors.filter(x => x !== s);
  return { ok: true };
}

// ------------------------------------------------------------ Transfermarkt

export function refreshMarket(c, club, rand = Math.random, full = false) {
  const f = c.finance;
  f.marketAge = 0;
  const L = c.leagues.findIndex(l => l.includes('OWN'));
  const keep = full ? [] : f.market.filter(() => rand() < 0.5);
  const want = 18 - keep.length;
  const out = [...keep];
  const taken = new Set(out.map(m => m.pid));
  let guard = 0;
  while (out.length < 18 && guard++ < 400) {
    const dl = Math.floor(rand() * 3) - 1;                     // eigene Liga ±1
    const tl = Math.max(0, Math.min(4, L + dl + (rand() < 0.15 ? -1 : 0)));
    const ids = c.leagues[tl].filter(id => id !== 'OWN');
    const t = c.teams[ids[Math.floor(rand() * ids.length)]];
    const p = t.players[Math.floor(rand() * t.players.length)];
    if (taken.has(p.id) || (p.pos === 'G' && rand() < 0.6)) continue;
    taken.add(p.id);
    out.push({ pid: p.id, team: t.id, price: Math.round(valueOf(p) * (1.1 + rand() * 0.3) / 500) * 500 });
  }
  void want;
  f.market = out;
}

export function marketEntries(c) {
  return c.finance.market.map(m => {
    const t = c.teams[m.team];
    const p = t && t.players.find(x => x.id === m.pid);
    return p ? { ...m, p, t } : null;
  }).filter(Boolean);
}

export function buyPlayer(c, club, pid, newId, rand = Math.random) {
  const f = c.finance;
  const m = f.market.find(x => x.pid === pid);
  if (!m) return { ok: false, msg: 'Nicht mehr verfügbar' };
  if (club.players.length >= MAX_ROSTER) return { ok: false, msg: `Kader voll (höchstens ${MAX_ROSTER} Spieler)` };
  if (f.balance < m.price) return { ok: false, msg: `Zu wenig Geld (${chf(m.price)} nötig)` };
  const t = c.teams[m.team];
  const p = t.players.find(x => x.id === pid);
  // Abgebendes Team füllt mit einem Junior auf
  const young = makePlayer(rand, p.pos, Math.max(30, overall(p) - 12), p.number, p.stick);
  young.id = newId();
  young.age = 18 + Math.floor(rand() * 3);
  replacePlayer(t, p, young);
  if (club.players.some(x => x.number === p.number)) p.number = freeNumber(club);
  club.players.push(p);
  club.reserve.push(p.id);
  book(c, 'buys', -m.price, `Transfer: ${p.firstName} ${p.lastName} von ${t.name}`);
  f.market = f.market.filter(x => x !== m);
  return { ok: true, p };
}

function freeNumber(club) {
  for (let n = 2; n < 100; n++) if (!club.players.some(p => p.number === n)) return n;
  return 99;
}

// Wo steht der Spieler? 'L0.C', 'G1', 'S2', 'R3' oder null
export function slotOf(club, pid) {
  for (let l = 0; l < club.lines.length; l++) for (const r in club.lines[l]) if (club.lines[l][r] === pid) return `L${l}.${r}`;
  let i = club.goalies.indexOf(pid); if (i >= 0) return `G${i}`;
  i = club.subs.indexOf(pid); if (i >= 0) return `S${i}`;
  i = (club.reserve || []).indexOf(pid); if (i >= 0) return `R${i}`;
  return null;
}

export function sellPlayer(c, club, pid, rand = Math.random) {
  const p = club.players.find(x => x.id === pid);
  if (!p) return { ok: false, msg: 'Spieler nicht gefunden' };
  if (club.players.length <= MIN_ROSTER) return { ok: false, msg: `Mindestens ${MIN_ROSTER} Spieler nötig – zuerst kaufen oder einen Junior hochziehen` };
  const slot = slotOf(club, pid);
  if (slot && slot[0] !== 'R') {
    // Ersatz aus der Reserve (gleicher Typ) übernimmt den Platz
    const isG = p.pos === 'G';
    const cand = club.reserve.map(id => club.players.find(x => x.id === id)).filter(x => x && (x.pos === 'G') === isG)
      .sort((a, b) => overall(b) - overall(a))[0];
    if (!cand) return { ok: false, msg: isG ? 'Kein Goalie in der Reserve als Ersatz' : 'Kein Feldspieler in der Reserve als Ersatz' };
    club.reserve = club.reserve.filter(id => id !== cand.id);
    setSlot(club, slot, cand.id);
  } else club.reserve = club.reserve.filter(id => id !== pid);
  club.players = club.players.filter(x => x !== p);
  if (club.favorite === pid) club.favorite = null;
  const price = Math.round(valueOf(p) * 0.85 / 500) * 500;
  // Käufer: zufälliges KI-Team, ersetzt dort den schwächsten Spieler gleicher Art
  const L = Math.max(0, c.leagues.findIndex(l => l.includes('OWN')) - (overall(p) > 65 ? 1 : 0));
  const ids = c.leagues[L].filter(id => id !== 'OWN');
  const t = c.teams[ids[Math.floor(rand() * ids.length)]];
  const weakest = t.players.filter(x => (x.pos === 'G') === (p.pos === 'G')).sort((a, b) => overall(a) - overall(b))[0];
  p.injury = null;
  replacePlayer(t, weakest, p);
  book(c, 'sales', price, `Verkauf: ${p.firstName} ${p.lastName} an ${t.name}`);
  return { ok: true, price, team: t };
}

export function setSlot(club, key, id) {
  if (key[0] === 'L') { const [l, r] = key.slice(1).split('.'); club.lines[+l][r] = id; }
  else if (key[0] === 'G') club.goalies[+key.slice(1)] = id;
  else if (key[0] === 'S') club.subs[+key.slice(1)] = id;
  else club.reserve[+key.slice(1)] = id;
}

// ------------------------------------------------------------ Nachwuchs

function makeJuniors(c, rand) {
  const f = c.finance;
  const lvl = f.facilities.youth;
  const pos = ['C', 'F', 'F', 'D', 'D', 'G'];
  f.juniors = [];
  for (let i = 0; i < 2 + lvl; i++) {
    const p = makePlayer(rand, pos[Math.floor(rand() * pos.length)], 40 + lvl * 6 + Math.round((rand() - 0.5) * 8), 0, { shaft: '#ffffff', blade: '#1f8f4e' });
    p.id = c.nextId++;
    p.age = 16 + Math.floor(rand() * 2);
    p.number = 0;
    f.juniors.push(p);
  }
}

export function promoteJunior(c, club, pid) {
  const f = c.finance;
  const p = f.juniors.find(x => x.id === pid);
  if (!p) return { ok: false, msg: 'Nicht gefunden' };
  if (club.players.length >= MAX_ROSTER) return { ok: false, msg: `Kader voll (höchstens ${MAX_ROSTER} Spieler)` };
  p.number = freeNumber(club);
  p.stick = { ...club.players[0].stick };
  club.players.push(p);
  club.reserve.push(p.id);
  f.juniors = f.juniors.filter(x => x !== p);
  return { ok: true, p };
}
