'use strict';
// Utilidades gerais: números aleatórios, cores, desenho de pixels.

const TILE = 16;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R = {
  f: (a, b) => a + Math.random() * (b - a),
  i: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  chance: (p) => Math.random() < p,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  const c = (v) => clamp(Math.round(v), 0, 255);
  return '#' + ((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1);
}
// f > 0 clareia, f < 0 escurece
function shade(h, f) {
  const [r, g, b] = hexToRgb(h);
  if (f >= 0) return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
  return rgbToHex(r * (1 + f), g * (1 + f), b * (1 + f));
}

function fmtMoney(v) {
  const parts = Math.abs(v).toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '-' : '') + 'R$ ' + parts[0] + ',' + parts[1];
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function drawPixels(g, x, y, rows, pal) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const col = pal[row[i]];
      if (col) { g.fillStyle = col; g.fillRect(x + i, y + j, 1, 1); }
    }
  }
}

function speckle(g, x, y, w, h, r, cols, n) {
  for (let k = 0; k < n; k++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.fillRect(x + Math.floor(r() * w), y + Math.floor(r() * h), 1, 1);
  }
}

// círculo cheio "pixelado"
function pxCircle(g, cx, cy, rad, col) {
  g.fillStyle = col;
  for (let dy = -rad; dy <= rad; dy++) {
    const w = Math.floor(Math.sqrt(rad * rad - dy * dy) + 0.3);
    g.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

// contorno de círculo (algoritmo do ponto médio)
function pxRing(g, cx, cy, rad, col) {
  cx = Math.round(cx); cy = Math.round(cy); rad = Math.round(rad);
  g.fillStyle = col;
  let x = rad, y = 0, err = 1 - rad;
  while (x >= y) {
    g.fillRect(cx + x, cy + y, 1, 1); g.fillRect(cx + y, cy + x, 1, 1);
    g.fillRect(cx - y, cy + x, 1, 1); g.fillRect(cx - x, cy + y, 1, 1);
    g.fillRect(cx - x, cy - y, 1, 1); g.fillRect(cx - y, cy - x, 1, 1);
    g.fillRect(cx + y, cy - x, 1, 1); g.fillRect(cx + x, cy - y, 1, 1);
    y++;
    if (err < 0) err += 2 * y + 1;
    else { x--; err += 2 * (y - x) + 1; }
  }
}

function pxDownArrow(g, cx, cy, col) {
  cx = Math.round(cx); cy = Math.round(cy);
  g.fillStyle = '#000';
  for (let k = 0; k < 5; k++) g.fillRect(cx - 4 + k, cy - 1 + k, 9 - 2 * k, 1);
  g.fillStyle = col;
  for (let k = 0; k < 4; k++) g.fillRect(cx - 3 + k, cy + k, 7 - 2 * k, 1);
}

// No navegador esta linha não faz nada; no Node (servidor do multiplayer) exporta o que é compartilhado.
if (typeof module !== 'undefined' && module.exports) module.exports = { TILE, mulberry32, R, clamp, lerp, angDiff };

function guidedSpeed(car, inp, dt) {
  const p = car.p;
  let v = car.vF;
  if (inp.hb || (!inp.up && !inp.down)) {
    const rate = inp.hb ? p.brake : 14;
    v = Math.sign(v) * Math.max(0, Math.abs(v) - rate * dt);
  } else if (inp.down) v -= (v > 0 ? p.brake : p.accel * 0.5) * dt;
  else v += p.accel * dt;
  return clamp(v, -p.reverseMax, p.maxSpeed);
}
