'use strict';
// Geração procedural da cidade: grade de ruas, quarteirões, prédios, praças, postos e oficinas.

const T = { GRASS: 0, ROAD: 1, SIDEWALK: 2, BUILDING: 3, WATER: 4, TREE: 5, LOT: 6, PLAZA: 7 };
// 0 = leste, 1 = sul, 2 = oeste, 3 = norte
const DIRS = [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 }];
// Distâncias medidas para fora, a partir da borda do cruzamento (em pixels).
const CROSSWALK_INNER = 14, CROSSWALK_WIDTH = 10;
const SIGNAL_SETBACK = CROSSWALK_INNER / 2; // foco entre a travessia e a borda do cruzamento
const CROSSWALK_OUTER = CROSSWALK_INNER + CROSSWALK_WIDTH;
const STOP_LINE_OUTER = CROSSWALK_OUTER + 5;
const ROOF_COUNT = 12;
const OFICINA_NAMES = ['Mecânica do Zé', 'Auto Center Rapidão', 'Oficina Dois Irmãos', 'Mecânica Boa Vista'];
const POSTO_NAMES = ['Auto Posto Estrela', 'Posto Bandeirante', 'Posto Boa Viagem', 'Posto Avenida'];
const LAVA_NAMES = ['Lava Jato Brilho Total', 'Lava Rápido do Tião'];

