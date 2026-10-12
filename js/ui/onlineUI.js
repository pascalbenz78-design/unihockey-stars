// Bildschirme für «Zu zweit online»: Spiel eröffnen oder mit Code beitreten,
// Lobby (Spielart und Teams wählt der Gastgeber), danach das Match.

import { CONFIG } from '../config.js';
import { OnlineSession } from '../net/online.js';
import { cleanCode } from '../net/net.js';
import { chooseKits } from '../club/club.js';
import { logoDataURL } from '../club/logo.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MODES = { gegen: 'Gegeneinander', mit: 'Miteinander gegen den Computer' };

export class OnlineUI {
  constructor(app) {
    this.app = app;
    this.s = null;
    this.busy = false;
    this.error = '';
  }

  get menus() { return this.app.menus; }

  // Einstieg: eröffnen oder beitreten
  start(code = '') {
    this.menus.screen = 'online';
    this.error = this.error || '';
    this.menus.show(`
      <h2>Zu zweit online</h2>
      <p class="sub">Freundschaftsspiel mit einer Kollegin oder einem Kollegen – jedes auf seinem eigenen Gerät.</p>
      <div class="menu-col">
        <button class="primary big" data-act="onHost" ${this.busy ? 'disabled' : ''}>Spiel eröffnen</button>
      </div>
      <div class="field-row join-row"><label>Code</label>
        <input id="on-code" class="txt short" maxlength="4" autocomplete="off" spellcheck="false" placeholder="z. B. k7mq" value="${esc(code)}">
        <button data-act="onJoin" ${this.busy ? 'disabled' : ''}>Beitreten</button></div>
      ${this.busy ? '<p class="hint">Verbinde …</p>' : ''}
      ${this.error ? `<p class="err">${esc(this.error)}</p>` : ''}
      <p class="hint">Wer eröffnet, bekommt einen Code mit 4 Zeichen und stellt das Spiel ein: gegeneinander (jedes steuert ein Team)
        oder miteinander im selben Team gegen den Computer. Beide brauchen Internet; die Verbindung geht direkt von Gerät zu Gerät.
        Online-Spiele zählen nicht für den Verein (keine Verletzungen, kein Training).</p>
      <div class="menu-row"><button data-act="main">Zurück</button></div>`);
    const inp = document.getElementById('on-code');
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') this.onAction('onJoin'); });
  }

  async open(role, code) {
    if (this.busy) return;
    this.busy = true; this.error = '';
    this.start(code);
    const s = new OnlineSession(this.app, why => this.changed(why));
    try {
      await s.start(role, code);
      this.s = s;
      this.app.online = s;
      this.busy = false;
      this.lobby();
    } catch (e) {
      this.busy = false;
      this.error = e.message || String(e);
      try { await s.leave(); } catch (x) { /* egal */ }
      this.start(code);
    }
  }

  changed(why) {
    const s = this.s;
    if (!s) return;
    if (why === 'hostLobby') { this.app.leaveOnlineMatch(); this.lobby(); return; }
    if (this.menus.screen === 'lobby') this.lobby();
    if (why === 'peer' && this.app.mode === 'match') {
      this.app.hud.toast(s.connected ? 'Mitspieler wieder verbunden' : 'Mitspieler nicht mehr verbunden …', 3);
    }
  }

