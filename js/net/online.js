// Online zu zweit: Lobby, Übertragung der Mannschaften und Spiel.
// Der Gastgeber rechnet das Match und schickt ~20 Schnappschüsse pro Sekunde;
// der Gast schickt nur seine Eingaben und zeigt das Spiel leicht verzögert
// (weich zwischen zwei Schnappschüssen) an.
//
// Präsenz-Felder (beide Geräte): app, role, name, ph (Phase: lobby | setup | match)
//   Gast:       ck (eigener Verein in Stücken), got (Spiel-Setup erhalten), in (Eingabe)
//   Gastgeber:  lob (Einstellungen zum Anzeigen), gotClub, sid + tx (Spiel-Setup in Stücken), s (Schnappschuss)

import { connectRoomProvider, makeCode, packText, unpackText } from './net.js';
import { encodeSnapshot, applySnapshot, EventLog, deserValue, InputEncoder, InputDecoder, splitText, ChunkReceiver } from './sync.js';

const APP = 'uhs1';
const SNAP_MS = 50;          // Gastgeber: Schnappschuss alle 50 ms
const DELAY = 0.12;          // Gast: so viel Sekunden hinter dem neuesten Schnappschuss anzeigen
const LOST_MS = 2500;        // so lange ohne Daten = Verbindung unterbrochen
const rid = () => Math.random().toString(36).slice(2, 8);

export class OnlineSession {
  constructor(app, onChange) {
    this.app = app;
    this.onChange = onChange || (() => {});
    this.role = null;
    this.code = '';
    this.conn = null;
    this.p2p = true;
    this.other = null;            // Präsenz des anderen Geräts
    this.otherSeen = 0;
    this.cfg = { mode: 'gegen', a: 'h', b: 'g', diff: 'mittel' };
    this.guestClub = null;
    this.timers = [];
  }

  get connected() { return !!this.other; }

  async start(role, code) {
    const { room, p2p } = await connectRoomProvider();
    if (!room) throw new Error('Zu zweit spielen geht hier nicht (kein Live-Raum verfügbar).');
    this.p2p = p2p;
    this.role = role;
    this.code = role === 'host' ? makeCode() : code;
    this.conn = await room.join('uhs-' + this.code, role === 'host');
    this.unsub = this.conn.onPeers(ch => this.onPeers(ch.peers));
    this.set({ app: APP, role, name: this.app.club.name.slice(0, 40), ph: 'lobby' });
    if (role === 'guest') this.sendClub();
    else this.publishLobby();
  }

  set(patch) {
    if (!this.conn) return;
    this.conn.presence(patch).catch(e => console.warn('Präsenz', e));
  }

  every(ms, fn) { const t = setInterval(fn, ms); this.timers.push(t); return t; }
  stop(t) { clearInterval(t); this.timers = this.timers.filter(x => x !== t); }

  onPeers(peers) {
    const want = this.role === 'host' ? 'guest' : 'host';
    const o = peers.find(p => !p.isMe && p.presence && p.presence.app === APP && p.presence.role === want);
    const was = !!this.other;
    this.other = o ? o.presence : null;
    if (o) this.otherSeen = performance.now();
    if (this.role === 'host') this.hostPeers(); else this.guestPeers();
    if (was !== !!this.other) this.onChange('peer');
  }

  // ------------------------------------------------------------ Gastgeber

  hostPeers() {
    const o = this.other;
    if (!o) return;
    // Verein des Gasts zusammensetzen
    if (o.ck && (!this.guestClub || this.guestClubId !== o.ck[0])) {
      this.clubRx = this.clubRx || new ChunkReceiver();
      const text = this.clubRx.add(o.ck);
      if (text && this.clubRxDone !== o.ck[0]) {
        this.clubRxDone = o.ck[0];
        unpackText(text).then(t => {
          this.guestClub = JSON.parse(t);
          this.guestClubId = o.ck[0];
          if (this.cfg.mode === 'gegen' && !this.bPicked) this.cfg.b = 'g';   // Gast spielt mit seinem Verein
          this.set({ gotClub: o.ck[0] });
          this.publishLobby();
          this.onChange('club');
        }).catch(e => console.warn('Verein des Gasts', e));
      }
    }
    if (this.pendingSid && o.got === this.pendingSid) {
      const setup = this.pendingSetup;
      this.pendingSid = null;
      this.stop(this.txTimer);
      this.set({ tx: null, ph: 'match' });
      this.app.startOnlineMatch(setup);
    }
  }

