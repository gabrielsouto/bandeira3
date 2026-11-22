'use strict';
// Toda a "arte" é gerada por código: chão, ruas, telhados, árvores, carros e ícones.

const PAL = {
  asphalt: '#575952', asphalt2: '#565850', asphalt3: '#5a5c55',
  line: '#f0cd7b', white: '#f4ecda',
  side: '#dcc8a4', side2: '#d1bc99', side3: '#dfcda9', curb: '#bea985',
  grass: '#83a962', grass2: '#87ac66', grass3: '#7ea45e',
  water: '#58aaa6', water2: '#69b6ad', foam: '#bce4ca',
  plaza: '#b1a78f', plaza2: '#a39a83',
  lot: '#585b61', lot2: '#4f5258',
};
const ROOFS = ['#8c6e5a', '#7d7f86', '#a39a86', '#6b7a8f', '#9a5a4e', '#5f6b5a',
  '#b0a48a', '#857065', '#6f6f78', '#9c8f7a', '#7a6a8a', '#a8836a'];

const CAR_ART = [
  '.oooooooooooooooo.',
  'obbbbdbbbbbbdbbbbo',
  'tbbbwwllllllwwwbbh',
  'obbbwwllllllwwwbbo',
  'obbbwwllllllwwwbbo',
  'obbbwwllllllwwwbbo',
  'obbbwwllllllwwwbbo',
  'tbbbwwllllllwwwbbh',
  'obbbbdbbbbbbdbbbbo',
  '.oooooooooooooooo.',
];
// Furgão voltado para a direita. A faixa na caixa de carga leva a cor do app.
const FERRY_ART = [
  '...oooooooooooooooooo......',
  '.obbbbbbbbbbbbbbbbbbbboo...',
  'obllzzzzzzzzzzzzzzzzzbbbo..',
  'obzzwzwwzwwzwwzwwzwwzzbbbo.',
  'obzzzzzzzzsszzzzzzwwzzbbbbo',
  'obzzzzzzzzsszzzzzzwwzzbbbbo',
  'obzzwzwwzwwzwwzwwzwwzzbbbo.',
  'obllzzzzzzzzzzzzzzzzzbbbo..',
  '.obbbbbbbbbbbbbbbbbbbboo...',
  '...oooooooooooooooooo......',
];
const VLT_ART = [
  '..ooooooooooookkoooooooooooo..',
  '.obwwbwwbwwbbdkkdbbwwbwwbwwbo.',
  'ohwlllllllllldkkdllllllllllwho',
  'obwbbbdddbbbbdkkdbbbbdddbbbwbo',
  'obwbbbdddbbbbdkkdbbbbdddbbbwbo',
  'ohwlllllllllldkkdllllllllllwho',
  '.obwwbwwbwwbbdkkdbbwwbwwbwwbo.',
  '..ooooooooooookkoooooooooooo..',
];
const BUS_ART = [
  '.oooooooooooooooooooooo.',
  'obwwbwwbwwbwwbwwbwwwbbbo',
  'tllllllllllllllllllwwbbh',
  'obbbbbldddlbbldddlbwwbbo',
  'obbbbbldddlbbldddlbwwbbo',
  'obbbbbldddlbbldddlbwwbbo',
  'obbbbbbbbbbbbbbbbbbwwbbo',
  'tllllllllllllllllllwwbbh',
  'obwwbwwbwwbwwbwwbwwwbbbo',
  '.oooooooooooooooooooooo.',
];
const AMBULANCE_ART = [
  '.oooooooooooooooooo..',
  'obbbbbbbbbbbbdwwwbbo.',
  'tzzzzzzzzzzzzdwwwwbbh',
  'olbbbbbzbbbbsdwwwwbbo',
  'olbbbbbzbbbbsdwwwwbbo',
  'olbbbzzzzzbbbdwwwwbbo',
  'olbbbbbzbbbbzdwwwwbbo',
  'olbbbbbzbbbbzdwwwwbbo',
  'tzzzzzzzzzzzzdwwwwbbh',
  'obbbbbbbbbbbbdwwwbbo.',
  '.oooooooooooooooooo..',
];
const VAN_ART = [
  '.oooooooooooooooooo..',
  'obbbbbbbbbbbbdwwwbbo.',
  'tlllllllllllldwwwwbbh',
  'olddllllllllddwwwwbbo',
  'olddbbzzbbblldwwwwbbo',
  'olddbbbzzbblldwwwwbbo',
  'olddbbzzbbblldwwwwbbo',
  'olddllllllllddwwwwbbo',
  'tlllllllllllldwwwwbbh',
  'obbbbbbbbbbbbdwwwbbo.',
  '.oooooooooooooooooo..',
];
// moto vista de cima, de frente para a direita: pneus (k), lanterna (t), piloto (p) e capacete (q)
const MOTO_ART = [
  '....pp........',
  '...pppp.......',
  'kttbbqqbbbbwkh',
  'kttbbqqbbbbwkh',
  '...pppp.......',
  '....pp........',
];
// moto do entregador: a bag vermelha (x, y, logo z) cobre a roda de trás
const MOTO_BAG_ART = [
  'xxxxx..pp........',
  'xyyyx.pppp.......',
  'xyzyxtbbqqbbbbwkh',
  'xyzyxtbbqqbbbbwkh',
  'xyyyx.pppp.......',
  'xxxxx..pp........',
];
// bike do entregador vista de cima: rodas finas (k), quadro (b), ciclista (p, capacete q) e a mochila térmica (x, y, logo z) nas costas
const BIKE_ART = [
  '...xxxx.pp.......',
  '...xyyx.ppp......',
  'tkkxyzxbqqpbbbkkh',
  'tkkxyzxbqqpbbbkkh',
  '...xyyx.ppp......',
  '...xxxx.pp.......',
];
const ARROW_ART = [
  '...x...',
  '...xx..',
  'xxxxxx.',
  'xxxxxxx',
  'xxxxxx.',
  '...xx..',
  '...x...',
];
const ICON_FUEL = [
  '.rrrr...',
  '.rwwr.r.',
  '.rwwr..r',
  '.rrrr..r',
  '.rrrrr.r',
  '.rrrr.rr',
  '.rrrr...',
  'rrrrrr..',
];
const ICON_DROP = [
  '...bb...',
  '...bb...',
  '..bbbb..',
  '.bbbbbb.',
  '.bwbbbb.',
  '.bwbbbb.',
  '..bbbb..',
  '...bb...',
];
const ICON_WRENCH = [
  '....y..y',
  '....yyyy',
  '....yyy.',
  '...yyy..',
  '..yyy...',
  '.yyy....',
  'yyy.....',
  'yy......',
];

