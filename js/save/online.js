// Spielstand online speichern mit Code (Supabase, REST ohne Zusatzbibliothek –
// gleiches Muster wie Netzroller). Schreiben und Lesen nur über die zwei
// Funktionen aus docs/supabase.sql. Ohne Internet läuft alles lokal weiter.

import { CONFIG } from '../config.js';

const TIMEOUT_MS = 15000;
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';   // ohne 0/O und 1/I
const META_KEY = 'unihockey-stars.online';

export const onlineConfigured = () => !!(CONFIG.online.url && CONFIG.online.key);

export function makeCode() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  const c = [...a].map(b => ALPHABET[b % 32]).join('');
  return `UH-${c.slice(0, 4)}-${c.slice(4)}`;
}

// Eingabe tolerant lesen: Kleinbuchstaben, Leerzeichen und fehlende Striche sind erlaubt.
export function normalizeCode(s) {
  let t = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.startsWith('UH')) t = t.slice(2);
  if (t.length !== 8) return null;
  if ([...t].some(ch => !ALPHABET.includes(ch))) return null;
  return `UH-${t.slice(0, 4)}-${t.slice(4)}`;
}

async function rpc(fn, args) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const key = CONFIG.online.key;
    const res = await fetch(`${CONFIG.online.url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ctl.signal,
      headers: {
        apikey: key, 'Content-Type': 'application/json',
        // ältere «anon»-Schlüssel sind JWTs und gehören zusätzlich in Authorization
        ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(args),
    });
    const txt = await res.text();
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = JSON.parse(txt).message || msg; } catch { /* Text bleibt */ }
      throw new Error(msg);
    }
    return txt ? JSON.parse(txt) : null;
  } finally { clearTimeout(timer); }
}

export const loadMeta = code => rpc('uh_load_game', { p_code: code, p_meta_only: true });
export const loadGame = code => rpc('uh_load_game', { p_code: code, p_meta_only: false });
export const saveGame = (code, data, known, force = false) =>
  rpc('uh_save_game', { p_code: code, p_data: data, p_known: known || null, p_force: force });

// ------------------------------------------------------------ Gerätezustand

// { code, known (Server-Zeitpunkt des letzten Abgleichs), localSavedAt, dirty, lastOnline }
export function getMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch { return {}; }
}
export function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* ohne Speicher */ }
}

export const fmtTime = iso => {
  if (!iso) return '–';
  const d = new Date(iso);
  return `${d.toLocaleDateString('de-CH')} ${d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
};
