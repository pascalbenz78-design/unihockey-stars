// Zeichnet ein Match mit Three.js: Szene, Licht, Schatten, Kamera,
// Spielerfiguren, Ball und Markierungen.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Arena } from './arena.js';
import { PlayerModel } from './playerModel.js';
import { HALF_W } from '../match/field.js';
import { frameAt } from '../match/replay.js';
import { penaltyBox } from '../match/rules.js';

const CAM = CONFIG.camera;

export class Renderer {
  constructor(canvas, qualityKey) {
    this.canvas = canvas;
    this.qualityKey = qualityKey;
    this.q = CONFIG.graphics[qualityKey] || CONFIG.graphics.mittel;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.q.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.q.shadows > 0;
    this.renderer.shadowMap.type = this.q.shadows >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1d222b);
    this.scene.fog = new THREE.Fog(0x1d222b, 45, 90);
    this.camera = new THREE.PerspectiveCamera(CAM.fov, 16 / 9, 0.5, 200);
    this.camTarget = new THREE.Vector3(0, 0, 0);
    this.camPos = new THREE.Vector3(0, CAM.height, CAM.distance);

    this.scene.add(new THREE.HemisphereLight(0xf4f7ff, 0x50565e, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-6, 22, 8);
    sun.target.position.set(0, 0, 0);
    if (this.q.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(this.q.shadows, this.q.shadows);
      const c = sun.shadow.camera;
      c.left = -23; c.right = 23; c.top = 14; c.bottom = -14; c.near = 5; c.far = 50;
      sun.shadow.bias = -0.0015;
      sun.shadow.normalBias = 0.04;
    }
    this.scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
    fill.position.set(10, 15, -12);
    this.scene.add(fill);

    this.arena = new Arena(this.scene, this.q);
    this.models = new Map();
    this.blobTex = makeBlobTexture();
    this.blobGeo = new THREE.PlaneGeometry(1, 1);
    this.blobGeo.rotateX(-Math.PI / 2);

    // Ball
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x444444 }));
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.ballShadow = this.makeBlob(0.3);

    // Markierung gesteuerter Spieler
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.6, 32), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.012;
    this.scene.add(this.marker);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 4), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    this.arrow.rotation.x = Math.PI;
    this.scene.add(this.arrow);
    // Ladebalken um den Spieler
    this.chargeRing = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.8, 32, 1, Math.PI / 2, Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
    this.chargeRing.rotation.x = -Math.PI / 2;
    this.chargeRing.position.y = 0.014;
    this.scene.add(this.chargeRing);
    // Passempfänger
    this.passMarker = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.48, 24), new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.7, depthWrite: false }));
    this.passMarker.rotation.x = -Math.PI / 2;
    this.passMarker.position.y = 0.011;
    this.scene.add(this.passMarker);

    // Schiedsrichter (nur Optik)
    this.refs = [0, 1].map(i => {
      const model = new PlayerModel({
        colors: { shirt: '#151515', shirt2: '#151515', shorts: '#151515', socks: '#151515', number: '#fff', goalie: '#151515', stripes: '#f2f2f2' },
        number: '', referee: true, seed: 40 + i, shadows: this.q.shadows > 0,
      });
      this.scene.add(model.root);
      return { model, x: 0, y: (i ? 1 : -1) * 8.7, action: 'idle', t: 0 };
    });

    this.time = 0;
    this.excitement = 0;
    this.resize();
  }

  makeBlob(size) {
    const m = new THREE.Mesh(this.blobGeo, new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false, opacity: 0.55 }));
    m.scale.set(size, 1, size);
    m.position.y = 0.006;
    this.scene.add(m);
    return m;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    this._size = sizeKey(this.canvas, pr);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // schmale Bildschirme: etwas weiter weg
    this.distMul = this.camera.aspect < 1.5 ? 1.25 : this.camera.aspect < 1.8 ? 1.08 : 1;
    if (h < 500) this.distMul *= 1.08; // flache Handybildschirme: mehr Übersicht
    this.camera.updateProjectionMatrix();
  }

  // Modelle für ein neues Match vorbereiten
  setMatch(match) {
    for (const m of this.models.values()) { this.scene.remove(m.model.root); m.model.dispose(); if (m.blob) this.scene.remove(m.blob); }
    this.models.clear();
    this.match = match;
    for (const t of match.teams) {
      for (const p of t.players.values()) {
        const model = new PlayerModel({
          colors: t.data.colors, number: p.data.number, stick: p.data.stick, stickSide: p.data.stickSide,
          goalie: p.isGoalie, seed: p.id, shadows: this.q.shadows > 0,
          look: p.data.look, logo: t.data.logo,
          favorite: !!t.data.goldStick && t.data.favorite === p.id,
        });
        model.root.visible = false;
        this.scene.add(model.root);
        const blob = this.q.shadows ? null : this.makeBlob(0.9);
        this.models.set(p, { model, blob, benchSlot: null });
      }
      // Plätze auf der Bank
      let i = 0;
      for (const p of t.players.values()) this.models.get(p).benchSlot = i++;
    }
    const c = match.ball;
    this.camTarget.set(c.x, 0, -c.y);
    // Logo des Heimteams im Mittelkreis, beide Logos auf den Banden
    const home = match.teams[match.home || 0].data;
    this.arena.paintCenter(home.logo || null, home.name);
    this.arena.paintAds(match.teams.map(t => t.data), match.sponsors || null);
    this.arena.setHall(match.hall || { stands: 2, scoreboard: 1, fill: 0.75 });
  }

  render(dt, extra = {}) {
    const m = this.match;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    if (this._size !== sizeKey(this.canvas, pr)) this.resize();
    this.time += dt;
    if (!m) { this.renderer.render(this.scene, this.camera); return; }
    const leaving = new Set(m.leaving.map(l => l.p));
    const ctl = m.human ? m.human.controlled : null;
    // Wiederholung: Zustand aus der Aufzeichnung statt live
    const frame = m.state === 'replay' && m.replay ? frameAt(m.replay.frames, m.replay.t) : null;
    this.frame = frame;

    for (const t of m.teams) {
      for (const p of t.players.values()) {
        const e = this.models.get(p);
        const md = e.model;
        let st;
        if (frame) {
          st = frame.players.get(p);
        } else if (p.onField || leaving.has(p)) {
          st = {
            x: p.x, y: p.y, facing: p.facing, speed: p.speed, action: p.anim.action, t: p.anim.t, dir: p.anim.dir,
            charge: p.charge, holding: p.isGoalie && m.ball.owner === p,
          };
        }
        if (!st && p.inBox) {
          // sitzt auf der Strafbank
          const box = penaltyBox(t);
          st = { x: box.x, y: box.y, facing: -Math.PI / 2, speed: 0, action: 'idle', t: this.time, dir: 0 };
        }
        if (!st && this.q.bench && !p.injuredNow) {
          // Ersatzspieler stehen hinter der Bande bei der Bank
          const slot = e.benchSlot;
          const bx = t.side * CONFIG.field.benchX;
          st = {
            x: bx - CONFIG.field.benchLength / 2 + 0.3 + Math.floor(slot / 2) * 0.66, y: HALF_W + 0.95 + (slot % 2) * 0.5,
            facing: -Math.PI / 2, speed: 0, action: 'idle', t: this.time, dir: 0,
          };
        }
        md.root.visible = !!st;
        if (e.blob) e.blob.visible = !!st;
        if (!st) continue;
        md.root.position.set(st.x, 0, -st.y);
        md.root.rotation.y = st.facing;
        md.pose({
          action: st.action, t: st.t, dir: st.dir, speed: st.speed,
          charge: st.charge != null ? st.charge / CONFIG.shot.chargeTime : 0, holding: st.holding,
        }, dt);
        if (e.blob) e.blob.position.set(st.x, 0.006, -st.y);
      }
    }

    // Ball
    const b = frame ? frame.ball : m.ball;
    this.ball.position.set(b.x, Math.max(0.085, b.z + 0.085), -b.y);
    this.ballShadow.position.set(b.x, 0.007, -b.y);
    this.ballShadow.visible = !this.q.shadows || b.z > 0.3;

    this.updateReferees(dt, b);

    // Markierungen
    const showCtl = ctl && ctl.onField && (m.state === 'play' || m.state === 'faceoff' || m.state === 'shootout');
    this.marker.visible = this.arrow.visible = !!showCtl;
    this.chargeRing.visible = false;
    if (showCtl) {
      this.marker.position.x = ctl.x; this.marker.position.z = -ctl.y;
      this.arrow.position.set(ctl.x, 2.25 + Math.sin(this.time * 6) * 0.06, -ctl.y);
      if (ctl.charge != null) {
        const c = Math.min(1, ctl.charge / CONFIG.shot.chargeTime);
        this.chargeRing.visible = true;
        this.chargeRing.geometry.setDrawRange(0, Math.max(1, Math.floor(c * 32)) * 6);
        this.chargeRing.position.x = ctl.x; this.chargeRing.position.z = -ctl.y;
        this.chargeRing.material.color.setHSL(0.15 - c * 0.15, 1, 0.55);
      }
    }
    const mb = m.ball;
    const pt = !frame && mb.pass && !mb.owner && mb.pass.to && mb.pass.to.onField && m.human && mb.pass.to.team === m.human.team ? mb.pass.to : null;
    this.passMarker.visible = !!pt;
    if (pt) { this.passMarker.position.x = pt.x; this.passMarker.position.z = -pt.y; }

    // Anzeigetafel
    const [ta, tb] = m.teams;
    this.arena.setScoreboard(ta.data.short, ta.score, tb.data.short, tb.score, m.shootout ? 'PEN' : m.clockText(), m.isOT ? 'V' : m.period);

    // Publikum: Aufregung bei Torchancen und Toren
    let want = 0.1;
    const gx = Math.abs(b.x);
    if (gx > 10) want = 0.25 + (gx - 10) / 10;
    if (mb.shot) want = 0.8;
    if (m.state === 'goal' || m.state === 'celebrate') want = 1.2;
    this.excitement += (want - this.excitement) * Math.min(1, dt * 2.5);
    this.arena.updateCrowd(this.time, this.excitement);

    this.updateCamera(dt, extra);
    this.renderer.render(this.scene, this.camera);
  }

  // Zwei Schiedsrichter laufen an den Längsseiten mit; bei Strafen Arm hoch
  updateReferees(dt, b) {
    const m = this.match;
    const signal = m.rules && m.rules.signalUntil > m.time;
    const k = 1 - Math.exp(-2.2 * dt);
    this.refs.forEach((r, i) => {
      const side = i === 0 ? -1 : 1;
      const tx = Math.max(-15, Math.min(15, b.x + side * 4.5));
      const ty = side * (HALF_W - 1.3);
      const ox = r.x, oy = r.y;
      r.x += (tx - r.x) * k; r.y += (ty - r.y) * k;
      const v = Math.hypot(r.x - ox, r.y - oy) / Math.max(dt, 1e-3);
      const facing = Math.atan2(b.y - r.y, b.x - r.x);
      r.model.root.visible = !m.shootout;
      r.model.root.position.set(r.x, 0, -r.y);
      r.model.root.rotation.y = facing;
      const act = signal && i === (b.y > 0 ? 1 : 0) ? 'signal' : v > 0.5 ? 'run' : 'idle';
      if (act !== r.action) { r.action = act; r.t = 0; }
      r.t += dt;
      r.model.pose({ action: act, t: r.t, dir: 0, speed: v, charge: 0 }, dt);
    });
  }

  updateCamera(dt, extra) {
    const m = this.match, b = this.frame ? this.frame.ball : m.ball;
    if (this.debugCam) {
      this.camera.position.set(...this.debugCam.pos);
      this.camera.lookAt(...this.debugCam.look);
      return;
    }
    // Wiederholung: erst tief von der Seite, dann hinter dem Tor
    if (m.state === 'replay' && m.replay) {
      const r = m.replay;
      const f = (r.t - r.start) / Math.max(0.01, r.end - r.start);
      if (f < 0.5) {
        this.camera.position.set(b.x - 3.5, 2.3, -b.y + 7.5);
      } else {
        const s = r.side;
        this.camera.position.set(s * 21.1, 2.4, -b.y * 0.3 + 1.6);
      }
      this.camera.lookAt(b.x, 0.5, -b.y);
      this.camTarget.set(b.x, 0, -b.y * 0.55);
      return;
    }
    // Jubel: näher beim Torschützen
    if (m.state !== 'celebrate') this._celebFor = null;
    if (m.state === 'celebrate' && m.celebrator) {
      const s = m.celebrator;
      if (this._celebFor !== s) { this._celebFor = s; this.camTarget.set(s.x, 0, -s.y); }
      const k = 1 - Math.exp(-3 * dt);
      this.camTarget.x += (s.x - this.camTarget.x) * k;
      this.camTarget.z += (-s.y - this.camTarget.z) * k;
      this.camera.position.set(this.camTarget.x + 1.5, 3.6, this.camTarget.z + 7.5);
      this.camera.lookAt(this.camTarget.x, 1.0, this.camTarget.z);
      return;
    }
    let tx = b.x + (b.vx || 0) * CAM.lookAhead, ty = b.y + (b.vy || 0) * CAM.lookAhead;
    const owner = m.ball.owner;
    if (owner) { tx = owner.x + owner.vx * 0.4; ty = owner.y + owner.vy * 0.3; }
    tx = Math.max(-CAM.maxX, Math.min(CAM.maxX, tx));
    ty = Math.max(-5, Math.min(6, ty));
    const k = 1 - Math.exp(-CAM.follow * dt);
    this.camTarget.x += (tx - this.camTarget.x) * k;
    this.camTarget.z += (-ty * 0.55 - this.camTarget.z) * k;
    const dist = CAM.distance * this.distMul;
    const zoom = m.state === 'goal' ? 0.82 : m.shootout ? 0.85 : 1;
    this.camera.position.set(this.camTarget.x * 0.92, CAM.height * this.distMul * zoom, this.camTarget.z + dist * zoom);
    this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z - 1.2);
  }
}

const sizeKey = (c, pr) => `${c.clientWidth}x${c.clientHeight}x${pr}`;

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.7)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
