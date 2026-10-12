// Spielstand: lokal (automatisch), online und als Datei.
// Online gibt es zwei Wege:
//   * Webseite (GitHub Pages): mit Code UH-XXXX-XXXX über Supabase.
//   * claude.ai-Artifact: im Claude-Konto des Spielers (dort sind fremde Server gesperrt).
// Bei zwei Geräten gewinnt der neuere Stand – vorher kommt eine Warnung.

import {
  onlineConfigured, makeCode, normalizeCode, loadMeta, loadGame, saveGame, getMeta, saveMeta, fmtTime,
} from '../save/online.js';
import { makeBundle, applyBundle, validBundle, downloadBundle, readBundleFile } from '../save/bundle.js';
import { inArtifact, connectCloud, cloudMeta, cloudSave, cloudLoad } from '../save/cloud.js';
import { ask } from './dialog.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class SaveManager {
  constructor(app) {
    this.app = app;
    this.meta = getMeta();
    this.timer = null;
    this.busy = false;
    this.status = '';
    this.conflict = null;
    this.artifact = inArtifact();
    this.cloud = null;               // Verbindung zum Claude-Konto (nur im Artifact)
  }

  get code() { return this.artifact ? null : this.meta.code || null; }
  get account() { return !!this.cloud; }
  get online() { return this.account || !!this.code; }

  // Nach jeder lokalen Speicherung aufrufen
  markDirty() {
    this.meta.localSavedAt = new Date().toISOString();
    this.meta.dirty = true;
    saveMeta(this.meta);
    if (this.online) this.schedule(4000);
  }

  schedule(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.upload(), ms);
  }

  async upload(force = false) {
    clearTimeout(this.timer);
    if (!this.online) return false;
    if (this.app.mode === 'match' && !force) { this.schedule(15000); return false; }   // nicht mitten im Spiel
    if (this.busy) { this.schedule(3000); return false; }
    this.busy = true;
    try {
      const bundle = makeBundle(this.meta.localSavedAt || new Date().toISOString());
      if (this.account) {
        const m = await cloudMeta(this.cloud);
        if (m && !force && m.savedAt !== this.meta.knownCloud && Date.parse(m.savedAt) > Date.parse(this.meta.knownCloud || 0)) {
          this.conflict = { saved_at: m.savedAt };
          this.showConflictWhenPossible();
          return false;
        }
        const at = await cloudSave(this.cloud, bundle);
        Object.assign(this.meta, { knownCloud: at, dirty: false, lastCloud: new Date().toISOString() });
        saveMeta(this.meta);
        this.status = 'ok';
        return true;
      }
      if (!onlineConfigured()) return false;
      const r = await saveGame(this.code, bundle, this.meta.known, force);
      if (r && r.ok) {
        Object.assign(this.meta, { known: r.updated_at, dirty: false, lastOnline: r.updated_at });
        saveMeta(this.meta);
        this.status = 'ok';
        return true;
      }
      if (r && r.conflict) { this.conflict = r; this.showConflictWhenPossible(); }
      return false;
    } catch (e) {
      this.status = `offline (${e.message || e.code})`;
      this.schedule(60000);              // später nochmals versuchen
      return false;
    } finally { this.busy = false; }
  }

  // Beim Start: Hat ein anderes Gerät inzwischen gespeichert?
  async startupCheck() {
    if (this.artifact) {
      this.cloud = await connectCloud();
      if (!this.cloud) return;
      try {
        const m = await cloudMeta(this.cloud);
        if (!m) { this.schedule(1500); return; }                     // erstes Mal: gleich hochladen
        if (m.savedAt === this.meta.knownCloud) { if (this.meta.dirty) this.schedule(2000); return; }
        this.conflict = { saved_at: m.savedAt };
        this.showConflictWhenPossible();
      } catch (e) { this.status = `offline (${e.message || e.code})`; }
      return;
    }
    if (!this.code || !onlineConfigured()) return;
    try {
      const m = await loadMeta(this.code);
      if (!m) return;
      const known = this.meta.known ? Date.parse(this.meta.known) : 0;
      if (Date.parse(m.updated_at) > known + 1000) { this.conflict = m; this.showConflictWhenPossible(); }
      else if (this.meta.dirty) this.schedule(2000);
    } catch (e) { this.status = `offline (${e.message})`; }
  }

  showConflictWhenPossible() {
    const app = this.app;
    if (app.mode === 'match' || !this.conflict) { setTimeout(() => this.showConflictWhenPossible(), 5000); return; }
    const c = this.conflict;
    const other = c.saved_at || c.updated_at;
    // Noch nie auf diesem Gerät gespielt (kein lokaler Stand): Konto-Stand ist sicher der richtige
    const serverNewer = !this.meta.localSavedAt || Date.parse(other) >= Date.parse(this.meta.localSavedAt);
    const where = this.account ? 'in deinem Claude-Konto (anderes Gerät)' : 'auf dem anderen Gerät';
    app.menus.show(`
      <h2>Neuerer Spielstand gefunden</h2>
      <p>${this.account ? 'In deinem Claude-Konto liegt ein Spielstand, der nicht von diesem Gerät stammt.'
        : `Mit dem Code <b>${esc(this.code)}</b> wurde auf einem anderen Gerät gespeichert.`}</p>
      <table class="tab fin">
        <tr><td>Stand ${where}</td><td class="num">${fmtTime(other)}</td></tr>
        <tr><td>Stand auf diesem Gerät</td><td class="num">${fmtTime(this.meta.localSavedAt)}</td></tr>
      </table>
      <p class="hint">Der neuere Stand gewinnt. Wählst du «Diesen Stand behalten», wird der andere überschrieben.</p>
      <div class="menu-row">
        <button data-act="saveLater">Später</button>
        <button class="${serverNewer ? '' : 'primary'}" data-act="saveKeep">Diesen Stand behalten</button>
        <button class="${serverNewer ? 'primary' : ''}" data-act="saveLoadServer">${this.account ? 'Stand aus dem Konto laden' : 'Stand vom anderen Gerät laden'}</button>
      </div>`);
  }

  // ------------------------------------------------------------ Bildschirm

  screen(msg = '') {
    const m = this.meta;
    let box;
    if (this.artifact) {
      box = this.account
        ? `<div class="code-box"><p><b>Dein Spielstand wird in deinem Claude-Konto gespeichert.</b></p>
            <p class="hint">Öffne dieses Artifact auf einem anderen Gerät (gleiches Konto) und spiele einfach weiter – ohne Code.
            Gespeichert wird automatisch nach jedem Spiel und jeder Änderung.</p>
            <div class="menu-row center"><button class="primary" data-act="saveNow">Jetzt speichern</button></div>
            <p class="hint">Zuletzt im Konto gespeichert: ${fmtTime(m.lastCloud)}${m.dirty ? ' · neue Änderungen werden gleich gespeichert' : ''}${this.status && this.status !== 'ok' ? ` · ${esc(this.status)}` : ''}</p></div>`
        : `<div class="code-box"><p>Dein Spielstand ist nur in diesem Browser gespeichert.</p>
            <p class="hint">Im Claude-Konto speichern geht nur angemeldet und mit Schreibrecht für dieses Artifact.
            Zum Mitnehmen auf ein anderes Gerät: als Datei speichern.</p></div>`;
    } else if (this.code) {
      box = `<div class="code-box"><span class="hint">Dein Code</span><b class="code" id="save-code">${esc(this.code)}</b>
        <div class="menu-row center"><button class="primary" data-act="saveCopy">Code kopieren</button><button data-act="saveNow">Jetzt speichern</button></div>
        <p class="hint">Zuletzt online gespeichert: ${fmtTime(m.lastOnline)}${m.dirty ? ' · neue Änderungen werden gleich hochgeladen' : ''}${this.status && this.status !== 'ok' ? ` · ${esc(this.status)}` : ''}</p></div>`;
    } else {
      box = `<div class="code-box"><p>Dein Spielstand ist bisher nur auf diesem Gerät gespeichert.</p>
        <button class="primary big" data-act="saveCreate" ${onlineConfigured() ? '' : 'disabled'}>Online speichern und Code erhalten</button>
        <p class="hint">Mit dem Code kannst du auf jedem anderen Gerät weiterspielen. Danach wird automatisch nach jedem Spiel und jeder Änderung gespeichert.</p></div>`;
    }
    const codeLoad = this.artifact ? '' : `
      <h3>Auf diesem Gerät weiterspielen</h3>
      <div class="field-row"><input class="txt" id="load-code" placeholder="UH-XXXX-XXXX" maxlength="14" autocomplete="off" autocapitalize="characters">
        <button data-act="saveLoadCode" ${onlineConfigured() ? '' : 'disabled'}>Spielstand laden</button></div>
      <p class="hint">Achtung: Der Spielstand auf diesem Gerät wird dabei ersetzt.</p>`;
    this.app.menus.show(`
      <h2>Spielstand</h2>
      ${msg ? `<p class="note">${msg}</p>` : ''}
      <p class="hint">Automatisch gespeichert auf diesem Gerät: ${fmtTime(m.localSavedAt)}</p>
      ${box}${codeLoad}
      <h3>Als Datei</h3>
      <div class="menu-row left"><button data-act="saveExport">Als Datei speichern</button>
        <button data-act="saveImport">Datei laden</button><input type="file" id="import-file" accept=".json,application/json" hidden></div>
      ${this.code ? '<div class="menu-row left"><button data-act="saveForget">Online-Speichern auf diesem Gerät beenden</button></div>' : ''}
      <div class="menu-row"><button class="primary" data-act="main">Zurück</button></div>`, 'wide');
    const inp = document.getElementById('import-file');
    inp.addEventListener('change', () => this.importFile(inp.files[0]));
  }

  async createCode() {
    this.app.saveClub();
    for (let i = 0; i < 3; i++) {
      this.meta.code = makeCode();
      this.meta.known = null;
      saveMeta(this.meta);
      try {
        const bundle = makeBundle(this.meta.localSavedAt || new Date().toISOString());
        const r = await saveGame(this.meta.code, bundle, null, false);
        if (r && r.ok) {
          Object.assign(this.meta, { known: r.updated_at, dirty: false, lastOnline: r.updated_at });
          saveMeta(this.meta);
          this.screen('Gespeichert! Notiere dir den Code oder kopiere ihn.');
          return;
        }
      } catch (e) {
        delete this.meta.code; saveMeta(this.meta);
        this.screen(`Online-Speichern hat nicht geklappt: ${esc(e.message)}. Später nochmals versuchen oder als Datei speichern.`);
        return;
      }
    }
    delete this.meta.code; saveMeta(this.meta);
    this.screen('Es konnte kein freier Code erzeugt werden. Bitte nochmals versuchen.');
  }

  async loadCode(raw) {
    const code = normalizeCode(raw);
    if (!code) { this.screen('Der Code hat die Form UH-XXXX-XXXX (ohne 0, O, 1 und I).'); return; }
    let r;
    try { r = await loadGame(code); } catch (e) { this.screen(`Laden hat nicht geklappt: ${esc(e.message)}`); return; }
    if (!r || !validBundle(r.data)) { this.screen(`Unter ${esc(code)} ist kein Spielstand gespeichert.`); return; }
    if (!await ask(`Spielstand vom ${fmtTime(r.saved_at || r.updated_at)} laden? Der Stand auf diesem Gerät wird ersetzt.`, { ok: 'Laden' })) return;
    applyBundle(r.data);
    this.meta = { code, known: r.updated_at, localSavedAt: r.data.savedAt, dirty: false, lastOnline: r.updated_at };
    saveMeta(this.meta);
    location.reload();
  }

  async loadServer() {
    try {
      if (this.account) {
        const r = await cloudLoad(this.cloud);
        if (!r || !validBundle(r.bundle)) { this.screen('Im Konto ist kein gültiger Spielstand.'); return; }
        applyBundle(r.bundle);
        this.meta = { ...this.meta, knownCloud: r.meta.savedAt, localSavedAt: r.bundle.savedAt, dirty: false, lastCloud: new Date().toISOString() };
        saveMeta(this.meta);
        location.reload();
        return;
      }
      const r = await loadGame(this.code);
      if (!r || !validBundle(r.data)) { this.screen('Auf dem Server ist kein gültiger Spielstand.'); return; }
      applyBundle(r.data);
      this.meta = { ...this.meta, known: r.updated_at, localSavedAt: r.data.savedAt, dirty: false, lastOnline: r.updated_at };
      saveMeta(this.meta);
      location.reload();
    } catch (e) { this.screen(`Laden hat nicht geklappt: ${esc(e.message || e.code)}`); }
  }

  async importFile(file) {
    if (!file) return;
    try {
      const b = await readBundleFile(file);
      if (!validBundle(b)) throw new Error('Die Datei ist kein Unihockey-Stars-Spielstand');
      if (!await ask(`Spielstand vom ${fmtTime(b.savedAt)} aus der Datei laden? Der Stand auf diesem Gerät wird ersetzt.`, { ok: 'Laden' })) return;
      applyBundle(b);
      this.meta.localSavedAt = new Date().toISOString();
      this.meta.dirty = true;                       // online: wird beim nächsten Start hochgeladen
      saveMeta(this.meta);
      location.reload();
    } catch (e) { this.screen(esc(e.message)); }
  }

  async exportFile() {
    this.app.saveClub();
    const b = makeBundle();
    if (!this.artifact) { downloadBundle(b); return; }
    // Im Artifact sind direkte Downloads gesperrt: über die Download-Freigabe anbieten
    try {
      const dl = await window.claude.use('downloads');
      if (!dl) { this.screen('Datei-Export ist hier nicht verfügbar.'); return; }
      await dl.save({ filename: `unihockey-stars-spielstand-${b.savedAt.slice(0, 10)}.json`, data: JSON.stringify(b) });
    } catch (e) {
      if (e && e.code !== 'declined') this.screen(`Export hat nicht geklappt (${esc(e.code || e.message)}).`);
    }
  }

  async copy() {
    const code = this.code;
    try { await navigator.clipboard.writeText(code); this.app.hud.toast('Code kopiert', 2); }
    catch {
      const el = document.getElementById('save-code');
      const r = document.createRange(); r.selectNodeContents(el);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      this.app.hud.toast('Code markiert – jetzt kopieren', 2.5);
    }
  }

  onAction(act) {
    switch (act) {
      case 'saveScreen': this.screen(); return true;
      case 'saveCreate': this.createCode(); return true;
      case 'saveCopy': this.copy(); return true;
      case 'saveNow': this.upload().then(ok => this.screen(ok ? (this.account ? 'Im Konto gespeichert.' : 'Online gespeichert.') : (this.conflict ? '' : 'Speichern hat nicht geklappt (offline?).'))); return true;
      case 'saveLoadCode': this.loadCode(document.getElementById('load-code').value); return true;
      case 'saveExport': this.exportFile(); return true;
      case 'saveImport': document.getElementById('import-file').click(); return true;
      case 'saveForget':
        ask('Online-Speichern auf diesem Gerät beenden? Der Code bleibt gültig, du kannst ihn später wieder eingeben.', { ok: 'Beenden' })
          .then(ok => { if (ok) { this.meta = { localSavedAt: this.meta.localSavedAt }; saveMeta(this.meta); this.screen(); } });
        return true;
      case 'saveLater': this.conflict = null; this.app.menus.main(); return true;
      case 'saveKeep': this.conflict = null; this.upload(true).then(() => this.app.menus.main()); return true;
      case 'saveLoadServer': this.loadServer(); return true;
      default: return false;
    }
  }
}
