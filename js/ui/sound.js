// Ton mit Web Audio, komplett synthetisch: Schuss, Pass, Bande, Pfosten,
// Parade, Pfiff, Torsirene und Publikum (lauter bei Chancen und Toren).
// Der Ton startet erst nach der ersten Berührung/Taste (Vorgabe der Browser).

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this.crowdLevel = 0;
  }

  // Beim ersten Tippen/Tastendruck aufrufen
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.enabled ? +this.volume : 0;
    this.master.connect(c.destination);
    // Rauschen als Grundlage für viele Klänge
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Publikum: gefiltertes, leicht schwankendes Rauschen
    const src = c.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    this.crowdGain = c.createGain(); this.crowdGain.gain.value = 0;
    src.connect(bp).connect(lp).connect(this.crowdGain).connect(this.master);
    src.start();
  }

  setEnabled(on, volume = this.volume) {
    this.enabled = on; this.volume = +volume || 0.7;
    if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.05);
  }

  get ok() { return !!this.ctx && this.enabled; }

  // ------------------------------------------------------------ Bausteine

  burst({ dur = 0.08, freq = 2000, type = 'highpass', q = 0.7, gain = 0.5, attack = 0.002 }) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  tone({ freq = 440, dur = 0.2, type = 'sine', gain = 0.3, slide = 0, delay = 0, attack = 0.005 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  // ------------------------------------------------------------ Klänge

  shot(power = 0.5) {
    if (!this.ok) return;
    this.burst({ dur: 0.05 + power * 0.04, freq: 1500, gain: 0.35 + power * 0.4 });   // Klack der Kelle
    this.tone({ freq: 180, dur: 0.08, type: 'triangle', gain: 0.25 + power * 0.2, slide: -100 });
  }

  pass() {
    if (!this.ok) return;
    this.burst({ dur: 0.04, freq: 2500, gain: 0.2 });
  }

  board(speed) {
    if (!this.ok || speed < 3) return;
    const v = Math.min(1, speed / 20);
    this.burst({ dur: 0.12, freq: 380, type: 'lowpass', q: 1, gain: 0.25 + v * 0.45 });
    this.tone({ freq: 95, dur: 0.12, type: 'sine', gain: 0.25 * v });
  }

  post() {
    if (!this.ok) return;
    for (const [f, g] of [[1180, 0.25], [2410, 0.12], [3650, 0.06]]) this.tone({ freq: f, dur: 0.9, gain: g, attack: 0.001 });
    this.crowdBurst(0.6, 0.8);
  }

  save() {
    if (!this.ok) return;
    this.burst({ dur: 0.1, freq: 600, type: 'lowpass', gain: 0.4 });
    this.crowdBurst(0.35, 0.6);
  }

  whistle(long = false) {
    if (!this.ok) return;
    const dur = long ? 1.1 : 0.35;
    for (const [f, g] of [[2900, 0.12], [3120, 0.09]]) {
      const o = this.tone({ freq: f, dur, type: 'square', gain: g, attack: 0.02 });
      // Triller
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 28;
      const lg = this.ctx.createGain(); lg.gain.value = 70;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(); lfo.stop(this.ctx.currentTime + dur + 0.05);
    }
    if (long) this.tone({ freq: 2900, dur: 0.5, type: 'square', gain: 0.1, delay: 1.25, attack: 0.02 });
  }

  horn() {
    if (!this.ok) return;
    // Torsirene: tiefer Akkord, 2 Sekunden
    for (const f of [196, 247, 294]) this.tone({ freq: f, dur: 2.2, type: 'sawtooth', gain: 0.07, attack: 0.08 });
    this.crowdBurst(1, 3);
  }

  // Jubel/Raunen des Publikums
  crowdBurst(level, secs) {
    if (!this.ctx) return;
    this.crowdBoost = Math.max(this.crowdBoost || 0, level);
    this.crowdBoostUntil = this.ctx.currentTime + secs;
  }

  // jedes Bild: Grundlautstärke des Publikums nach Aufregung (0..1.2)
  crowd(excitement, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    let lvl = active ? 0.05 + Math.min(1.2, excitement) * 0.18 : 0.02;
    if (this.crowdBoostUntil > t) lvl = Math.max(lvl, (this.crowdBoost || 0) * 0.45);
    else this.crowdBoost = 0;
    this.crowdGain.gain.setTargetAtTime(lvl, t, 0.25);
  }
}
