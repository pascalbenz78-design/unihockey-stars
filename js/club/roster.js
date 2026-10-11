// Spieler und Kader erzeugen. Alle Namen sind erfunden.

const FIRST = ['Luca', 'Noah', 'Jan', 'Nico', 'Lars', 'Timo', 'Simon', 'Fabian', 'Levin', 'Robin',
  'Elias', 'Joel', 'Silvan', 'Dario', 'Reto', 'Marco', 'Andrin', 'Gian', 'Nils', 'Cyrill',
  'Yannick', 'Matteo', 'Livio', 'Florian', 'Sandro', 'Pascal', 'Remo', 'Jonas', 'Mika', 'Lenny',
  'Kevin', 'Severin', 'Ramon', 'Dominik', 'Patrick', 'Lukas', 'Mauro', 'Janis', 'Tobias', 'Corsin'];
const LAST = ['Meier', 'Gerber', 'Brunner', 'Keller', 'Frei', 'Huber', 'Steiner', 'Baumann', 'Moser', 'Zbinden',
  'Wyss', 'Graf', 'Hofer', 'Bachmann', 'Roth', 'Kunz', 'Lüthi', 'Suter', 'Widmer', 'Aebi',
  'Schmid', 'Egli', 'Bühler', 'Ammann', 'Rüegg', 'Häfliger', 'Imhof', 'Odermatt', 'Zürcher', 'Fankhauser',
  'Gisler', 'Arnold', 'Kälin', 'Marti', 'Stucki', 'Bieri', 'Tanner', 'Zaugg', 'Wüthrich', 'Caflisch'];

let idCounter = 1;

// Einfacher reproduzierbarer Zufall (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function makePlayer(rand, pos, level, number, stick) {
  const r = (spread = 14) => clamp(Math.round(level + (rand() - 0.5) * 2 * spread), 20, 95);
  const p = {
    id: idCounter++,
    firstName: FIRST[Math.floor(rand() * FIRST.length)],
    lastName: LAST[Math.floor(rand() * LAST.length)],
    number,
    age: 17 + Math.floor(rand() * 17),
    pos,                           // 'C' Center, 'F' Flügel, 'D' Verteidiger, 'G' Goalie
    stickSide: rand() < 0.6 ? 'L' : 'R',
    stick: { ...stick },
    celebration: Math.floor(rand() * 8),
    stats: {
      tempo: r(), schuss: r(), pass: r(), ausdauer: r(), zweikampf: r(), technik: r(),
      reflexe: r(), stellung: r(),
    },
  };
  if (pos === 'C') { p.stats.pass = clamp(p.stats.pass + 6, 20, 95); p.stats.technik = clamp(p.stats.technik + 4, 20, 95); }
  if (pos === 'F') { p.stats.schuss = clamp(p.stats.schuss + 7, 20, 95); p.stats.tempo = clamp(p.stats.tempo + 4, 20, 95); }
  if (pos === 'D') { p.stats.zweikampf = clamp(p.stats.zweikampf + 8, 20, 95); p.stats.schuss = clamp(p.stats.schuss - 4, 20, 95); }
  return p;
}

// Kader: 3 Linien (C, F links, F rechts, D links, D rechts) + 2 Goalies + 3 Ersatz
export function makeTeam({ name, short, colors, stick, level = 60, seed = 1 }) {
  const rand = rng(seed);
  const used = new Set();
  const num = (pref) => {
    let n = pref;
    while (used.has(n) || n < 1) n = 2 + Math.floor(rand() * 97);
    used.add(n);
    return n;
  };
  const players = [];
  const lines = [];
  for (let l = 0; l < 3; l++) {
    const lv = level - l * 4;
    const line = {
      C: makePlayer(rand, 'C', lv, num(10 + l * 10 + 0), stick),
      LW: makePlayer(rand, 'F', lv, num(10 + l * 10 + 1), stick),
      RW: makePlayer(rand, 'F', lv, num(10 + l * 10 + 2), stick),
      LD: makePlayer(rand, 'D', lv, num(10 + l * 10 + 3), stick),
      RD: makePlayer(rand, 'D', lv, num(10 + l * 10 + 4), stick),
    };
    for (const k in line) players.push(line[k]);
    lines.push(Object.fromEntries(Object.entries(line).map(([k, p]) => [k, p.id])));
  }
  const g1 = makePlayer(rand, 'G', level + 2, num(1), stick);
  const g2 = makePlayer(rand, 'G', level - 6, num(30), stick);
  players.push(g1, g2);
  const subs = [makePlayer(rand, 'F', level - 10, num(0), stick), makePlayer(rand, 'D', level - 10, num(0), stick),
    makePlayer(rand, 'C', level - 10, num(0), stick)];
  players.push(...subs);
  return { name, short, colors, players, lines, goalies: [g1.id, g2.id], subs: subs.map(p => p.id) };
}

// Zwei Teams für das Freundschaftsspiel (Etappe 1)
export function defaultTeams() {
  return [
    makeTeam({
      name: 'UHC Alpenblitz', short: 'ALB', seed: 11, level: 62,
      colors: { shirt: '#d42a2a', shirt2: '#ffffff', shorts: '#1b1b1f', socks: '#d42a2a', number: '#ffffff', goalie: '#2c2c34' },
      stick: { shaft: '#f2f2f2', blade: '#d42a2a' },
    }),
    makeTeam({
      name: 'Floorball Seewölfe', short: 'SEE', seed: 27, level: 62,
      colors: { shirt: '#1f5fbf', shirt2: '#ffd400', shorts: '#ffffff', socks: '#1f5fbf', number: '#ffd400', goalie: '#11743a' },
      stick: { shaft: '#111111', blade: '#ffd400' },
    }),
  ];
}