  lobby() {
    const s = this.s;
    if (!s) return this.start();
    this.menus.screen = 'lobby';
    const host = s.role === 'host';
    const other = s.other;
    const otherName = other ? esc(other.name || 'Mitspieler') : '';
    const status = other ? `<span class="ok">✓ ${otherName} ist verbunden</span>` : `<span class="wait">⏳ Warte auf ${host ? 'Mitspieler' : 'Gastgeber'} …</span>`;
    const link = host && s.p2p ? `${location.origin}${location.pathname}?zu-zweit=${s.code}` : '';
    let body;
    if (host) {
      const c = s.validCfg();
      const opts = s.teamOptions();
      const tb = (key, sel, dis) => opts.map(o => `<button class="team-pick ${sel === o.id ? 'sel' : ''}" data-act="onTeam" data-val="${key}:${o.id}" ${dis === o.id ? 'disabled' : ''}>
        <img src="${logoDataURL(o.data.logo, 40)}" alt="">${esc(o.label)}</button>`).join('');
      const vs = c.mode === 'gegen';
      body = `
        <div class="field-row"><label>Spielart</label><div class="opts">${Object.entries(MODES).map(([k, v]) =>
          `<button class="opt ${c.mode === k ? 'sel' : ''}" data-act="onMode" data-val="${k}">${v}</button>`).join('')}</div></div>
        <div class="field-row"><label>${vs ? 'Dein Team' : 'Euer Team'}</label><div class="opts">${tb('a', c.a, -1)}</div></div>
        <div class="field-row"><label>${vs ? 'Team Mitspieler' : 'Gegner'}</label><div class="opts">${tb('b', c.b, c.a)}</div></div>
        ${vs ? '' : `<div class="field-row"><label>Schwierigkeit</label><div class="opts">${Object.entries(CONFIG.difficulty).map(([k, d]) =>
          `<button class="opt ${c.diff === k ? 'sel' : ''}" data-act="onDiff" data-val="${k}">${d.label}</button>`).join('')}</div></div>`}
        <p class="hint">${vs ? 'Du spielst von links nach rechts, dein Mitspieler auf der anderen Seite.' : 'Ihr steuert beide je einen Spieler eures Teams (gelber und blauer Ring). Der Ball geht jeweils an den, der den Pass gespielt hat oder näher dran ist.'}</p>
        <div class="menu-row">
          <button data-act="onLeave">Verlassen</button>
          <button class="primary big" data-act="onKickoff" ${other && !s.pendingSid ? '' : 'disabled'}>${s.pendingSid ? 'Starte …' : 'Anpfiff!'}</button>
        </div>`;
    } else {
      const l = s.lob;
      body = `
        ${l ? `<div class="lob-info"><p><b>Spielart:</b> ${esc(MODES[l.mode] || l.mode)}</p>
          <p><b>${l.mode === 'gegen' ? 'Gastgeber' : 'Euer Team'}:</b> ${esc(l.a)} · <b>${l.mode === 'gegen' ? 'Du' : 'Gegner'}:</b> ${esc(l.b)}
          ${l.mode === 'gegen' ? '' : ` · <b>Schwierigkeit:</b> ${esc((CONFIG.difficulty[l.diff] || {}).label || l.diff)}`}</p></div>` : ''}
        <p class="hint">Der Gastgeber stellt das Spiel ein und pfeift an.</p>
        <div class="menu-row"><button data-act="onLeave">Verlassen</button></div>`;
    }
    this.menus.show(`
      <h2>Zu zweit online</h2>
      <div class="code-box"><span>Code</span><b>${esc(s.code.toUpperCase())}</b>
        ${host ? `<button data-act="onCopy" data-val="${esc(s.code)}">Code kopieren</button>` : ''}
        ${link ? `<button data-act="onCopy" data-val="${esc(link)}">Link kopieren</button>` : ''}</div>
      <p class="lob-status">${status}</p>
      ${body}`, 'wide');
  }

  copy(text) {
    const done = () => this.app.hud.toast('Kopiert', 1.5);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => this.app.hud.toast(text, 4));
    else this.app.hud.toast(text, 4);
  }

  async leave() {
    const s = this.s;
    this.s = null;
    this.app.online = null;
    if (s) await s.leave();
  }

  onAction(act, val) {
    const s = this.s;
    switch (act) {
      case 'online': this.error = ''; if (this.s) this.lobby(); else this.start(); return true;
      case 'onHost': this.open('host'); return true;
      case 'onJoin': {
        const code = cleanCode((document.getElementById('on-code') || {}).value);
        if (code.length !== 4) { this.error = 'Bitte den Code mit 4 Zeichen eingeben.'; this.start(code); return true; }
        this.open('guest', code);
        return true;
      }
      case 'onCopy': this.copy(val); return true;
      case 'onLeave': this.leave().then(() => this.app.toMenu()); return true;
      case 'onMode': if (s) { s.setCfg({ mode: val }); this.lobby(); } return true;
      case 'onDiff': if (s) { s.setCfg({ diff: val }); this.lobby(); } return true;
      case 'onTeam': {
        if (!s) return true;
        const [k, id] = val.split(':');
        s.cfg[k] = id;
        if (k === 'b') s.bPicked = true;
        if (k === 'a' && s.cfg.b === id) s.cfg.b = null;
        s.setCfg({});
        this.lobby();
        return true;
      }
      case 'onKickoff': {
        if (!s || !s.connected) return true;
        const opts = s.teamOptions();
        const a = opts.find(o => o.id === s.cfg.a).data, b = opts.find(o => o.id === s.cfg.b).data;
        s.kickoff(chooseKits(a, b));
        this.lobby();
        return true;
      }
      case 'onLobby': this.app.leaveOnlineMatch(); if (s && s.role === 'host') s.backToLobby(); this.lobby(); return true;
      case 'onResume': this.menus.hide(); return true;
      default: return false;
    }
  }
}
