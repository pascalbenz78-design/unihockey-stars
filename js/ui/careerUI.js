// Karriere-Bildschirme: Start, Zentrale (nächstes Spiel, Tabelle, Saisonziel),
// Tabellen aller Ligen, Resultate, Cup, Playoffs/Barrage (Turnierbaum),
// Torschützen, Saisonende und Saisonwechsel.

import {
  OWN, LEAGUES, ROUNDS, CUP_ROUNDS, currentEvent, eventLabel, ownFixture, standings, getTeam, ownLeague,
  leagueName, topScorers, seasonLabel,
} from '../league/career.js';
import { logoDataURL } from '../club/logo.js';
import { shortName } from '../club/names.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TYPE = { regular: '', ot: ' n.V.', so: ' n.P.' };

// In Listen über mehrere Teams immer mit Initiale; bei Verwechslungsgefahr ganzer Vorname
const listName = (p, all) => { const n = shortName(p, all); return n === p.lastName ? `${p.firstName[0]}. ${p.lastName}` : n; };

export class CareerUI {
  constructor(app) {
    this.app = app;
    this.logos = new Map();
    this.tableL = null;
    this.scorerScope = 'own';
  }

  get c() { return this.app.career; }
  get club() { return this.app.club; }
  show(html, cls = 'wide career') { this.app.menus.show(html, cls); this.app.menus.screen = 'career'; }

  team(id) { return getTeam(this.c, this.club, id); }
  logo(id) {
    const t = this.team(id);
    const key = id === OWN ? `${id}:${JSON.stringify(t.logo)}` : id;
    if (!this.logos.has(key)) this.logos.set(key, logoDataURL(t.logo, 48));
    return this.logos.get(key);
  }
  tname(id, short = false) {
    const t = this.team(id);
    return `<span class="tn ${id === OWN ? 'own' : ''}"><img src="${this.logo(id)}" alt="">${esc(short ? t.short : t.name)}</span>`;
  }
  score(g) { return `${g.gh}:${g.ga}${TYPE[g.type] || ''}`; }

  // ------------------------------------------------------------ Start

  start() {
    if (this.c) { this.hub(); return; }
    const club = this.club;
    this.show(`
      <h2>Karriere</h2>
      <div class="club-head"><img class="club-logo" src="${logoDataURL(club.logo, 112)}" alt="">
        <div><b>${esc(club.name)}</b><br><span class="hint">startet in der Liga 5</span></div></div>
      <ul class="sum-list">
        <li>5 Ligen mit je 8 Teams. Qualifikation mit Hin- und Rückrunde (14 Spiele).</li>
        <li>Die besten 4 spielen die Playoffs (Best-of-3). Der Playoff-Sieger steigt auf, der Letzte ab.</li>
        <li>Barrage: Playoff-Finalverlierer gegen den Zweitletzten der oberen Liga.</li>
        <li>Dazu der Cup mit allen 40 Teams und ein Saisonziel vom Vorstand.</li>
        <li>Jedes Spiel kannst du selbst spielen oder simulieren.</li>
      </ul>
      <div class="menu-row"><button data-act="main">Zurück</button><button class="primary big" data-act="carNew">Karriere starten</button></div>`, 'career');
  }

  // ------------------------------------------------------------ Zentrale

