// Spielstand: lokal (automatisch), online mit Code (Supabase) und als Datei.
// Bei zwei Geräten gewinnt der neuere Stand – vorher kommt eine Warnung.

import {
  onlineConfigured, makeCode, normalizeCode, loadMeta, loadGame, saveGame, getMeta, saveMeta, fmtTime,
} from '../save/online.js';
import { makeBundle, applyBundle, validBundle, downloadBundle, readBundleFile } from '../save/bundle.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class SaveManager {
  constructor(app) {
    this.app = app;
    this.meta = getMeta();
    this.timer = null;
    this.busy = false;
    this.status = '';
    this.conflict = null;
  }

  get code() { return this.meta.code || null; }

  // Nach jeder lokalen Speicherung aufrufen
  markDirty() {
    this.meta.localSavedAt = new Date().toISOString();
    this.meta.dirty = true;
    saveMeta(this.meta);
    if (this.code) this.schedule(4000);
  }

  schedule(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.upload(), ms);
  }

  async upload(force = false) {
    clearTimeout(this.timer);
    if (!this.code || !onlineConfigured()) return false;
    if (this.app.mode === 'match' && !force) { this.schedule(15000); return false; }   // nicht mitten im Spiel
    if (this.busy) { this.schedule(3000); return false; }
    this.busy = true;
    try {
      const bundle = makeBundle(this.meta.localSavedAt || new Date().toISOString());
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
      this.status = `offline (${e.message})`;
      this.schedule(60000);              // später nochmals versuchen
      return false;
    } finally { this.busy = false; }
  }

  // Beim Start: Hat ein anderes Gerät inzwischen gespeichert?
  async startupCheck() {
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
    const serverNewer = !this.meta.localSavedAt || Date.parse(c.saved_at || c.updated_at) >= Date.parse(this.meta.localSavedAt);
    app.menus.show(`
      <h2>Neuerer Spielstand gefunden</h2>
      <p>Mit dem Code <b>${esc(this.code)}</b> wurde auf einem anderen Gerät gespeichert.</p>
      <table class="tab fin">
        <tr><td>Stand auf dem anderen Gerät</td><td class="num">${fmtTime(c.saved_at || c.updated_at)}</td></tr>
        <tr><td>Stand auf diesem Gerät</td><td class="num">${fmtTime(this.meta.localSavedAt)}</td></tr>
      </table>
      <p class="hint">Der neuere Stand gewinnt. Wählst du «Diesen Stand behalten», wird der andere überschrieben.</p>
      <div class="menu-row">
        <button data-act="saveLater">Später</button>
        <button class="${serverNewer ? '' : 'primary'}" data-act="saveKeep">Diesen Stand behalten</button>
        <button class="${serverNewer ? 'primary' : ''}" data-act="saveLoadServer">Stand vom anderen Gerät laden</button>
      </div>`);
  }

  // ------------------------------------------------------------ Bildschirm

  screen(msg = '') {
    const m = this.meta;
    const online = onlineConfigured();
    let codeBox;
    if (this.code) {
      codeBox = `<div class="code-box"><span class="hint">Dein Code</span><b class="code" id="save-code">${esc(this.code)}</b>
        <div class="menu-row center"><button class="primary" data-act="saveCopy">Code kopieren</button><button data-act="saveNow">Jetzt speichern</button></div>
        <p class="hint">Zuletzt online gespeichert: ${fmtTime(m.lastOnline)}${m.dirty ? ' · neue Änderungen werden gleich hochgeladen' : ''}${this.status && this.status !== 'ok' ? ` · ${esc(this.status)}` : ''}</p></div>`;
    } else {
      codeBox = `<div class="code-box"><p>Dein Spielstand ist bisher nur auf diesem Gerät gespeichert.</p>
        <button class="primary big" data-act="saveCreate" ${online ? '' : 'disabled'}>Online speichern und Code erhalten</button>
        <p class="hint">Mit dem Code kannst du auf jedem anderen Gerät weiterspielen. Danach wird automatisch nach jedem Spiel und jeder Änderung gespeichert.</p></div>`;
    }
    this.app.menus.show(`
      <h2>Spielstand</h2>
      ${msg ? `<p class="note">${msg}</p>` : ''}
      <p class="hint">Automatisch gespeichert auf diesem Gerät: ${fmtTime(m.localSavedAt)}</p>
      ${codeBox}
      <h3>Auf diesem Gerät weiterspielen</h3>
      <div class="field-row"><input class="txt" id="load-code" placeholder="UH-XXXX-XXXX" maxlength="14" autocomplete="off" autocapitalize="characters">
        <button data-act="saveLoadCode" ${online ? '' : 'disabled'}>Spielstand laden</button></div>
      <p class="hint">Achtung: Der Spielstand auf diesem Gerät wird dabei ersetzt.</p>
      <h3>Ohne Internet: als Datei</h3>
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
    if (!confirm(`Spielstand vom ${fmtTime(r.saved_at || r.updated_at)} laden? Der Stand auf diesem Gerät wird ersetzt.`)) return;
    applyBundle(r.data);
    this.meta = { code, known: r.updated_at, localSavedAt: r.data.savedAt, dirty: false, lastOnline: r.updated_at };
    saveMeta(this.meta);
    location.reload();
  }

  async loadServer() {
    try {
      const r = await loadGame(this.code);
      if (!r || !validBundle(r.data)) { this.screen('Auf dem Server ist kein gültiger Spielstand.'); return; }
      applyBundle(r.data);
      this.meta = { ...this.meta, known: r.updated_at, localSavedAt: r.data.savedAt, dirty: false, lastOnline: r.updated_at };
      saveMeta(this.meta);
      location.reload();
    } catch (e) { this.screen(`Laden hat nicht geklappt: ${esc(e.message)}`); }
  }

  async importFile(file) {
    if (!file) return;
    try {
      const b = await readBundleFile(file);
      if (!validBundle(b)) throw new Error('Die Datei ist kein Unihockey-Stars-Spielstand');
      if (!confirm(`Spielstand vom ${fmtTime(b.savedAt)} aus der Datei laden? Der Stand auf diesem Gerät wird ersetzt.`)) return;
      applyBundle(b);
      this.meta.localSavedAt = new Date().toISOString();
      this.meta.dirty = true;                       // mit Code: wird beim nächsten Start hochgeladen
      saveMeta(this.meta);
      location.reload();
    } catch (e) { this.screen(esc(e.message)); }
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
      case 'saveNow': this.upload().then(ok => this.screen(ok ? 'Online gespeichert.' : (this.conflict ? '' : 'Speichern hat nicht geklappt (offline?).'))); return true;
      case 'saveLoadCode': this.loadCode(document.getElementById('load-code').value); return true;
      case 'saveExport': this.app.saveClub(); downloadBundle(makeBundle()); return true;
      case 'saveImport': document.getElementById('import-file').click(); return true;
      case 'saveForget':
        if (confirm('Online-Speichern auf diesem Gerät beenden? Der Code bleibt gültig, du kannst ihn später wieder eingeben.')) {
          this.meta = { localSavedAt: this.meta.localSavedAt }; saveMeta(this.meta); this.screen();
        }
        return true;
      case 'saveLater': this.conflict = null; this.app.menus.main(); return true;
      case 'saveKeep': this.conflict = null; this.upload(true).then(() => this.app.menus.main()); return true;
      case 'saveLoadServer': this.loadServer(); return true;
      default: return false;
    }
  }
}