function makeIconCanvas(rows, pal, outline = '#0b0b0b') {
  const w = rows[0].length, h = rows.length;
  const [c, g] = makeCanvas(w + 2, h + 2);
  g.fillStyle = outline;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!pal[rows[j][i]]) continue;
    g.fillRect(i, j + 1, 1, 1); g.fillRect(i + 2, j + 1, 1, 1);
    g.fillRect(i + 1, j, 1, 1); g.fillRect(i + 1, j + 2, 1, 1);
  }
  drawPixels(g, 1, 1, rows, pal);
  return c;
}

const ICONS = {
  fuel: makeIconCanvas(ICON_FUEL, { r: '#e74c3c', w: '#f5f5f5' }),
  wrench: makeIconCanvas(ICON_WRENCH, { y: '#f1c40f' }),
  drop: makeIconCanvas(ICON_DROP, { b: '#3fb6ff', w: '#e8f7ff' }),
  arrowGo: makeIconCanvas(ARROW_ART, { x: '#39ff88' }),
  arrowDrop: makeIconCanvas(ARROW_ART, { x: '#ffd23f' }),
  arrowPega: makeIconCanvas(ARROW_ART, { x: '#ff4fd8' }),
  charge: makeIconCanvas(['....cc.', '...cc..', '..cc...', '.ccccc.', '...cc..', '..cc...', '.cc....'], { c: '#5af2ce' }),
  arrow_casa: makeIconCanvas(ARROW_ART, { x: '#ce8cff' }),
  arrow_recarga: makeIconCanvas(ARROW_ART, { x: '#5af2ce' }),
  arrow_posto: makeIconCanvas(ARROW_ART, { x: '#ff6b5e' }),
  arrow_oficina: makeIconCanvas(ARROW_ART, { x: '#ff9a1f' }),
  arrow_lavajato: makeIconCanvas(ARROW_ART, { x: '#3fb6ff' }),
};

