// Karriere: 5 Ligen à 8 Teams, Qualifikation (Hin- und Rückrunde), Cup,
// Playoffs, Barrage, Auf-/Abstieg, Saisonziel, Saisonwechsel.
// Reine Logik ohne DOM – in Node testbar (tools/careertest.mjs).

import { CONFIG } from '../config.js';
import { defaultTeams } from '../club/roster.js';
import { clubTeamData } from '../club/club.js';
import { overall } from '../club/training.js';
import { TEAM_NAMES, createAITeam, renumber } from './teams.js';
import { simulateGame, teamStrength } from './sim.js';
import { ageTeam, adjustToLevel } from './aging.js';
import { initFinance, newSeasonFinance, financeAfterEvent, financeSeasonEnd } from './finance.js';

export const OWN = 'OWN';
export const LEAGUE_LEVELS = [74, 68, 62, 56, 51];
export const LEAGUES = 5;
export const ROUNDS = 14;
export const CUP_ROUNDS = ['1. Runde', '2. Runde', '3. Runde', 'Achtelfinal', 'Viertelfinal', 'Halbfinal', 'Final'];
const CUP_AFTER = [0, 2, 4, 6, 8, 10, 12];     // Cuprunde nach dieser Ligarunde
const CUP_ENTRY = [[3, 4], [2], [1], [0], [], [], []];
const P = CONFIG.points;

export const leagueName = L => `Liga ${L + 1}`;

function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ------------------------------------------------------------ Aufbau

export function createCareer(club, rand = Math.random) {
  const c = { version: 1, season: 1, year: 2026, nextId: 200000, teams: {}, leagues: [[], [], [], [], []], history: [] };
  const block = () => { const s = c.nextId; c.nextId += 100; return s; };
  // die bekannten Freundschaftsgegner spielen in Liga 3
  for (const t of defaultTeams()) {
    t.id = t.short;
    renumber(t, block());
    c.teams[t.id] = t;
    c.leagues[2].push(t.id);
  }
  c.leagues[4].push(OWN);
  const names = shuffle([...TEAM_NAMES], rand);
  let n = 0;
  for (let L = 0; L < LEAGUES; L++) {
    while (c.leagues[L].length < 8) {
      const [name, short] = names[n++];
      const id = 'T' + n;
      const lvl = LEAGUE_LEVELS[L] + Math.round((rand() - 0.5) * 8);
      c.teams[id] = createAITeam(id, name, short, lvl, 5000 + n * 37 + Math.floor(rand() * 1000), block());
      c.leagues[L].push(id);
    }
  }
  initFinance(c, club, rand);
  startSeason(c, club, rand);
  return c;
}

export function getTeam(c, club, id) {
  return id === OWN ? { ...clubTeamData(club), id: OWN } : c.teams[id];
}

export const ownLeague = c => c.leagues.findIndex(l => l.includes(OWN));

// Doppelrunde nach dem Kreisverfahren
function roundRobin(ids, rand) {
  const a = shuffle([...ids], rand);
  const n = a.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const x = a[i], y = a[n - 1 - i];
      pairs.push((r + i) % 2 ? [x, y] : [y, x]);
    }
    rounds.push(pairs);
    a.splice(1, 0, a.pop());
  }
  return [...rounds, ...rounds.map(rd => rd.map(([h, aw]) => [aw, h]))];
}

function startSeason(c, club, rand) {
  c.schedule = c.leagues.map(ids => roundRobin(ids, rand));
  c.results = c.leagues.map(() => []);
  c.calendar = [];
  for (let r = 0; r < ROUNDS; r++) {
    c.calendar.push({ kind: 'league', round: r });
    const cr = CUP_AFTER.indexOf(r);
    if (cr >= 0) c.calendar.push({ kind: 'cup', round: cr });
  }
  c.eventIdx = 0;
  c.phase = 'regular';
  c.playoffs = null;
  c.barrages = null;
  c.cup = { alive: [], rounds: [], winner: null, runnerUp: null };
  c.stats = {};
  c.summary = null;
  c.lastEvent = null;
  c.goal = boardGoal(c, club);
  prepareEvent(c, rand);
}

// ------------------------------------------------------------ Tabelle

