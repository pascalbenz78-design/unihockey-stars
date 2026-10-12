// Eingabe: Tastatur (PC), Touch (virtueller Joystick + Tasten) und am PC
// wahlweise Bewegung mit der Maus (gleicher Joystick, mit gedrückter Maustaste).
// poll() liefert den Zustand (Richtung, gehaltene Tasten) und die seit dem
// letzten Aufruf neu gedrückten Tasten.

const KEYMAP = {
  // Pass: Alt (links oder rechts/AltGr); X bleibt als Ersatz, falls Alt im Browser nicht ankommt
  Space: 'shoot', AltLeft: 'pass', AltRight: 'pass', KeyX: 'pass', KeyC: 'bank', ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyE: 'switch', KeyG: 'goalie', KeyQ: 'line', KeyP: 'pause', Escape: 'pause',
};
const MOVE = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = {};
    this.held = {};
    this.joy = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this.enabled = true;
    addEventListener('keydown', e => this.onKey(e, true));
    addEventListener('keyup', e => this.onKey(e, false));
    addEventListener('blur', () => { this.keys.clear(); this.held = {}; });
  }

  onKey(e, down) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    // Manche Umgebungen melden Alt nur über den Tastennamen
    const code = e.code || (e.key === 'Alt' ? 'AltLeft' : e.key === 'AltGraph' ? 'AltRight' : '');
    const act = KEYMAP[code];
    if (act || MOVE[code]) e.preventDefault();   // verhindert u. a., dass Alt die Menüleiste öffnet
    if (down) {
      if (this.keys.has(code)) return; // Tastenwiederholung ignorieren
      this.keys.add(code);
      if (act) { this.pressed[act] = true; this.held[act] = true; }
    } else {
      this.keys.delete(code);
      if (act) this.held[act] = [...this.keys].some(k => KEYMAP[k] === act);
    }
  }

  // Touch-Steuerung an die Elemente binden
  bindTouch(joyZone, knob, buttons) {
    const base = knob.parentElement;
    const R = 55;
    const move = e => {
      const dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
      const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
      this.joy.x = dx * k / R; this.joy.y = -dy * k / R;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    };
    joyZone.addEventListener('pointerdown', e => {
      if (this.joy.id != null) return;
      this.joy.id = e.pointerId; this.joy.ox = e.clientX; this.joy.oy = e.clientY;
      base.style.left = `${e.clientX}px`; base.style.top = `${e.clientY}px`;
      base.classList.add('active');
      joyZone.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    joyZone.addEventListener('pointermove', e => { if (e.pointerId === this.joy.id) move(e); });
    const end = e => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.id = null; this.joy.x = 0; this.joy.y = 0;
      knob.style.transform = '';
      base.classList.remove('active');
    };
    joyZone.addEventListener('pointerup', end);
    joyZone.addEventListener('pointercancel', end);

    for (const btn of buttons) {
      const act = btn.dataset.act;
      btn.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        this.pressed[act] = true; this.held[act] = true;
        btn.classList.add('down');
        btn.setPointerCapture(e.pointerId);
      });
      const up = e => { e.preventDefault(); this.held[act] = false; btn.classList.remove('down'); };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    }
  }

  poll() {
    let mx = 0, my = 0;
    for (const k of this.keys) { const v = MOVE[k]; if (v) { mx += v[0]; my += v[1]; } }
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    if (this.joy.id != null) {
      const j = Math.hypot(this.joy.x, this.joy.y);
      // kleine tote Zone, danach volle Richtung
      if (j > 0.18) { mx = this.joy.x / Math.max(j, 0.7); my = this.joy.y / Math.max(j, 0.7); }
    }
    const pressed = this.pressed;
    this.pressed = {};
    if (this._fake) { // Testeingabe
      const f = this._fake;
      if (f.mx != null) mx = f.mx;
      if (f.my != null) my = f.my;
      Object.assign(pressed, f.pressed || {});
      f.pressed = null;
      return { state: { mx, my, sprint: !!f.sprint, shootHeld: !!f.shootHeld }, pressed };
    }
    return {
      state: { mx, my, sprint: !!this.held.sprint, shootHeld: !!this.held.shoot },
      pressed,
    };
  }

  clear() { this.pressed = {}; }
}