function generateCity(seed) {
  const r = mulberry32(seed);
  const ri = (a, b) => Math.floor(a + r() * (b - a + 1));
  const NX = 9, NY = 9, MARGIN = 6;

  // segmentos de rua entre cruzamentos (alguns são removidos e viram calçadão)
  const hSeg = [], vSeg = [];
  for (let j = 0; j < NY; j++) hSeg.push(new Array(NX - 1).fill(true));
  for (let i = 0; i < NX; i++) vSeg.push(new Array(NY - 1).fill(true));

  // tipo de cada rua inteira (linha j = horizontal, coluna i = vertical):
  //   'dupla' = 2 tiles, 1 faixa por sentido;  'unica' = 2 tiles, 2 faixas no mesmo sentido (rowDir/colDir);
  //   'larga' = 4 tiles, 2 faixas por sentido (avenida)
  const rowKind = new Array(NY).fill('dupla'), colKind = new Array(NX).fill('dupla');
  const rowDir = new Array(NY).fill(0), colDir = new Array(NX).fill(1); // sentido da mão única: 0 leste / 1 sul (ou 2 oeste / 3 norte)

  // pode sair do cruzamento (i,j) indo na direção d? (a rua existe e a mão deixa)
  const canGo = (i, j, d) => {
    if (i < 0 || j < 0 || i >= NX || j >= NY) return false;
    if (d === 0) return i < NX - 1 && hSeg[j][i] && !(rowKind[j] === 'unica' && rowDir[j] !== 0);
    if (d === 2) return i > 0 && hSeg[j][i - 1] && !(rowKind[j] === 'unica' && rowDir[j] !== 2);
    if (d === 1) return j < NY - 1 && vSeg[i][j] && !(colKind[i] === 'unica' && colDir[i] !== 1);
    return j > 0 && vSeg[i][j - 1] && !(colKind[i] === 'unica' && colDir[i] !== 3);
  };
  const exits = (i, j) => { const e = []; for (let d = 0; d < 4; d++) if (canGo(i, j, d)) e.push(d); return e; };
  // por onde dá para chegar no cruzamento (i,j) andando na direção d
  const entries = (i, j) => {
    const e = [];
    for (let d = 0; d < 4; d++) if (canGo(i - DIRS[d].dx, j - DIRS[d].dy, d)) e.push(d);
    return e;
  };
  // quantas ruas (de qualquer mão) saem do cruzamento
  const links = (i, j) => (i < NX - 1 && hSeg[j][i] ? 1 : 0) + (j < NY - 1 && vSeg[i][j] ? 1 : 0)
    + (i > 0 && hSeg[j][i - 1] ? 1 : 0) + (j > 0 && vSeg[i][j - 1] ? 1 : 0);
  // todos os cruzamentos alcançam todos (respeitando a mão)? "back" anda ao contrário, para checar que todos voltam
  const reach = (back) => {
    const seen = new Uint8Array(NX * NY);
    const st = [[0, 0]]; seen[0] = 1; let n = 1;
    while (st.length) {
      const [i, j] = st.pop();
      for (let d = 0; d < 4; d++) {
        const a = i + DIRS[d].dx, b = j + DIRS[d].dy;
        const ok = back ? canGo(a, b, (d + 2) % 4) : canGo(i, j, d);
        if (ok && !seen[b * NX + a]) { seen[b * NX + a] = 1; n++; st.push([a, b]); }
      }
    }
    return n === NX * NY;
  };
  const connected = () => reach(false) && reach(true);
  let removed = 0;
  for (let tries = 0; tries < 300 && removed < 14; tries++) {
    if (r() < 0.5) {
      const i = ri(0, NX - 2), j = ri(0, NY - 1);
      if (!hSeg[j][i]) continue;
      hSeg[j][i] = false;
      if (links(i, j) < 2 || links(i + 1, j) < 2 || !connected()) { hSeg[j][i] = true; continue; }
    } else {
      const i = ri(0, NX - 1), j = ri(0, NY - 2);
      if (!vSeg[i][j]) continue;
      vSeg[i][j] = false;
      if (links(i, j) < 2 || links(i, j + 1) < 2 || !connected()) { vSeg[i][j] = true; continue; }
    }
    removed++;
  }

  // sorteia ruas de mão única e avenidas largas (só nas ruas de dentro; a mão única precisa deixar a cidade toda alcançável)
  const streets = [];
  for (let k = 1; k < NY - 1; k++) streets.push({ row: true, k });
  for (let k = 1; k < NX - 1; k++) streets.push({ row: false, k });
  for (let k = streets.length - 1; k > 0; k--) { const m = Math.floor(r() * (k + 1)); [streets[k], streets[m]] = [streets[m], streets[k]]; }
  let nUni = 0, nLarga = 0;
  for (const st of streets) {
    const kinds = st.row ? rowKind : colKind, dirs = st.row ? rowDir : colDir;
    const flip = r() < 0.5;
    if (nUni < 4 && (nUni <= nLarga || nLarga >= 3)) {
      kinds[st.k] = 'unica'; dirs[st.k] = st.row ? (flip ? 2 : 0) : (flip ? 3 : 1);
      if (connected()) nUni++; else kinds[st.k] = 'dupla';
    } else if (nLarga < 3) {
      kinds[st.k] = 'larga'; nLarga++;
    }
  }
  const wy = rowKind.map((k) => (k === 'larga' ? 4 : 2)), wx = colKind.map((k) => (k === 'larga' ? 4 : 2));

  const xs = [], ys = [];
  let p = MARGIN;
  for (let i = 0; i < NX; i++) { xs.push(p); p += wx[i] + ri(8, 13); }
  p = MARGIN;
  for (let j = 0; j < NY; j++) { ys.push(p); p += wy[j] + ri(8, 13); }
  const W = xs[NX - 1] + wx[NX - 1] + MARGIN, H = ys[NY - 1] + wy[NY - 1] + MARGIN;

  const tiles = new Uint8Array(W * H);
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T.WATER : tiles[y * W + x];
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = t; };

  // água na borda
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) set(x, y, T.WATER);
  }

  const colRoad = new Uint8Array(W), rowRoad = new Uint8Array(H);
  xs.forEach((x, i) => { for (let a = 0; a < wx[i]; a++) colRoad[x + a] = 1; });
  ys.forEach((y, j) => { for (let a = 0; a < wy[j]; a++) rowRoad[y + a] = 1; });

  for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++)
    for (let a = 0; a < wx[i]; a++) for (let b = 0; b < wy[j]; b++) set(xs[i] + a, ys[j] + b, T.ROAD);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX - 1; i++) {
    const t = hSeg[j][i] ? T.ROAD : T.PLAZA;
    for (let x = xs[i] + wx[i]; x < xs[i + 1]; x++) for (let b = 0; b < wy[j]; b++) set(x, ys[j] + b, t);
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY - 1; j++) {
    const t = vSeg[i][j] ? T.ROAD : T.PLAZA;
    for (let y = ys[j] + wy[j]; y < ys[j + 1]; y++) for (let a = 0; a < wx[i]; a++) set(xs[i] + a, y, t);
  }

  // quarteirões
  const buildings = [], places = [], blocks = [];
  for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const b = { i, j, x0: xs[i] + wx[i], x1: xs[i + 1] - 1, y0: ys[j] + wy[j], y1: ys[j + 1] - 1 };
    blocks.push(b);
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++)
      set(x, y, (x === b.x0 || x === b.x1 || y === b.y0 || y === b.y1) ? T.SIDEWALK : T.GRASS);
  }

  // escolhe quarteirões para oficinas e postos, espalhados pela cidade
  const order = blocks.map((_, k) => k);
  for (let k = order.length - 1; k > 0; k--) { const m = Math.floor(r() * (k + 1)); [order[k], order[m]] = [order[m], order[k]]; }
  const want = ['posto', 'oficina', 'lavajato', 'posto', 'oficina', 'posto', 'oficina', 'lavajato'];
  const chosen = [];
  for (const k of order) {
    if (chosen.length >= want.length) break;
    const b = blocks[k];
    if (chosen.some((c) => Math.abs(c.b.i - b.i) + Math.abs(c.b.j - b.j) < 3)) continue;
    const sides = [];
    if (hSeg[b.j][b.i]) sides.push('top');
    if (hSeg[b.j + 1][b.i]) sides.push('bottom');
    if (vSeg[b.i][b.j]) sides.push('left');
    if (vSeg[b.i + 1][b.j]) sides.push('right');
    if (!sides.length) continue;
    chosen.push({ b, kind: want[chosen.length], side: sides[Math.floor(r() * sides.length)] });
  }
  const special = new Map(chosen.map((c) => [c.b, c]));

  function bsp(x0, y0, x1, y1) {
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w <= 0 || h <= 0) return;
    const canV = w >= 6, canH = h >= 6;
    if ((canV || canH) && !(w <= 8 && h <= 8 && r() < 0.3)) {
      const vert = canV && (!canH || (w >= h ? r() < 0.8 : r() < 0.2));
      if (vert) { const s = x0 + ri(3, w - 3); bsp(x0, y0, s - 1, y1); bsp(s, y0, x1, y1); }
      else { const s = y0 + ri(3, h - 3); bsp(x0, y0, x1, s - 1); bsp(x0, s, x1, y1); }
      return;
    }
    if (w >= 3 && h >= 3 && r() < 0.06) { // pátio / estacionamento
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, T.LOT);
      return;
    }
    buildings.push({ x0, y0, x1, y1, color: ri(0, ROOF_COUNT - 1), style: ri(0, 3) });
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, T.BUILDING);
  }

  let oi = 0, pi = 0, li = 0;
  for (const b of blocks) {
    let ix0 = b.x0 + 1, ix1 = b.x1 - 1, iy0 = b.y0 + 1, iy1 = b.y1 - 1;
    const sp = special.get(b);
    if (sp) {
      let L;
      if (sp.side === 'top') { L = { x0: ix0, x1: ix1, y0: iy0, y1: iy0 + 2 }; iy0 += 3; }
      else if (sp.side === 'bottom') { L = { x0: ix0, x1: ix1, y0: iy1 - 2, y1: iy1 }; iy1 -= 3; }
      else if (sp.side === 'left') { L = { x0: ix0, x1: ix0 + 2, y0: iy0, y1: iy1 }; ix0 += 3; }
      else { L = { x0: ix1 - 2, x1: ix1, y0: iy0, y1: iy1 }; ix1 -= 3; }
      for (let y = L.y0; y <= L.y1; y++) for (let x = L.x0; x <= L.x1; x++) set(x, y, T.LOT);
      // o último posto vende gasolina batizada (só muda o nome e o preço, não os tiles)
      const cheap = sp.kind === 'posto' && pi === 2;
      const name = sp.kind === 'oficina' ? OFICINA_NAMES[oi++ % 4] : sp.kind === 'lavajato' ? LAVA_NAMES[li++ % 2]
        : cheap ? (pi++, 'Posto Preço Baixo') : POSTO_NAMES[pi++ % 4];
      places.push({ kind: sp.kind, name, cheap, side: sp.side, x0: L.x0, x1: L.x1, y0: L.y0, y1: L.y1,
        cx: (L.x0 + L.x1 + 1) * 8, cy: (L.y0 + L.y1 + 1) * 8 });
      bsp(ix0, iy0, ix1, iy1);
    } else if (r() < 0.13) {
      b.park = true;
      for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) if (r() < 0.2) set(x, y, T.TREE);
    } else {
      bsp(ix0, iy0, ix1, iy1);
    }
  }

  // periferia: calçada colada nas ruas e árvores espalhadas
  const inCore = (x, y) => x >= xs[0] && x <= xs[NX - 1] + wx[NX - 1] - 1 && y >= ys[0] && y <= ys[NY - 1] + wy[NY - 1] - 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (get(x, y) !== T.GRASS || inCore(x, y)) continue;
    let near = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (get(x + dx, y + dy) === T.ROAD) near = true;
    if (near) set(x, y, T.SIDEWALK);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (get(x, y) !== T.GRASS || inCore(x, y)) continue;
    let ok = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const t = get(x + dx, y + dy);
      if (t === T.SIDEWALK || t === T.ROAD) ok = false;
    }
    if (ok && r() < 0.12) set(x, y, T.TREE);
  }

  // listas úteis
  const isNode = (x, y) => colRoad[x] && rowRoad[y];
  const curbs = [], pedTiles = [], roadTiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = get(x, y);
    if (t === T.ROAD && !isNode(x, y)) roadTiles.push({ x, y });
    if (t === T.SIDEWALK || t === T.PLAZA) pedTiles.push({ x, y });
    if (t === T.SIDEWALK) {
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
        if (get(nx, ny) === T.ROAD && !isNode(nx, ny)) {
          curbs.push({ x: x * 16 + 8, y: y * 16 + 8 });
          break;
        }
      }
    }
  }

  return {
    seed, W, H, tiles, xs, ys, wx, wy, NX, NY, hSeg, vSeg, rowKind, colKind, rowDir, colDir, buildings, places, blocks, curbs, pedTiles, roadTiles,
    get, exits, entries, links, canGo,
    onCoast(tx, ty) { return !inCore(tx, ty); },
    solid(tx, ty) { const t = get(tx, ty); return t === T.BUILDING || t === T.WATER || t === T.TREE; },
    tileAtPx(px, py) { return get(Math.floor(px / 16), Math.floor(py / 16)); },
    placeAt(px, py) {
      const tx = Math.floor(px / 16), ty = Math.floor(py / 16);
      return places.find((p) => tx >= p.x0 && tx <= p.x1 && ty >= p.y0 && ty <= p.y1) || null;
    },
    // faixas de uma rua: centros (em px, a partir da borda de cima/esquerda da rua) das faixas de quem anda na direção d.
    // A faixa 0 é a da direita (a mais perto da calçada). Na rua de mão única as duas faixas vão para o mesmo lado.
    laneOffsets(i, j, d) {
      const horiz = d % 2 === 0, kind = horiz ? rowKind[j] : colKind[i], w = (horiz ? wy[j] : wx[i]) * 16;
      if (kind === 'unica' && (horiz ? rowDir[j] : colDir[i]) !== d) return [];
      const n = kind === 'dupla' ? 1 : 2, high = d === 0 || d === 3; // leste e norte andam do lado de cima/direita da rua
      return Array.from({ length: n }, (_, k) => (high ? w - 8 - k * 16 : 8 + k * 16));
    },
    laneCount(i, j, d) { return this.laneOffsets(i, j, d).length; },
    // pontos das faixas ao entrar/sair de um cruzamento (k = faixa, 0 = a da direita)
    entryPoint(i, j, d, k = 0) {
      const ox = xs[i] * 16, oy = ys[j] * 16, o = this.laneOffsets(i, j, d)[k] || 0;
      switch (d) {
        case 0: return { x: ox, y: oy + o };
        case 1: return { x: ox + o, y: oy };
        case 2: return { x: ox + wx[i] * 16, y: oy + o };
        default: return { x: ox + o, y: oy + wy[j] * 16 };
      }
    },
    exitPoint(i, j, d, k = 0) {
      const ox = xs[i] * 16, oy = ys[j] * 16, o = this.laneOffsets(i, j, d)[k] || 0;
      switch (d) {
        case 0: return { x: ox + wx[i] * 16, y: oy + o };
        case 1: return { x: ox + o, y: oy + wy[j] * 16 };
        case 2: return { x: ox, y: oy + o };
        default: return { x: ox + o, y: oy };
      }
    },
  };
}

// Impressão digital da cidade (FNV-1a dos tiles). No multiplayer, todos na sala precisam ter a mesma.
function cityHash(city) {
  let h = 2166136261;
  for (let k = 0; k < city.tiles.length; k++) { h ^= city.tiles[k]; h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

// No navegador esta linha não faz nada; no Node (servidor do multiplayer) exporta o que é compartilhado.
if (typeof module !== 'undefined' && module.exports) module.exports = { T, DIRS, generateCity, cityHash };
