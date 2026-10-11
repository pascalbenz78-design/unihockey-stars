// Kurznamen: normalerweise nur der Nachname. Gibt es den Nachnamen in der
// gleichen Gruppe (Team, Liste) mehrfach, kommt die Vornamen-Initiale dazu
// («A. Meier», «D. Meier»). Bei gleicher Initiale der ganze Vorname.

export function shortName(p, group) {
  if (!p) return '';
  const same = (group || []).filter(o => o && o !== p && o.id !== p.id && o.lastName === p.lastName);
  if (!same.length) return p.lastName;
  const ini = p.firstName[0];
  if (same.some(o => o.firstName[0] === ini)) return `${p.firstName} ${p.lastName}`;
  return `${ini}. ${p.lastName}`;
}

// Kurzname innerhalb des eigenen Teams (team: Teamdaten mit players)
export const teamName = (p, team) => shortName(p, team ? team.players : []);
