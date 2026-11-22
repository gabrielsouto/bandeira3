'use strict';

const FERRY_TICKET = 4;
const Barcas = {
  docks: [], dwell: 0, wake: [], wakeDistance: 0,
  get state() { return S.ferryRun ? 'route' : 'idle'; },
  init(city) {
    this.east = (city.W - 1) * TILE;
    this.docks = [0, city.xs.length - 1].map((i, side) => ({
      name: side ? 'Cais Nascente' : 'Cais Poente',
      x: (city.xs[i] + city.wx[i] / 2) * TILE,
      y: (city.H - 1) * TILE,
      roadY: (city.ys.at(-1) + city.wy.at(-1) / 2) * TILE,
    }));
  },
  get side() { return S.ferryDock || 0; },
  buildRoute(circle) {
    const start = this.docks[this.side], end = this.docks[1 - this.side];
    const points = circle ? [start, { x: this.east, y: start.y }, { x: this.east, y: TILE },
      { x: TILE, y: TILE }, { x: TILE, y: start.y }, start] : [start, end];
    this.length = 0;
    this.legs = points.slice(1).map((to, i) => {
      const from = points[i], dx = to.x - from.x, dy = to.y - from.y;
      const size = Math.hypot(dx, dy), startAt = this.length;
      this.length += size;
      return { from, to, dx: dx / size, dy: dy / size, startAt, endAt: this.length };
    });
  },
  legAt(position) {
    return this.legs.find(leg => position < leg.endAt) || this.legs.at(-1);
  },
  place(car, position) {
    const leg = this.legAt(position), offset = position - leg.startAt;
    car.x = leg.from.x + leg.dx * offset; car.y = leg.from.y + leg.dy * offset;
    car.a = Math.atan2(leg.dy, leg.dx);
  },
  enter(car) {
    this.wake.length = 0; this.wakeDistance = 0;
    const r = S.ferryRun;
    this.buildRoute(r?.circle);
    const dock = this.docks[this.side];
    // As travessias antigas guardavam a coordenada horizontal do canal sul.
    if (r && r.position == null) r.position = (r.x - dock.x) * (this.side ? -1 : 1);
    this.place(car, r?.position || 0);
    Object.assign(car, {
      speed: 0, vF: 0, vR: 0, vx: 0, vy: 0, steer: 0, throttle: 0, braking: true });
    this.dwell = 0;
  },
  leave(car) {
    this.enter(car);
    car.y = this.docks[this.side].roadY;
  },
  accept(circle = false) {
    if (S.ferryRun) return;
    S.ferryRun = { position: 0, circle, passengers: R.i(6, 14), boarded: false };
    this.enter(player); writeSave();
    toast('Embarque aberto. Aguarde os passageiros.');
  },
  cancel() {
    if (!S.ferryRun) return;
    S.ferryRun = null; this.enter(player); writeSave();
    toast('Travessia cancelada. Barca recolhida ao cais de origem.');
  },
  target() {
    const r = S.ferryRun;
    if (r?.circle && r.boarded) return { ...this.legAt(r.position).to, kind: 'drop' };
    return r && { ...this.docks[r.boarded ? 1 - this.side : this.side], kind: r.boarded ? 'drop' : 'pick' };
  },
  drive(car, inp, dt) {
    const r = S.ferryRun;
    if (!r) return;
    const v = guidedSpeed(car, inp, dt);
    const previous = r.position;
    const next = previous + v * dt;
    r.position = clamp(next, -20, this.length + 20);
    this.place(car, r.position);
    for (const wave of this.wake) wave.age += dt;
    while (this.wake.length && this.wake[0].age >= 1.15) this.wake.shift();
    const moved = r.position - previous;
    this.wakeDistance += Math.abs(moved);
    if (this.wakeDistance >= 4) {
      this.wakeDistance %= 4;
      const direction = Math.sign(moved), offset = direction > 0 ? -16 : 17;
      this.wake.push({ x: car.x + offset * Math.cos(car.a), y: car.y + offset * Math.sin(car.a),
        a: car.a, direction, strength: Math.min(1, Math.abs(v) / 55), age: 0 });
    }
    const speed = next === r.position ? v : 0;
    Object.assign(car, { vF: speed, vx: Math.cos(car.a) * speed, vy: Math.sin(car.a) * speed,
      speed: Math.abs(speed), braking: !!(inp.hb || inp.down), throttle: inp.up && !inp.hb ? 1 : 0 });
  },
  onImpact() {},
  update(dt, car) {
    const r = S.ferryRun;
    if (!r) return;
    const dock = this.docks[r.boarded && !r.circle ? 1 - this.side : this.side];
    if (car.speed > 0.5 || Math.abs((r.boarded ? this.length : 0) - r.position) > 12) { this.dwell = 0; return; }
    this.dwell += dt;
    if (this.dwell < 2) return;
    this.dwell = 0;
    Sfx.door();
    if (r.boarded) {
      const fare = FERRY_TICKET * r.passengers;
      S.money += fare; S.earned += fare; S.ferryTrips++;
      if (!r.circle) S.ferryDock = 1 - this.side;
      S.ferryRun = null;
      this.enter(car); Sfx.cash();
      toast(dock.name + ' · +' + fmtMoney(fare) + '. Aperte E para a volta.', 'good');
    } else {
      r.boarded = true;
      toast(r.passengers + (r.circle ? ' a bordo. Contorne a ilha e volte a este cais.' : ' a bordo. Siga para o ' + this.target().name + '.'));
    }
    writeSave();
  },
  phoneHTML() {
    const r = S.ferryRun;
    if (!r) return '<div class="ph-title">' + this.docks[this.side].name + '</div><div class="ph-row">Travessia para o ' + this.docks[1 - this.side].name + ' · ' + fmtMoney(FERRY_TICKET) + ' por passageiro</div><div class="ph-btns"><button data-act="accept"><kbd>E</kbd> TRAVESSIA</button><button data-act="circle"><kbd>I</kbd> VOLTA À ILHA</button></div>';
    const dock = this.docks[r.boarded && !r.circle ? 1 - this.side : this.side];
    const remaining = (r.boarded ? this.length : 0) - r.position, distance = Math.abs(remaining);
    const status = this.dwell ? (r.boarded ? 'Desembarcando…' : 'Embarcando…') :
      distance <= 12 ? 'Pare junto ao cais' : remaining < 0 ? 'Recue até o cais' : 'Siga pelo canal';
    return '<div class="ph-title">' + (r.circle ? 'Volta à ilha · ' : '') + dock.name + '</div><div class="ph-row">' + status + '</div><div class="ph-muted">' +
      r.passengers + (r.boarded ? ' a bordo' : ' aguardando') + ' · ' + kmStr(distance) +
      '</div><div class="ph-btns"><button class="ghost" data-act="cancel"><kbd>C</kbd> CANCELAR</button></div>';
  },
  drawWorld(g, cx, cy) {
    g.save();
    g.strokeStyle = '#c1f0eb'; g.lineWidth = 1.05; g.lineCap = 'round';
    for (const wave of this.wake) {
      const fade = wave.age / 1.15, spread = 3.8 + 8 * fade;
      g.save(); g.translate(wave.x - cx, wave.y - cy); g.rotate(wave.a);
      g.globalAlpha = .76 * wave.strength * (1 - fade) ** 1.4;
      g.beginPath();
      for (const side of [-1, 1]) {
        g.moveTo(1.2 * wave.direction, side * spread);
        g.quadraticCurveTo(-wave.direction, side * (spread + .38), -2.8 * wave.direction, side * (spread + 1.45));
      }
      g.stroke(); g.restore();
    }
    g.restore();
    for (const dock of this.docks) {
      const x = dock.x - cx, y = dock.y - cy;
      g.fillStyle = '#70503d'; g.fillRect(x - 4, y - 24, 9, 16); g.fillRect(x - 18, y - 13, 36, 7);
      g.fillStyle = '#cfaa78';
      for (let i = -17; i < 18; i += 4) g.fillRect(x + i, y - 13, 3, 6);
    }
    const dock = this.target();
    if (!dock) return;
    if (!dock.name) return; // As curvas do circuito usam a seta de navegação.
    pxDownArrow(g, dock.x - cx, dock.y - cy - 18, dock.kind === 'pick' ? '#39ff88' : '#ffd23f');
    const progress = dock.kind === 'pick' ? 1 - this.dwell / 2 : this.dwell / 2;
    if (progress > 0) for (let i = -1; i <= 1; i++)
      drawPedSprite(g, lerp(player.x, dock.x + i * 8, progress) - cx, dock.y - 11 * progress - cy,
        '#ffc573', '#52453c', time * 3, !this.dwell);
  },
  drawMinimap(g, scale) {
    const [west, east] = this.docks;
    g.fillStyle = '#6cdbed';
    if (S.ferryRun?.circle) {
      g.strokeStyle = '#6cdbed'; g.lineWidth = 1;
      g.strokeRect(TILE * scale, TILE * scale, (this.east - TILE) * scale, (west.y - TILE) * scale);
    } else g.fillRect(west.x * scale, west.y * scale, (east.x - west.x) * scale, 1);
    for (const p of this.docks) g.fillRect(p.x * scale - 1, p.y * scale - 1, 3, 3);
  },
};
