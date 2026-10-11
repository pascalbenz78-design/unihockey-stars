// Der eigene Verein: Name, Kürzel, Trikots, Logo, Kader, Linien, Training.

import { makeTeam } from './roster.js';
import { runTraining } from './training.js';

const ID_BASE = 100000; // eigene Spieler-IDs, damit sie sich nie mit Gegnern überschneiden

export function createDefaultClub() {
  const kits = {
    home: { shirt: '#1f8f4e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#1f8f4e', number: '#ffffff', goalie: '#2c2c34' },
    away: { shirt: '#ffffff', shirt2: '#1f8f4e', shorts: '#1f8f4e', socks: '#ffffff', number: '#1f8f4e', goalie: '#3a3a8a' },
  };
  const t = makeTeam({
    name: 'UHC Mein Verein', short: 'UHC', kits, seed: 1000 + Math.floor(Math.random() * 90000), level: 60,
    stick: { shaft: '#ffffff', blade: '#1f8f4e' },
  });
  const map = new Map(t.players.map((p, i) => [p.id, ID_BASE + i + 1]));
  for (const p of t.players) p.id = map.get(p.id);
  return {
    version: 1,
    name: t.name,
    short: t.short,
    kits,
    logo: { shape: 'shield', bg: '#1f8f4e', border: '#ffffff', symbol: 'star', symbolColor: '#ffd400', initials: 'UHC', textColor: '#ffffff' },
    players: t.players,
    lines: t.lines.map(l => Object.fromEntries(Object.entries(l).map(([k, id]) => [k, map.get(id)]))),
    goalies: t.goalies.map(id => map.get(id)),
    subs: t.subs.map(id => map.get(id)),
    favorite: null,
    goldStick: true,
    training: { focus: 'ausgeglichen', intensity: 'normal' },
    record: { played: 0, won: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
    lastReport: null,
  };
}

// Teamdaten für ein Match (gleiches Format wie die anderen Teams)
export function clubTeamData(club) {
  return {
    name: club.name, short: club.short, colors: club.kits.home, kits: club.kits, logo: club.logo,
    players: club.players, lines: club.lines, goalies: club.goalies, subs: club.subs, reserve: club.reserve || [],
    favorite: club.favorite, goldStick: club.goldStick, own: true,
  };
}

function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function colorDistance(a, b) {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, (g1 - g2) * 1.2, b1 - b2);
}

// Gast zieht das Auswärtstrikot an, wenn die Heimtrikots zu ähnlich sind
export function chooseKits(home, away) {
  const a = { ...home, colors: home.kits ? home.kits.home : home.colors };
  let awayColors = away.kits ? away.kits.home : away.colors;
  if (away.kits && colorDistance(a.colors.shirt, awayColors.shirt) < 140) awayColors = away.kits.away;
  return [a, { ...away, colors: awayColors }];
}

// Nach einem eigenen Spiel: Verletzungen, Bilanz, Training.
// heal = false in der Karriere (dort heilen Verletzungen pro Spieltag).
export function clubAfterMatch(club, match, ownIndex, heal = true) {
  const own = match.teams[ownIndex], opp = match.other(own);
  return clubAfterGame(club, {
    gf: own.score, ga: opp.score, injuries: match.rules.injuries.filter(i => i.team.own),
  }, heal);
}

export function clubAfterGame(club, { gf, ga, injuries = [] }, heal = true, physio = 0) {
  const short = g => Math.max(1, Math.round(g * (1 - 0.15 * physio)));   // Physiotherapie verkürzt Ausfälle
  const fresh = new Set(injuries.map(i => i.player.id));
  const healed = [];
  if (heal) {
    for (const p of club.players) {
      if (p.injury && p.injury.games > 0 && !fresh.has(p.id)) {
        p.injury.games -= 1;
        if (p.injury.games <= 0) { p.injury = null; healed.push(p); }
      }
    }
  }
  for (const i of injuries) {
    const p = club.players.find(x => x.id === i.player.id);
    if (p) p.injury = { level: i.level, games: short(i.games) };
  }
  club.record.played++;
  if (gf > ga) club.record.won++; else club.record.lost++;
  club.record.goalsFor += gf; club.record.goalsAgainst += ga;
  const training = runTraining(club);
  for (const x of training.injured) { x.games = short(x.games); x.player.injury.games = x.games; }
  club.lastReport = {
    improved: training.improved.map(x => ({ id: x.player.id, stat: x.stat, value: x.value })),
    injured: training.injured.map(x => ({ id: x.player.id, level: x.level, games: x.games })),
  };
  return { healed, training };
}

export const playerById = (club, id) => club.players.find(p => p.id === id);
