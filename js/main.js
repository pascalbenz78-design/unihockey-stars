// Unihockey Stars – Start, Spielschleife, Zusammenspiel von Match, Grafik,
// Eingabe und Menüs.

import { CONFIG } from './config.js';
import { Match } from './match/match.js';
import { defaultTeams } from './club/roster.js';
import { Renderer } from './render/renderer.js';
import { Input, isTouchDevice } from './ui/input.js';
import { Hud } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { ClubEditor } from './ui/clubEditor.js';
import { createDefaultClub, clubTeamData, chooseKits, clubAfterMatch, clubAfterGame } from './club/club.js';
import { CareerUI } from './ui/careerUI.js';
import { SaveManager } from './ui/saveUI.js';
import { Sound } from './ui/sound.js';
import { loadCareer, saveCareer } from './save/careerStore.js';
import { createCareer, ownFixture, getTeam, playEvent, startNextSeason, OWN, currentEvent, standings, ownLeague } from './league/career.js';
import { initFinance, hallOf, attendance, CAPACITY } from './league/finance.js';
import { loadClub, saveClub } from './save/clubStore.js';
import { STAT_NAMES, FOCI, INTENSITY } from './club/training.js';
import { shortName } from './club/names.js';
import { loadSettings, saveSettings } from './save/settings.js';
import { applyTeamPrefs, recordMatchInjuries } from './club/teamStore.js';
import { celebrationName } from './club/celebrations.js';
import { FOUL_NAMES, INJURY_NAMES } from './match/rules.js';
import { OnlineUI } from './ui/onlineUI.js';

const DT = 1 / CONFIG.physics.tickRate;

class App {
  constructor() {
    this.settings = loadSettings();
    this.touch = isTouchDevice();
    document.body.classList.toggle('touch', this.touch);
    this.club = loadClub();
    if (!this.club) { this.club = createDefaultClub(); saveClub(this.club); }
    this.refreshTeams();
    this.input = new Input();
    this.hud = new Hud();
    this.menus = new Menus(this);
    this.clubEditor = new ClubEditor(this);
    this.sync = new SaveManager(this);
    this.sound = new Sound();
    this.sound.setEnabled(this.settings.sound, this.settings.volume);
    const unlock = () => this.sound.unlock();
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
    this.applyControlPrefs();
    this.careerUI = new CareerUI(this);
    this.onlineUI = new OnlineUI(this);
    this.online = null;           // laufende Online-Sitzung (zu zweit)
    this.career = loadCareer();
    if (this.career && !this.career.finance) { initFinance(this.career, this.club); saveCareer(this.career); }
    this.mode = 'menu';
    this.paused = false;
    this.acc = 0;
    this.last = performance.now();
    this.fps = 60;
    this.createRenderer();
    this.bindTouch();
    this.startDemo();
    this.menus.main();
    document.getElementById('loading').remove();
    // Einladungslink: ?zu-zweit=CODE → direkt beitreten
    const inv = new URLSearchParams(location.search).get('zu-zweit');
    if (inv) {
      try { history.replaceState(null, '', location.pathname); } catch { /* egal */ }
      this.onlineUI.open('guest', inv.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4));
    }

    addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'match' && !this.online) this.pause(); });
    requestAnimationFrame(t => this.frame(t));
    this.sync.startupCheck();
  }

  // Touch-Steuerung: Grösse und Linkshänder-Anordnung
  applyControlPrefs() {
    const b = document.body.classList;
    b.remove('ts-klein', 'ts-gross');
    if (this.settings.touchSize !== 'normal') b.add(`ts-${this.settings.touchSize}`);
    b.toggle('lefty', !!this.settings.lefty);
  }

  // Teams mit gespeicherten Jubeln und Verletzungen
  refreshTeams() { this.teams = defaultTeams().map(applyTeamPrefs); }

  // Alle wählbaren Teams: eigener Verein zuerst
  allTeams() { return [clubTeamData(this.club), ...this.teams]; }

  saveClub() {
    if (!saveClub(this.club)) this.hud.toast('Speichern nicht möglich (privater Modus?)', 3);
    if (this.sync) this.sync.markDirty();
  }

  createRenderer() {
    const old = document.getElementById('game');
    const canvas = document.createElement('canvas');
    canvas.id = 'game';
    old.replaceWith(canvas);
    if (this.renderer) this.renderer.renderer.dispose();
    this.renderer = new Renderer(canvas, this.settings.graphics);
    if (this.match) this.renderer.setMatch(this.match);
  }

  bindTouch() {
    const t = document.getElementById('touch');
    this.input.bindTouch(document.getElementById('joyzone'), document.getElementById('joyknob'), t.querySelectorAll('[data-act]'));
    this.input.bindMouse(document.getElementById('joyknob'));
    t.querySelector('[data-act="pause"]').addEventListener('pointerdown', () => this.pause());
    // Vollbild braucht einen «echten» Klick (pointerdown zählt beim Tippen nicht)
    const fs = t.querySelector('[data-act="fullscreen"]');
    if (!this.canFullscreen()) fs.remove();
    else fs.addEventListener('click', () => this.toggleFullscreen());
    // Tippen/Klicken überspringt Wiederholung und Jubel
    addEventListener('pointerdown', e => {
      if (this.mode === 'match' && !this.menus.visible && !e.target.closest('#btns-top')) this.skipRequest = true;
    });
  }

  // KI gegen KI im Hintergrund des Hauptmenüs
  startDemo() {
    this.match = new Match({ teams: defaultTeams(), humanTeam: null, difficulty: 'mittel' });
    this.renderer.setMatch(this.match);
    this.mode = 'menu';
    this.hud.show(false);
    this.showTouch(false);
  }

  // Online zu zweit: Match aus dem Setup des Gastgebers (beide Geräte gleich)
  startOnlineMatch(setup) {
    const s = this.online;
    if (!s) return;
    this.matchKind = 'online';
    this.friendlyTeams = null;
    this.spectators = 0;
    this.match = new Match({ teams: setup.teams, humans: setup.humans, difficulty: setup.diff, settings: setup.settings });
    if (s.role === 'guest') { this.match.human = this.match.humans[1]; this.match.takeEvents(); }
    else s.log = null;
    this.beginMatch();
  }

  leaveOnlineMatch() {
    if (this.mode === 'match') this.startDemo();
  }

  matchSettings() {
    const s = this.settings;
    return { autoChange: !!s.autoChange, autoGoalie: !!s.autoGoalie, autoSwitch: s.autoSwitch !== false };
  }

  startFriendly(pick = 0, opp = 1) {
    this.refreshTeams();
    const all = this.allTeams();
    if (opp === pick) opp = (pick + 1) % all.length;
    // eigenes Team spielt immer zuerst von links nach rechts; Gast evtl. im Auswärtstrikot
    const teams = chooseKits(all[pick], all[opp]);
    this.friendlyTeams = teams;
    this.matchKind = 'friendly';
    this.match = new Match({
      teams, humanTeam: 0, difficulty: this.settings.difficulty, settings: this.matchSettings(),
    });
    this.beginMatch();
  }

  beginMatch() {
    this.renderer.setMatch(this.match);
    this.mode = 'match';
    this.paused = false;
    this.menus.hide();
    this.hud.setTeams(this.match);
    this.hud.show(true);
    this.showTouch(true);
    this.hud.message(this.matchKind === 'career' && this.spectators ? `1. Drittel<small>${this.spectators.toLocaleString('de-CH')} Zuschauer</small>` : '1. Drittel', 2, 'small');
    this.input.clear();
    this.tryFullscreen();
  }

  canFullscreen() {
    const el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen);
  }

  toggleFullscreen() {
    const el = document.documentElement;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        if (r && r.then) r.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
      }
    } catch { /* nicht unterstützt */ }
  }

  tryFullscreen() {
    if (!this.touch) return;
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
      }
    } catch { /* nicht unterstützt */ }
  }

  // Touch-Steuerung (Handy) bzw. am PC nur der Joystick, wenn mit der Maus bewegt wird
  showTouch(inMatch) {
    const mouse = !this.touch && this.settings.moveInput === 'maus';
    document.body.classList.toggle('mouse-move', mouse);
    this.input.setMouseMode(mouse && inMatch);
    document.getElementById('touch').classList.toggle('hidden', !(inMatch && (this.touch || mouse)));
  }

  toMenu() {
    if (this.online) this.onlineUI.leave();
    this.paused = false;
    this.startDemo();
    this.menus.main();
  }

  pause() {
    if (this.mode !== 'match' || this.paused) return;
    if (this.online) {
      // Online läuft das Spiel weiter; nur ein kleines Menü
      if (this.menus.visible && this.menus.screen === 'onlinePause') this.menus.hide();
      else if (!this.menus.visible) this.menus.onlinePause();
      return;
    }
    if (this.match.state === 'intermission' || this.match.state === 'end') return;
    this.paused = true;
    this.menus.pause();
  }

  resume() {
    this.paused = false;
    this.menus.hide();
    this.input.clear();
    this.last = performance.now();
  }

  nextPeriod() {
    this.match.nextPeriod();
    this.menus.hide();
    this.hud.message(`${this.match.period}. Drittel`, 1.6, 'small');
    this.input.clear();
  }

  changeSetting(k, v) {
    this.settings[k] = v;
    saveSettings(this.settings);
    if (k === 'graphics') this.createRenderer();
    if (this.match && (k === 'autoChange' || k === 'autoGoalie' || k === 'autoSwitch')) this.match.settings[k] = v;
    if (k === 'sound' || k === 'volume') this.sound.setEnabled(this.settings.sound, +this.settings.volume);
    if (k === 'touchSize' || k === 'lefty') this.applyControlPrefs();
    if (k === 'moveInput') this.showTouch(this.mode === 'match');
  }

  frame(now) {
    requestAnimationFrame(t => this.frame(t));
    this.tick(now);
  }

  tick(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    const m = this.match;

    if (this.mode === 'match' && this.online && this.online.role === 'guest') {
      // Gast: rechnet nicht selbst, zeigt den Zustand des Gastgebers
      const { state, pressed } = this.input.poll();
      if (pressed.pause) this.pause();
      if ((m.state === 'replay' || m.state === 'celebrate') && (this.skipRequest || pressed.shoot || pressed.pass || pressed.bank || pressed.switch)) pressed.skip = true;
      this.skipRequest = false;
      this.online.guestFrame(m, state, pressed, dt);
      if (this.menus.screen === 'intermission' && this.menus.visible && m.state !== 'intermission') {
        this.menus.hide();
        this.hud.message(m.periodLabel(), 1.6, 'small');
      }
      this.handleEvents();
      this.hud.update(m, dt);
    } else if (this.mode === 'match') {
      const { state, pressed } = this.input.poll();
      if (pressed.pause) { if (this.paused) this.resume(); else this.pause(); }
      if ((m.state === 'replay' || m.state === 'celebrate') && (this.skipRequest || pressed.shoot || pressed.pass || pressed.bank || pressed.switch)) {
        m.skip();
        delete pressed.shoot; delete pressed.pass; delete pressed.bank; delete pressed.switch;
      }
      this.skipRequest = false;
      if (!this.paused && m.human) {
        m.human.setInput(state, pressed);
        if (this.online) this.online.applyGuestInput(m);
        this.acc += dt;
        while (this.acc >= DT) { m.step(DT); this.acc -= DT; }
      }
      this.handleEvents();
      if (this.online) this.online.afterStep(m);
      this.hud.update(m, dt);
    } else {
      // Demo: läuft endlos
      this.acc += dt;
      while (this.acc >= DT) {
        m.step(DT);
        this.acc -= DT;
        if (m.state === 'intermission') m.nextPeriod();
        if (m.state === 'end') { this.startDemo(); break; }
      }
      this.match.takeEvents();
    }
    this.updateNetInfo();
    this.renderer.render(this.paused ? 0 : dt);
    this.sound.crowd(this.renderer.excitement, this.mode === 'match' && !this.paused);
  }

  // Hinweis bei unterbrochener Verbindung (online)
  updateNetInfo() {
    const el = document.getElementById('netinfo');
    if (!el) return;
    const s = this.online;
    const lost = !!s && this.mode === 'match' && this.matchKind === 'online' && s.lost();
    el.classList.toggle('hidden', !lost);
    if (lost) el.textContent = s.role === 'guest' ? 'Verbindung zum Gastgeber unterbrochen – verbinde neu …' : 'Mitspieler nicht verbunden – warte …';
  }

  // ------------------------------------------------------------ Karriere

  saveCareer() {
    if (this.career && !saveCareer(this.career)) this.hud.toast('Karriere konnte nicht gespeichert werden', 3);
    this.saveClub();
  }

  newCareer() {
    this.career = createCareer(this.club);
    this.saveCareer();
    this.careerUI.hub();
  }

  toCareerHub() {
    this.paused = false;
    this.startDemo();
    this.careerUI.hub();
  }

  // Eigenes Spiel des aktuellen Ereignisses live spielen
  startCareerMatch() {
    const c = this.career;
    const f = ownFixture(c);
    if (!f) return;
    const ownHome = f.h === OWN;
    const fac = c.finance.facilities;
    const own = { ...clubTeamData(this.club), id: OWN, regen: 1 + 0.15 * fac.locker };
    const opp = getTeam(c, this.club, ownHome ? f.a : f.h);
    const [hd, ad] = chooseKits(ownHome ? own : opp, ownHome ? opp : own);
    const teams = ownHome ? [hd, ad] : [ad, hd];
    this.match = new Match({
      teams, humanTeam: 0, home: ownHome ? 0 : 1, difficulty: this.settings.difficulty, settings: this.matchSettings(),
    });
    this.matchKind = 'career';
    // Halle des Heimteams, Auslastung, Sponsoren auf den Banden
    const ev = currentEvent(c);
    const hall = hallOf(c, ownHome ? OWN : opp.id);
    const rank = standings(c, ownLeague(c)).findIndex(r => r.id === OWN) + 1;
    const oppL = c.leagues.findIndex(l => l.includes(opp.id));
    const spectators = ownHome ? attendance(c, rank, ev.kind, oppL) : Math.round(CAPACITY[hall.stands] * (0.55 + Math.random() * 0.35));
    this.match.hall = { ...hall, fill: spectators / CAPACITY[hall.stands] };
    this.match.sponsors = ownHome ? c.finance.sponsors : null;
    this.spectators = spectators;
    this.careerFixture = { ownHome, oppId: opp.id };
    this.friendlyTeams = null;
    this.beginMatch();
  }

  // Ereignis ohne eigenes Live-Spiel abschliessen (eigenes Spiel simuliert)
  simulateCareerEvent() {
    const c = this.career;
    const had = !!ownFixture(c);
    const ev = playEvent(c, this.club, null);
    let extra = '';
    if (had) {
      const g = ev.games.find(x => x.h === OWN || x.a === OWN);
      const gf = g.h === OWN ? g.gh : g.ga, ga = g.h === OWN ? g.ga : g.gh;
      const r = clubAfterGame(this.club, { gf, ga }, false, c.finance.facilities.physio);
      extra = this.trainingSummary(r.training);
      this.hud.toast(`Simuliert: ${gf}:${ga}`, 2.5);
    }
    this.saveCareer();
    this.careerUI.hub();
    if (extra) this.careerUI.appendNote(extra);
  }

  // Resultat des Live-Spiels in die Karriere übernehmen
  finishCareerMatch(m) {
    const { ownHome, oppId } = this.careerFixture;
    const own = m.teams[0], opp = m.teams[1];
    const goals = m.goals.filter(g => !g.ownGoal).map(g => ({
      team: g.team === 0 ? OWN : oppId, scorer: g.scorer.id, assist: g.assist ? g.assist.id : null,
    }));
    const result = {
      gh: ownHome ? own.score : opp.score, ga: ownHome ? opp.score : own.score,
      type: m.result ? m.result.type : 'regular', goals,
    };
    // Verletzungen des Gegners bleiben bestehen
    for (const i of m.rules.injuries) if (!i.team.own) i.player.injury = { level: i.level, games: i.games };
    playEvent(this.career, this.club, result);
    const r = clubAfterGame(this.club, { gf: own.score, ga: opp.score, injuries: m.rules.injuries.filter(i => i.team.own) }, false, this.career.finance.facilities.physio);
    this.saveCareer();
    return this.trainingSummary(r.training);
  }

  nextCareerSeason() {
    startNextSeason(this.career, this.club);
    this.saveCareer();
    this.careerUI.agingReport();
  }

  trainingSummary(rep) {
    const t = this.club.training;
    const imp = rep.improved.map(x => `${shortName(x.player, this.club.players)} ${STAT_NAMES[x.stat]} ${x.value}`);
    const inj = rep.injured.map(x => `🩹 ${shortName(x.player, this.club.players)} im Training verletzt (${x.games} ${x.games === 1 ? 'Spiel' : 'Spiele'})`);
    return `<p class="hint train-sum"><b>Training</b> (${FOCI[t.focus].label}, ${INTENSITY[t.intensity].label}): ${imp.length ? '📈 ' + imp.join(', ') : 'noch keine neuen Punkte'}${inj.length ? '<br>' + inj.join(', ') : ''}</p>`;
  }

  handleEvents() {
    const m = this.match;
    const snd = this.sound;
    const hostLog = this.online && this.online.role === 'host' && this.matchKind === 'online';
    for (const e of m.takeEvents()) {
      if (hostLog) this.online.logEvent(m, e);
      switch (e.type) {
        case 'shot': snd.shot(e.power); break;
        case 'pass': snd.pass(); break;
        case 'board': snd.board(e.speed); break;
        case 'post': snd.post(); break;
        case 'save': case 'catch': snd.save(); break;
        case 'whistle': snd.whistle(e.kind === 'end'); break;
        case 'goalHorn': snd.horn(); break;
        default: break;
      }
      switch (e.type) {
        case 'goal': {
          const g = e.goal;
          const own = m.human && e.team === m.human.team;
          const who = g.ownGoal ? 'Eigentor' : `${g.scorer.firstName} ${g.scorer.lastName}`;
          const as = g.assist ? `<small>Assist: ${g.assist.firstName} ${g.assist.lastName}</small>` : '';
          const pp = g.pp === 'PP' ? '<small>Powerplay-Tor</small>' : g.pp === 'SH' ? '<small>Tor in Unterzahl!</small>' : '';
          const canc = e.cancelledPenalty ? '<small>Vorteil genutzt – Strafe entfällt</small>' : '';
          this.hud.message(`<b>TOR!</b><span>${e.team.data.short} · ${who}</span>${as}${pp}${canc}`, 3, own ? 'goal own' : 'goal');
          snd.horn();
          break;
        }
        case 'celebrate':
          if (e.player) this.hud.toast(`Jubel: ${celebrationName(e.player.data.celebration || 0)}`, 2.5);
          break;
        case 'foul':
          if (m.rules.pending) this.hud.toast(`Foul von #${e.offender.data.number} – Vorteil ${e.victim.team.data.short}`, 2.5);
          break;
        case 'penalty': {
          const pl = e.player.data;
          this.hud.message(`<b>2 MINUTEN</b><span>${e.team.data.short} · #${pl.number} ${pl.firstName} ${pl.lastName}</span><small>${FOUL_NAMES[e.foul]}</small>`, 2.6, 'penalty');
          break;
        }
        case 'penaltyEnd':
          this.hud.toast(`${e.team.data.short}: Strafe vorbei – wieder komplett`);
          break;
        case 'injury': {
          const pl = e.player.data;
          const g = e.games === 1 ? 'Spiel' : 'Spiele';
          this.hud.message(`<b>VERLETZUNG</b><span>${e.team.data.short} · ${pl.firstName} ${pl.lastName}</span><small>${INJURY_NAMES[e.level]} – ${e.games} ${g} Pause</small>`, 3.2, 'injury');
          break;
        }
        case 'shootoutStart':
          this.hud.message('<b>PENALTYS</b><span>Je 3 Schützen</span>', 2, 'penalty');
          break;
        case 'shootoutAttempt': {
          const own = m.human && e.team === m.human.team;
          const turn = m.human && m.human.benched ? (own ? 'Dein Mitspieler schiesst' : 'Dein Mitspieler hält') : (own ? 'Du schiesst!' : 'Du hältst!');
          this.hud.message(`<span>${e.team.data.short} · ${e.shooter.data.firstName} ${e.shooter.data.lastName}</span><small>${turn}</small>`, 1.4, 'small');
          break;
        }
        case 'shootoutResult':
          this.hud.message(e.scored ? '<b>TOR!</b>' : '<b>Gehalten!</b>', 1.6, e.scored ? 'goal' : 'penalty');
          break;
        case 'periodEnd':
          this.menus.intermission(m, this.matchKind === 'online' && !!this.online && this.online.role === 'guest');
          break;
        case 'gameEnd': {
          if (this.matchKind === 'online') { this.menus.end(m, [], '', false, this.online ? this.online.role : 'guest'); break; }
          if (this.matchKind === 'career') {
            const extra = this.finishCareerMatch(m);
            this.menus.end(m, [], extra, true);
            break;
          }
          const others = (this.friendlyTeams || []).filter(t => !t.own);
          const healed = recordMatchInjuries(others, m.rules.injuries.filter(i => !i.team.own));
          let extra = '';
          const ownIdx = m.teams.findIndex(t => t.data.own);
          if (ownIdx >= 0) {
            const r = clubAfterMatch(this.club, m, ownIdx);
            this.saveClub();
            for (const pl of r.healed) healed.push({ team: { short: this.club.short }, player: pl });
            extra = this.trainingSummary(r.training);
          }
          this.refreshTeams();
          this.menus.end(m, healed, extra);
          break;
        }
        case 'lineChange':
          if (m.human && e.team === m.human.team) this.hud.toast(`Linienwechsel → Linie ${e.line + 1}`);
          else this.hud.toast(`${e.team.data.short} wechselt die Linie`);
          break;
        default: break;
      }
    }
  }
}

const app = new App();

// Test- und Debug-Zugriff (Konsole): __uh.app, __uh.sim(sek)
window.__uh = {
  app,
  get match() { return app.match; },
  // Spielt sec Sekunden mit festen Bildern ab (auch wenn der Browser keine Animationsbilder liefert).
  // keys: optionale Eingabe, z. B. { mx: 1, pressed: { shoot: true } }
  run(sec, fps = 30, keys = null) {
    let t = app.last;
    for (let i = 0; i < sec * fps; i++) {
      if (keys) {
        const inp = app.input;
        inp._fake = keys;
      }
      t += 1000 / fps; app.tick(t);
    }
    app.input._fake = null;
    app.last = performance.now();
  },
  sim(sec) { const m = app.match; for (let i = 0; i < sec / DT; i++) { m.step(DT); if (m.state === 'intermission' || m.state === 'end') break; } },
};
