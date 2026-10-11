// Menüs und Bildschirme: Hauptmenü, Freundschaftsspiel, Einstellungen,
// Anleitung, Pause, Drittelspause mit Statistik, Spielende.

import { CONFIG } from '../config.js';
import { CELEBRATIONS } from '../club/celebrations.js';
import { injuredPlayers, saveCelebration } from '../club/teamStore.js';
import { FOUL_NAMES, INJURY_NAMES } from '../match/rules.js';

const POS_NAME = { C: 'Center', F: 'Flügel', D: 'Verteidiger', G: 'Goalie' };

export class Menus {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('screen');
    this.back = null;
    this.el.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      this.onAction(b.dataset.act, b.dataset.val, b);
    });
  }

  show(html, cls = '') {
    this.el.innerHTML = `<div class="panel ${cls}">${html}</div>`;
    this.el.classList.remove('hidden');
    const first = this.el.querySelector('button.primary');
    if (first && !this.app.touch) first.focus({ preventScroll: true });
  }
  hide() { this.el.classList.add('hidden'); this.el.innerHTML = ''; }
  get visible() { return !this.el.classList.contains('hidden'); }

  main() {
    this.screen = 'main';
    this.show(`
      <div class="logo"><span class="star">★</span> UNIHOCKEY <b>STARS</b> <span class="star">★</span></div>
      <p class="sub">Arcade-Unihockey mit Vereinsmanager</p>
      <div class="menu-col">
        <button class="primary big" data-act="friendly">Freundschaftsspiel</button>
        <button class="big" disabled title="folgt in Etappe 3–4">Karriere <small>(bald)</small></button>
        <button data-act="settings">Einstellungen</button>
        <button data-act="help">Anleitung</button>
      </div>
      <p class="ver">Version ${CONFIG.version} · Etappe 2</p>`, 'main');
  }

  friendly() {
    this.screen = 'friendly';
    const s = this.app.settings;
    const teams = this.app.teams;
    this.pick = this.pick ?? 0;
    const tbtn = (t, i) => `<button class="team-pick ${this.pick === i ? 'sel' : ''}" data-act="pickTeam" data-val="${i}">
      <i class="swatch" style="background:${t.colors.shirt};border-color:${t.colors.shirt2}"></i>${t.name}</button>`;
    this.show(`
      <h2>Freundschaftsspiel</h2>
      <div class="field-row"><label>Dein Team</label><div class="opts">${teams.map(tbtn).join('')}</div></div>
      <div class="field-row"><label>Schwierigkeit</label><div class="opts">${this.opts('difficulty', CONFIG.difficulty, s.difficulty)}</div></div>
      <p class="hint">3 Drittel à 20:00 Spielzeit (je 3 Minuten). Bei Unentschieden Verlängerung und Penaltyschiessen.</p>
      ${this.injuryNote(teams[this.pick])}
      <div class="menu-row">
        <button data-act="main">Zurück</button>
        <button data-act="celebrations">Jubel zuordnen</button>
        <button class="primary big" data-act="start">Anpfiff!</button>
      </div>`);
  }

  injuryNote(team) {
    const inj = injuredPlayers(team);
    if (!inj.length) return '';
    return `<p class="injured">Verletzt: ${inj.map(p => `${p.firstName} ${p.lastName} (${INJURY_NAMES[p.injury.level]}, noch ${p.injury.games} ${p.injury.games === 1 ? 'Spiel' : 'Spiele'})`).join(', ')}</p>`;
  }

  // Jubel pro Spieler wählen (gespeichert)
  celebrations() {
    this.screen = 'celebrations';
    const team = this.app.teams[this.pick ?? 0];
    const opts = id => CELEBRATIONS.map(c => `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${c.name}</option>`).join('');
    const rows = team.players.filter(p => p.pos !== 'G').map(p => `<tr>
        <td>#${p.number}</td><td>${p.firstName} ${p.lastName}</td><td class="hint">${POS_NAME[p.pos]}</td>
        <td><select data-cel="${p.id}">${opts(p.celebration || 0)}</select></td></tr>`).join('');
    this.show(`
      <h2>Jubel – ${team.name}</h2>
      <p class="hint">Nach jedem Tor jubelt der Torschütze so. Die Auswahl wird gespeichert.</p>
      <table class="cel-table">${rows}</table>
      <div class="menu-row"><button class="primary" data-act="friendly">Fertig</button></div>`, 'wide');
    this.el.querySelectorAll('select[data-cel]').forEach(sel => sel.addEventListener('change', () => {
      const pl = team.players.find(x => x.id === +sel.dataset.cel);
      saveCelebration(team, pl, +sel.value);
    }));
  }

  opts(key, table, cur) {
    return Object.entries(table).map(([k, v]) =>
      `<button class="opt ${cur === k ? 'sel' : ''}" data-act="set" data-val="${key}:${k}">${v.label}</button>`).join('');
  }
  toggle(key, cur, label) {
    return `<button class="toggle ${cur ? 'on' : ''}" data-act="toggle" data-val="${key}">${label}<span>${cur ? 'An' : 'Aus'}</span></button>`;
  }

  settings(back) {
    this.screen = 'settings';
    if (back) this.back = back;
    const s = this.app.settings;
    this.show(`
      <h2>Einstellungen</h2>
      <div class="field-row"><label>Schwierigkeit</label><div class="opts">${this.opts('difficulty', CONFIG.difficulty, s.difficulty)}</div></div>
      <div class="field-row"><label>Grafik</label><div class="opts">${this.opts('graphics', CONFIG.graphics, s.graphics)}</div></div>
      <div class="field-row"><label>Wechsel</label><div class="opts">${this.toggle('autoChange', s.autoChange, 'Auto-Wechsel')}</div></div>
      <div class="field-row"><label>Goalie</label><div class="opts">${this.toggle('autoGoalie', s.autoGoalie, 'Bei Schuss aufs eigene Tor automatisch übernehmen')}</div></div>
      <p class="hint">Die Schwierigkeit gilt ab dem nächsten Spiel. Ton folgt in Etappe 6.</p>
      <div class="menu-row"><button class="primary" data-act="back">Fertig</button></div>`);
  }

  help(back) {
    this.screen = 'help';
    if (back) this.back = back;
    this.show(`
      <h2>Anleitung</h2>
      <div class="help-cols">
        <div>
          <h3>Tastatur</h3>
          <table class="keys">
            <tr><td><kbd>WASD</kbd> / <kbd>Pfeile</kbd></td><td>laufen</td></tr>
            <tr><td><kbd>Leertaste</kbd></td><td>Schuss – halten lädt auf (härter, aber ungenauer)</td></tr>
            <tr><td><kbd>X</kbd></td><td>Pass (in Laufrichtung)</td></tr>
            <tr><td><kbd>C</kbd></td><td>Bandenpass</td></tr>
            <tr><td><kbd>Shift</kbd></td><td>Sprint (kostet Ausdauer) · Goalie: Hechtsprung</td></tr>
            <tr><td><kbd>E</kbd></td><td>zum Spieler am nächsten beim Ball wechseln</td></tr>
            <tr><td><kbd>G</kbd></td><td>Goalie übernehmen / abgeben</td></tr>
            <tr><td><kbd>Q</kbd></td><td>Linienwechsel</td></tr>
            <tr><td><kbd>P</kbd></td><td>Pause</td></tr>
          </table>
          <h3>Handy</h3>
          <p>Links Joystick (Daumen irgendwo hinlegen), rechts Schuss, Pass, Bande, Sprint. Oben Spieler-Wechsel, Goalie, Linie, Pause.</p>
        </div>
        <div>
          <h3>Tipps</h3>
          <ul>
            <li><b>Direktschuss:</b> Schuss drücken, kurz bevor der Pass ankommt.</li>
            <li><b>Ball erobern:</b> ohne Ball nahe beim Gegner Schuss oder Pass drücken (Stockeinsatz).</li>
            <li>Mit Richtung nach oben/unten beim Schuss zielst du in die obere bzw. untere Torecke.</li>
            <li>Müde Spieler sind langsamer und schiessen ungenauer – rechtzeitig wechseln!</li>
          </ul>
          <h3>Regeln</h3>
          <ul>
            <li>3 Drittel à 20:00 (läuft schneller: ein Drittel dauert 3 Minuten).</li>
            <li>Kein Bodycheck. Feldspieler dürfen nicht in den Torraum.</li>
            <li>Ball über die Bande: Bully am nächsten Punkt.</li>
          </ul>
        </div>
      </div>
      <div class="menu-row"><button class="primary" data-act="back">Zurück</button></div>`, 'wide');
  }

  pause() {
    this.screen = 'pause';
    this.show(`
      <h2>Pause</h2>
      <div class="menu-col">
        <button class="primary big" data-act="resume">Weiter</button>
        <button data-act="settings">Einstellungen</button>
        <button data-act="help">Anleitung</button>
        <button data-act="quit">Spiel beenden</button>
      </div>`);
  }

  intermission(match) {
    this.screen = 'intermission';
    const title = match.next === 'ot' ? 'Unentschieden – Verlängerung' : match.next === 'shootout' ? 'Penaltyschiessen' : 'Drittelspause';
    const sub = match.next === 'ot' ? '5:00 Sudden Death: Das nächste Tor entscheidet.'
      : match.next === 'shootout' ? 'Je 3 Schützen, danach einzeln weiter. Du steuerst Schütze und Goalie.'
        : `Nach dem ${match.period}. Drittel`;
    const btn = match.next === 'ot' ? 'Weiter: Verlängerung' : match.next === 'shootout' ? 'Weiter: Penaltyschiessen' : `Weiter: ${match.period + 1}. Drittel`;
    this.show(`
      <h2>${title}</h2>
      <p class="sub">${sub}</p>
      ${this.scoreLine(match)}
      ${this.statsTable(match)}
      ${this.goalList(match)}
      <div class="menu-row"><button class="primary big" data-act="nextPeriod">${btn}</button></div>`, 'wide');
  }

  end(match, healed = []) {
    this.screen = 'end';
    const h = match.human ? match.human.team : null;
    let title = 'Schlussresultat';
    if (h) {
      const o = match.other(h);
      title = h.score > o.score ? 'Sieg! 🎉' : h.score < o.score ? 'Niederlage' : 'Unentschieden';
    }
    const r = match.result;
    const kind = r && r.type === 'ot' ? ' n.V.' : r && r.type === 'so' ? ' n.P.' : '';
    if (kind) title += ` <small class="hint">(${kind.trim()})</small>`;
    this.show(`
      <h2>${title}</h2>
      ${this.scoreLine(match)}
      ${this.statsTable(match)}
      ${this.goalList(match)}
      ${this.summary(match, healed)}
      <div class="menu-row">
        <button data-act="main">Hauptmenü</button>
        <button class="primary big" data-act="start">Revanche</button>
      </div>`, 'wide');
  }

  summary(m, healed) {
    const items = [];
    for (const l of m.rules.log) {
      const t = m.teams[l.team];
      items.push(`<li>✋ <b style="color:${t.data.colors.shirt}">${t.data.short}</b> 2 Min. ${l.player.lastName} – ${FOUL_NAMES[l.type]}</li>`);
    }
    for (const i of m.rules.injuries) {
      items.push(`<li>🩹 <b>${i.team.short}</b> ${i.player.firstName} ${i.player.lastName}: ${INJURY_NAMES[i.level]}, ${i.games} ${i.games === 1 ? 'Spiel' : 'Spiele'} Pause</li>`);
    }
    for (const x of healed) items.push(`<li>✅ ${x.team.short} ${x.player.firstName} ${x.player.lastName} ist wieder fit</li>`);
    if (m.shootout) {
      const k = m.shootout.kicks;
      items.push(`<li>Penaltys: ${m.teams[0].data.short} ${k[0].filter(Boolean).length} – ${k[1].filter(Boolean).length} ${m.teams[1].data.short}</li>`);
    }
    return items.length ? `<ul class="sum-list">${items.join('')}</ul>` : '';
  }

  scoreLine(m) {
    const [a, b] = m.teams;
    return `<div class="scoreline"><span><i class="swatch" style="background:${a.data.colors.shirt}"></i>${a.data.name}</span>
      <b>${a.score} : ${b.score}</b><span>${b.data.name}<i class="swatch" style="background:${b.data.colors.shirt}"></i></span></div>`;
  }

  statsTable(m) {
    const [a, b] = m.teams;
    const tot = a.stats.possession + b.stats.possession || 1;
    const rows = [
      ['Schüsse', a.stats.shots, b.stats.shots],
      ['Schüsse aufs Tor', a.stats.onTarget, b.stats.onTarget],
      ['Paraden', a.stats.saves, b.stats.saves],
      ['Pässe (angekommen)', `${a.stats.passesOk}/${a.stats.passes}`, `${b.stats.passesOk}/${b.stats.passes}`],
      ['Ballbesitz', `${Math.round(a.stats.possession / tot * 100)} %`, `${Math.round(b.stats.possession / tot * 100)} %`],
      ['Bälle erobert', a.stats.steals, b.stats.steals],
    ];
    return `<table class="stats"><tr><th>${a.data.short}</th><th></th><th>${b.data.short}</th></tr>
      ${rows.map(r => `<tr><td>${r[1]}</td><td class="lbl">${r[0]}</td><td>${r[2]}</td></tr>`).join('')}</table>`;
  }

  goalList(m) {
    if (!m.goals.length) return '<p class="hint">Noch keine Tore.</p>';
    return `<ul class="goals">${m.goals.map(g => {
      const t = m.teams[g.team];
      const time = clockText((g.period > 3 ? 300 : 1200) - g.clock);
      const who = g.ownGoal ? 'Eigentor' : `${g.scorer.firstName} ${g.scorer.lastName} (${g.scorer.number})`;
      const as = g.assist ? ` · Assist ${g.assist.lastName}` : '';
      const per = g.period > 3 ? 'V' : g.period + '.';
      const pp = g.pp === 'PP' ? ' <small class="hint">(PP)</small>' : g.pp === 'SH' ? ' <small class="hint">(Unterzahl)</small>' : '';
      return `<li><span class="gt">${per} / ${time}</span> <b style="color:${t.data.colors.shirt}">${t.data.short}</b> ${who}${as}${pp}</li>`;
    }).join('')}</ul>`;
  }

  onAction(act, val) {
    const app = this.app;
    switch (act) {
      case 'main': app.toMenu(); break;
      case 'friendly': this.app.refreshTeams(); this.friendly(); break;
      case 'celebrations': this.celebrations(); break;
      case 'pickTeam': this.pick = +val; this.friendly(); break;
      case 'start': app.startFriendly(this.pick ?? 0); break;
      case 'settings': this.settings(this.screen); break;
      case 'help': this.help(this.screen); break;
      case 'back': {
        const b = this.back; this.back = null;
        if (b === 'pause') this.pause(); else if (b === 'friendly') this.friendly(); else this.main();
        break;
      }
      case 'set': {
        const [k, v] = val.split(':');
        app.changeSetting(k, v);
        if (this.screen === 'friendly') this.friendly(); else this.settings();
        break;
      }
      case 'toggle': app.changeSetting(val, !app.settings[val]); this.settings(); break;
      case 'resume': app.resume(); break;
      case 'quit': app.toMenu(); break;
      case 'nextPeriod': app.nextPeriod(); break;
      default: break;
    }
  }
}

function clockText(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
