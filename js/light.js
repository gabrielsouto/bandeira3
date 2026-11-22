'use strict';
// Dia e noite: uma camada escura por cima do mundo, recortada por faróis, postes e luzes dos lugares.
// A escuridão segue o relógio do jogo (gameMin): amanhece das 05:00 às 07:00 e escurece das 17:00 às 19:30.

const NIGHT_MAX = 0.74;    // opacidade da camada no meio da noite
const NIGHT_TINT = '8,12,34';

const Light = {
  cv: null, g: null, lamps: [],

  init(city) {
    [this.cv, this.g] = makeCanvas(1, 1);
    // um poste em cada cruzamento (na esquina de calçada) e no meio dos trechos compridos
    const { xs, ys, NX, NY } = city;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      this.lamps.push({ x: xs[i] * 16 - 3, y: ys[j] * 16 - 3, r: 46 });
      if (i < NX - 1 && city.hSeg[j][i] && xs[i + 1] - xs[i] - city.wx[i] > 7) this.lamps.push({ x: (xs[i] + xs[i + 1] + city.wx[i]) * 8, y: ys[j] * 16 - 3, r: 40 });
      if (j < NY - 1 && city.vSeg[i][j] && ys[j + 1] - ys[j] - city.wy[j] > 7) this.lamps.push({ x: xs[i] * 16 - 3, y: (ys[j] + ys[j + 1] + city.wy[j]) * 8, r: 40 });
    }
    for (const p of city.places) this.lamps.push({ x: p.cx, y: p.cy, r: 70 });
  },

  // 0 = dia claro, NIGHT_MAX = noite fechada
  darkness(min) {
    const h = (min / 60) % 24;
    if (h >= 7 && h < 17) return 0;
    if (h >= 17 && h < 19.5) return NIGHT_MAX * (h - 17) / 2.5;
    if (h >= 5 && h < 7) return NIGHT_MAX * (7 - h) / 2;
    return NIGHT_MAX;
  },
  isNight(min) { return this.darkness(min) > NIGHT_MAX * 0.6; },

  // furo de luz redondo
  hole(x, y, r, k = 1) {
    const g = this.g, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${k})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  },

  // facho de farol saindo da frente do veículo
  beam(x, y, a, len, spread, k = 1) {
    const g = this.g;
    g.save(); g.translate(x, y); g.rotate(a);
    const gr = g.createRadialGradient(0, 0, 2, 0, 0, len);
    gr.addColorStop(0, `rgba(0,0,0,${k})`); gr.addColorStop(0.6, `rgba(0,0,0,${k * 0.55})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, len, -spread, spread); g.closePath(); g.fill();
    g.restore();
  },

  // cars: lista de { x, y, a, front, len } (front = distância do centro ao farol)
  render(ctx, vw, vh, camX, camY, cars, extra) {
    const d = this.darkness(gameMin);
    if (d < 0.02) return;
    const cv = this.cv, g = this.g;
    if (cv.width !== vw || cv.height !== vh) { cv.width = vw; cv.height = vh; }
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, vw, vh);
    g.fillStyle = `rgba(${NIGHT_TINT},${d})`;
    g.fillRect(0, 0, vw, vh);
    g.globalCompositeOperation = 'destination-out';
    const vis = (x, y, r) => x + r > camX && y + r > camY && x - r < camX + vw && y - r < camY + vh;
    for (const l of this.lamps) if (vis(l.x, l.y, l.r)) this.hole(l.x - camX, l.y - camY, l.r, 0.85);
    for (const c of cars) {
      if (!vis(c.x, c.y, c.len)) continue;
      const fx = Math.cos(c.a), fy = Math.sin(c.a);
      this.beam(c.x - camX + fx * c.front, c.y - camY + fy * c.front, c.a, c.len, c.spread || 0.42, c.k || 0.9);
      this.hole(c.x - camX, c.y - camY, 12, 0.5); // o próprio carro aparece um pouco
    }
    if (extra) extra(this);
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(cv, 0, 0);
    // brilho amarelado dos postes
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lamps) {
      if (!vis(l.x, l.y, 16)) continue;
      const x = l.x - camX, y = l.y - camY, gr = ctx.createRadialGradient(x, y, 0, x, y, 16);
      gr.addColorStop(0, `rgba(255,200,110,${0.35 * d})`); gr.addColorStop(1, 'rgba(255,200,110,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - 16, y - 16, 32, 32);
    }
    ctx.globalCompositeOperation = 'source-over';
  },
};
