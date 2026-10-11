// Ganzer Spielstand als ein Objekt (Verein, Karriere, Freundschaftsteams).
// Wird online gespeichert und für den Datei-Export verwendet.

const KEYS = {
  club: 'unihockey-stars.club',
  career: 'unihockey-stars.career',
  teams: 'unihockey-stars.teams',
};

export function makeBundle(savedAt = new Date().toISOString()) {
  const b = { app: 'unihockey-stars', v: 1, savedAt };
  for (const [k, key] of Object.entries(KEYS)) {
    try { b[k] = JSON.parse(localStorage.getItem(key) || 'null'); } catch { b[k] = null; }
  }
  return b;
}

export function validBundle(b) {
  return !!b && b.app === 'unihockey-stars' && b.v === 1 && b.club && Array.isArray(b.club.players) && b.club.players.length >= 20;
}

// Spielstand übernehmen (danach neu laden)
export function applyBundle(b) {
  if (!validBundle(b)) throw new Error('Kein gültiger Spielstand');
  for (const [k, key] of Object.entries(KEYS)) {
    if (b[k]) localStorage.setItem(key, JSON.stringify(b[k]));
    else localStorage.removeItem(key);
  }
}

export function downloadBundle(b) {
  const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `unihockey-stars-spielstand-${b.savedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function readBundleFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { try { resolve(JSON.parse(r.result)); } catch { reject(new Error('Datei ist kein Spielstand')); } };
    r.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    r.readAsText(file);
  });
}
