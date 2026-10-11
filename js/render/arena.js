// Unihockeyhalle: Hallenboden mit Linien, Banden mit Werbeflächen, Tore,
// Spielerbänke, Tribünen mit Publikum, Anzeigetafel.
// Feld (x, y) → Three.js (x, Höhe, −y).

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { drawLogo } from '../club/logo.js';
import {
  HALF_L, HALF_W, GOAL_X, GOAL_HALF_W, GOAL_BACK_X, CREASE_FRONT_X, CREASE_BACK_X, CREASE_HALF_W, FACEOFF_SPOTS,
} from '../match/field.js';

const F = CONFIG.field;

// Erfundene Sponsoren für die Banden
export const SPONSORS = [
  { name: 'Bergkäse AG', bg: '#ffd84d', fg: '#7a3b00' },
  { name: 'VELO BLITZ', bg: '#1d1d1d', fg: '#ffe600' },
  { name: 'Schoggi Moser', bg: '#5b2d12', fg: '#ffffff' },
  { name: 'Alpen-Mobil', bg: '#0b62c4', fg: '#ffffff' },
  { name: 'Bäckerei Zopf', bg: '#ffffff', fg: '#c0392b' },
  { name: 'Seeblick Hotel', bg: '#13806b', fg: '#ffffff' },
  { name: 'TURBO SPORT', bg: '#e8332a', fg: '#ffffff' },
  { name: 'Gipfelbank', bg: '#ffffff', fg: '#0b3a6e' },
];

export class Arena {
  constructor(scene, quality) {
    this.scene = scene;
    this.q = quality;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.crowd = null;
    this.buildFloor();
    this.buildBoards();
    this.goals = [this.buildGoal(1), this.buildGoal(-1)];
    this.buildBenches();
    this.buildStands();
    this.buildHall();
  }

  buildFloor() {
    const S = 48;
    const c = document.createElement('canvas');
    c.width = F.length * S; c.height = F.width * S;
    const g = c.getContext('2d');
    const P = (x, y) => [(x + HALF_L) * S, (HALF_W - y) * S];
    g.fillStyle = '#8b939a';
    g.fillRect(0, 0, c.width, c.height);
    // Spielfläche (abgerundet)
    g.save();
    roundRect(g, 0, 0, c.width, c.height, F.cornerRadius * S);
    g.clip();
    const grad = g.createRadialGradient(c.width / 2, c.height / 2, 50, c.width / 2, c.height / 2, c.width * 0.6);
    grad.addColorStop(0, '#3f7cc0'); grad.addColorStop(1, '#2f66a6');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    // feine Bodenstruktur
    g.globalAlpha = 0.05;
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#000000';
      g.fillRect(Math.random() * c.width, Math.random() * c.height, 2 + Math.random() * 6, 1);
    }
    g.globalAlpha = 1;
    g.restore();

    g.strokeStyle = '#f4f4f4';
    g.fillStyle = '#f4f4f4';
    g.lineWidth = 0.05 * S;
    // Mittellinie und Mittelkreis
    line(g, P(0, HALF_W), P(0, -HALF_W));
    g.beginPath(); g.arc(...P(0, 0), F.centerCircleRadius * S, 0, Math.PI * 2); g.stroke();
    // Torräume, Goalieräume, Torlinien
    for (const s of [1, -1]) {
      const x0 = s * CREASE_FRONT_X, x1 = s * CREASE_BACK_X;
      const [ax, ay] = P(Math.min(x0, x1), CREASE_HALF_W), [bx, by] = P(Math.max(x0, x1), -CREASE_HALF_W);
      g.strokeRect(ax, ay, bx - ax, by - ay);
      const gx0 = s * GOAL_X, gx1 = s * (GOAL_X - F.goalieAreaDepth);
      const [cx, cy] = P(Math.min(gx0, gx1), F.goalieAreaWidth / 2), [dx, dy] = P(Math.max(gx0, gx1), -F.goalieAreaWidth / 2);
      g.strokeRect(cx, cy, dx - cx, dy - cy);
      line(g, P(s * GOAL_X, GOAL_HALF_W), P(s * GOAL_X, -GOAL_HALF_W));
    }
    // Bully-Punkte als Kreuze
    for (const sp of FACEOFF_SPOTS) {
      const [x, y] = P(sp.x, sp.y);
      const k = 0.3 * S;
      line(g, [x - k, y], [x + k, y]); line(g, [x, y - k], [x, y + k]);
    }
    // Mittelkreis-Bereich merken, damit das Logo später getauscht werden kann
    const [mx, my] = P(0, 0);
    const half = Math.round((F.centerCircleRadius + 0.3) * S);
    this.center = { x: mx - half, y: my - half, size: half * 2, S, cx: mx, cy: my };
    this.centerBase = g.getImageData(this.center.x, this.center.y, this.center.size, this.center.size);
    this.floorCtx = g;
    this.paintCenter(null);

