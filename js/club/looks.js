// Aussehen der Spieler: Haut, Haare, Frisur, Schlägerfarben.

export const SKIN_TONES = ['#ffdbac', '#f1c27d', '#e0ac69', '#d9a066', '#c68642', '#a86b3c', '#8d5524', '#5c3a1e'];
export const HAIR_COLORS = ['#111111', '#2b1b0e', '#5a3a1a', '#8b5a2b', '#b5651d', '#d8b26e', '#f0d78c', '#a9a9a9', '#c0392b', '#2e86de'];
export const HAIR_STYLES = { kurz: 'Kurz', lang: 'Lang', locken: 'Locken', irokese: 'Irokese', glatze: 'Glatze' };
export const STICK_COLORS = ['#ffffff', '#111111', '#d42a2a', '#1f5fbf', '#ffd400', '#1f8f4e', '#ff7f27', '#7d3cff', '#ff4fa3', '#00c2d1', '#9aa3ad'];
export const GOLD = '#ffc61a';

export function randomLook(rand) {
  const pick = a => a[Math.floor(rand() * a.length)];
  const styles = Object.keys(HAIR_STYLES);
  const r = rand();
  return {
    skin: pick(SKIN_TONES),
    hair: pick(HAIR_COLORS.slice(0, 8)),
    hairStyle: r < 0.5 ? 'kurz' : r < 0.68 ? 'lang' : r < 0.84 ? 'locken' : r < 0.92 ? 'glatze' : styles[3],
  };
}