  hub() {
    const c = this.c, club = this.club;
    const L = ownLeague(c);
    const ev = currentEvent(c);
    let next;
    if (ev.kind === 'end') {
      next = `<div class="next-card"><h3>Saison beendet</h3><p>Alle Spiele sind gespielt.</p>
        <div class="menu-row left"><button class="primary big" data-act="carSeasonEnd">Saisonbilanz ansehen</button></div></div>`;
    } else {
      const f = ownFixture(c);
      if (f) {
        const home = f.h === OWN;
        const ser = f.series ? `<p class="hint">Serie ${this.seriesText(f.series)}</p>` : '';
        next = `<div class="next-card"><h3>${eventLabel(c, ev)}</h3>
          <div class="matchup">${this.tname(f.h)}<b>–</b>${this.tname(f.a)}</div>
          <p class="hint">${home ? 'Heimspiel' : 'Auswärtsspiel'}</p>${ser}
          <div class="menu-row left"><button class="primary big" data-act="carPlay">Spielen</button>
          <button data-act="carSim">Simulieren</button></div></div>`;
      } else {
        next = `<div class="next-card"><h3>${eventLabel(c, ev)}</h3>
          <p>${ev.kind === 'cup' ? 'Dein Team ist im Cup ausgeschieden.' : 'Dein Team spielt in dieser Runde nicht.'}</p>
          <div class="menu-row left"><button class="primary big" data-act="carSim">Runde simulieren</button></div></div>`;
      }
    }
    const last = c.lastEvent ? this.lastEventHtml(c.lastEvent) : '';
    this.show(`
      <div class="club-head"><img class="club-logo" src="${logoDataURL(club.logo, 112)}" alt="">
        <div><h2>${esc(club.name)}</h2><span class="hint">Saison ${seasonLabel(c)} · ${leagueName(L)} · Ziel: ${esc(c.goal.text)}</span></div></div>
      <div class="hub">
        <div>${next}${last}</div>
        <div><h3>${leagueName(L)}</h3>${this.tableHtml(L, true)}</div>
      </div>
      <div class="menu-row nav">
        <button data-act="carTables">Tabellen</button><button data-act="carResults">Resultate</button>
        <button data-act="carCup">Cup</button><button data-act="carBracket">Playoffs</button>
        <button data-act="carScorers">Torschützen</button><button data-act="carClub">Mein Verein</button>
        <button data-act="main">Hauptmenü</button>
      </div>`);
  }

  // Zusatzhinweis (z. B. Trainingsbericht) unter der Zentrale anzeigen
  appendNote(html) {
    const panel = this.app.menus.el.querySelector('.panel');
    if (panel) panel.insertAdjacentHTML('beforeend', html);
  }

  seriesText(s) {
    const t = id => this.team(id).short;
    return `${t(s.a)} ${s.wins[0]}:${s.wins[1]} ${t(s.b)}`;
  }

  lastEventHtml(e) {
    const L = ownLeague(this.c);
    const own = e.games.filter(g => g.h === OWN || g.a === OWN);
    let games = e.games;
    if (e.kind === 'league') games = games.filter(g => this.c.leagues[L].includes(g.h));
    else games = [...own, ...games.filter(g => !own.includes(g))].slice(0, 8);
    return `<h3>Letzte Runde: ${esc(e.label)}</h3><table class="res">${games.map(g =>
      `<tr class="${g.h === OWN || g.a === OWN ? 'own' : ''}"><td>${this.tname(g.h, true)}</td><td class="sc">${this.score(g)}</td><td>${this.tname(g.a, true)}</td></tr>`).join('')}</table>`;
  }

  // ------------------------------------------------------------ Tabellen

  tableHtml(L, compact = false) {
    const rows = standings(this.c, L);
    const mark = i => (i < 4 ? 'po' : i === 6 && L > 0 ? 'bar' : i === 7 && L < LEAGUES - 1 ? 'rel' : '');
    return `<table class="tab ${compact ? 'compact' : ''}">
      <tr><th></th><th>Team</th><th>Sp</th>${compact ? '' : '<th>S</th><th>SnV</th><th>NnV</th><th>N</th>'}<th>Tore</th><th>TD</th><th>Pkt</th></tr>
      ${rows.map((r, i) => `<tr class="${r.id === OWN ? 'own' : ''} ${mark(i)}"><td>${i + 1}</td><td>${this.tname(r.id, compact)}</td><td>${r.gp}</td>
        ${compact ? '' : `<td>${r.w}</td><td>${r.otw}</td><td>${r.otl}</td><td>${r.l}</td>`}
        <td>${r.gf}:${r.ga}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`).join('')}
    </table>`;
  }

