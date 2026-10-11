// Einstellungen lokal im Browser speichern (funktioniert auch ohne Speicher).

import { CONFIG } from '../config.js';

const KEY = 'unihockey-stars.settings';

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { s = {}; }
  return { ...CONFIG.defaults, ...s };
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* privater Modus */ }
}