    const tex = new THREE.CanvasTexture(c);
    this.floorTex = tex;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const rink = new THREE.Mesh(new THREE.PlaneGeometry(F.length, F.width),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.0 }));
    rink.rotation.x = -Math.PI / 2;
    rink.receiveShadow = true;
    this.group.add(rink);

    // Hallenboden rundherum
    const hall = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), new THREE.MeshStandardMaterial({ color: 0x8b939a, roughness: 0.8 }));
    hall.rotation.x = -Math.PI / 2;
    hall.position.y = -0.005;
    this.group.add(hall);
  }

  // Mittelkreis: Logo des Heimteams (oder Unihockey-Stars-Stern)
  paintCenter(logo, name) {
    const g = this.floorCtx, c = this.center, S = c.S;
    g.putImageData(this.centerBase, c.x, c.y);
    g.save();
    g.translate(c.cx, c.cy);
    if (logo) {
      g.globalAlpha = 0.8;
      drawLogo(g, logo, 0, -0.2 * S, 3.2 * S);
      g.globalAlpha = 0.55;
      g.fillStyle = '#ffffff';
      g.font = `bold ${0.42 * S}px Arial`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText((name || '').toUpperCase(), 0, 2.15 * S);
    } else {
      g.globalAlpha = 0.18;
      g.fillStyle = '#ffffff';
      starPath(g, 0, 0, 1.6 * S, 0.7 * S, 5);
      g.fill();
      g.globalAlpha = 0.5;
      g.font = `bold ${0.55 * S}px Arial`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('UNIHOCKEY STARS', 0, 2.2 * S);
    }
    g.restore();
    if (this.floorTex) this.floorTex.needsUpdate = true;
  }

  // Banden: Sponsoren, dazu Logos der beiden Teams
  paintAds(teams = [], sponsors = null) {
    const c = this.adCanvas, g = c.getContext('2d');
    const w = c.width / SPONSORS.length;
    // gewählte Sponsoren des Heimteams zuerst, Rest mit Standard-Sponsoren auffüllen
    const list = sponsors && sponsors.length
      ? SPONSORS.map((d, i) => sponsors[i % sponsors.length] || d) : SPONSORS;
    list.forEach((s, i) => {
      g.fillStyle = s.bg; g.fillRect(i * w, 0, w, c.height);
      g.fillStyle = s.fg;
      g.font = 'bold 30px Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(s.name, i * w + w / 2, c.height / 2 + 2);
    });
    teams.forEach((t, k) => {
      if (!t || !t.logo) return;
      const i = k === 0 ? 1 : 5;
      g.fillStyle = '#ffffff'; g.fillRect(i * w, 0, w, c.height);
      drawLogo(g, t.logo, i * w + 34, c.height / 2, 50);
      g.fillStyle = t.colors ? t.colors.shirt : '#222';
      g.font = 'bold 24px Arial, sans-serif';
      g.textAlign = 'left'; g.textBaseline = 'middle';
      const name = t.name.length > 14 ? t.short : t.name;
      g.fillText(name, i * w + 66, c.height / 2 + 2);
    });
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, 5); g.fillRect(0, c.height - 4, c.width, 4);
    if (this.adTexture) this.adTexture.needsUpdate = true;
  }

  buildBoards() {
    // Werbetextur (24 m lang)
    const c = document.createElement('canvas');
    c.width = 2048; c.height = 64;
    this.adCanvas = c;
    this.paintAds();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    this.adTexture = tex; this.adCanvas = c;

    const pts = roundedRectPath(HALF_L, HALF_W, F.cornerRadius, 14);
    const H = F.boardHeight, T = 0.05, AD_LEN = 24;
    const pos = [], uv = [], idxAd = [], idxWhite = [];
    let len = 0;
    const n = pts.length;
    // pro Punkt: innen unten, innen oben, aussen oben, aussen unten
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n], q = pts[(i + 1) % n], o = pts[(i - 1 + n) % n];
      if (i > 0) len += Math.hypot(p.x - o.x, p.y - o.y);
      const tx = q.x - o.x, ty = q.y - o.y, tl = Math.hypot(tx, ty);
      const nx = ty / tl, ny = -tx / tl; // nach aussen
      const u = len / AD_LEN;
      pos.push(p.x, 0, -p.y, p.x, H, -p.y, p.x + nx * T, H, -(p.y + ny * T), p.x + nx * T, 0, -(p.y + ny * T));
      // Innenseite läuft gegen den Uhrzeigersinn → u umdrehen, damit die Schrift lesbar ist
      uv.push(-u, 0, -u, 1, u, 1, u, 0);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 4, b = (i + 1) * 4;
      idxAd.push(a, b, a + 1, b, b + 1, a + 1);                 // innen
      idxAd.push(a + 3, a + 2, b + 3, b + 3, a + 2, b + 2);     // aussen
      idxWhite.push(a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);  // oben
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex([...idxAd, ...idxWhite]);
    geo.addGroup(0, idxAd.length, 0);
    geo.addGroup(idxAd.length, idxWhite.length, 1);
    geo.computeVertexNormals();
    const boards = new THREE.Mesh(geo, [
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, side: THREE.DoubleSide }),
    ]);
    boards.castShadow = true;
    boards.receiveShadow = true;
    this.group.add(boards);
  }

  buildGoal(side) {
    const grp = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xd6201f, roughness: 0.35, metalness: 0.2 });
    const tube = (len, r = F.postRadius) => new THREE.CylinderGeometry(r, r, len, 10);
    const gx = side * GOAL_X, bx = side * GOAL_BACK_X, h = F.goalHeight, w = GOAL_HALF_W;
    const add = (geo, x, y, z, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, red);
      m.position.set(x, y, z); m.rotation.set(rx, 0, rz);
      m.castShadow = true; grp.add(m); return m;
    };
    add(tube(h), gx, h / 2, -w); add(tube(h), gx, h / 2, w);
    add(tube(2 * w), gx, h, 0, Math.PI / 2);
    // Bodenrahmen hinten
    const d = F.goalDepth;
    add(tube(d, 0.025), (gx + bx) / 2, 0.025, -w, 0, Math.PI / 2);
    add(tube(d, 0.025), (gx + bx) / 2, 0.025, w, 0, Math.PI / 2);
    add(tube(2 * w, 0.025), bx, 0.025, 0, Math.PI / 2);
    // Netz
    const nc = document.createElement('canvas');
    nc.width = nc.height = 64;
    const ng = nc.getContext('2d');
    ng.strokeStyle = 'rgba(255,255,255,0.85)'; ng.lineWidth = 2;
    for (let i = 0; i <= 64; i += 8) { line(ng, [i, 0], [i, 64]); line(ng, [0, i], [64, i]); }
    const ntex = new THREE.CanvasTexture(nc);
    ntex.wrapS = ntex.wrapT = THREE.RepeatWrapping;
    const netMat = (rx, ry) => {
      const t = ntex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry);
      return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    };
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * w, h * 0.85), netMat(12, 7));
    back.position.set(bx, h * 0.42, 0); back.rotation.y = Math.PI / 2;
    grp.add(back);
    for (const z of [-w, w]) {
      const s = new THREE.Mesh(sidePanel(d, h), netMat(4, 7));
      s.position.set(gx, 0, z); s.scale.x = side;
      grp.add(s);
    }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(d, 2 * w), netMat(4, 12));
    top.position.set((gx + bx) / 2, h * 0.92, 0); top.rotation.x = -Math.PI / 2; top.rotation.y = -side * 0.25;
    grp.add(top);
    this.group.add(grp);
    return grp;
  }

  buildBenches() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.7 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xaad4ff, transparent: true, opacity: 0.18, roughness: 0.1 });
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(F.benchLength, 0.45, 0.5), mat);
      b.position.set(s * F.benchX, 0.22, -(HALF_W + 1.6));
      b.receiveShadow = true;
      this.group.add(b);
      const g = new THREE.Mesh(new THREE.BoxGeometry(F.benchLength + 0.6, 0.9, 0.04), glass);
      g.position.set(s * F.benchX, 0.95, -(HALF_W + 2.2));
      this.group.add(g);
      // Strafbank (zwischen den Spielerbänken)
      const pb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.5), mat);
      pb.position.set(s * 1.6, 0.22, -(HALF_W + 1.5));
      this.group.add(pb);
      const pg = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.04), glass);
      pg.position.set(s * 1.6, 1.0, -(HALF_W + 2.0));
      this.group.add(pg);
    }
    // Schild «Strafbank»
    const c = document.createElement('canvas');
    c.width = 256; c.height = 48;
    const g2 = c.getContext('2d');
    g2.fillStyle = '#111'; g2.fillRect(0, 0, 256, 48);
    g2.fillStyle = '#ffcf2e'; g2.font = 'bold 28px Arial'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillText('STRAFBANK', 128, 25);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(0, 1.75, -(HALF_W + 2.02));
    this.group.add(sign);
  }

  buildStands() {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x5d636b, roughness: 0.9 });
    const seatA = new THREE.MeshStandardMaterial({ color: 0xb8262a, roughness: 0.7 });
    const rows = 10, depth = 0.85, rise = 0.48;
    this.seats = [];
    this.standRows = [];
    // sichtbare Reihen je Ausbaustufe der Tribünen (0–4)
    const ROWS = { far: [4, 6, 8, 10, 10], end: [0, 2, 4, 7, 10], near: [0, 0, 3, 6, 10] };
    const unlock = (kind, r) => ROWS[kind].findIndex(n => n > r);
    const tier = (cx, cy, len, rot, kind) => {
      // cx, cy: Feldmitte der ersten Reihe; rot: Blickrichtung zum Feld
      for (let r = 0; r < rows; r++) {
        const lvl = unlock(kind, r);
        const step = new THREE.Mesh(new THREE.BoxGeometry(len, rise * (r + 1), depth), concrete);
        const dist = r * depth;
        const ox = Math.cos(rot) * dist, oy = Math.sin(rot) * dist;
        step.position.set(cx + ox, rise * (r + 1) / 2, -(cy + oy));
        step.rotation.y = rot + Math.PI / 2;
        step.receiveShadow = true;
        this.group.add(step);
        const seatRow = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.35), seatA);
        seatRow.position.set(cx + ox, rise * (r + 1) + 0.04, -(cy + oy));
        seatRow.rotation.y = rot + Math.PI / 2;
        this.group.add(seatRow);
        this.standRows.push({ meshes: [step, seatRow], lvl });
        // Sitzplätze für Zuschauer merken
        const n = Math.floor(len / 0.55);
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n - 0.5;
          const px = cx + ox + Math.cos(rot + Math.PI / 2) * t * len;
          const py = cy + oy + Math.sin(rot + Math.PI / 2) * t * len;
          this.seats.push({ x: px, y: py, h: rise * (r + 1), rot, lvl });
        }
      }
    };
    tier(0, HALF_W + 3.2, 44, Math.PI / 2, 'far');        // Gegenseite hinter den Bänken
    tier(HALF_L + 2.5, 0, 22, 0, 'end');                    // rechte Stirnseite
    tier(-(HALF_L + 2.5), 0, 22, Math.PI, 'end');           // linke Stirnseite
    tier(0, -(HALF_W + 4), 36, -Math.PI / 2, 'near');       // Kameraseite (meist ausserhalb des Bildes)
    this.buildCrowd();
  }

  buildCrowd() {
    const max = this.q.crowd;
    // vorne die Plätze, die schon mit kleinen Tribünen da sind
    const seats = this.seats.map(s => ({ ...s, r: Math.random() })).sort((a, b) => a.lvl - b.lvl || a.r - b.r);
    // Qualität begrenzt die Anzahl: gleichmässig ausdünnen
    const step = Math.max(1, seats.length / max);
    const pick = [];
    for (let i = 0; i < seats.length && pick.length < max; i += step) pick.push(seats[Math.floor(i)]);
    pick.sort((a, b) => a.lvl - b.lvl || a.r - b.r);
    this.crowdUnlocked = [0, 1, 2, 3, 4].map(l => pick.filter(s => s.lvl <= l).length);
    const bodyGeo = new THREE.BoxGeometry(0.42, 0.55, 0.3);
    bodyGeo.translate(0, 0.42, 0);
    const headGeo = new THREE.SphereGeometry(0.12, 8, 6);
    headGeo.translate(0, 0.86, 0);
    const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), pick.length);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), pick.length);
    const shirt = ['#d42a2a', '#1f5fbf', '#ffd400', '#ffffff', '#2b2b2b', '#2e8b57', '#ff7f27', '#7d3cff', '#e0e0e0', '#d42a2a'];
    const skin = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
    const col = new THREE.Color();
    this.crowdData = pick.map((s, i) => {
      bodies.setColorAt(i, col.set(shirt[Math.floor(Math.random() * shirt.length)]));
      heads.setColorAt(i, col.set(skin[Math.floor(Math.random() * skin.length)]));
      return { ...s, ph: Math.random() * 10, amp: 0.5 + Math.random() * 0.8 };
    });
    bodies.instanceColor.needsUpdate = true; heads.instanceColor.needsUpdate = true;
    this.crowd = { bodies, heads };
    this.group.add(bodies, heads);
    this._mtx = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._up = new THREE.Vector3(0, 1, 0);
    this.crowdFrame = 0;
    this.crowdCount = pick.length;
    this.updateCrowd(0, 0, true);
  }

  // Halle je nach Ausbau: Tribünenreihen, Publikum (Auslastung), Anzeigetafel
  setHall({ stands = 4, scoreboard = 1, fill = 0.85 } = {}) {
    for (const r of this.standRows) for (const m of r.meshes) m.visible = r.lvl <= stands;
    const n = Math.round(this.crowdUnlocked[stands] * Math.max(0.05, Math.min(1, fill)));
    this.crowdCount = n;
    this.crowd.bodies.count = n;
    this.crowd.heads.count = n;
    this.updateCrowd(0, 0, true);
    const s = [0.7, 1, 1.25, 1.4][scoreboard] || 1;
    this.scoreboard.scale.set(s, s, 1);
    this.scoreFrame.scale.set(s, s, 1);
    this.videoCube.visible = scoreboard >= 2;
  }

  // Publikum wippt, bei Aufregung springen die Leute
  updateCrowd(time, excitement, all = false) {
    if (!this.crowd) return;
    const { bodies, heads } = this.crowd;
    const n = Math.min(this.crowdCount ?? this.crowdData.length, this.crowdData.length);
    const part = all ? 1 : 3;
    this.crowdFrame = (this.crowdFrame + 1) % part;
    for (let i = this.crowdFrame; i < n; i += part) {
      const c = this.crowdData[i];
      const jump = Math.max(0, Math.sin(time * (5 + c.amp * 3) + c.ph)) * (0.03 + excitement * 0.35 * c.amp);
      this._p.set(c.x, c.h + jump, -c.y);
      this._q.setFromAxisAngle(this._up, c.rot + Math.PI / 2);
      this._mtx.compose(this._p, this._q, this._s);
      bodies.setMatrixAt(i, this._mtx);
      heads.setMatrixAt(i, this._mtx);
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }

  buildHall() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.95, side: THREE.BackSide });
    const hall = new THREE.Mesh(new THREE.BoxGeometry(74, 22, 60), wallMat);
    hall.position.y = 10.95; // Boden der Box knapp unter dem Hallenboden
    this.group.add(hall);
    // Anzeigetafel an der Rückwand
    const c = document.createElement('canvas');
    c.width = 512; c.height = 192;
    this.boardCanvas = c;
    this.boardTex = new THREE.CanvasTexture(c);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    const sb = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({ map: this.boardTex }));
    sb.position.set(0, 8.5, -29.8);
    this.group.add(sb);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(8.4, 3.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    frame.position.set(0, 8.5, -29.95);
    this.group.add(frame);
    this.scoreboard = sb; this.scoreFrame = frame;
    // Videowürfel über der Feldmitte (ab Ausbaustufe 2)
    const screen = new THREE.MeshBasicMaterial({ map: this.boardTex });
    const dark = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const cube = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 2.6), [screen, screen, dark, dark, screen, screen]);
    cube.position.set(0, 11.5, 0);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 10, 4), dark);
    rope.position.y = 5.5;
    cube.add(rope);
    cube.visible = false;
    this.group.add(cube);
    this.videoCube = cube;
    this.setScoreboard('HEIM', 0, 'GAST', 0, '20:00', 1);
    // Lichtbänder an der Decke (nur Optik)
    const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
    for (const x of [-15, 0, 15]) for (const z of [-8, 8]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(6, 0.15, 1), lamp);
      l.position.set(x, 21.8, z);
      this.group.add(l);
    }
  }

  setScoreboard(a, sa, b, sb, clock, period) {
    const key = `${a}${sa}${b}${sb}${clock}${period}`;
    if (key === this._sbKey) return;
    this._sbKey = key;
    const g = this.boardCanvas.getContext('2d');
    g.fillStyle = '#05070a'; g.fillRect(0, 0, 512, 192);
    g.fillStyle = '#ffb000'; g.font = 'bold 40px monospace'; g.textAlign = 'center';
    g.fillText(a, 110, 55); g.fillText(b, 402, 55);
    g.font = 'bold 90px monospace'; g.fillStyle = '#ff3b2f';
    g.fillText(String(sa), 110, 150); g.fillText(String(sb), 402, 150);
    g.fillStyle = '#3cff6b'; g.font = 'bold 54px monospace';
    g.fillText(clock, 256, 95);
    g.font = 'bold 30px monospace'; g.fillStyle = '#ffb000';
    g.fillText(`${period}. DRITTEL`, 256, 150);
    this.boardTex.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- Helfer

function line(g, a, b) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

function starPath(g, x, y, R, r, n) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n;
    const rr = i % 2 ? r : R;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

// Punkte entlang der Bande (gegen den Uhrzeigersinn)
export function roundedRectPath(hx, hy, R, seg) {
  const pts = [];
  const corners = [
    { cx: hx - R, cy: -hy + R, a0: -Math.PI / 2 },
    { cx: hx - R, cy: hy - R, a0: 0 },
    { cx: -hx + R, cy: hy - R, a0: Math.PI / 2 },
    { cx: -hx + R, cy: -hy + R, a0: Math.PI },
  ];
  for (const c of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = c.a0 + (i / seg) * Math.PI / 2;
      pts.push({ x: c.cx + Math.cos(a) * R, y: c.cy + Math.sin(a) * R });
    }
  }
  return pts;
}

// Seitennetz: Dreieck/Trapez von Pfosten (hoch) nach hinten (niedrig)
function sidePanel(d, h) {
  const geo = new THREE.BufferGeometry();
  const v = [0, 0, 0, d, 0, 0, d, h * 0.85, 0, 0, h, 0];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 0.85, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  return geo;
}