function artToCanvas(rows, pal) {
  const [c, g] = makeCanvas(rows[0].length, rows.length);
  drawPixels(g, 0, 0, rows, pal);
  return c;
}

// art: 'car' (padrão), 'taxi' (luminoso no teto), 'escola' (autoescola), 'moto' ou 'bike';
// bag = entregador com a caixa térmica (true = vermelha do euComida, ou a cor da bag)
function makeCarSprites(body, isPlayer, art = 'car', bag = false) {
  let rows = art === 'bike' ? BIKE_ART : art === 'moto' ? (bag ? MOTO_BAG_ART : MOTO_ART) : CAR_ART;
  if (art === 'van') rows = VAN_ART;
  if (art === 'helicoptero') rows = [
    '.............k..........', '...t.........k..........', '...b......zzzkzzzzz.....',
    '...b.......ookoo........', '..obo....obbbkwwwbo.....', 'obbbdddddbbblkwwwbbo....',
    'obbbdddddbbblkwwwbbo....', '..obo....obbbkwwwbo.....', '...b.......ookoo........',
    '...b......zzzkzzzzz.....', '.............k..........', '.............k..........',
  ];
  if (art === 'barca') rows = FERRY_ART;
  if (art === 'vlt') rows = VLT_ART;
  if (art === 'onibus') rows = BUS_ART;
  if (art === 'ambulancia') rows = AMBULANCE_ART;
  const bagCol = typeof bag === 'string' ? bag : '#e3262e';
  if (art === 'viatura') rows = rows.map((row, y) => y >= 2 && y <= 7
    ? row.slice(0, 7) + (y < 5 ? 'zz' : 'ss') + row.slice(9) : row);
  if (art === 'taxi') rows = rows.map((row, y) => (y >= 3 && y <= 6) ? row.slice(0, 7) + 'sss' + row.slice(10) : row);
  // autoescola: faixa vermelha dos lados e placa no teto
  if (art === 'escola') rows = rows.map((row, y) => (y === 1 || y === 8) ? row.slice(0, 3) + 'y'.repeat(12) + row.slice(15)
    : (y >= 3 && y <= 6) ? row.slice(0, 7) + 'yyy' + row.slice(10) : row);
  if (isPlayer && ['car', 'taxi', 'escola'].includes(art)) rows = rows.map((row, y) => (y === 4 || y === 5) ? row.slice(0, 10) + 'g' + row.slice(11) : row);
  const pal = { o: shade(body, -0.6), b: body, d: shade(body, -0.22), l: shade(body, 0.2),
    w: '#24323f', h: '#fff3b0', t: '#7a1c1c', g: '#39ff88', s: '#ff9a1f', k: '#151515', p: bag ? '#3a3a3a' : '#2c3e66', q: isPlayer ? '#39ff88' : '#e8e8e8',
    x: shade(bagCol, -0.55), y: bagCol, z: typeof bag === 'string' ? '#151515' : '#f4f4f4' };
  if (art === 'bike') { pal.b = '#2a2a2a'; pal.h = '#e8f4ff'; } // quadro preto, farolete branco
  if (art === 'van') { pal.l = '#d9dcdd'; pal.z = '#232f3e'; }
  if (art === 'ambulancia' || art === 'viatura') { pal.z = '#e63d42'; pal.s = '#357fe5'; }
  const shadowPal = {};
  for (const k in pal) shadowPal[k] = 'rgba(0,0,0,0.35)';
  return {
    body, art, bag,
    img: artToCanvas(rows, pal),
    brake: artToCanvas(rows, Object.assign({}, pal, { t: '#ff4040' })),
    shadow: artToCanvas(rows, shadowPal),
  };
}

