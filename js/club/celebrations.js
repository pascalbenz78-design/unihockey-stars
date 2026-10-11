// Torjubel – die Nummer wird beim Spieler gespeichert (data.celebration).

export const CELEBRATIONS = [
  { id: 0, name: 'Faust' },
  { id: 1, name: 'Knierutscher' },
  { id: 2, name: 'Schläger hochhalten' },
  { id: 3, name: 'Flieger' },
  { id: 4, name: 'Tänzchen' },
  { id: 5, name: 'Herz' },
  { id: 6, name: 'Sprung' },
  { id: 7, name: 'Team-Kreis' },
  { id: 8, name: 'Bogenschütze' },
  { id: 9, name: 'Salutieren' },
];

export const celebrationName = id => (CELEBRATIONS[id] || CELEBRATIONS[0]).name;