export function standings(c, L) {
  const rows = new Map(c.leagues[L].map(id => [id, { id, gp: 0, w: 0, otw: 0, otl: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  for (const round of c.results[L]) {
    for (const g of round) {
      const h = rows.get(g.h), a = rows.get(g.a);
      if (!h || !a) continue;
      h.gp++; a.gp++;
      h.gf += g.gh; h.ga += g.ga; a.gf += g.ga; a.ga += g.gh;
      const hw = g.gh > g.ga;
      const [win, loss] = hw ? [h, a] : [a, h];
      if (g.type === 'regular') { win.w++; win.pts += P.win; loss.l++; loss.pts += P.loss; }
      else { win.otw++; win.pts += P.winOT; loss.otl++; loss.pts += P.lossOT; }
    }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || (x.id < y.id ? -1 : 1));
}

// ------------------------------------------------------------ Ereignisse

export function currentEvent(c) {
  if (c.phase === 'regular') return c.calendar[c.eventIdx];
  if (c.phase === 'playoffs') return { kind: 'playoff', stage: c.playoffs.stage, game: c.playoffs.game };
  if (c.phase === 'barrage') return { kind: 'barrage', game: c.barrages.game };
  return { kind: 'end' };
}

export function eventLabel(c, ev = currentEvent(c)) {
  switch (ev.kind) {
    case 'league': return `Qualifikation, Runde ${ev.round + 1}/${ROUNDS}`;
    case 'cup': return `Cup, ${CUP_ROUNDS[ev.round]}`;
    case 'playoff': return `Playoff-${ev.stage === 'sf' ? 'Halbfinal' : 'Final'}, Spiel ${ev.game}`;
    case 'barrage': return `Barrage, Spiel ${ev.game}`;
    default: return 'Saisonende';
  }
}

function newSeries(a, b, meta = {}) { return { a, b, wins: [0, 0], games: [], winner: null, loser: null, ...meta }; }

// Alle Begegnungen eines Ereignisses: [{ h, a, ref }]
export function fixtures(c, ev = currentEvent(c)) {
  const out = [];
  if (ev.kind === 'league') {
    c.schedule.forEach((rounds, L) => rounds[ev.round].forEach(([h, a]) => out.push({ h, a, L })));
  } else if (ev.kind === 'cup') {
    const rd = c.cup.rounds[ev.round];
    if (rd) rd.pairs.forEach((p, i) => out.push({ h: p.h, a: p.a, cup: i }));
  } else if (ev.kind === 'playoff') {
    c.playoffs.leagues.forEach((pl, L) => {
      const list = ev.stage === 'sf' ? pl.sf : pl.final ? [pl.final] : [];
      list.forEach(s => { if (!s.winner) out.push(seriesFixture(s, ev.game, { L })); });
    });
  } else if (ev.kind === 'barrage') {
    c.barrages.series.forEach((s, k) => { if (!s.winner) out.push(seriesFixture(s, ev.game, { k })); });
  }
  return out;
}

function seriesFixture(s, game, meta) {
  const home = game % 2 === 1 ? s.a : s.b;       // Spiel 1 und 3 beim Besserklassierten
  return { h: home, a: home === s.a ? s.b : s.a, series: s, ...meta };
}

export function ownFixture(c, ev = currentEvent(c)) {
  return fixtures(c, ev).find(f => f.h === OWN || f.a === OWN) || null;
}

// Ereignis abschliessen: eigenes Resultat (falls vorhanden) eintragen, Rest simulieren
export function playEvent(c, club, ownResult = null, rand = Math.random) {
  const ev = currentEvent(c);
  const list = fixtures(c, ev);
  const played = [];
  for (const f of list) {
    let r;
    if ((f.h === OWN || f.a === OWN) && ownResult) r = ownResult;
    else r = simulateGame(getTeam(c, club, f.h), getTeam(c, club, f.a), rand);
    const g = { h: f.h, a: f.a, gh: r.gh, ga: r.ga, type: r.type };
    played.push({ ...g, f });
    if (ev.kind !== 'cup') recordStats(c, r.goals || []);
    if (f.series) {
      f.series.games.push(g);
      const hi = f.h === f.series.a ? 0 : 1;
      const win = g.gh > g.ga ? hi : 1 - hi;
      f.series.wins[win]++;
      if (f.series.wins[win] >= 2) {
        f.series.winner = win === 0 ? f.series.a : f.series.b;
        f.series.loser = win === 0 ? f.series.b : f.series.a;
      }
    }
    if (f.cup != null) {
      const pair = c.cup.rounds[ev.round].pairs[f.cup];
      Object.assign(pair, { gh: g.gh, ga: g.ga, type: g.type, winner: g.gh > g.ga ? g.h : g.a });
    }
  }
  if (ev.kind === 'league') {
    c.schedule.forEach((rounds, L) => { c.results[L][ev.round] = played.filter(p => p.f.L === L).map(({ f, ...g }) => g); });
  }
  healTick(c, club);
  const ownRank = standings(c, ownLeague(c)).findIndex(r => r.id === OWN) + 1;
  financeAfterEvent(c, club, ev, played, ownRank);
  c.lastEvent = { label: eventLabel(c, ev), kind: ev.kind, games: played.map(({ f, ...g }) => g) };
  advance(c, club, ev, rand);
  return c.lastEvent;
}

function recordStats(c, goals) {
  for (const g of goals) {
    if (g.scorer) { const s = c.stats[g.scorer] = c.stats[g.scorer] || { g: 0, a: 0, team: g.team }; s.g++; s.team = g.team; }
    if (g.assist) { const s = c.stats[g.assist] = c.stats[g.assist] || { g: 0, a: 0, team: g.team }; s.a++; s.team = g.team; }
  }
}

// Verletzungen heilen mit der Zeit (pro Ereignis ein Spiel)
function healTick(c, club) {
  const heal = p => { if (p.injury && p.injury.games > 0) { p.injury.games--; if (p.injury.games <= 0) p.injury = null; } };
  for (const t of Object.values(c.teams)) t.players.forEach(heal);
  club.players.forEach(heal);
}

function advance(c, club, ev, rand) {
  if (ev.kind === 'league' || ev.kind === 'cup') {
    if (ev.kind === 'cup') {
      const rd = c.cup.rounds[ev.round];
      c.cup.alive = rd.pairs.map(p => p.winner);
      if (ev.round === CUP_ROUNDS.length - 1) {
        const p = rd.pairs[0];
        c.cup.winner = p.winner; c.cup.runnerUp = p.winner === p.h ? p.a : p.h;
      }
    }
    c.eventIdx++;
    if (c.eventIdx >= c.calendar.length) startPlayoffs(c);
  } else if (ev.kind === 'playoff') {
    const pl = c.playoffs;
    const stageSeries = pl.leagues.flatMap(x => (pl.stage === 'sf' ? x.sf : [x.final]));
    if (stageSeries.every(s => s.winner)) {
      if (pl.stage === 'sf') {
        pl.leagues.forEach(x => { x.final = newSeries(...seed(c, x.L, x.sf[0].winner, x.sf[1].winner)); });
        pl.stage = 'final'; pl.game = 1;
      } else {
        pl.leagues.forEach(x => { x.champion = x.final.winner; x.runnerUp = x.final.loser; });
        startBarrages(c);
      }
    } else pl.game++;
  } else if (ev.kind === 'barrage') {
    if (c.barrages.series.every(s => s.winner)) {
      c.phase = 'end';
      c.summary = seasonSummary(c, club);
      financeSeasonEnd(c, c.summary);
    } else c.barrages.game++;
  }
  prepareEvent(c, rand);
}

// Heimvorteil: besser klassiertes Team zuerst
function seed(c, L, x, y) {
  const tab = standings(c, L).map(r => r.id);
  return tab.indexOf(x) <= tab.indexOf(y) ? [x, y] : [y, x];
}

function startPlayoffs(c) {
  c.phase = 'playoffs';
  c.playoffs = {
    stage: 'sf', game: 1,
    leagues: c.leagues.map((_, L) => {
      const t = standings(c, L).map(r => r.id);
      return { L, top4: t.slice(0, 4), sf: [newSeries(t[0], t[3]), newSeries(t[1], t[2])], final: null, champion: null, runnerUp: null };
    }),
  };
}

function startBarrages(c) {
  c.phase = 'barrage';
  const series = [];
  for (let k = 0; k < LEAGUES - 1; k++) {
    const upper7 = standings(c, k)[6].id;
    const lowerRunner = c.playoffs.leagues[k + 1].runnerUp;
    series.push(newSeries(upper7, lowerRunner, { k }));
  }
  c.barrages = { game: 1, series };
}

// Cup: Auslosung, sobald die Runde dran ist
function prepareEvent(c, rand) {
  const ev = currentEvent(c);
  if (ev.kind !== 'cup' || c.cup.rounds[ev.round]) return;
  const entering = CUP_ENTRY[ev.round].flatMap(L => c.leagues[L]);
  const pool = shuffle([...c.cup.alive, ...entering], rand);
  const lg = id => c.leagues.findIndex(l => l.includes(id));
  const pairs = [];
  for (let i = 0; i + 1 < pool.length; i += 2) {
    let h = pool[i], a = pool[i + 1];
    if (lg(a) > lg(h)) [h, a] = [a, h];          // tieferes Team hat Heimrecht
    pairs.push({ h, a });
  }
  c.cup.rounds[ev.round] = { name: CUP_ROUNDS[ev.round], pairs };
}

// ------------------------------------------------------------ Saisonziel

export const GOAL_TEXT = {
  meister: () => 'Schweizer Meister werden',
  aufstieg: L => `Aufstieg in die ${leagueName(L - 1)}`,
  playoffs: () => 'Playoffs erreichen (Rang 1–4)',
  barrage: L => (L === LEAGUES - 1 ? 'Mindestens Rang 6' : 'Barrage vermeiden (Rang 1–6)'),
  klassenerhalt: () => 'Klassenerhalt (nicht absteigen)',
};

function boardGoal(c, club) {
  const L = ownLeague(c);
  const ranked = c.leagues[L].map(id => ({ id, s: teamStrength(getTeam(c, club, id)).total })).sort((a, b) => b.s - a.s);
  const rank = ranked.findIndex(r => r.id === OWN) + 1;
  let type;
  if (rank <= 2) type = L === 0 ? 'meister' : 'aufstieg';
  else if (rank <= 4) type = 'playoffs';
  else if (rank <= 6 || L === LEAGUES - 1) type = 'barrage';
  else type = 'klassenerhalt';
  return { type, league: L, text: GOAL_TEXT[type](L), expectedRank: rank };
}

// ------------------------------------------------------------ Saisonende

function seasonSummary(c, club) {
  const tables = c.leagues.map((_, L) => standings(c, L));
  const moves = [];
  for (let k = 0; k < LEAGUES - 1; k++) {
    const up = c.playoffs.leagues[k + 1].champion;
    const down = tables[k][7].id;
    moves.push({ id: up, from: k + 1, to: k, why: 'Ligameister' });
    moves.push({ id: down, from: k, to: k + 1, why: 'Letzter' });
    const b = c.barrages.series[k];
    if (b.winner === b.b) {
      moves.push({ id: b.b, from: k + 1, to: k, why: 'Barrage' });
      moves.push({ id: b.a, from: k, to: k + 1, why: 'Barrage' });
    }
  }
  const L = ownLeague(c);
  const ownRank = tables[L].findIndex(r => r.id === OWN) + 1;
  const ownMove = moves.find(m => m.id === OWN);
  const g = c.goal;
  const champion = c.playoffs.leagues[L].champion === OWN;
  let met;
  switch (g.type) {
    case 'meister': met = champion; break;
    case 'aufstieg': met = !!ownMove && ownMove.to < L; break;
    case 'playoffs': met = ownRank <= 4; break;
    case 'barrage': met = ownRank <= 6; break;
    default: met = !(ownMove && ownMove.to > L);
  }
  const exceeded = met && ((g.type !== 'aufstieg' && g.type !== 'meister' && ownMove && ownMove.to < L) || (g.type === 'playoffs' && champion));
  const verdict = exceeded ? 'Der Vorstand ist begeistert – mehr erreicht als erwartet!'
    : met ? 'Saisonziel erreicht. Der Vorstand ist zufrieden.'
      : 'Saisonziel verpasst. Der Vorstand ist enttäuscht und erwartet eine Steigerung.';
  return {
    season: c.season, year: c.year,
    champions: c.playoffs.leagues.map(x => x.champion),
    runnersUp: c.playoffs.leagues.map(x => x.runnerUp),
    cup: { winner: c.cup.winner, runnerUp: c.cup.runnerUp },
    moves, ownLeague: L, ownRank, ownMove: ownMove || null, champion,
    goal: { ...g, met, exceeded, verdict },
    scorers: topScorers(c, club, 15),
    best: topScorers(c, club, 1)[0] || null,
  };
}

export function findPlayer(c, club, pid) {
  const cp = club.players.find(p => p.id === pid);
  if (cp) return { p: cp, team: OWN };
  for (const t of Object.values(c.teams)) {
    const p = t.players.find(x => x.id === pid);
    if (p) return { p, team: t.id };
  }
  return null;
}

export function topScorers(c, club, n = 15, L = null) {
  const out = [];
  for (const [pid, s] of Object.entries(c.stats)) {
    if (L != null && !c.leagues[L].includes(s.team)) continue;
    const f = findPlayer(c, club, +pid);
    if (!f) continue;
    out.push({ pid: +pid, p: f.p, team: s.team, g: s.g, a: s.a, pts: s.g + s.a });
  }
  return out.sort((x, y) => y.pts - x.pts || y.g - x.g).slice(0, n);
}

// Neue Saison: Auf-/Abstieg anwenden, Spieler altern, neuer Spielplan
export function startNextSeason(c, club, rand = Math.random) {
  const s = c.summary;
  for (const m of s.moves) {
    c.leagues[m.from] = c.leagues[m.from].filter(id => id !== m.id);
    c.leagues[m.to].push(m.id);
  }
  c.history.push({
    season: c.season, year: c.year, ownLeague: s.ownLeague, ownRank: s.ownRank, champion: s.champion,
    swissChampion: s.champions[0], cupWinner: s.cup.winner, goalMet: s.goal.met,
    ownMove: s.ownMove ? (s.ownMove.to < s.ownMove.from ? 'up' : 'down') : null,
  });
  const newId = () => c.nextId++;
  const ownData = { ...clubTeamData(club), reserve: club.reserve || [] };
  const aging = { own: ageTeam(ownData, rand, newId), ai: 0 };
  // Rücktritte im eigenen Verein: Goalie- und Ersatzlisten zurückschreiben
  club.goalies = ownData.goalies;
  club.subs = ownData.subs;
  club.reserve = ownData.reserve;
  syncClub(club, aging.own);
  c.leagues.forEach((ids, L) => ids.forEach(id => {
    if (id === OWN) return;
    const t = c.teams[id];
    aging.ai += ageTeam(t, rand, newId).retired.length;
    adjustToLevel(t, LEAGUE_LEVELS[L] - 4, rand);
  }));
  // Sommerpause: alle wieder gesund
  for (const t of Object.values(c.teams)) t.players.forEach(p => { p.injury = null; });
  club.players.forEach(p => { p.injury = null; });
  const gone = new Set(aging.own.retired.map(r => r.old));
  aging.own.changes = aging.own.changes.filter(x => !gone.has(x.p));
  c.lastAging = {
    retired: aging.own.retired.map(r => ({ old: `${r.old.firstName} ${r.old.lastName}`, age: r.old.age, young: `${r.young.firstName} ${r.young.lastName}`, pos: r.young.pos })),
    better: aging.own.changes.filter(x => x.delta > 0).map(x => ({ name: `${x.p.firstName} ${x.p.lastName}`, delta: x.delta })),
    worse: aging.own.changes.filter(x => x.delta < 0).map(x => ({ name: `${x.p.firstName} ${x.p.lastName}`, delta: x.delta })),
  };
  c.season++;
  c.year++;
  if (c.finance) newSeasonFinance(c, club, rand);
  startSeason(c, club, rand);
}

function syncClub(club, report) {
  if (!report.retired.length) return;
  if (club.favorite && report.retired.some(r => r.old.id === club.favorite)) club.favorite = null;
}

export const seasonLabel = c => `${c.year}/${String((c.year + 1) % 100).padStart(2, '0')}`;
export { overall };