function drawRoof(g, b, r) {
  const x = b.x0 * 16, y = b.y0 * 16, w = (b.x1 - b.x0 + 1) * 16, h = (b.y1 - b.y0 + 1) * 16;
  const base = ROOFS[b.color];
  g.fillStyle = shade(base, -0.22); g.fillRect(x, y, w, h);
  g.fillStyle = shade(base, 0.15); g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle = shade(base, -0.12); g.fillRect(x + 3, y + 3, w - 6, h - 6);
  g.fillStyle = base; g.fillRect(x + 4, y + 4, w - 7, h - 7);
  const ix = x + 4, iy = y + 4, iw = w - 7, ih = h - 7;
  if (b.style === 1) {
    g.fillStyle = shade(base, -0.035);
    for (let k = 2; k < ih; k += 9) g.fillRect(ix, iy + k, iw, 1);
  } else if (b.style === 2) {
    g.fillStyle = shade(base, -0.04);
    for (let k = 6; k < iw; k += 16) g.fillRect(ix + k, iy, 1, ih);
    for (let k = 6; k < ih; k += 16) g.fillRect(ix, iy + k, iw, 1);
  } else {
    speckle(g, ix, iy, iw, ih, r, [shade(base, -0.07), shade(base, 0.07)], Math.floor(iw * ih / 120));
  }
  if (b.style === 3 && iw >= 40 && ih >= 40) { // heliponto
    const cx = ix + (iw >> 1), cy = iy + (ih >> 1);
    pxCircle(g, cx, cy, 13, '#4a4f55');
    g.fillStyle = '#f1c40f';
    g.fillRect(cx - 4, cy - 5, 2, 11); g.fillRect(cx + 3, cy - 5, 2, 11); g.fillRect(cx - 2, cy - 1, 5, 2);
    return;
  }
  const n = Math.floor(iw * ih / 1200) + 1;
  for (let k = 0; k < n; k++) {
    const kind = r();
    const ax = ix + 2 + Math.floor(r() * Math.max(1, iw - 12));
    const ay = iy + 2 + Math.floor(r() * Math.max(1, ih - 10));
    if (kind < 0.5) { // ar-condicionado
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(ax + 1, ay + 1, 5, 4);
      g.fillStyle = '#b9bec4'; g.fillRect(ax, ay, 5, 4);
      g.fillStyle = '#7d838a'; g.fillRect(ax + 1, ay + 1, 3, 2);
    } else if (kind < 0.7) { // respiro
      g.fillStyle = '#2a2a2e'; g.fillRect(ax, ay, 2, 2);
      g.fillStyle = shade(base, 0.25); g.fillRect(ax, ay, 1, 1);
    } else if (kind < 0.88 && iw >= 24 && ih >= 20) { // casa de máquinas
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(ax + 2, ay + 2, 10, 7);
      g.fillStyle = shade(base, -0.25); g.fillRect(ax, ay, 10, 7);
      g.fillStyle = shade(base, 0.1); g.fillRect(ax, ay, 10, 1);
      g.fillStyle = '#3a2f28'; g.fillRect(ax + 6, ay + 4, 3, 3);
    } else { // caixa d'água
      pxCircle(g, ax + 5, ay + 5, 3, 'rgba(0,0,0,0.3)');
      pxCircle(g, ax + 4, ay + 4, 3, '#8796a3');
      g.fillStyle = '#b4c2cc'; g.fillRect(ax + 3, ay + 3, 2, 1);
    }
  }
}

function drawHome(g, p) {
  g.save();
  g.transform(p.a.dx, p.a.dy, p.b.dx, p.b.dy, p.x, p.y);
  const rect = (color, x, y, w, h) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  // Jardim, caminho de pedestres e entrada da garagem.
  rect('#557841', 0, 0, 96, 48);
  rect('#698d4e', 1, 1, 94, 46);
  rect('#b5a68c', 22, 0, 8, 23);
  for (let y = 3; y < 21; y += 4) rect('#cec1a7', 23, y, 6, 2);
  rect('#888891', 48, 0, 32, 48);
  rect('#666775', 48, 4, 2, 44); rect('#666775', 78, 4, 2, 44);
  rect('#a3a2a9', 50, 0, 28, 3);
  // Marcações da vaga.
  rect('#e7ddc0', 54, 10, 1, 27); rect('#e7ddc0', 73, 10, 1, 27);
  rect('#e7ddc0', 54, 37, 20, 1);
  // Fachada, telhado de duas águas e chaminé.
  rect('#494945', 2, 18, 46, 30);
  rect('#e6c8a4', 2, 16, 44, 31);
  rect('#6a443d', 0, 22, 48, 26);
  rect('#b46a54', 1, 23, 46, 12);
  rect('#8b4d43', 1, 35, 46, 12);
  for (let y = 25; y < 47; y += 3) rect('#9e5949', 2, y, 44, 1);
  rect('#d59370', 1, 34, 46, 2);
  rect('#694440', 35, 35, 7, 8); rect('#c59680', 35, 35, 7, 3);
  rect('#725744', 22, 16, 8, 6); rect('#aa805c', 24, 17, 4, 4);
  for (const x of [6, 35]) {
    rect('#826c57', x, 17, 7, 5); rect('#80abac', x + 1, 18, 5, 3);
  }
  // Cerca baixa e canteiros deixam as duas entradas abertas.
  for (const x of [1, 31, 81]) rect('#d6c6a6', x, 5, x === 1 ? 19 : 14, 2);
  for (const x of [2, 9, 17, 32, 39, 45, 82, 89, 94]) rect('#e9dbc0', x, 3, 1, 6);
  for (const y of [18, 33, 42]) {
    pxCircle(g, 87, y, 4, '#3d623d');
    pxCircle(g, 86, y - 1, 2, '#6a944b');
    rect('#e1a492', 86, y, 2, 1);
  }
  g.restore();
}