  tables(L = this.tableL ?? ownLeague(this.c)) {
    this.tableL = L;
    const tabs = Array.from({ length: LEAGUES }, (_, i) =>
      `<button class="tab ${i === L ? 'sel' : ''}" data-act="carTables" data-val="${i}">${leagueName(i)}${i === ownLeague(this.c) ? ' ★' : ''}</button>`).join('');
    this.show(`<h2>Tabellen</h2><div class="tabs">${tabs}</div>${this.tableHtml(L)}
      <p class="hint legend"><span class="po">■</span> Playoffs ${L > 0 ? '<span class="bar">■</span> Barrage' : ''} ${L < LEAGUES - 1 ? '<span class="rel">■</span> Abstieg' : ''}
      · Punkte: Sieg 3, Sieg n.V./n.P. 2, Niederlage n.V./n.P. 1</p>
      ${this.back()}`);
  }

  back() { return '<div class="menu-row"><button class="primary" data-act="carHub">Zurück</button></div>'; }

  // ------------------------------------------------------------ Resultate

  results() {
    const c = this.c, L = ownLeague(c);
    const rounds = c.schedule[L].map((pairs, r) => {
      const res = c.results[L][r];
      const rows = pairs.map(([h, a], i) => {
        const g = res && res[i];
        return `<tr class="${h === OWN || a === OWN ? 'own' : ''}"><td>${this.tname(h, true)}</td><td class="sc">${g ? this.score(g) : '–'}</td><td>${this.tname(a, true)}</td></tr>`;
      }).join('');
      return `<div class="round"><h3>Runde ${r + 1}</h3><table class="res">${rows}</table></div>`;
    }).join('');
    this.show(`<h2>Resultate ${leagueName(L)}</h2><div class="rounds">${rounds}</div>${this.back()}`);
  }

  // ------------------------------------------------------------ Cup

  cup() {
    const c = this.c;
    const rounds = CUP_ROUNDS.map((name, i) => {
      const rd = c.cup.rounds[i];
      if (!rd) return `<div class="round"><h3>${name}</h3><p class="hint">noch nicht ausgelost</p></div>`;
      return `<div class="round"><h3>${name}</h3><table class="res">${rd.pairs.map(p =>
        `<tr class="${p.h === OWN || p.a === OWN ? 'own' : ''}"><td class="${p.winner === p.h ? 'win' : ''}">${this.tname(p.h, true)}</td>
         <td class="sc">${p.winner ? this.score(p) : '–'}</td><td class="${p.winner === p.a ? 'win' : ''}">${this.tname(p.a, true)}</td></tr>`).join('')}</table></div>`;
    }).join('');
    const win = c.cup.winner ? `<p class="champ">🏆 Cupsieger: ${this.tname(c.cup.winner)}</p>` : '';
    this.show(`<h2>Cup ${seasonLabel(c)}</h2>${win}
      <p class="hint">K.-o.-System mit allen 40 Teams. Liga 4 und 5 starten in der 1. Runde, Liga 3 in der 2., Liga 2 in der 3., Liga 1 im Achtelfinal. Das tiefer klassierte Team hat Heimrecht.</p>
      <div class="rounds">${rounds}</div>${this.back()}`);
  }

  // ------------------------------------------------------------ Playoffs und Barrage

  seriesHtml(s, title) {
    if (!s) return `<div class="series empty"><small>${title}</small><span class="hint">offen</span></div>`;
    const games = s.games.map(g => `${g.h === s.a ? g.gh : g.ga}:${g.h === s.a ? g.ga : g.gh}${TYPE[g.type]}`).join(', ');
    return `<div class="series ${s.a === OWN || s.b === OWN ? 'own' : ''}"><small>${title}</small>
      <div class="${s.winner === s.a ? 'win' : ''}">${this.tname(s.a, true)}<b>${s.wins[0]}</b></div>
      <div class="${s.winner === s.b ? 'win' : ''}">${this.tname(s.b, true)}<b>${s.wins[1]}</b></div>
      <span class="hint">${games || 'noch nicht gespielt'}</span></div>`;
  }

