// Vereinslogos aus Formen, Symbolen und Initialen. Ein Logo ist ein kleines
// JSON-Objekt und wird überall mit drawLogo() auf ein Canvas gezeichnet.
//   { shape, bg, border, symbol, symbolColor, initials, textColor }

export const SHAPES = { shield: 'Schild', circle: 'Kreis', diamond: 'Raute', square: 'Quadrat', hexagon: 'Sechseck' };
export const SYMBOLS = {
  none: 'Keins', star: 'Stern', bolt: 'Blitz', crown: 'Krone', ball: 'Ball', flame: 'Flamme', mountain: 'Berg',
  sticks: 'Schläger', wolf: 'Wolf', eagle: 'Adler', bear: 'Bär', ibex: 'Steinbock', fox: 'Fuchs',
};

const POLY = {
  bolt: [[0.15, -1], [-0.55, 0.1], [-0.05, 0.1], [-0.25, 1], [0.55, -0.15], [0.05, -0.15], [0.3, -1]],
  crown: [[-0.85, 0.55], [-0.85, -0.45], [-0.42, 0.05], [0, -0.75], [0.42, 0.05], [0.85, -0.45], [0.85, 0.55]],
  mountain: [[-1, 0.7], [-0.35, -0.5], [-0.1, -0.1], [0.25, -0.8], [1, 0.7]],
  wolf: [[-0.7, -0.95], [-0.35, -0.35], [0.35, -0.35], [0.7, -0.95], [0.78, -0.1], [0.55, 0.35], [0.2, 0.55],
    [0.12, 0.92], [-0.12, 0.92], [-0.2, 0.55], [-0.55, 0.35], [-0.78, -0.1]],
  fox: [[-0.85, -0.95], [-0.3, -0.35], [0.3, -0.35], [0.85, -0.95], [0.9, 0], [0.45, 0.3], [0, 0.95], [-0.45, 0.3], [-0.9, 0]],
  eagle: [[0, -0.25], [-0.3, -0.5], [-1, -0.62], [-0.75, -0.36], [-0.97, -0.25], [-0.6, -0.05], [-0.78, 0.1], [-0.3, 0.15],
    [-0.2, 0.6], [0, 0.92], [0.2, 0.6], [0.3, 0.15], [0.78, 0.1], [0.6, -0.05], [0.97, -0.25], [0.75, -0.36], [1, -0.62], [0.3, -0.5]],
};

function poly(g, pts, x, y, s) {
  g.beginPath();
  pts.forEach(([px, py], i) => (i ? g.lineTo(x + px * s, y + py * s) : g.moveTo(x + px * s, y + py * s)));
  g.closePath();
  g.fill();
}

function starPath(g, x, y, R, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r : R;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function shapePath(g, shape, x, y, S) {
  const h = S / 2;
  g.beginPath();
  switch (shape) {
    case 'circle': g.arc(x, y, h, 0, Math.PI * 2); break;
    case 'diamond': g.moveTo(x, y - h); g.lineTo(x + h, y); g.lineTo(x, y + h); g.lineTo(x - h, y); break;
    case 'square': {
      const r = S * 0.14;
      g.moveTo(x - h + r, y - h); g.arcTo(x + h, y - h, x + h, y + h, r); g.arcTo(x + h, y + h, x - h, y + h, r);
      g.arcTo(x - h, y + h, x - h, y - h, r); g.arcTo(x - h, y - h, x + h, y - h, r);
      break;
    }
    case 'hexagon':
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(x + Math.cos(a) * h, y + Math.sin(a) * h); }
      break;
    default: // Schild
      g.moveTo(x - h * 0.86, y - h * 0.92);
      g.quadraticCurveTo(x, y - h * 0.72, x + h * 0.86, y - h * 0.92);
      g.lineTo(x + h * 0.86, y - h * 0.05);
      g.quadraticCurveTo(x + h * 0.8, y + h * 0.62, x, y + h);
      g.quadraticCurveTo(x - h * 0.8, y + h * 0.62, x - h * 0.86, y - h * 0.05);
  }
  g.closePath();
}

