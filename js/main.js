// Unihockey Stars – Start, Spielschleife, Zusammenspiel von Match, Grafik,
// Eingabe und Menüs.

import { CONFIG } from './config.js';
import { Match } from './match/match.js';
import { defaultTeams } from './club/roster.js';
import { Renderer } from './render/renderer.js';
import { Input, isTouchDevice } from './ui/input.js';
import { Hud } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { loadSettings, saveSettings } from './save/settings.js';

const DT = 1 / CONFIG.physics.tickRate;

class App {
  constructor() {
    this.settings = loadSettings();
    this.touch = isTouchDevice();
    document.body.classList.toggle('touch', this.touch);
    this.teams = defaultTeams();
    this.input = new Input();
    this.hud = new Hud();
    this.menus = new Menus(this);
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

    addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'match') this.pause(); });
    requestAnimationFrame(t => this.frame(t));
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
    t.querySelector('[data-act="pause"]').addEventListener('pointerdown', () => this.pause());
  }

  // KI gegen KI im Hintergrund des Hauptmenüs
  startDemo() {
    this.match = new Match({ teams: defaultTeams(), humanTeam: null, difficulty: 'mittel' });
    this.renderer.setMatch(this.match);
    this.mode = 'menu';
    this.hud.show(false);
    this.showTouch(false);
  }

  startFriendly(pick) {
    const teams = defaultTeams();
    if (pick === 1) teams.reverse(); // eigenes Team spielt immer zuerst von links nach rechts
    this.match = new Match({
      teams, humanTeam: 0, difficulty: this.settings.difficulty,
      settings: { autoChange: this.settings.autoChange, autoGoalie: this.settings.autoGoalie },
    });
    this.renderer.setMatch(this.match);
    this.mode = 'match';
    this.paused = false;
    this.menus.hide();
    this.hud.setTeams(this.match);
    this.hud.show(true);
    this.showTouch(this.touch);
    this.hud.message('1. Drittel', 1.6, 'small');
    this.input.clear();
    this.tryFullscreen();
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

  showTouch(on) { document.getElementById('touch').classList.toggle('hidden', !on); }

  toMenu() {
    this.paused = false;
    this.startDemo();
    this.menus.main();
  }

  pause() {
    if (this.mode !== 'match' || this.paused) return;
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
    if (this.match && (k === 'autoChange' || k === 'autoGoalie')) this.match.settings[k] = v;
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

    if (this.mode === 'match') {
      const { state, pressed } = this.input.poll();
      if (pressed.pause) { if (this.paused) this.resume(); else this.pause(); }
      if (!this.paused && m.human) {
        m.human.setInput(state, pressed);
        this.acc += dt;
        while (this.acc >= DT) { m.step(DT); this.acc -= DT; }
      }
      this.handleEvents();
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
    this.renderer.render(this.paused ? 0 : dt);
  }

  handleEvents() {
    const m = this.match;
    for (const e of m.takeEvents()) {
      switch (e.type) {
        case 'goal': {
          const g = e.goal;
          const own = m.human && e.team === m.human.team;
          const who = g.ownGoal ? 'Eigentor' : `${g.scorer.firstName} ${g.scorer.lastName}`;
          const as = g.assist ? `<small>Assist: ${g.assist.firstName} ${g.assist.lastName}</small>` : '';
          this.hud.message(`<b>TOR!</b><span>${e.team.data.short} · ${who}</span>${as}`, 3, own ? 'goal own' : 'goal');
          break;
        }
        case 'periodEnd':
          this.menus.intermission(m);
          break;
        case 'gameEnd':
          this.menus.end(m);
          break;
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