  bracket() {
    const c = this.c;
    if (!c.playoffs) {
      this.show(`<h2>Playoffs und Barrage</h2><p>Die Playoffs beginnen nach der 14. Runde der Qualifikation.
        Aktuell wären diese Teams dabei:</p>${Array.from({ length: LEAGUES }, (_, L) =>
        `<p><b>${leagueName(L)}:</b> ${standings(c, L).slice(0, 4).map(r => this.tname(r.id, true)).join(' ')}</p>`).join('')}${this.back()}`);
      return;
    }
    const leagues = c.playoffs.leagues.map((x, L) => `
      <div class="bracket"><h3>${leagueName(L)}${x.champion ? ` – ${L === 0 ? 'Schweizer Meister' : 'Ligameister'}: ${this.tname(x.champion, true)}` : ''}</h3>
        <div class="tree"><div class="col">${this.seriesHtml(x.sf[0], 'Halbfinal 1–4')}${this.seriesHtml(x.sf[1], 'Halbfinal 2–3')}</div>
        <div class="col final">${this.seriesHtml(x.final, 'Final')}</div></div></div>`).join('');
    const bar = c.barrages ? `<h3>Barrage (Best-of-3)</h3><div class="tree bar">${c.barrages.series.map(s =>
      this.seriesHtml(s, `${leagueName(s.k)} / ${leagueName(s.k + 1)}`)).join('')}</div>` : '<p class="hint">Barrage folgt nach den Playoffs.</p>';
    this.show(`<h2>Playoffs und Barrage ${seasonLabel(c)}</h2>${leagues}${bar}${this.back()}`);
  }

  // ------------------------------------------------------------ Torschützen

  scorersHtml(list) {
    const all = list.map(x => x.p);
    return `<table class="tab"><tr><th></th><th>Spieler</th><th>Team</th><th>T</th><th>A</th><th>Pkt</th></tr>
      ${list.map((x, i) => `<tr class="${x.team === OWN ? 'own' : ''}"><td>${i + 1}</td><td>${esc(listName(x.p, all))}</td>
        <td>${this.tname(x.team, true)}</td><td>${x.g}</td><td>${x.a}</td><td><b>${x.pts}</b></td></tr>`).join('')}</table>`;
  }

  scorers(scope = this.scorerScope) {
    this.scorerScope = scope;
    const L = scope === 'own' ? ownLeague(this.c) : null;
    const list = topScorers(this.c, this.club, 20, L);
    this.show(`<h2>Torschützen</h2>
      <div class="tabs"><button class="tab ${scope === 'own' ? 'sel' : ''}" data-act="carScorers" data-val="own">${leagueName(ownLeague(this.c))}</button>
      <button class="tab ${scope === 'all' ? 'sel' : ''}" data-act="carScorers" data-val="all">Alle Ligen</button></div>
      ${list.length ? this.scorersHtml(list) : '<p class="hint">Noch keine Tore.</p>'}
      <p class="hint">Qualifikation, Playoffs und Barrage (ohne Cup).</p>${this.back()}`);
  }

  // ------------------------------------------------------------ Saisonende