function drawPlace(g, p, r) {
  const x = p.x0 * 16, y = p.y0 * 16, w = (p.x1 - p.x0 + 1) * 16, h = (p.y1 - p.y0 + 1) * 16;
  const horiz = p.side === 'top' || p.side === 'bottom';
  if (p.kind === 'posto') {
    g.fillStyle = '#7a7d83'; g.fillRect(x, y, w, h);
    speckle(g, x, y, w, h, r, ['#71747a', '#83868c'], (w * h / 40) | 0);
    g.fillStyle = '#e8c547';
    g.fillRect(x + 2, y + 2, w - 4, 1); g.fillRect(x + 2, y + h - 3, w - 4, 1);
    g.fillRect(x + 2, y + 2, 1, h - 4); g.fillRect(x + w - 3, y + 2, 1, h - 4);
    const n = Math.max(1, Math.floor((horiz ? w : h) / 48));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const cx = Math.round(horiz ? x + w * t : x + w / 2), cy = Math.round(horiz ? y + h / 2 : y + h * t);
      const iw = horiz ? 12 : 6, ih = horiz ? 6 : 12;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(cx - iw / 2 + 1, cy - ih / 2 + 2, iw, ih);
      g.fillStyle = '#d9d9d9'; g.fillRect(cx - iw / 2, cy - ih / 2, iw, ih);
      g.fillStyle = '#c0392b';
      if (horiz) { g.fillRect(cx - 4, cy - 2, 3, 4); g.fillRect(cx + 1, cy - 2, 3, 4); }
      else { g.fillRect(cx - 2, cy - 4, 4, 3); g.fillRect(cx - 2, cy + 1, 4, 3); }
    }
  } else if (p.kind === 'lavajato') {
    g.fillStyle = '#6f7f8c'; g.fillRect(x, y, w, h);
    speckle(g, x, y, w, h, r, ['#667683', '#7a8a97'], (w * h / 40) | 0);
    for (let k = 0; k < 6; k++) // poças
      pxCircle(g, x + 8 + Math.floor(r() * (w - 16)), y + 8 + Math.floor(r() * (h - 16)), 2 + Math.floor(r() * 3), 'rgba(90,170,230,0.45)');
    // túnel de lavagem com escovas azuis
    const tw = horiz ? Math.min(40, w - 8) : 26, th = horiz ? 26 : Math.min(40, h - 8);
    const tx = Math.round(x + (w - tw) / 2), ty = Math.round(y + (h - th) / 2);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(tx + 2, ty + 2, tw, th);
    g.fillStyle = '#d8dde2'; g.fillRect(tx, ty, tw, th);
    g.fillStyle = '#3c4a57'; g.fillRect(tx + 2, ty + 2, tw - 4, th - 4);
    g.fillStyle = '#3fb6ff';
    for (let k = 4; k < (horiz ? tw : th) - 4; k += 6) {
      if (horiz) { g.fillRect(tx + k, ty + 3, 3, 5); g.fillRect(tx + k, ty + th - 8, 3, 5); }
      else { g.fillRect(tx + 3, ty + k, 5, 3); g.fillRect(tx + tw - 8, ty + k, 5, 3); }
    }
  } else {
    g.fillStyle = '#5f5b55'; g.fillRect(x, y, w, h);
    speckle(g, x, y, w, h, r, ['#57534d', '#68645e'], (w * h / 40) | 0);
    for (let k = 0; k < 4; k++)
      pxCircle(g, x + 8 + Math.floor(r() * (w - 16)), y + 8 + Math.floor(r() * (h - 16)), 2 + Math.floor(r() * 3), 'rgba(0,0,0,0.25)');
    const back = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[p.side];
    const len = horiz ? w : h;
    for (let k = 0; k < len; k += 4) {
      g.fillStyle = ((k / 4) & 1) ? '#111' : '#f1c40f';
      if (back === 'bottom') g.fillRect(x + k, y + h - 3, 4, 3);
      else if (back === 'top') g.fillRect(x + k, y, 4, 3);
      else if (back === 'right') g.fillRect(x + w - 3, y + k, 3, 4);
      else g.fillRect(x, y + k, 3, 4);
    }
    for (let k = 0; k < 2; k++) {
      let tx, ty;
      if (back === 'bottom') { tx = x + 8 + k * 10; ty = y + h - 10; }
      else if (back === 'top') { tx = x + 8 + k * 10; ty = y + 9; }
      else if (back === 'right') { tx = x + w - 10; ty = y + 8 + k * 10; }
      else { tx = x + 9; ty = y + 8 + k * 10; }
      pxCircle(g, tx + 1, ty + 1, 4, 'rgba(0,0,0,0.35)');
      pxCircle(g, tx, ty, 4, '#1a1a1a');
      pxCircle(g, tx, ty, 1, '#555');
    }
  }
}

