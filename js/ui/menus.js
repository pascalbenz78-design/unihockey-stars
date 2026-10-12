// Menüs und Bildschirme: Hauptmenü, Freundschaftsspiel, Einstellungen,
// Anleitung, Pause, Drittelspause mit Statistik, Spielende.

import { CONFIG } from '../config.js';
import { injuredPlayers } from '../club/teamStore.js';
import { logoDataURL } from '../club/logo.js';
import { teamName } from '../club/names.js';
import { FOUL_NAMES, INJURY_NAMES } from '../match/rules.js';


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
      <button class="club-card" data-act="club">
        <img src="${logoDataURL(this.app.club.logo, 80)}" alt="">
        <span><b>${esc(this.app.club.name)}</b><small>Mein Verein bearbeiten ›</small></span>
      </button>
      <div class="menu-col">
        <button class="primary big" data-act="friendly">Freundschaftsspiel</button>
        <button class="big" data-act="online">Zu zweit online</button>
        <button class="big" data-act="career">Karriere${this.app.career ? ' <small>(weiter)</small>' : ''}</button>
        <button data-act="saveScreen">Spielstand${this.app.sync && this.app.sync.code ? ` <small>(${this.app.sync.code})</small>` : ''}</button>
        <button data-act="settings">Einstellungen</button>
        <button data-act="help">Anleitung</button>
      </div>
      <p class="ver">Version ${CONFIG.version} · Etappe 6</p>`, 'main');
  }

  friendly() {
    this.screen = 'friendly';
    const s = this.app.settings;
    const teams = this.app.allTeams();
    this.pick = this.pick ?? 0;
    this.opp = this.opp ?? 1;
    if (this.opp === this.pick) this.opp = (this.pick + 1) % teams.length;
    const tbtn = (t, i, act, sel, dis) => `<button class="team-pick ${sel === i ? 'sel' : ''}" data-act="${act}" data-val="${i}" ${dis === i ? 'disabled' : ''}>
      <img src="${logoDataURL(t.logo, 48)}" alt="">${esc(t.name)}</button>`;
    this.show(`
      <h2>Freundschaftsspiel</h2>
      <div class="field-row"><label>Dein Team</label><div class="opts">${teams.map((t, i) => tbtn(t, i, 'pickTeam', this.pick, -1)).join('')}</div></div>
      <div class="field-row"><label>Gegner</label><div class="opts">${teams.map((t, i) => tbtn(t, i, 'pickOpp', this.opp, this.pick)).join('')}</div></div>
      <div class="field-row"><label>Schwierigkeit</label><div class="opts">${this.opts('difficulty', CONFIG.difficulty, s.difficulty)}</div></div>
      <p class="hint">3 Drittel à 20:00 Spielzeit (je 3 Minuten). Bei Unentschieden Verlängerung und Penaltyschiessen.</p>
      ${this.injuryNote(teams[this.pick])}
      <div class="menu-row">
        <button data-act="main">Zurück</button>
        <button class="primary big" data-act="start">Anpfiff!</button>
      </div>`);
  }

  injuryNote(team) {
    const inj = injuredPlayers(team);
    if (!inj.length) return '';
    return `<p class="injured">Verletzt: ${inj.map(p => `${p.firstName} ${p.lastName} (${INJURY_NAMES[p.injury.level]}, noch ${p.injury.games} ${p.injury.games === 1 ? 'Spiel' : 'Spiele'})`).join(', ')}</p>`;
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
      <div class="field-row"><label>Wechsel</label><div class="opts">${this.toggle('autoChange', s.autoChange, 'Linie automatisch wechseln')}</div></div>
      <div class="field-row"><label>Spielerwahl</label><div class="opts">${this.toggle('autoSwitch', s.autoSwitch !== false, 'Automatisch der Spieler am nächsten beim Ball')}</div></div>
      <div class="field-row"><label>Goalie</label><div class="opts">${this.toggle('autoGoalie', s.autoGoalie, 'Bei Schuss aufs eigene Tor automatisch übernehmen')}</div></div>
      <div class="field-row"><label>Ton</label><div class="opts">${this.toggle('sound', s.sound, 'Ton')}
        ${this.opts('volume', { '0.35': { label: 'Leise' }, '0.7': { label: 'Mittel' }, '1.0': { label: 'Laut' } }, String(s.volume))}</div></div>
      <div class="field-row"><label>Bewegung (PC)</label><div class="opts">
        ${this.opts('moveInput', { tastatur: { label: 'Tastatur' }, maus: { label: 'Maus (Joystick)' } }, s.moveInput)}</div></div>
      <div class="field-row"><label>Touch-Tasten</label><div class="opts">
        ${this.opts('touchSize', { klein: { label: 'Klein' }, normal: { label: 'Normal' }, gross: { label: 'Gross' } }, s.touchSize)}
        ${this.toggle('lefty', s.lefty, 'Linkshänder (Joystick rechts)')}</div></div>
      <p class="hint">Die Schwierigkeit gilt ab dem nächsten Spiel.</p>
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
            <tr><td><kbd>WASD</kbd> / <kbd>Pfeile</kbd></td><td>laufen – oder mit der Maus: in den Einstellungen «Bewegung (PC): Maus» wählen. Der Joystick steht unten rechts; zeige mit der Maus in die gewünschte Richtung (weiter weg = schneller, Mitte = stehen bleiben), ohne zu klicken</td></tr>
            <tr><td><kbd>Leertaste</kbd></td><td>Schuss – halten lädt auf (härter, aber ungenauer)</td></tr>
            <tr><td><kbd>Alt</kbd> (oder <kbd>X</kbd>)</td><td>Pass (in Laufrichtung)</td></tr>
            <tr><td><kbd>C</kbd></td><td>Bandenpass</td></tr>
            <tr><td><kbd>Shift</kbd></td><td>Sprint (kostet Ausdauer) · Goalie: Hechtsprung</td></tr>
            <tr><td><kbd>Y</kbd></td><td>anderen Spieler wählen (sonst automatisch der Nächste am Ball)</td></tr>
            <tr><td><kbd>G</kbd></td><td>Goalie übernehmen / abgeben</td></tr>
            <tr><td><kbd>Q</kbd></td><td>Linienwechsel</td></tr>
            <tr><td><kbd>P</kbd></td><td>Pause</td></tr>
          </table>
          <h3>Handy</h3>
          <p>Links der Joystick, rechts Schuss, Pass, Bande, Sprint und unten rechts «Wechsel» (anderen Spieler wählen). Oben Goalie, Linie, Vollbild, Pause.</p>
        </div>
        <div>
          <h3>Tipps</h3>
          <ul>
            <li><b>Direktschuss:</b> Schuss drücken, kurz bevor der Pass ankommt.</li>
            <li><b>Ball erobern:</b> ohne Ball nahe beim Gegner Schuss oder Pass drücken (Stockeinsatz).</li>
            <li>Mit Richtung nach oben/unten beim Schuss zielst du in die obere bzw. untere Torecke.</li>
            <li>Müde Spieler sind langsamer und schiessen ungenauer – rechtzeitig wechseln! Beim Linienwechsel gehen die Spieler nacheinander raus; der Neue kommt erst, wenn der Alte über der Bande ist.</li>
            <li><b>Auslage:</b> Schüsse auf die Seite, auf der die Kelle ist (Rückhand), sind ungenauer.</li>
            <li><b>Karriere:</b> 5 Ligen, Cup, Playoffs, Auf-/Abstieg. Geld für Halle, Sponsoren (Verträge für 1–3 Saisons), Transfers und Nachwuchs.</li>
            <li><b>Zu zweit online:</b> Eine Person eröffnet und schickt den Code (oder den Link), die andere tritt bei. Gegeneinander oder miteinander gegen den Computer. Online läuft das Spiel ohne Pause.</li>
            <li><b>Spielstand:</b> wird automatisch gespeichert. Unter «Spielstand» kannst du auf einem anderen Gerät weiterspielen: auf der Webseite mit einem Code (UH-XXXX-XXXX), als claude.ai-Artifact automatisch über dein Claude-Konto.</li>
            <li><b>Mein Verein:</b> Name, Trikots, Logo, Spieler (Aussehen, Schläger, Jubel), Aufstellung und Training. Der ★ Lieblingsspieler bekommt einen goldenen Schläger.</li>
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

  // Online: Menü während des Spiels (das Spiel läuft weiter)
  onlinePause() {
    this.screen = 'onlinePause';
    this.show(`
      <h2>Menü</h2>
      <p class="hint">Online läuft das Spiel weiter.</p>
      <div class="menu-col">
        <button class="primary big" data-act="onResume">Zurück ins Spiel</button>
        ${this.app.online && this.app.online.role === 'host' ? '<button data-act="onLobby">Abbrechen, zurück in die Lobby</button>' : ''}
        <button data-act="onLeave">Spiel verlassen</button>
      </div>`);
  }

  // waiting: Gast beim Online-Spiel (der Gastgeber pfeift weiter)
  intermission(match, waiting = false) {
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
      <div class="menu-row">${waiting ? '<p class="hint">Warte, bis der Gastgeber weiterspielt …</p>' : `<button class="primary big" data-act="nextPeriod">${btn}</button>`}</div>`, 'wide');
  }

  // online: 'host' oder 'guest' beim Spiel zu zweit
  end(match, healed = [], extra = '', career = false, online = null) {
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
      ${extra}
      <div class="menu-row">${career ? '<button class="primary big" data-act="careerNext">Weiter</button>' : online ? `
        <button data-act="onLeave">Verlassen</button>
        ${online === 'host' ? '<button class="primary big" data-act="onLobby">Zurück in die Lobby</button>' : '<span class="hint">Der Gastgeber kann ein neues Spiel starten.</span>'}` : `
        <button data-act="main">Hauptmenü</button>
        <button class="primary big" data-act="start">Revanche</button>`}
      </div>`, 'wide');
  }

  summary(m, healed) {
    const items = [];
    for (const l of m.rules.log) {
      const t = m.teams[l.team];
      items.push(`<li>✋ <b style="color:${t.data.colors.shirt}">${t.data.short}</b> 2 Min. ${teamName(l.player, t.data)} – ${FOUL_NAMES[l.type]}</li>`);
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
      const as = g.assist ? ` · Assist ${teamName(g.assist, t.data)}` : '';
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
      case 'pickTeam': this.pick = +val; this.friendly(); break;
      case 'pickOpp': this.opp = +val; this.friendly(); break;
      case 'start': app.startFriendly(this.pick ?? 0, this.opp ?? 1); break;
      case 'club': app.clubEditor.open(); break;
      case 'career': app.careerUI.start(); break;
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
      default: if (!app.onlineUI.onAction(act, val) && !app.careerUI.onAction(act, val) && !app.sync.onAction(act, val)) app.clubEditor.onAction(act, val); break;
    }
  }
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function clockText(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