  // Wählbare Teams: eigener Verein, Verein des Gasts, die zwei Standardteams
  teamOptions() {
    const app = this.app;
    const out = [{ id: 'h', data: app.allTeams()[0], label: app.club.name }];
    if (this.guestClub) out.push({ id: 'g', data: this.guestClub, label: `${this.guestClub.name} (Gast)` });
    app.teams.forEach((t, i) => out.push({ id: 'd' + i, data: t, label: t.name }));
    return out;
  }

  validCfg() {
    const ids = this.teamOptions().map(o => o.id);
    const c = this.cfg;
    if (!ids.includes(c.a)) c.a = 'h';
    if (!ids.includes(c.b) || c.b === c.a) c.b = ids.find(id => id !== c.a && (c.mode === 'gegen' ? id === 'g' : id[0] === 'd')) || ids.find(id => id !== c.a);
    return c;
  }

  setCfg(patch) {
    Object.assign(this.cfg, patch);
    if (patch.mode) { this.cfg.a = 'h'; this.cfg.b = patch.mode === 'gegen' ? 'g' : 'd0'; }
    this.publishLobby();
  }

  publishLobby() {
    const c = this.validCfg();
    const name = id => (this.teamOptions().find(o => o.id === id) || {}).label || '?';
    this.set({ lob: { mode: c.mode, a: name(c.a), b: name(c.b), diff: c.diff } });
  }

  // Anpfiff: Setup in Stücken senden, bis der Gast es bestätigt
  async kickoff(teams) {
    const c = this.validCfg();
    const setup = {
      teams, mode: c.mode, humans: c.mode === 'gegen' ? [0, 1] : [0, 0], diff: c.mode === 'gegen' ? 'mittel' : c.diff,
      settings: { autoChange: !!this.app.settings.autoChange, autoGoalie: !!this.app.settings.autoGoalie },
    };
    const parts = splitText(await packText(JSON.stringify(setup)));
    const sid = rid();
    this.pendingSid = sid;
    this.pendingSetup = setup;
    let i = 0;
    const send = () => {
      const a = i % parts.length, b = (i + 1) % parts.length;
      this.set({ ph: 'setup', sid, tx: [sid, parts.length, a, parts[a], b, parts[b]] });
      i += 2;
    };
    send();
    this.stop(this.txTimer);
    this.txTimer = this.every(120, send);
  }

  backToLobby() {
    this.set({ ph: 'lobby', s: null });
    this.log = null;
  }

  // Pro Bild vor dem Rechnen: Eingabe des Gasts übernehmen
  applyGuestInput(m) {
    const o = this.other;
    const h = m.humans[1];
    if (!h) return;
    if (!o || !o.in) { h.setInput({ mx: 0, my: 0, sprint: false, shootHeld: false }, {}); return; }
    if (o.in === this.lastIn) return;
    this.lastIn = o.in;
    this.dec = this.dec || new InputDecoder();
    const r = this.dec.decode(o.in);
    if (!r) return;
    if (r.pressed.skip && (m.state === 'replay' || m.state === 'celebrate')) m.skip();
    h.setInput(r.state, r.pressed);
  }

  logEvent(m, e) { (this.log = this.log || new EventLog()).add(m, e); }

  // Nach dem Rechnen: Schnappschuss senden (gedrosselt)
  afterStep(m) {
    const now = performance.now();
    if (now - (this.lastSnap || 0) < SNAP_MS) return;
    this.lastSnap = now;
    this.set({ s: encodeSnapshot(m, this.log) });
  }

  // ------------------------------------------------------------ Gast