function prerenderCity(city) {
  const W = city.W, H = city.H, get = city.get;
  const [cv, g] = makeCanvas(W * TILE, H * TILE);
  const r = mulberry32((city.seed * 7 + 13) >>> 0);

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = get(x, y), px = x * TILE, py = y * TILE;
    switch (t) {
      case T.ROAD:
        g.fillStyle = PAL.asphalt; g.fillRect(px, py, 16, 16);
        speckle(g, px, py, 16, 16, r, [PAL.asphalt2, PAL.asphalt3], 3);
        break;
      case T.SIDEWALK:
        g.fillStyle = PAL.side; g.fillRect(px, py, 16, 16);
        g.fillStyle = PAL.side2;
        g.fillRect(px, py, 16, 1); g.fillRect(px, py, 1, 16);
        speckle(g, px, py, 16, 16, r, [PAL.side2, PAL.side3], 5);
        g.fillStyle = PAL.curb;
        if (get(x + 1, y) === T.ROAD) g.fillRect(px + 14, py, 2, 16);
        if (get(x - 1, y) === T.ROAD) g.fillRect(px, py, 2, 16);
        if (get(x, y + 1) === T.ROAD) g.fillRect(px, py + 14, 16, 2);
        if (get(x, y - 1) === T.ROAD) g.fillRect(px, py, 16, 2);
        break;
      case T.GRASS: case T.TREE:
        if (city.onCoast(x, y)) {
          g.fillStyle = '#f3d290'; g.fillRect(px, py, 16, 16);
          break;
        }
        g.fillStyle = PAL.grass; g.fillRect(px, py, 16, 16);
        speckle(g, px, py, 16, 16, r, [PAL.grass2, PAL.grass3], 5);
        break;
      case T.WATER:
        g.fillStyle = PAL.water; g.fillRect(px, py, 16, 16);
        g.fillStyle = PAL.water2;
        if (r() < .18) g.fillRect(px + 2, py + Math.floor(r() * 14), 6 + Math.floor(r() * 7), 1);
        g.fillStyle = PAL.foam;
        if (get(x + 1, y) !== T.WATER) g.fillRect(px + 15, py, 1, 16);
        if (get(x - 1, y) !== T.WATER) g.fillRect(px, py, 1, 16);
        if (get(x, y + 1) !== T.WATER) g.fillRect(px, py + 15, 16, 1);
        if (get(x, y - 1) !== T.WATER) g.fillRect(px, py, 16, 1);
        break;
      case T.PLAZA:
        g.fillStyle = PAL.plaza; g.fillRect(px, py, 16, 16);
        g.fillStyle = PAL.plaza2;
        for (let a = 0; a < 16; a += 4) for (let b = 0; b < 16; b += 4) if (((a + b) >> 2) & 1) g.fillRect(px + a, py + b, 4, 4);
        break;
      case T.LOT:
        g.fillStyle = PAL.lot; g.fillRect(px, py, 16, 16);
        speckle(g, px, py, 16, 16, r, [PAL.lot2, PAL.asphalt3], 10);
        break;
      default:
        g.fillStyle = '#26262b'; g.fillRect(px, py, 16, 16);
    }
  }

  // Sinalização: faixa central (dupla amarela nas avenidas) e faixas de pedestre.
  const { xs, ys, NX, NY, hSeg, vSeg, wx, wy, rowKind, colKind } = city;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX - 1; i++) {
    if (!hSeg[j][i]) continue;
    const x0 = (xs[i] + wx[i]) * 16, x1 = xs[i + 1] * 16, yy = ys[j] * 16, h = wy[j] * 16, kind = rowKind[j];
    for (let x = x0 + STOP_LINE_OUTER + 2; x + 6 <= x1 - STOP_LINE_OUTER - 2; x += 12) {
      if (kind === 'dupla') { g.fillStyle = PAL.line; g.fillRect(x, yy + 15, 6, 2); }
      else if (kind === 'unica') { g.fillStyle = PAL.white; g.fillRect(x, yy + 15, 6, 2); }
      else { g.fillStyle = PAL.white; g.fillRect(x, yy + 15, 6, 2); g.fillRect(x, yy + h - 17, 6, 2); }
    }
    if (kind === 'larga') { g.fillStyle = PAL.line; g.fillRect(x0 + CROSSWALK_OUTER, yy + h / 2 - 2, x1 - x0 - 2 * CROSSWALK_OUTER, 1); g.fillRect(x0 + CROSSWALK_OUTER, yy + h / 2 + 1, x1 - x0 - 2 * CROSSWALK_OUTER, 1); }
    g.fillStyle = PAL.white;
    for (let k = 0; k < h / 4; k++) { g.fillRect(x0 + CROSSWALK_INNER, yy + 1 + k * 4, CROSSWALK_WIDTH, 2); g.fillRect(x1 - CROSSWALK_OUTER, yy + 1 + k * 4, CROSSWALK_WIDTH, 2); }
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY - 1; j++) {
    if (!vSeg[i][j]) continue;
    const y0 = (ys[j] + wy[j]) * 16, y1 = ys[j + 1] * 16, xx = xs[i] * 16, w = wx[i] * 16, kind = colKind[i];
    for (let y = y0 + STOP_LINE_OUTER + 2; y + 6 <= y1 - STOP_LINE_OUTER - 2; y += 12) {
      if (kind === 'dupla') { g.fillStyle = PAL.line; g.fillRect(xx + 15, y, 2, 6); }
      else if (kind === 'unica') { g.fillStyle = PAL.white; g.fillRect(xx + 15, y, 2, 6); }
      else { g.fillStyle = PAL.white; g.fillRect(xx + 15, y, 2, 6); g.fillRect(xx + w - 17, y, 2, 6); }
    }
    if (kind === 'larga') { g.fillStyle = PAL.line; g.fillRect(xx + w / 2 - 2, y0 + CROSSWALK_OUTER, 1, y1 - y0 - 2 * CROSSWALK_OUTER); g.fillRect(xx + w / 2 + 1, y0 + CROSSWALK_OUTER, 1, y1 - y0 - 2 * CROSSWALK_OUTER); }
    g.fillStyle = PAL.white;
    for (let k = 0; k < w / 4; k++) { g.fillRect(xx + 1 + k * 4, y0 + CROSSWALK_INNER, 2, CROSSWALK_WIDTH); g.fillRect(xx + 1 + k * 4, y1 - CROSSWALK_OUTER, 2, CROSSWALK_WIDTH); }
  }

  for (const p of city.places) drawPlace(g, p, r);

  for (const b of city.buildings) drawRoof(g, b, r);
  return cv;
}

function prerenderMinimap(city) {
  const [c, g] = makeCanvas(city.W * 2, city.H * 2);
  drawMinimapTiles(city, g);
  return c;
}

function drawMinimapTiles(city, g, x0 = 0, y0 = 0, x1 = city.W, y1 = city.H) {
  const col = {
    [T.GRASS]: '#2c4a28', [T.ROAD]: '#c9ccd2', [T.SIDEWALK]: '#5d6068', [T.BUILDING]: '#353844',
    [T.WATER]: '#1b3a5c', [T.TREE]: '#21401f', [T.LOT]: '#6a6d75', [T.PLAZA]: '#6a655a',
  };
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    g.fillStyle = col[city.get(x, y)];
    g.fillRect(x * 2, y * 2, 2, 2);
  }
}
