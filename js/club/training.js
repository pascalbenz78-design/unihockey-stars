// Training zwischen den Spielen: Schwerpunkt und Intensität wählen, die
// Spieler verbessern sich langsam. Hartes Training erhöht das
// Verletzungsrisiko.

import { CONFIG } from '../config.js';

export const SKATER_STATS = ['tempo', 'schuss', 'pass', 'ausdauer', 'zweikampf', 'technik'];
export const GOALIE_STATS = ['reflexe', 'stellung'];
export const STAT_NAMES = {
  tempo: 'Tempo', schuss: 'Schuss', pass: 'Pass', ausdauer: 'Ausdauer', zweikampf: 'Zweikampf', technik: 'Technik',
  reflexe: 'Reflexe', stellung: 'Stellungsspiel',
};

export const FOCI = {
  ausgeglichen: { label: 'Ausgeglichen', stats: SKATER_STATS },
  tempo: { label: 'Tempo', stats: ['tempo'] },
  schuss: { label: 'Schuss', stats: ['schuss'] },
  pass: { label: 'Pass', stats: ['pass'] },
  ausdauer: { label: 'Ausdauer', stats: ['ausdauer'] },
  zweikampf: { label: 'Zweikampf', stats: ['zweikampf'] },
  technik: { label: 'Technik', stats: ['technik'] },
  goalie: { label: 'Goalies', stats: GOALIE_STATS },
};

export const INTENSITY = {
  leicht: { label: 'Locker', gain: 0.55, injury: 0 },
  normal: { label: 'Normal', gain: 1, injury: 0.006 },
  hart: { label: 'Hart', gain: 1.6, injury: 0.03 },
};

const BASE_GAIN = 0.5;

function ageFactor(age) {
  return age < 21 ? 1.4 : age < 25 ? 1.15 : age < 29 ? 0.85 : age < 32 ? 0.55 : 0.3;
}

// Eine Trainingseinheit für alle gesunden Spieler. Gibt einen Bericht zurück.
export function runTraining(club, rand = Math.random) {
  const focus = FOCI[club.training.focus] || FOCI.ausgeglichen;
  const inten = INTENSITY[club.training.intensity] || INTENSITY.normal;
  const report = { improved: [], injured: [] };
  for (const p of club.players) {
    if (p.injury && p.injury.games > 0) continue;
    p.progress = p.progress || {};
    const isG = p.pos === 'G';
    const own = isG ? GOALIE_STATS : SKATER_STATS;
    for (const st of own) {
      let w;
      if (isG) w = club.training.focus === 'goalie' ? 1 : 0.35;
      else if (club.training.focus === 'goalie') w = 0.1;
      else if (focus === FOCI.ausgeglichen) w = 0.35;
      else w = focus.stats.includes(st) ? 1 : 0.1;
      const v = p.stats[st];
      const gain = BASE_GAIN * w * inten.gain * ageFactor(p.age) * Math.max(0.05, 1 - v / 110) * (0.6 + rand() * 0.8);
      p.progress[st] = (p.progress[st] || 0) + gain;
      while (p.progress[st] >= 1 && p.stats[st] < 99) {
        p.progress[st] -= 1;
        p.stats[st] += 1;
        report.improved.push({ player: p, stat: st, value: p.stats[st] });
      }
    }
    if (rand() < inten.injury) {
      const r = rand();
      const level = r < 0.7 ? 'leicht' : r < 0.95 ? 'mittel' : 'schwer';
      const [a, b] = CONFIG.rules.injuryGames[level];
      const games = a + Math.floor(rand() * (b - a + 1));
      p.injury = { level, games };
      report.injured.push({ player: p, level, games });
    }
  }
  return report;
}

export function overall(p) {
  const st = p.pos === 'G' ? GOALIE_STATS : SKATER_STATS;
  return Math.round(st.reduce((a, k) => a + p.stats[k], 0) / st.length);
}