function drawSymbol(g, sym, x, y, s, color, bg) {
  g.fillStyle = color; g.strokeStyle = color;
  switch (sym) {
    case 'star': starPath(g, x, y, s, s * 0.42); g.fill(); break;
    case 'ball': {
      g.beginPath(); g.arc(x, y, s * 0.85, 0, Math.PI * 2); g.fill();
      g.fillStyle = bg;
      for (const [dx, dy] of [[0, 0], [-0.42, -0.25], [0.42, -0.25], [-0.42, 0.3], [0.42, 0.3], [0, -0.55], [0, 0.58]]) {
        g.beginPath(); g.arc(x + dx * s, y + dy * s, s * 0.11, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'flame':
      g.beginPath();
      g.moveTo(x, y + s * 0.95);
      g.bezierCurveTo(x - s * 0.95, y + s * 0.8, x - s * 0.6, y - s * 0.2, x - s * 0.1, y - s);
      g.bezierCurveTo(x, y - s * 0.4, x + s * 0.35, y - s * 0.35, x + s * 0.3, y - s * 0.7);
      g.bezierCurveTo(x + s * 0.95, y - s * 0.1, x + s * 0.8, y + s * 0.85, x, y + s * 0.95);
      g.fill();
      break;
    case 'sticks':
      g.lineWidth = s * 0.16; g.lineCap = 'round';
      for (const sg of [1, -1]) {
        g.beginPath(); g.moveTo(x - sg * s * 0.7, y - s * 0.8); g.lineTo(x + sg * s * 0.45, y + s * 0.55); g.stroke();
        g.beginPath(); g.moveTo(x + sg * s * 0.45, y + s * 0.55); g.lineTo(x + sg * s * 0.85, y + s * 0.5); g.stroke();
      }
      g.beginPath(); g.arc(x, y + s * 0.78, s * 0.16, 0, Math.PI * 2); g.fill();
      break;
    case 'bear':
      g.beginPath(); g.arc(x, y + s * 0.12, s * 0.66, 0, Math.PI * 2); g.fill();
      for (const sg of [1, -1]) { g.beginPath(); g.arc(x + sg * s * 0.52, y - s * 0.45, s * 0.26, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = bg;
      for (const sg of [1, -1]) { g.beginPath(); g.arc(x + sg * s * 0.25, y - s * 0.02, s * 0.08, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.ellipse(x, y + s * 0.38, s * 0.14, s * 0.1, 0, 0, Math.PI * 2); g.fill();
      break;
    case 'ibex':
      poly(g, [[-0.28, -0.1], [0.28, -0.1], [0.22, 0.5], [0, 0.9], [-0.22, 0.5]], x, y, s);
      g.lineWidth = s * 0.17; g.lineCap = 'round';
      for (const sg of [1, -1]) {
        g.beginPath(); g.moveTo(x + sg * s * 0.15, y - s * 0.1);
        g.quadraticCurveTo(x + sg * s * 0.3, y - s * 1.05, x + sg * s * 0.9, y - s * 0.55); g.stroke();
      }
      break;
    case 'none': break;
    default:
      if (POLY[sym]) {
        poly(g, POLY[sym], x, y, s);
        if (sym === 'wolf' || sym === 'fox') {
          g.fillStyle = bg;
          for (const sg of [1, -1]) { g.beginPath(); g.arc(x + sg * s * 0.27, y + s * 0.02, s * 0.08, 0, Math.PI * 2); g.fill(); }
        }
        if (sym === 'eagle') { g.beginPath(); g.arc(x, y - s * 0.45, s * 0.2, 0, Math.PI * 2); g.fill(); }
      }
  }
}

// Logo der Grösse S (Pixel) mit Mittelpunkt (x, y) zeichnen
export function drawLogo(g, logo, x, y, S) {
  if (!logo) return;
  g.save();
  shapePath(g, logo.shape, x, y, S);
  g.fillStyle = logo.bg;
  g.fill();
  g.lineWidth = Math.max(1.5, S * 0.06);
  g.strokeStyle = logo.border;
  g.stroke();
  g.clip();
  const hasText = !!(logo.initials && logo.initials.trim());
  const hasSym = logo.symbol && logo.symbol !== 'none';
  if (hasSym) drawSymbol(g, logo.symbol, x, y - (hasText ? S * 0.12 : 0), S * (hasText ? 0.24 : 0.32), logo.symbolColor, logo.bg);
  if (hasText) {
    const t = logo.initials.trim().slice(0, 3).toUpperCase();
    g.fillStyle = logo.textColor;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = hasSym ? S * (t.length > 2 ? 0.2 : 0.24) : S * (t.length > 2 ? 0.3 : 0.38);
    g.font = `900 ${fs}px Arial, sans-serif`;
    g.fillText(t, x, y + (hasSym ? S * 0.26 : S * 0.02));
  }
  g.restore();
}

export function logoCanvas(logo, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  drawLogo(c.getContext('2d'), logo, size / 2, size / 2, size * 0.92);
  return c;
}

export function logoDataURL(logo, size = 96) {
  try { return logoCanvas(logo, size).toDataURL(); } catch { return ''; }
}

// Zufallslogo (für erfundene Gegner, Etappe 4)
export function randomLogo(rand, colors, initials) {
  const pick = o => { const k = Object.keys(o); return k[Math.floor(rand() * k.length)]; };
  let symbol = pick(SYMBOLS);
  if (symbol === 'none') symbol = 'star';
  return { shape: pick(SHAPES), bg: colors.shirt, border: colors.shirt2, symbol, symbolColor: colors.shirt2, initials, textColor: colors.number || '#ffffff' };
}
