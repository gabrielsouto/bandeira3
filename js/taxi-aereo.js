'use strict';

const TaxiAereo = {
  pads: [], dwell: 0,
  get state() { return S.flight ? 'route' : 'idle'; },
  init(city) {
    this.width = city.W * TILE;
    this.height = city.H * TILE;
    const roofs = city.buildings.map(b => ({
      x: (b.x0 + b.x1 + 1) * TILE / 2, y: (b.y0 + b.y1 + 1) * TILE / 2,
    }));
    this.pads = [[0.2, 0.2, 'Noroeste'], [0.8, 0.3, 'Leste'], [0.5, 0.8, 'Sul']].map(([u, v, name]) => {
      const distance = p => Math.hypot(p.x - u * this.width, p.y - v * this.height);
      roofs.sort((a, b) => distance(a) - distance(b));
      return { ...roofs.shift(), name: 'Heliponto ' + name };
    });
    this.curbs = city.curbs;
  },
  origin() { return this.pads[S.airPad || 0]; },
  enter(car) {
    const p = S.flight || this.origin();
    Object.assign(car, { x: p.x, y: p.y, a: p.a || 0, speed: 0, vx: 0, vy: 0, vF: 0,
      vR: 0, throttle: 0, steer: 0, braking: true });
    this.dwell = 0;
  },
  leave(car) {
    this.enter(car);
    const distance = p => Math.hypot(p.x - car.x, p.y - car.y);
    const curb = this.curbs.reduce((best, p) => distance(p) < distance(best) ? p : best);
    car.x = curb.x; car.y = curb.y;
  },
  accept() {
    if (S.flight) return;
    const dest = ((S.airPad || 0) + R.i(1, this.pads.length - 1)) % this.pads.length;
    const from = this.origin(), to = this.pads[dest];
    S.flight = { x: from.x, y: from.y, a: Math.atan2(to.y - from.y, to.x - from.x),
      dest, boarded: false, fare: Math.round(25 + Math.hypot(to.x - from.x, to.y - from.y) / 25) };
    this.enter(player); writeSave();
    toast('Aguarde o embarque no heliponto.');
  },
  cancel() {
    if (!S.flight) return;
    S.flight = null; this.enter(player); writeSave();
    toast('Voo cancelado. Helicóptero de volta ao heliponto de origem.');
  },
  target() {
    const f = S.flight;
    return f && { ...(f.boarded ? this.pads[f.dest] : this.origin()), kind: f.boarded ? 'drop' : 'pick' };
  },
  drive(car, inp, dt) {
    const f = S.flight;
    if (!f?.boarded) return;
    car.a += (Number(!!inp.right) - Number(!!inp.left)) * 2.5 * dt;
    car.vF = guidedSpeed(car, inp, dt);
    car.vx = Math.cos(car.a) * car.vF; car.vy = Math.sin(car.a) * car.vF;
    car.x = clamp(car.x + car.vx * dt, 12, this.width - 12);
    car.y = clamp(car.y + car.vy * dt, 12, this.height - 12);
    car.speed = Math.abs(car.vF); car.throttle = inp.up ? 1 : 0; car.braking = !!inp.hb;
    Object.assign(f, { x: car.x, y: car.y, a: car.a });
  },
  update(dt, car) {
    const f = S.flight;
    if (!f) return;
    const p = this.target();
    if (car.speed > 0.5 || Math.hypot(car.x - p.x, car.y - p.y) > 14) { this.dwell = 0; return; }
    this.dwell += dt;
    if (this.dwell < 2) return;
    this.dwell = 0;
    if (f.boarded) {
      S.money += f.fare; S.earned += f.fare; S.airTrips++;
      S.airPad = f.dest; S.flight = null; this.enter(car); Sfx.cash();
      toast('Pouso no ' + p.name + ' · +' + fmtMoney(f.fare), 'good');
    } else {
      f.boarded = true; Sfx.door(); toast('Passageiro a bordo. Siga para o ' + this.pads[f.dest].name + '.');
    }
    writeSave();
  },
  phoneHTML() {
    const f = S.flight;
    if (!f) return '<div class="ph-title">' + this.origin().name + '</div><div class="ph-btns"><button data-act="accept"><kbd>E</kbd> ACEITAR VOO</button></div>';
    const to = this.pads[f.dest];
    const status = !f.boarded ? 'Embarcando…' : this.dwell ? 'Desembarcando…' : 'Pouse no H · ' + kmStr(Math.hypot(to.x - f.x, to.y - f.y));
    return '<div class="ph-title">' + to.name + '</div><div class="ph-row">' + status + ' · ' + fmtMoney(f.fare) + '</div><div class="ph-btns"><button data-act="cancel" class="ghost"><kbd>C</kbd> CANCELAR</button></div>';
  },
  drawWorld(g, cx, cy) {
    for (const p of this.pads) {
      const x = p.x - cx, y = p.y - cy;
      g.fillStyle = '#384958'; g.fillRect(x - 16, y - 16, 32, 32);
      g.strokeStyle = '#ffcf55'; g.strokeRect(x - 14, y - 14, 28, 28);
      g.fillStyle = '#fff4c8'; g.fillRect(x - 6, y - 8, 3, 16);
      g.fillRect(x + 3, y - 8, 3, 16); g.fillRect(x - 3, y - 2, 6, 3);
    }
    const p = this.target();
    if (p) pxDownArrow(g, p.x - cx, p.y - cy - 19, p.kind === 'pick' ? '#39ff88' : '#ffd23f');
  },
  drawMinimap(g, scale) {
    g.fillStyle = '#ffcf55';
    for (const p of this.pads) g.fillRect(p.x * scale - 1, p.y * scale - 1, 3, 3);
  },
};
