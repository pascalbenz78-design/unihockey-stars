// Die erfundenen Gegner der Ligawelt (keine echten Vereine).

import { makeTeam, rng } from '../club/roster.js';
import { randomLogo } from '../club/logo.js';

export const TEAM_NAMES = [
  ['Floorball Gletscherfüchse', 'GLF'], ['UHC Sturmvögel', 'STV'], ['Unihockey Bergdohlen', 'BDO'], ['UH Wildbach Tigers', 'WBT'],
  ['Team Feuersalamander', 'FSA'], ['UHC Nebelkrähen', 'NEB'], ['Floorball Murmeltiere', 'MUR'], ['UHC Lawinen', 'LAW'],
  ['Unihockey Steinadler', 'STA'], ['UH Blitzhasen', 'BLH'], ['Floorball Eisbären', 'EIS'], ['UHC Talwind', 'TWI'],
  ['Team Hochmoor', 'HOM'], ['UHC Föhnsturm', 'FON'], ['Floorball Bergkristall', 'BKR'], ['UH Rotkehlchen', 'RKE'],
  ['Unihockey Waldgeister', 'WGE'], ['UHC Kometen', 'KOM'], ['Floorball Polarlichter', 'POL'], ['UH Gämsen', 'GAE'],
  ['UHC Sonnenberg Stars', 'SBS'], ['Team Donnerkeil', 'DON'], ['Floorball Biberburg', 'BIB'], ['UHC Wirbelwind', 'WIR'],
  ['Unihockey Silberpfeile', 'SIL'], ['UH Grizzlys', 'GRI'], ['UHC Feuerfalken', 'FFA'], ['Floorball Flusskrebse', 'FLK'],
  ['Team Gipfelstürmer', 'GIP'], ['UHC Schneeeulen', 'SEU'], ['Unihockey Luchse', 'LUC'], ['UH Drachenflieger', 'DRA'],
  ['Floorball Vulkane', 'VUL'], ['UHC Morgenrot', 'MOR'], ['Team Seeadler', 'SAD'], ['UH Hornissen', 'HOR'], ['Floorball Igel', 'IGE'],
];

const PALETTE = ['#d42a2a', '#1f5fbf', '#1f8f4e', '#ffd400', '#ff7f27', '#7d3cff', '#111111', '#ffffff',
  '#00a3b4', '#8b1e3f', '#2c3e8c', '#ff4fa3', '#6b8e23', '#9aa3ad', '#5a3a1a'];
const LIGHT = new Set(['#ffd400', '#ffffff', '#9aa3ad', '#ff7f27']);

export function randomKits(rand) {
  const a = PALETTE[Math.floor(rand() * PALETTE.length)];
  let b = a;
  while (b === a) b = PALETTE[Math.floor(rand() * PALETTE.length)];
  const num = LIGHT.has(a) ? '#111111' : '#ffffff';
  const home = { shirt: a, shirt2: b, shorts: rand() < 0.5 ? b : '#1b1b1f', socks: a, number: num, goalie: '#2c2c34' };
  const away = { shirt: b, shirt2: a, shorts: a, socks: b, number: LIGHT.has(b) ? '#111111' : '#ffffff', goalie: '#3a3a8a' };
  return { home, away };
}

// Ein KI-Team mit eindeutigen Spieler-IDs (ab startId)
export function createAITeam(id, name, short, level, seed, startId) {
  const rand = rng(seed);
  const kits = randomKits(rand);
  const logo = randomLogo(rand, kits.home, short);
  const t = makeTeam({ name, short, kits, logo, level, seed, stick: { shaft: '#ffffff', blade: kits.home.shirt } });
  return renumber({ ...t, id }, startId);
}

// IDs eines Teams neu vergeben (Linien/Goalies/Ersatz mitziehen)
export function renumber(t, startId) {
  const map = new Map(t.players.map((p, i) => [p.id, startId + i]));
  for (const p of t.players) p.id = map.get(p.id);
  t.lines = t.lines.map(l => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, map.get(v)])));
  t.goalies = t.goalies.map(v => map.get(v));
  t.subs = t.subs.map(v => map.get(v));
  return t;
}