  async sendClub() {
    const parts = splitText(await packText(JSON.stringify(this.app.allTeams()[0])));
    const id = rid();
    let i = 0;
    const t = this.every(200, () => {
      if (this.other && this.other.gotClub === id) { this.stop(t); this.set({ ck: null }); return; }
      this.set({ ck: [id, parts.length, i % parts.length, parts[i % parts.length]] });
      i++;
    });
  }

  guestPeers() {
    const o = this.other;
    if (!o) return;
    // Spiel-Setup empfangen
    if (o.ph === 'setup' && o.tx && o.sid !== this.gotSid) {
      if (!this.setupRx || this.setupRx.id !== o.sid) this.setupRx = new ChunkReceiver();
      const text = this.setupRx.add(o.tx);
      if (text && this.unpacking !== o.sid) {
        const sid = o.sid;
        this.unpacking = sid;
        unpackText(text).then(t => {
          this.gotSid = sid;
          this.set({ got: sid, ph: 'match' });
          this.resetGuest();
          this.app.startOnlineMatch(JSON.parse(t));
        }).catch(e => console.warn('Setup', e));
      }
    }
    // Schnappschüsse sammeln
    const s = o.s;
    if (s && s !== this.lastS && this.buf) {
      this.lastS = s;
      if (!this.buf.length || s.t > this.buf[this.buf.length - 1].t) {
        this.buf.push(s);
        this.lastSnapAt = performance.now();
        if (this.buf.length > 40) this.buf.shift();
        const off = s.t - performance.now() / 1000;
        if (this.off == null || off > this.off + 0.3 || off < this.off - 0.6) this.off = off;
        else this.off += (off - this.off) * 0.05;
      }
    }
    if (o.lob) this.lob = o.lob;
    if (o.ph === 'lobby' && this.app.mode === 'match' && this.app.matchKind === 'online') this.onChange('hostLobby');
    else if (o.ph === 'lobby') this.onChange('lobby');
  }

  resetGuest() {
    this.buf = [];
    this.off = null;
    this.lastSeq = 0;
    this.lastS = null;
    this.lastSnapAt = performance.now();
    this.enc = new InputEncoder();
  }

  // Pro Bild beim Gast: Eingabe senden, Spielzustand anzeigen, Ereignisse weiterreichen
  guestFrame(m, state, pressed, dt) {
    if (!this.enc) this.resetGuest();
    const inp = this.enc.encode(state, pressed);
    const key = inp.join(',');
    const now = performance.now();
    if (key !== this.lastInKey || now - (this.lastInAt || 0) > 250) {
      this.lastInKey = key; this.lastInAt = now;
      this.set({ in: inp });
    }
    const buf = this.buf;
    if (!buf || !buf.length || this.off == null) return;
    const rt = Math.min(now / 1000 + this.off - DELAY, buf[buf.length - 1].t);
    let i = 0;
    while (i < buf.length - 2 && buf[i + 1].t <= rt) i++;
    const a = buf[i], b = buf[Math.min(i + 1, buf.length - 1)];
    const k = b.t > a.t ? Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))) : 0;
    applySnapshot(m, a, b, k);
    // Ereignisse der Schnappschüsse, deren Zeit erreicht ist
    for (const s of buf) {
      if (s.t > rt || s.done) continue;
      s.done = true;
      if (s.fin) applySnapshot(m, s);
      for (const [seq, e] of s.ev) {
        if (seq <= this.lastSeq) continue;
        this.lastSeq = seq;
        const ev = deserValue(m, e);
        if (ev && ev.type) m.events.push(ev);
      }
    }
    if (m.state === 'play' || m.state === 'goal') m.recorder.tick(m, dt);
  }

  // Verbindung unterbrochen? (Gast: keine neuen Schnappschüsse, Gastgeber: Gast fehlt)
  lost() {
    if (!this.other) return true;
    if (this.role === 'guest' && this.app.mode === 'match') return performance.now() - (this.lastSnapAt || 0) > LOST_MS;
    return false;
  }

  async leave() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    if (this.unsub) try { this.unsub(); } catch (e) { /* egal */ }
    const c = this.conn;
    this.conn = null;
    if (c) try { await c.leave(); } catch (e) { /* egal */ }
  }
}
