// Selbst gebaute 3D-Spielerfigur (Feldspieler und Goalie) mit prozeduralen
// Animationen: stehen, laufen, Schuss aufladen, schiessen, passen,
// Stockeinsatz, fallen, jubeln, Goalie-Parade.
//
// Modellraum: Blick nach +X, oben +Y, links −Z. Die Arme werden per
// Zwei-Gelenk-IK an den Schläger geführt.

import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0);
const L_UA = 0.27, L_FA = 0.27, L_TH = 0.44, L_SH = 0.44;
const SHAFT = 1.02;
export const MODEL_SCALE = 1.12; // Figuren etwas grösser als echt, damit man sie gut sieht
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xd9a066];
const HAIR = [0x2b1b0e, 0x5a3a1a, 0x8b5a2b, 0xd8b26e, 0x111111, 0x6b4423];

let G = null; // gemeinsame Geometrien
function geos() {
  if (G) return G;
  const limb = (r, len) => { const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 3, 8); g.translate(0, -len / 2, 0); return g; };
  G = {
    torso: (() => {
      // Profil von der Taille bis zum Hals (Lathe → runde Schultern)
      const pr = [[0.15, 0], [0.155, 0.08], [0.17, 0.2], [0.19, 0.32], [0.2, 0.4], [0.185, 0.46], [0.14, 0.51], [0.06, 0.54]];
      return new THREE.LatheGeometry(pr.map(([r, y]) => new THREE.Vector2(r, y)), 18);
    })(),
    shoulder: new THREE.SphereGeometry(0.068, 10, 8),
    pelvis: new THREE.CylinderGeometry(0.155, 0.165, 0.2, 12),
    head: new THREE.SphereGeometry(0.105, 16, 12),
    hair: new THREE.SphereGeometry(0.112, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
    neck: new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8),
    upperArm: limb(0.058, L_UA),
    foreArm: limb(0.047, L_FA),
    hand: new THREE.SphereGeometry(0.045, 8, 6),
    thigh: limb(0.072, L_TH),
    shin: limb(0.056, L_SH),
    shoe: (() => { const g = new THREE.BoxGeometry(0.25, 0.08, 0.11); g.translate(0.05, -L_SH - 0.01, 0); return g; })(),
    shaft: (() => { const g = new THREE.CylinderGeometry(0.014, 0.012, SHAFT, 6); g.translate(0, -SHAFT / 2, 0); return g; })(),
    grip: (() => { const g = new THREE.CylinderGeometry(0.017, 0.017, 0.22, 6); g.translate(0, -0.11, 0); return g; })(),
    blade: (() => { const g = new THREE.BoxGeometry(0.27, 0.075, 0.02); g.translate(0.11, 0.035, 0); return g; })(),
    // Goalie-Ausrüstung
    helmet: new THREE.SphereGeometry(0.13, 16, 12),
    mask: new THREE.SphereGeometry(0.135, 12, 8, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.25, Math.PI * 0.5),
    glove: new THREE.SphereGeometry(0.07, 10, 8),
    pad: limb(0.09, L_SH),
  };
  return G;
}

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts }));
  return matCache.get(key);
}

