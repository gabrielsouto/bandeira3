'use strict';

const VLT_FARE = 40;
const VLT = {
  stations: [], dwell: 0,
  get state() { return S.vltRun ? 'route' : 'idle'; },

  init(city) {
    const left = (city.xs[0] - 2) * TILE, top = (city.ys[0] - 2) * TILE;
    const right = (city.xs.at(-1) + city.wx.at(-1) + 2) * TILE;
    const bottom = (city.ys.at(-1) + city.wy.at(-1) + 2) * TILE;
    const w = right - left, h = bottom - top;
    const radius = 1.5 * TILE;
    this.track = { left, top, w, h, radius };
    this.bendLength = radius * Math.PI / 2;
    this.length = 0;
    this.sides = [
      [left + radius, top, 1, 0, w], [right, top + radius, 0, 1, h],
      [right - radius, bottom, -1, 0, w], [left, bottom - radius, 0, -1, h],
    ].map(([x, y, dx, dy, span]) => {
      const straight = span - 2 * radius, start = this.length;
      this.length += straight + this.bendLength;
      return { x, y, dx, dy, straight, start, end: this.length };
    });
    this.stations = [
      ['Terminal Poente', (city.xs[0] + city.wx[0] / 2) * TILE - left],
      ['Mercado', w / 2], ['Nascente', w + h / 2],
      ['Jardim Sul', w + h + w / 2], ['Oeste', 2 * w + h + h / 2],
    ].map(([name, perimeter]) => {
      const position = this.fromPerimeter(perimeter);
      return { name, position, ...this.point(position) };
    });
  },
  // Converte a distância no retângulo original, usada nas estações e nos saves antigos.
  fromPerimeter(position) {
    const { w, h, radius } = this.track, perimeter = 2 * (w + h);
    const laps = Math.floor((position - radius) / perimeter);
    let along = position - radius - laps * perimeter;
    for (const side of this.sides) {
      const span = side.straight + 2 * radius;
      if (along < span) {
        const bend = Math.max(0, along - side.straight) * Math.PI / 4;
        return laps * this.length + side.start + Math.min(along, side.straight) + bend;
      }
      along -= span;
    }
    return (laps + 1) * this.length;
  },
  point(position) {
    const remainder = position % this.length;
    const d = remainder < 0 ? (remainder + this.length) % this.length : remainder;
    const side = this.sides.find(s => d < s.end);
    const along = d - side.start, a = Math.atan2(side.dy, side.dx);
    if (along <= side.straight) {
      return { x: side.x + side.dx * along, y: side.y + side.dy * along, a };
    }
    const radius = this.track.radius, turn = (along - side.straight) / radius;
    const forward = side.straight + radius * Math.sin(turn), inward = radius * (1 - Math.cos(turn));
    return { x: side.x + side.dx * forward - side.dy * inward,
      y: side.y + side.dy * forward + side.dx * inward, a: a + turn };
  },
  park(car, position) {
    Object.assign(car, this.point(position), { speed: 0, vx: 0, vy: 0, vF: 0, vR: 0,
      steer: 0, throttle: 0, braking: true });
    this.dwell = 0;
  },
  enter(car) {
    const r = S.vltRun;
    if (r && !r.roundedTrack) {
      if (!Number.isFinite(r.position)) {
        // A antiga Linha Norte salvava apenas a coordenada horizontal.
        r.position = r.x - this.track.left;
        r.index = 0;
      }
      r.position = this.fromPerimeter(r.position);
      r.roundedTrack = true;
    }
    this.park(car, r ? r.position : this.stations[0].position);
  },
  leave(car, city) {
    const closest = (axis, widths, value) => axis.map((n, i) => (n + widths[i] / 2) * TILE)
      .reduce((best, n) => Math.abs(n - value) < Math.abs(best - value) ? n : best);
    const x = closest(city.xs, city.wx, car.x), y = closest(city.ys, city.wy, car.y);
    this.park(car, this.stations[0].position);
    Object.assign(car, { x, y });
  },
  accept() {
    if (S.vltRun) return;
    const position = this.stations[0].position;
    this.park(player, position);
    S.vltRun = { index: 0, position, aboard: 0, roundedTrack: true };
    writeSave(); toast('Serviço iniciado. Aguarde o embarque na plataforma.');
  },
  cancel() {
    if (!S.vltRun) return;
    S.vltRun = null; this.enter(player); writeSave(); toast('Serviço encerrado. VLT recolhido ao terminal.');
  },
  onImpact() {},
  drive(car, inp, dt) {
    const r = S.vltRun;
    if (!r) return;
    const v = guidedSpeed(car, inp, dt);
    r.position += v * dt;
    Object.assign(car, this.point(r.position));
    car.vF = v; car.vx = Math.cos(car.a) * v; car.vy = Math.sin(car.a) * v;
    car.speed = Math.abs(v); car.throttle = inp.up && !inp.hb ? 1 : 0; car.braking = !!(inp.hb || inp.down);
  },
  target() {
    const r = S.vltRun;
    if (!r) return null;
    const final = r.index === this.stations.length;
    const station = this.stations[final ? 0 : r.index];
    return { ...station, kind: final ? 'drop' : 'pick',
      position: station.position + (final ? this.length : 0) };
  },
  update(dt, car) {
    const r = S.vltRun;
    if (!r) return;
    const station = this.target();
    if (car.speed > 0.5 || Math.abs(r.position - station.position) > 14) { this.dwell = 0; return; }
    this.dwell += dt;
    if (this.dwell < 2) return;
    this.dwell = 0; Sfx.door();
    if (station.kind === 'drop') {
      S.vltRun = null; S.vltTrips++; S.money += VLT_FARE; S.earned += VLT_FARE;
      this.park(car, station.position); Sfx.cash();
      toast('Volta completa. +' + fmtMoney(VLT_FARE) + ' · E para iniciar outra volta.', 'good');
    } else {
      const leaving = R.i(0, r.aboard), boarding = R.i(3, 9);
      r.aboard += boarding - leaving; r.index++;
      toast(station.name + ' · Embarques: ' + boarding + ' · Desembarques: ' + leaving);
    }
    writeSave();
  },
  phoneHTML() {
    const r = S.vltRun;
    if (!r) return '<div class="ph-title">VLT · LINHA CIRCULAR</div><div class="ph-row">5 estações · ' + fmtMoney(VLT_FARE) + ' por viagem</div><div class="ph-btns"><button data-act="accept"><kbd>E</kbd> INICIAR VIAGEM</button></div>';
    const station = this.target(), distance = Math.abs(station.position - r.position);
    const status = this.dwell ? 'Portas abertas · aguarde' : distance <= 14 ? 'Freie para abrir as portas' :
      station.position < r.position ? 'Plataforma atrás · recue' : 'Siga até a plataforma';
    return `<div class="ph-title">${esc(station.name)}</div><div class="ph-row">${status}</div><div class="ph-muted">${r.aboard} a bordo · ${kmStr(distance)} até a parada</div>
      <div class="ph-btns"><button class="ghost" data-act="cancel"><kbd>C</kbd> ENCERRAR</button></div>`;
  },
  trackPath(g, inset = 0) {
    const { left, top, w, h, radius } = this.track;
    g.beginPath();
    g.roundRect(left + inset, top + inset, w - 2 * inset, h - 2 * inset, radius - inset);
  },
  drawTrack(g, cx, cy) {
    g.save(); g.translate(0.5 - cx, 0.5 - cy);
    this.trackPath(g);
    g.strokeStyle = '#53585c'; g.lineWidth = 13; g.stroke();
    const spacing = this.length / Math.round(this.length / 8);
    g.setLineDash([3, spacing - 3]);
    g.strokeStyle = '#353d43'; g.lineWidth = 11; g.stroke();
    g.setLineDash([]);
    g.strokeStyle = '#bdc7cd'; g.lineWidth = 1;
    for (const inset of [-3, 3]) { this.trackPath(g, inset); g.stroke(); }
    g.restore();
    for (const station of this.stations) {
      g.save(); g.translate(station.x - cx, station.y - cy); g.rotate(station.a);
      g.fillStyle = '#687583'; g.fillRect(-22, -17, 44, 11);
      g.fillStyle = '#ffcf54'; g.fillRect(-22, -8, 44, 2);
      g.fillStyle = '#f4f1df'; g.fillRect(-1, -6, 2, 12);
      g.restore();
    }
  },
  drawMinimap(g, scale) {
    g.save(); g.scale(scale, scale);
    this.trackPath(g);
    g.strokeStyle = '#49dfcc'; g.lineWidth = 1 / scale; g.stroke();
    g.restore();
    g.fillStyle = '#49dfcc';
    for (const p of this.stations) g.fillRect(p.x * scale - 1, p.y * scale - 1, 3, 3);
  },
  drawWorld(g, cx, cy) {
    const p = this.target();
    if (!p) return;
    pxDownArrow(g, p.x - cx, p.y - cy - 22, p.kind === 'pick' ? '#39ff88' : '#ffd23f');
    if (p.kind === 'pick') {
      const t = this.dwell / 2;
      for (let i = 0; i < 3; i++) {
        const along = -8 + 6 * i;
        const x = p.x + along * Math.cos(p.a) + 13 * Math.sin(p.a);
        const y = p.y + along * Math.sin(p.a) - 13 * Math.cos(p.a);
        drawPedSprite(g, lerp(x, player.x, t) - cx, lerp(y, player.y, t) - cy,
          ['#ffc573', '#90d5c9', '#db9dc5'][i], '#52453c', time * 3, !t);
      }
    }
  },
};
