// Eigenen Verein lokal speichern (nach jeder Änderung).

const KEY = 'unihockey-stars.club';

export function loadClub() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    return c && c.version ? c : null;
  } catch { return null; }
}

export function saveClub(club) {
  try { localStorage.setItem(KEY, JSON.stringify(club)); return true; } catch { return false; }
}
