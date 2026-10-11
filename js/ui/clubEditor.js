// Vereins-Editor: Verein (Name, Kürzel, Trikots), Logo, Spieler (Name,
// Nummer, Position, Auslage, Schläger, Aussehen, Jubel, Lieblingsspieler),
// Aufstellung per Drag & Drop und Training.

import { SHAPES, SYMBOLS, logoDataURL, drawLogo } from '../club/logo.js';
import { SKIN_TONES, HAIR_COLORS, HAIR_STYLES, STICK_COLORS, GOLD } from '../club/looks.js';
import { CELEBRATIONS } from '../club/celebrations.js';
import { FOCI, INTENSITY, STAT_NAMES, SKATER_STATS, GOALIE_STATS, overall } from '../club/training.js';
import { INJURY_NAMES } from '../match/rules.js';
import { playerById } from '../club/club.js';
import { shortName } from '../club/names.js';

const POS = { C: 'Center', F: 'Flügel', D: 'Verteidiger', G: 'Goalie' };
const KIT_FIELDS = { shirt: 'Trikot', shirt2: 'Akzent', shorts: 'Hose', socks: 'Stulpen', number: 'Nummer', goalie: 'Goalie' };
const TABS = { verein: 'Verein', logo: 'Logo', spieler: 'Spieler', aufstellung: 'Aufstellung', training: 'Training' };
const SLOT_POS = { C: 'C', LW: 'F', RW: 'F', LD: 'D', RD: 'D' };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class ClubEditor {
  constructor(app) {
    this.app = app;
    this.tab = 'verein';
    this.playerId = null;
  }

  get club() { return this.app.club; }
  get el() { return this.app.menus.el; }
  save() { this.app.saveClub(); }

  open(tab, back = 'main') {
    if (tab) this.tab = tab;
    this.backAct = back;
    this.playerId = null;
    this.render();
  }

  render() {
    const c = this.club;
    const head = `
      <div class="club-head">
        <img class="club-logo" src="${logoDataURL(c.logo, 112)}" alt="">
        <div><h2>${esc(c.name)}</h2><span class="hint">${esc(c.short)} · Bilanz ${c.record.won} Siege, ${c.record.lost} Niederlagen</span></div>
      </div>
      <div class="tabs">${Object.entries(TABS).map(([k, v]) =>
        `<button class="tab ${this.tab === k ? 'sel' : ''}" data-act="ctab" data-val="${k}">${v}</button>`).join('')}</div>`;
    const body = this[`tab_${this.tab}`]();
    this.app.menus.show(`${head}<div class="tab-body">${body}</div>
      <div class="menu-row"><button class="primary" data-act="${this.backAct || 'main'}">Fertig</button></div>`, 'wide club');
    this.app.menus.screen = 'club';
    this.bind();
  }

  // ------------------------------------------------------------ Verein

  tab_verein() {
    const c = this.club;
    const kitCol = kit => `
      <div class="kit-col">
        <h3>${kit === 'home' ? 'Heimtrikot' : 'Auswärtstrikot'}</h3>
        <canvas class="kit-prev" data-kitprev="${kit}" width="120" height="120"></canvas>
        <div class="color-grid">${Object.entries(KIT_FIELDS).map(([k, v]) =>
          `<label>${v}<input type="color" data-kit="${kit}.${k}" value="${c.kits[kit][k]}"></label>`).join('')}</div>
      </div>`;
    return `
      <div class="field-row"><label>Vereinsname</label><input class="txt" data-field="name" maxlength="28" value="${esc(c.name)}"></div>
      <div class="field-row"><label>Kürzel</label><input class="txt short" data-field="short" maxlength="4" value="${esc(c.short)}"></div>
      <div class="kits">${kitCol('home')}${kitCol('away')}</div>
      <p class="hint">Der Gast zieht automatisch das Auswärtstrikot an, wenn die Farben zu ähnlich sind.</p>
      <div class="field-row"><label>Lieblingsspieler</label><div class="opts">
        <button class="toggle ${c.goldStick ? 'on' : ''}" data-act="cgold">Goldener Schläger für den Lieblingsspieler<span>${c.goldStick ? 'An' : 'Aus'}</span></button></div></div>`;
  }

  // ------------------------------------------------------------ Logo

  tab_logo() {
    const L = this.club.logo;
    const symIcon = k => logoDataURL({ shape: 'circle', bg: '#2a3443', border: '#2a3443', symbol: k, symbolColor: '#ffffff', initials: '', textColor: '#fff' }, 48);
    return `
      <div class="logo-edit">
        <canvas class="logo-big" width="200" height="200"></canvas>
        <div class="logo-form">
          <div class="field-row"><label>Form</label><div class="opts">${Object.entries(SHAPES).map(([k, v]) =>
            `<button class="opt ${L.shape === k ? 'sel' : ''}" data-act="clogo" data-val="shape:${k}">${v}</button>`).join('')}</div></div>
          <div class="field-row"><label>Farben</label><div class="color-grid">
            <label>Fläche<input type="color" data-logo="bg" value="${L.bg}"></label>
            <label>Rand<input type="color" data-logo="border" value="${L.border}"></label>
            <label>Symbol<input type="color" data-logo="symbolColor" value="${L.symbolColor}"></label>
            <label>Schrift<input type="color" data-logo="textColor" value="${L.textColor}"></label></div></div>
          <div class="field-row"><label>Initialen</label><input class="txt short" data-logo="initials" maxlength="3" value="${esc(L.initials)}"></div>
        </div>
      </div>
      <h3>Symbol</h3>
      <div class="sym-grid">${Object.entries(SYMBOLS).map(([k, v]) =>
        `<button class="sym ${L.symbol === k ? 'sel' : ''}" data-act="clogo" data-val="symbol:${k}"><img src="${symIcon(k)}" alt=""><span>${v}</span></button>`).join('')}</div>`;
  }

  // ------------------------------------------------------------ Spieler

  tab_spieler() {
    if (this.playerId) return this.playerDetail(playerById(this.club, this.playerId));
    const c = this.club;
    const order = { G: 0, D: 1, F: 2, C: 3 };
    const ps = [...c.players].sort((a, b) => order[b.pos] - order[a.pos] || a.number - b.number);
    return `<p class="hint">Antippen zum Bearbeiten. ★ = Lieblingsspieler.</p>
      <table class="plist">
        <tr><th></th><th>#</th><th>Name</th><th>Position</th><th>Alter</th><th>Stärke</th><th>Auslage</th><th></th></tr>
        ${ps.map(p => `<tr data-act="cplayer" data-val="${p.id}">
          <td class="fav">${c.favorite === p.id ? '★' : ''}</td><td>${p.number}</td>
          <td><b>${esc(p.firstName)} ${esc(p.lastName)}</b></td><td>${POS[p.pos]}</td><td>${p.age}</td>
          <td><span class="ovr">${overall(p)}</span></td><td>${p.pos === 'G' ? '–' : p.stickSide === 'L' ? 'Links' : 'Rechts'}</td>
          <td class="injured">${p.injury && p.injury.games > 0 ? `🩹 ${p.injury.games}` : ''}</td></tr>`).join('')}
      </table>`;
  }

  playerDetail(p) {
    const c = this.club;
    const isG = p.pos === 'G';
    const sw = (key, list, cur) => `<div class="swatches">${list.map(col =>
      `<button class="sw ${col === cur ? 'sel' : ''}" style="background:${col}" data-act="cpset" data-val="${key}:${col}" aria-label="${col}"></button>`).join('')}
      <input type="color" data-pfield="${key}" value="${cur}"></div>`;
    const stats = (isG ? GOALIE_STATS : SKATER_STATS).map(k => {
      const v = p.stats[k];
      const prog = p.progress && p.progress[k] ? Math.round(p.progress[k] * 100) : 0;
      return `<div class="stat"><span>${STAT_NAMES[k]}</span><span class="bar"><i style="width:${v}%"></i><b style="width:${prog}%"></b></span><em>${v}</em></div>`;
    }).join('');
    const inj = p.injury && p.injury.games > 0 ? `<p class="injured">🩹 Verletzt (${INJURY_NAMES[p.injury.level]}), noch ${p.injury.games} ${p.injury.games === 1 ? 'Spiel' : 'Spiele'}</p>` : '';
    return `
      <div class="menu-row left"><button data-act="cplist">← Alle Spieler</button></div>
      <div class="pdetail">
        <div class="pport"><canvas class="portrait" width="150" height="190"></canvas>
          <button class="fav-btn ${c.favorite === p.id ? 'on' : ''}" data-act="cfav">★ Lieblingsspieler</button></div>
        <div class="pform">
          <div class="field-row"><label>Vorname</label><input class="txt" data-pfield="firstName" maxlength="16" value="${esc(p.firstName)}"></div>
          <div class="field-row"><label>Nachname</label><input class="txt" data-pfield="lastName" maxlength="18" value="${esc(p.lastName)}"></div>
          <div class="field-row"><label>Nummer</label><input class="txt short" type="number" min="1" max="99" data-pfield="number" value="${p.number}"><span class="hint num-hint"></span></div>
          <div class="field-row"><label>Alter</label><span>${p.age} Jahre</span></div>
          <div class="field-row"><label>Position</label><div class="opts">${isG ? '<span>Goalie</span>' : ['C', 'F', 'D'].map(k =>
            `<button class="opt ${p.pos === k ? 'sel' : ''}" data-act="cpset" data-val="pos:${k}">${POS[k]}</button>`).join('')}</div></div>
          ${isG ? '' : `<div class="field-row"><label>Auslage</label><div class="opts">
            <button class="opt ${p.stickSide === 'L' ? 'sel' : ''}" data-act="cpset" data-val="stickSide:L">Links</button>
            <button class="opt ${p.stickSide === 'R' ? 'sel' : ''}" data-act="cpset" data-val="stickSide:R">Rechts</button>
            <span class="hint">Schüsse auf die Kellenseite sind Rückhand: ungenauer und schwächer.</span></div></div>
          <div class="field-row"><label>Schaft</label>${sw('stick.shaft', STICK_COLORS, p.stick.shaft)}</div>
          <div class="field-row"><label>Kelle</label>${sw('stick.blade', STICK_COLORS, p.stick.blade)}</div>`}
          <div class="field-row"><label>Haut</label>${sw('look.skin', SKIN_TONES, p.look.skin)}</div>
          <div class="field-row"><label>Haare</label>${sw('look.hair', HAIR_COLORS, p.look.hair)}</div>
          ${isG ? '' : `<div class="field-row"><label>Frisur</label><div class="opts">${Object.entries(HAIR_STYLES).map(([k, v]) =>
            `<button class="opt ${p.look.hairStyle === k ? 'sel' : ''}" data-act="cpset" data-val="look.hairStyle:${k}">${v}</button>`).join('')}</div></div>
          <div class="field-row"><label>Jubel</label><select data-pfield="celebration">${CELEBRATIONS.map(x =>
            `<option value="${x.id}" ${x.id === (p.celebration || 0) ? 'selected' : ''}>${x.name}</option>`).join('')}</select></div>`}
          ${inj}
          <h3>Werte <small class="hint">(heller Balken = Trainingsfortschritt zum nächsten Punkt)</small></h3>
          <div class="stats-grid">${stats}</div>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------ Aufstellung

  slotId(key) {
    const c = this.club;
    if (key[0] === 'L') { const [l, r] = key.slice(1).split('.'); return c.lines[+l][r]; }
    if (key[0] === 'G') return c.goalies[+key.slice(1)];
    if (key[0] === 'R') return (c.reserve || [])[+key.slice(1)];
    return c.subs[+key.slice(1)];
  }

  setSlot(key, id) {
    const c = this.club;
    if (key[0] === 'L') { const [l, r] = key.slice(1).split('.'); c.lines[+l][r] = id; }
    else if (key[0] === 'G') c.goalies[+key.slice(1)] = id;
    else if (key[0] === 'R') c.reserve[+key.slice(1)] = id;
    else c.subs[+key.slice(1)] = id;
  }

  card(key, label) {
    const p = playerById(this.club, this.slotId(key));
    if (!p) return `<div class="slot empty" data-slot="${key}"><small>${label}</small></div>`;
    const slotRole = key[0] === 'L' ? key.split('.')[1] : null;
    const mismatch = slotRole && SLOT_POS[slotRole] !== p.pos;
    const inj = p.injury && p.injury.games > 0;
    return `<div class="slot pcard ${inj ? 'inj' : ''}" data-slot="${key}">
      <small>${label}${mismatch ? ' ⚠' : ''}</small>
      <b>${this.club.favorite === p.id ? '★ ' : ''}${p.number} ${esc(shortName(p, this.club.players))}</b>
      <span>${POS[p.pos]} · ${overall(p)}${inj ? ' · 🩹' : ''}</span></div>`;
  }

  tab_aufstellung() {
    const lines = [0, 1, 2].map(l => `
      <div class="line"><h3>Linie ${l + 1}</h3>
        <div class="formation">
          ${this.card(`L${l}.LW`, 'Flügel L')}${this.card(`L${l}.C`, 'Center')}${this.card(`L${l}.RW`, 'Flügel R')}
          ${this.card(`L${l}.LD`, 'Vert. L')}<div class="spacer"></div>${this.card(`L${l}.RD`, 'Vert. R')}
        </div></div>`).join('');
    return `<p class="hint">Spieler mit Finger oder Maus auf einen anderen Platz ziehen, um zu tauschen. ⚠ = nicht auf der eigenen Position.
      Verletzte (🩹) werden im Spiel automatisch ersetzt.</p>
      <div class="lines">${lines}</div>
      <div class="lines two"><div class="line"><h3>Goalies</h3><div class="formation g">${this.card('G0', 'Stammgoalie')}${this.card('G1', 'Ersatzgoalie')}</div></div>
      <div class="line"><h3>Ersatz</h3><div class="formation g">${this.card('S0', 'Ersatz')}${this.card('S1', 'Ersatz')}${this.card('S2', 'Ersatz')}</div></div></div>
      ${(this.club.reserve || []).length ? `<div class="line"><h3>Reserve <small class="hint">(spielt nur, wenn jemand ausfällt)</small></h3><div class="formation r">${this.club.reserve.map((_, i) => this.card(`R${i}`, 'Reserve')).join('')}</div></div>` : ''}`;
  }

  swap(a, b) {
    const ia = this.slotId(a), ib = this.slotId(b);
    const pa = playerById(this.club, ia), pb = playerById(this.club, ib);
    const gSlot = k => k[0] === 'G';
    const ok = (p, k) => !p || (gSlot(k) ? p.pos === 'G' : p.pos !== 'G');
    if (!ok(pa, b) || !ok(pb, a)) { this.app.hud.toast('Goalies nur auf Goalie-Plätze, Feldspieler nur aufs Feld', 2.5); this.render(); return; }
    this.setSlot(a, ib); this.setSlot(b, ia);
    this.save();
    this.render();
  }

  bindDrag() {
    this.el.querySelectorAll('.pcard[data-slot]').forEach(card => {
      card.addEventListener('pointerdown', e => {
        e.preventDefault();
        const ghost = card.cloneNode(true);
        ghost.classList.add('ghost');
        document.body.appendChild(ghost);
        const place = ev => { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; };
        place(e);
        card.classList.add('dragging');
        let over = null;
        const move = ev => {
          place(ev);
          const t = document.elementFromPoint(ev.clientX, ev.clientY);
          const s = t && t.closest('[data-slot]');
          if (over && over !== s) over.classList.remove('over');
          over = s && s !== card ? s : null;
          if (over) over.classList.add('over');
        };
        const up = ev => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          ghost.remove();
          card.classList.remove('dragging');
          const t = document.elementFromPoint(ev.clientX, ev.clientY);
          const s = t && t.closest('[data-slot]');
          if (s && s !== card) this.swap(card.dataset.slot, s.dataset.slot);
          else if (over) over.classList.remove('over');
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
    });
  }

  // ------------------------------------------------------------ Training

  tab_training() {
    const c = this.club, t = c.training;
    const rep = c.lastReport;
    let report = '<p class="hint">Noch kein Training durchgeführt.</p>';
    if (rep) {
      const imp = rep.improved.map(x => {
        const p = playerById(c, x.id);
        return p ? `<li>📈 ${esc(p.firstName)} ${esc(p.lastName)}: ${STAT_NAMES[x.stat]} ${x.value}</li>` : '';
      }).join('');
      const inj = rep.injured.map(x => {
        const p = playerById(c, x.id);
        return p ? `<li class="injured">🩹 ${esc(p.firstName)} ${esc(p.lastName)} im Training verletzt (${INJURY_NAMES[x.level]}, ${x.games} ${x.games === 1 ? 'Spiel' : 'Spiele'})</li>` : '';
      }).join('');
      report = imp || inj ? `<ul class="sum-list">${imp}${inj}</ul>` : '<p class="hint">Letztes Training: noch keine Verbesserung (das braucht ein paar Spiele).</p>';
    }
    return `
      <p class="hint">Trainiert wird automatisch nach jedem Spiel deines Vereins. Junge Spieler verbessern sich schneller.</p>
      <div class="field-row"><label>Schwerpunkt</label><div class="opts">${Object.entries(FOCI).map(([k, v]) =>
        `<button class="opt ${t.focus === k ? 'sel' : ''}" data-act="ctrain" data-val="focus:${k}">${v.label}</button>`).join('')}</div></div>
      <div class="field-row"><label>Intensität</label><div class="opts">${Object.entries(INTENSITY).map(([k, v]) =>
        `<button class="opt ${t.intensity === k ? 'sel' : ''}" data-act="ctrain" data-val="intensity:${k}">${v.label}</button>`).join('')}</div></div>
      <p class="hint">Locker: wenig Fortschritt, kein Verletzungsrisiko · Normal: kleines Risiko · Hart: schneller Fortschritt, aber deutlich mehr Verletzungen.</p>
      <h3>Letztes Training</h3>${report}`;
  }

  // ------------------------------------------------------------ Ereignisse

  onAction(act, val) {
    const c = this.club;
    switch (act) {
      case 'ctab': this.tab = val; this.playerId = null; this.render(); return true;
      case 'cgold': c.goldStick = !c.goldStick; this.save(); this.render(); return true;
      case 'clogo': { const [k, v] = val.split(':'); c.logo[k] = v; this.save(); this.render(); return true; }
      case 'cplayer': this.playerId = +val; this.render(); this.el.querySelector('.panel').scrollTop = 0; return true;
      case 'cplist': this.playerId = null; this.render(); return true;
      case 'cfav': c.favorite = c.favorite === this.playerId ? null : this.playerId; this.save(); this.render(); return true;
      case 'cpset': {
        const p = playerById(c, this.playerId);
        const i = val.indexOf(':');
        this.setPath(p, val.slice(0, i), val.slice(i + 1));
        this.save(); this.render(); return true;
      }
      case 'ctrain': { const [k, v] = val.split(':'); c.training[k] = v; this.save(); this.render(); return true; }
      default: return false;
    }
  }

  setPath(obj, path, v) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = v;
  }

  bind() {
    const root = this.el, c = this.club;
    // Vereinsdaten
    root.querySelectorAll('[data-field]').forEach(inp => inp.addEventListener('input', () => {
      let v = inp.value;
      if (inp.dataset.field === 'short') { v = v.toUpperCase().replace(/[^A-Z0-9ÄÖÜ]/g, ''); inp.value = v; if (!v) return; }
      if (!v.trim()) return;
      c[inp.dataset.field] = v;
      this.save();
      root.querySelector('.club-head h2').textContent = c.name;
    }));
    root.querySelectorAll('[data-kit]').forEach(inp => inp.addEventListener('input', () => {
      const [kit, k] = inp.dataset.kit.split('.');
      c.kits[kit][k] = inp.value;
      this.save();
      this.drawKits();
    }));
    this.drawKits();
    // Logo
    root.querySelectorAll('[data-logo]').forEach(inp => inp.addEventListener('input', () => {
      c.logo[inp.dataset.logo] = inp.dataset.logo === 'initials' ? inp.value.toUpperCase().slice(0, 3) : inp.value;
      this.save();
      this.drawLogoPreview();
    }));
    this.drawLogoPreview();
    // Spieler
    root.querySelectorAll('[data-pfield]').forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      const p = playerById(c, this.playerId);
      const f = inp.dataset.pfield;
      if (f === 'number') {
        const n = Math.round(+inp.value);
        const hint = root.querySelector('.num-hint');
        if (!(n >= 1 && n <= 99)) { hint.textContent = '1 bis 99'; return; }
        const other = c.players.find(x => x.number === n && x !== p);
        if (other) { hint.textContent = `vergeben (${other.lastName})`; return; }
        hint.textContent = '';
        p.number = n;
      } else if (f === 'celebration') p.celebration = +inp.value;
      else if (f.includes('.')) this.setPath(p, f, inp.value);
      else { if (!inp.value.trim()) return; p[f] = inp.value; }
      this.save();
      this.drawPortrait();
    }));
    this.drawPortrait();
    if (this.tab === 'aufstellung') this.bindDrag();
  }

  drawLogoPreview() {
    const cv = this.el.querySelector('.logo-big');
    const img = this.el.querySelector('.club-logo');
    if (img) img.src = logoDataURL(this.club.logo, 112);
    if (!cv) return;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    drawLogo(g, this.club.logo, 100, 100, 180);
  }

  drawKits() {
    this.el.querySelectorAll('[data-kitprev]').forEach(cv => {
      drawShirt(cv.getContext('2d'), this.club.kits[cv.dataset.kitprev], 10, this.club.logo, 60, 60, 1);
    });
  }

  drawPortrait() {
    const cv = this.el.querySelector('.portrait');
    if (!cv || !this.playerId) return;
    const p = playerById(this.club, this.playerId);
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    const gold = this.club.goldStick && this.club.favorite === p.id;
    const kit = this.club.kits.home;
    const isG = p.pos === 'G';
    // Schläger hinter dem Körper
    if (!isG) {
      const side = p.stickSide === 'L' ? -1 : 1;
      g.lineCap = 'round';
      g.strokeStyle = gold ? GOLD : p.stick.shaft; g.lineWidth = 7;
      g.beginPath(); g.moveTo(75 - side * 25, 95); g.lineTo(75 + side * 45, 182); g.stroke();
      g.strokeStyle = gold ? GOLD : p.stick.blade; g.lineWidth = 11;
      g.beginPath(); g.moveTo(75 + side * 42, 180); g.lineTo(75 + side * 68, 178); g.stroke();
    }
    drawShirt(g, isG ? { ...kit, shirt: kit.goalie } : kit, p.number, this.club.logo, 75, 125, 0.95);
    // Kopf
    const hx = 75, hy = 52;
    g.fillStyle = p.look.skin;
    g.beginPath(); g.arc(hx, hy, 24, 0, Math.PI * 2); g.fill();
    g.fillStyle = p.look.hair;
    const st = isG ? 'helm' : p.look.hairStyle;
    if (st === 'helm') {
      g.fillStyle = kit.goalie; g.beginPath(); g.arc(hx, hy, 27, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#222'; g.lineWidth = 2;
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(hx + i * 7, hy - 8); g.lineTo(hx + i * 7, hy + 18); g.stroke(); }
      g.beginPath(); g.moveTo(hx - 18, hy + 2); g.lineTo(hx + 18, hy + 2); g.stroke();
    } else if (st === 'kurz' || st === 'lang' || st === 'locken') {
      g.beginPath(); g.arc(hx, hy - 4, 25, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fill();
      if (st === 'lang') { g.fillRect(hx - 26, hy - 6, 9, 30); g.fillRect(hx + 17, hy - 6, 9, 30); }
      if (st === 'locken') for (let i = 0; i < 8; i++) { const a = Math.PI + (i / 7) * Math.PI; g.beginPath(); g.arc(hx + Math.cos(a) * 24, hy - 4 + Math.sin(a) * 22, 7, 0, Math.PI * 2); g.fill(); }
    } else if (st === 'irokese') {
      g.fillRect(hx - 5, hy - 34, 10, 18);
    }
    if (!isG) {
      g.fillStyle = '#222';
      g.beginPath(); g.arc(hx - 8, hy + 2, 2.6, 0, Math.PI * 2); g.arc(hx + 8, hy + 2, 2.6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7a3b2e'; g.lineWidth = 2;
      g.beginPath(); g.arc(hx, hy + 9, 7, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    }
  }
}

// Trikot (vorne) als kleine Zeichnung
export function drawShirt(g, kit, number, logo, x, y, s) {
  g.save();
  g.translate(x, y); g.scale(s, s);
  if (g.canvas.dataset.kitprev) g.clearRect(-60 / s, -60 / s, 120 / s, 120 / s);
  g.fillStyle = kit.shirt; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-22, -48); g.lineTo(-48, -36); g.lineTo(-56, -10); g.lineTo(-38, -4); g.lineTo(-36, 40);
  g.lineTo(36, 40); g.lineTo(38, -4); g.lineTo(56, -10); g.lineTo(48, -36); g.lineTo(22, -48);
  g.quadraticCurveTo(0, -36, -22, -48);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = kit.shirt2;
  g.fillRect(-36, 26, 72, 6);
  g.beginPath(); g.moveTo(-48, -36); g.lineTo(-56, -10); g.lineTo(-50, -8); g.lineTo(-43, -32); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(48, -36); g.lineTo(56, -10); g.lineTo(50, -8); g.lineTo(43, -32); g.closePath(); g.fill();
  if (logo) drawLogo(g, logo, -14, -20, 22);
  g.fillStyle = kit.number; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(number), 10, 4);
  g.fillStyle = kit.shorts; g.fillRect(-34, 40, 68, 16);
  g.restore();
}
