// Lokal gespeicherte Vereinsdaten für die Freundschaftsspiel-Teams:
// Jubel pro Spieler und Verletzungen (bis zur Genesung).
// Schlüssel: «Kürzel#Nummer». Ab Etappe 3/4 wandert das in den Spielstand.

import { CONFIG } from '../config.js';

const KEY = 'unihockey-stars.teams';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function save(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ohne Speicher */ }
}
const key = (team, p) => `${team.short}#${p.number}`;

// Gespeicherte Jubel und Verletzungen auf die Teamdaten übertragen
export function applyTeamPrefs(team) {
  const d = load();
  for (const p of team.players) {
    const e = d[key(team, p)];
    if (!e) continue;
    if (e.celebration != null) p.celebration = e.celebration;
    p.injury = e.injury && e.injury.games > 0 ? { ...e.injury } : null;
  }
  return team;
}

export function saveCelebration(team, p, id) {
  const d = load();
  const k = key(team, p);
  d[k] = { ...(d[k] || {}), celebration: id };
  save(d);
  p.celebration = id;
}

// Nach einem Spiel: bestehende Verletzungen heilen um ein Spiel, neue eintragen.
// newInjuries: [{ team, player(data), level, games }]
export function recordMatchInjuries(teams, newInjuries) {
  const d = load();
  const fresh = new Set(newInjuries.map(n => key(n.team, n.player)));
  const healed = [];
  for (const team of teams) {
    for (const p of team.players) {
      const k = key(team, p);
      const e = d[k];
      if (!e || !e.injury || fresh.has(k)) continue;
      e.injury.games -= 1;
      if (e.injury.games <= 0) { e.injury = null; healed.push({ team, player: p }); }
    }
  }
  for (const n of newInjuries) {
    const k = key(n.team, n.player);
    d[k] = { ...(d[k] || {}), injury: { level: n.level, games: n.games } };
  }
  save(d);
  return healed;
}

export function injuredPlayers(team) {
  return team.players.filter(p => p.injury && p.injury.games > 0);
}

export const INJURY_LABEL = { leicht: 'leicht', mittel: 'mittel', schwer: 'schwer' };
export const injuryRange = level => CONFIG.rules.injuryGames[level];