function jerseyTexture(colors, number, goalie) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = goalie ? colors.goalie : colors.shirt;
  g.fillRect(0, 0, 256, 128);
  // Schulterpartie und Seitenstreifen
  g.fillStyle = colors.shirt2;
  g.fillRect(0, 0, 256, 16);
  g.fillRect(118, 16, 20, 112);
  g.fillRect(246, 16, 10, 112); g.fillRect(0, 16, 10, 112);
  g.fillStyle = colors.number;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 3;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 70px Arial, sans-serif';
  g.strokeText(String(number), 192, 70); g.fillText(String(number), 192, 70);
  g.font = 'bold 30px Arial, sans-serif';
  g.strokeText(String(number), 64, 52); g.fillText(String(number), 64, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class PlayerModel {
  constructor({ colors, number, stick, stickSide = 'L', goalie = false, seed = 1, shadows = true }) {
    const g = geos();
    this.goalie = goalie;
    this.hs = stickSide === 'L' ? 1 : -1;
    this.phase = Math.random() * 6;
    this.root = new THREE.Group();
    this.root.scale.setScalar(MODEL_SCALE);
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.body.position.y = 0.95;

    const skin = mat(SKIN[seed % SKIN.length]);
    const hair = mat(HAIR[(seed * 7) % HAIR.length]);
    const shorts = mat(colors.shorts);
    const socks = mat(goalie ? colors.goalie : colors.socks);
    const shoe = mat(0x222222);
    const jersey = new THREE.MeshStandardMaterial({ map: jerseyTexture(colors, number, goalie), roughness: 0.8 });
    this.jerseyMat = jersey;
    const meshes = [];
    const add = (parent, geo, m, pos) => {
      const mesh = new THREE.Mesh(geo, m);
      if (pos) mesh.position.set(...pos);
      parent.add(mesh); meshes.push(mesh); return mesh;
    };

    // Becken + Oberkörper
    add(this.body, g.pelvis, goalie ? mat(colors.goalie) : shorts, [0, -0.02, 0]).scale.set(1, 1, 0.8);
    this.torso = new THREE.Group();
    this.torso.position.y = 0.06;
    this.body.add(this.torso);
    const tm = add(this.torso, g.torso, jersey, [0, 0, 0]);
    tm.scale.set(goalie ? 1.12 : 1, 1, goalie ? 0.95 : 0.78);
    add(this.torso, g.neck, skin, [0, 0.53, 0]);
    this.head = new THREE.Group();
    this.head.position.y = 0.66;
    this.torso.add(this.head);
    if (goalie) {
      add(this.head, g.helmet, mat(colors.goalie, { roughness: 0.4 }));
      add(this.head, g.mask, mat(0x222222, { wireframe: true }));
    } else {
      add(this.head, g.head, skin);
      add(this.head, g.hair, hair, [-0.012, 0.012, 0]);
    }

    // Arme (Schulter → Ellbogen → Hand)
    this.arms = [];
    for (const side of [-1, 1]) { // −1 = links (−Z)
      const upper = new THREE.Group();
      const shoulder = new THREE.Vector3(0, 0.45, side * 0.21);
      upper.position.copy(shoulder);
      this.torso.add(upper);
      add(upper, g.upperArm, jersey).scale.set(goalie ? 1.3 : 1, 1, goalie ? 1.3 : 1);
      add(upper, g.shoulder, jersey).scale.setScalar(goalie ? 1.35 : 1);
      const fore = new THREE.Group();
      fore.position.y = -L_UA;
      upper.add(fore);
      add(fore, g.foreArm, goalie ? jersey : skin).scale.set(goalie ? 1.3 : 1, 1, goalie ? 1.3 : 1);
      add(fore, goalie ? g.glove : g.hand, goalie ? mat(0xeeeeee) : mat(0x1d1d1d), [0, -L_FA, 0]);
      this.arms.push({ side, upper, fore, shoulder });
    }

    // Beine
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0, -0.06, side * 0.095);
      this.body.add(hip);
      add(hip, g.thigh, goalie ? mat(colors.goalie) : shorts).scale.set(goalie ? 1.25 : 1, 1, goalie ? 1.25 : 1);
      const knee = new THREE.Group();
      knee.position.y = -L_TH;
      hip.add(knee);
      add(knee, goalie ? g.pad : g.shin, goalie ? mat(0xf2f2f2) : socks);
      add(knee, g.shoe, shoe);
      this.legs.push({ side, hip, knee });
    }

    // Schläger (nicht beim Goalie)
    if (!goalie) {
      this.stick = new THREE.Group();
      this.root.add(this.stick);
      add(this.stick, g.shaft, mat(stick.shaft, { roughness: 0.4 }));
      add(this.stick, g.grip, mat(0x111111));
      this.bladeMesh = add(this.stick, g.blade, mat(stick.blade, { roughness: 0.45 }), [0, -SHAFT, 0]);
    }
    for (const m of meshes) { m.castShadow = shadows; m.receiveShadow = false; }

    this._grip = new THREE.Vector3();
    this._heel = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._inv = new THREE.Matrix4();
  }

  setStickColors(stick) {
    if (!this.stick) return;
    this.stick.children[0].material = mat(stick.shaft, { roughness: 0.4 });
    this.bladeMesh.material = mat(stick.blade, { roughness: 0.45 });
  }

  dispose() {
    this.jerseyMat.map.dispose();
    this.jerseyMat.dispose();
  }

  // Pose aus dem Spielerzustand: { action, t, dir, speed, charge }
  pose(s, dt) {
    const hs = this.hs;
    const sp = s.speed;
    this.phase += dt * (2.2 + sp * 1.55);
    const ph = this.phase;
    const run = Math.min(1, sp / 5.5);

    // Grundwerte
    let bodyY = 0.95, lean = 0, twist = 0, roll = 0, sideShift = 0;
    let legSwing = Math.sin(ph) * 0.75 * run;
    let crouch = 0.22 + run * 0.08;
    let spread = 0;
    const grip = this._grip.set(0.2, 1.0, 0.07 * hs);
    const heel = this._heel.set(0.39, 0, -0.2 * hs);
    let heelOnFloor = true;
    let leftHand = null, rightHand = null; // feste Handziele (Goalie, Jubel)

    lean = 0.15 + run * 0.22;
    heel.z += Math.sin(ph * 0.5) * 0.08 * run;
    heel.x += Math.cos(ph * 0.5) * 0.05 * run;

    const t = s.t;
    switch (s.action) {
      case 'charge': {
        const c = Math.min(1, s.charge);
        twist = 0.75 * c * hs;
        heel.set(0.4 - 0.85 * c, 0.15 + 0.65 * c, -0.25 * hs - 0.35 * c * hs);
        heelOnFloor = false;
        lean = 0.3;
        break;
      }
      case 'shoot': {
        heelOnFloor = false;
        if (t < 0.1) {
          const k = t / 0.1;
          heel.set(-0.35 + 0.85 * k, 0.6 - 0.57 * k, -0.55 * hs + 0.4 * hs * k);
          twist = (0.7 - 0.9 * k) * hs;
        } else {
          const k = Math.min(1, (t - 0.1) / 0.3);
          heel.set(0.5 + 0.45 * k, 0.03 + 1.05 * k, -0.15 * hs + 0.45 * hs * k);
          twist = (-0.2 - 0.4 * k) * hs;
        }
        lean = 0.35;
        break;
      }
      case 'pass': {
        heelOnFloor = false;
        const k = Math.min(1, t / 0.32);
        const sw = k < 0.3 ? -(k / 0.3) : (k - 0.3) / 0.7;
        heel.set(0.45 + 0.35 * sw, 0.03 + Math.max(0, sw) * 0.25, -0.3 * hs + 0.25 * hs * sw);
        twist = -0.35 * sw * hs;
        break;
      }
      case 'poke': {
        const k = Math.sin(Math.min(1, t / 0.25) * Math.PI);
        heel.set(0.46 + 0.45 * k, 0, -0.18 * hs);
        lean += 0.25 * k;
        break;
      }
      case 'cheer': {
        heelOnFloor = false;
        const jump = Math.max(0, Math.sin(t * 7)) * 0.22;
        bodyY += jump;
        legSwing = 0.3 * Math.sin(t * 7);
        crouch = 0.1;
        lean = -0.1;
        grip.set(0.05, 1.95 + jump, 0.0);
        heel.set(0.1, 2.0 + jump + 0.8, -0.5 * hs);
        break;
      }
      case 'fall': {
        const k = Math.min(1, t / 0.4);
        lean = 1.45 * k;
        bodyY = 0.95 - 0.7 * k;
        crouch = 0.3;
        legSwing = 0;
        heel.set(0.9, 0, -0.5 * hs);
        break;
      }
      default: break;
    }

    if (this.goalie) {
      heelOnFloor = false;
      crouch = 0.62; spread = 0.32; lean = 0.42; legSwing *= 0.35;
      leftHand = this._tmp.set(0.32, 0.72, -0.36).clone();
      rightHand = new THREE.Vector3(0.32, 0.72, 0.36);
      if (s.action === 'save' && t < 0.7) {
        const k = Math.sin(Math.min(1, t / 0.6) * Math.PI);
        const dir = s.dir || 1; // +1 = nach links (−Z)
        roll = -dir * 1.1 * k;
        sideShift = -dir * 0.45 * k;
        spread = 0.32 + 0.4 * k;
        leftHand.set(0.25, 0.9 + 0.4 * k * (dir > 0 ? 1 : 0), -0.45 - 0.2 * k);
        rightHand.set(0.25, 0.9 + 0.4 * k * (dir < 0 ? 1 : 0), 0.45 + 0.2 * k);
      } else if (s.action === 'throw' && t < 0.5) {
        const k = Math.sin(Math.min(1, t / 0.45) * Math.PI);
        rightHand.set(0.1 + 0.4 * k, 1.1 + 0.8 * k, 0.3);
        crouch = 0.3;
      } else if (s.holding) {
        leftHand.set(0.3, 0.95, -0.1);
        rightHand.set(0.3, 0.95, 0.1);
        crouch = 0.35;
      }
    }

    // Beine: Oberschenkel nach vorn (+), Knie nach hinten
    for (const leg of this.legs) {
      const sgn = leg.side === -1 ? 1 : -1;
      const swing = legSwing * sgn;
      leg.hip.rotation.z = crouch + swing;
      const kneeBend = crouch * 2 + Math.max(0, -Math.sin(ph + (sgn > 0 ? 0 : Math.PI))) * 0.9 * run;
      leg.knee.rotation.z = -kneeBend;
      leg.hip.rotation.x = -leg.side * spread;
    }
    const legH = L_TH * Math.cos(crouch) + L_SH * Math.cos(crouch * 1) * Math.cos(spread);
    if (s.action !== 'cheer' && s.action !== 'fall') bodyY = 0.07 + legH * (this.goalie ? 0.96 : 1) + Math.abs(Math.sin(ph)) * 0.04 * run;

    this.body.position.set(0, bodyY, sideShift);
    this.body.rotation.set(roll, 0, -lean * 0.5);
    this.torso.rotation.set(0, twist, -lean * 0.5);
    this.head.rotation.set(0, -twist * 0.6, lean * 0.6);

    // Schläger ausrichten
    if (this.stick) {
      let end;
      if (heelOnFloor) {
        // Griffhöhe so wählen, dass die Kelle genau am Ziel auf dem Boden liegt
        const hd = Math.min(SHAFT * 0.85, Math.hypot(heel.x - grip.x, heel.z - grip.z));
        grip.y = Math.sqrt(SHAFT * SHAFT - hd * hd) + 0.02;
        end = this._tmp.set(heel.x, 0.02, heel.z);
      } else {
        end = this._tmp.copy(heel);
      }
      const dir = end.sub(grip).normalize();             // Griff → Kelle
      const yAxis = dir.clone().negate();                // Schaft nach oben
      let xAxis = new THREE.Vector3(1, 0, 0);
      xAxis.sub(yAxis.clone().multiplyScalar(xAxis.dot(yAxis)));
      if (xAxis.lengthSq() < 1e-4) xAxis.set(0, 0, 1);
      xAxis.normalize();
      const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
      this._m.makeBasis(xAxis, yAxis, zAxis);
      this.stick.quaternion.setFromRotationMatrix(this._m);
      this.stick.position.copy(grip);
      // Handziele: oberste Hand am Griff, untere Hand weiter unten
      const top = grip.clone();
      const low = grip.clone().addScaledVector(dir, 0.42);
      if (hs > 0) { leftHand = low; rightHand = top; } else { leftHand = top; rightHand = low; }
    }

    // Arme per IK (Ziele aus Modellraum in den Oberkörperraum umrechnen)
    this.body.updateMatrix(); this.torso.updateMatrix();
    this._m.multiplyMatrices(this.body.matrix, this.torso.matrix);
    this._inv.copy(this._m).invert();
    for (const arm of this.arms) {
      const target = (arm.side < 0 ? leftHand : rightHand) || new THREE.Vector3(0.1, 0.75, arm.side * 0.3);
      const tl = target.clone().applyMatrix4(this._inv);
      solveArm(arm, tl);
    }
  }
}

