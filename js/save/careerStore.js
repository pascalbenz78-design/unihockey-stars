// Karriere lokal speichern (nach jedem Spieltag).

const KEY = 'unihockey-stars.career';

export function loadCareer() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    return c && c.version ? c : null;
  } catch { return null; }
}

export function saveCareer(c) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch { return false; }
}

export function deleteCareer() {
  try { localStorage.removeItem(KEY); } catch { /* egal */ }
}