  seasonEnd() {
    const c = this.c, s = c.summary;
    const champs = s.champions.map((id, L) => `<li>${L === 0 ? '🏆 <b>Schweizer Meister</b>' : `🥇 Meister ${leagueName(L)}`}: ${this.tname(id, true)}</li>`).join('');
    const ups = s.moves.filter(m => m.to < m.from).map(m => `<li>⬆ ${this.tname(m.id, true)} in die ${leagueName(m.to)} <small class="hint">(${m.why})</small></li>`).join('');
    const downs = s.moves.filter(m => m.to > m.from).map(m => `<li>⬇ ${this.tname(m.id, true)} in die ${leagueName(m.to)} <small class="hint">(${m.why})</small></li>`).join('');
    const own = s.ownMove ? (s.ownMove.to < s.ownMove.from ? `⬆ Aufstieg in die ${leagueName(s.ownMove.to)}!` : `⬇ Abstieg in die ${leagueName(s.ownMove.to)}`) : `Ihr bleibt in der ${leagueName(s.ownLeague)}.`;
    const best = s.best ? `${esc(s.best.p.firstName)} ${esc(s.best.p.lastName)} (${this.tname(s.best.team, true)}) – ${s.best.g} Tore, ${s.best.a} Assists` : '–';
    const tables = Array.from({ length: LEAGUES }, (_, L) => `<details ${L === s.ownLeague ? 'open' : ''}><summary>${leagueName(L)}</summary>${this.tableHtml(L)}</details>`).join('');
    this.show(`
      <h2>Saisonbilanz ${seasonLabel(c)}</h2>
      <div class="verdict ${s.goal.met ? 'ok' : 'bad'}"><b>${s.champion ? '🏆 Meister! ' : ''}Rang ${s.ownRank} in der ${leagueName(s.ownLeague)}. ${own}</b>
        <span>Saisonziel «${esc(s.goal.text)}»: ${s.goal.met ? 'erreicht ✅' : 'verpasst ❌'}</span><span>${esc(s.goal.verdict)}</span></div>
      <div class="two-col">
        <div><h3>Meister</h3><ul class="sum-list">${champs}<li>🏆 Cupsieger: ${this.tname(s.cup.winner, true)}</li></ul>
          <h3>Aufsteiger</h3><ul class="sum-list">${ups}</ul><h3>Absteiger</h3><ul class="sum-list">${downs}</ul></div>
        <div><h3>Bester Spieler</h3><p>⭐ ${best}</p><h3>Torschützen (alle Ligen)</h3>${this.scorersHtml(s.scorers.slice(0, 10))}</div>
      </div>
      <h3>Schlusstabellen</h3>${tables}
      <div class="menu-row"><button data-act="carHub">Zurück</button><button class="primary big" data-act="carNextSeason">Neue Saison starten</button></div>`);
  }

  agingReport() {
    const a = this.c.lastAging || { retired: [], better: [], worse: [] };
    const li = (arr, f) => arr.length ? arr.map(f).join('') : '<li class="hint">–</li>';
    this.show(`
      <h2>Neue Saison ${seasonLabel(this.c)}</h2>
      <p>Alle Spieler sind ein Jahr älter und wieder gesund. Saisonziel: <b>${esc(this.c.goal.text)}</b></p>
      <div class="two-col">
        <div><h3>Rücktritte (ersetzt durch Junioren)</h3><ul class="sum-list">${li(a.retired, r => `<li>👋 ${esc(r.old)} (${r.age}) → 🆕 ${esc(r.young)}</li>`)}</ul></div>
        <div><h3>Entwicklung</h3><ul class="sum-list">${li(a.better.slice(0, 8), r => `<li>📈 ${esc(r.name)} +${r.delta}</li>`)}${li(a.worse.slice(0, 6), r => `<li>📉 ${esc(r.name)} ${r.delta}</li>`)}</ul></div>
      </div>
      <div class="menu-row"><button class="primary big" data-act="carHub">Los geht's</button></div>`);
  }

  // ------------------------------------------------------------ Ereignisse

  onAction(act, val) {
    const app = this.app;
    switch (act) {
      case 'carNew': app.newCareer(); return true;
      case 'carHub': this.hub(); return true;
      case 'carPlay': app.startCareerMatch(); return true;
      case 'carSim': app.simulateCareerEvent(); return true;
      case 'carTables': this.tables(val != null ? +val : undefined); return true;
      case 'carResults': this.results(); return true;
      case 'carCup': this.cup(); return true;
      case 'carBracket': this.bracket(); return true;
      case 'carScorers': this.scorers(val || undefined); return true;
      case 'carClub': app.clubEditor.open(null, 'carHub'); return true;
      case 'carSeasonEnd': this.seasonEnd(); return true;
      case 'carNextSeason': app.nextCareerSeason(); return true;
      case 'careerNext': app.toCareerHub(); return true;
      default: return false;
    }
  }
}

export { ROUNDS };