const _pole = new THREE.Vector3();
function solveArm(arm, target) {
  const sh = arm.shoulder;
  const d = target.clone().sub(sh);
  let dist = d.length();
  const max = L_UA + L_FA - 0.002;
  if (dist > max) { d.multiplyScalar(max / dist); dist = max; }
  if (dist < 0.05) { d.set(0.05, 0, 0); dist = 0.05; }
  const dn = d.clone().divideScalar(dist);
  const cosA = (L_UA * L_UA + dist * dist - L_FA * L_FA) / (2 * L_UA * dist);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  // Ellbogen nach aussen und unten/hinten
  _pole.set(-0.4, -0.6, arm.side * 0.8);
  _pole.sub(dn.clone().multiplyScalar(_pole.dot(dn))).normalize();
  const elbow = sh.clone().addScaledVector(dn, Math.cos(a) * L_UA).addScaledVector(_pole, Math.sin(a) * L_UA);
  const ud = elbow.clone().sub(sh).normalize();
  arm.upper.quaternion.setFromUnitVectors(DOWN, ud);
  const hand = sh.clone().add(d);
  const fd = hand.sub(elbow).normalize().applyQuaternion(arm.upper.quaternion.clone().invert());
  arm.fore.quaternion.setFromUnitVectors(DOWN, fd);
}
