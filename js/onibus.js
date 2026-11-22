'use strict';

const BUS_FARE = 5;
const Onibus = {
  line: [], offer: null, nextOfferT: 2, dwell: 0,
  get state() { return S.busRoute ? 'route' : this.offer ? 'offer' : 'idle'; },

  init(city) {
    // Os mesmos quatro pontos atendem os dois sentidos da linha.
    const cx = city.W * TILE / 2, cy = city.H * TILE / 2;
    this.line = [];
    for (const [name, dx, dy] of [
      ['Terminal Oeste', -460, 100], ['Bairro Oeste', -190, -95],
      ['Centro', 80, -95], ['Terminal Leste', 390, 100],
    ]) {
      let nearest = null, best = Infinity;
      for (const p of city.curbs) {
        const d = Math.hypot(p.x - cx - dx, p.y - cy - dy);
        if (d >= best || this.line.some(stop => Math.hypot(stop.x - p.x, stop.y - p.y) < 100)) continue;
        nearest = p; best = d;
      }
      if (nearest) this.line.push({ name, x: nearest.x, y: nearest.y });
    }
  },
  makeOffer(car) {
    if (this.line.length < 2) return null;
    const stops = [...this.line];
    const distance = p => Math.hypot(car.x - p.x, car.y - p.y);
    if (distance(stops[stops.length - 1]) < distance(stops[0])) stops.reverse();
    return { stops: stops.map((stop, i) => {
      const boarding = [];
      if (i < stops.length - 1) {
        const count = R.i(2, 4);
        for (let n = 0; n < count; n++) boarding.push(R.i(i + 1, stops.length - 1));
      }
      return { ...stop, boarding };
    }), expires: 20, expMax: 20 };
  },
  accept() {
    if (this.state !== 'offer' || !Rides.canWork()) return;
    S.busRoute = { stops: this.offer.stops, index: 0, aboard: [] };
    this.decline(); writeSave(); toast('Linha aceita. Siga a seta verde até o terminal.');
  },
  decline() { this.offer = null; this.nextOfferT = 3; },
  cancel() {
    if (!S.busRoute) return;
    S.busRoute = null; this.dwell = 0; this.nextOfferT = 4;
    writeSave(); toast('Viagem encerrada. A central vai enviar outro ônibus.');
  },
  target() {
    const r = S.busRoute;
    if (!r) return null;
    const stop = r.stops[r.index];
    return { x: stop.x, y: stop.y, kind: stop.boarding.length ? 'pick' : 'drop' };
  },
  onImpact() {},
  update(dt, car) {
    const r = S.busRoute;
    if (!r) {
      if (this.offer) {
        this.offer.expires -= dt;
        if (this.offer.expires <= 0) this.decline();
      } else if (Rides.canWork() && (this.nextOfferT -= dt) <= 0) {
        this.offer = this.makeOffer(car); this.nextOfferT = 3;
        if (this.offer) Sfx.ding();
      }
      return;
    }
    const stop = r.stops[r.index];
    if (car.speed >= 7 || Math.hypot(car.x - stop.x, car.y - stop.y) >= 26) { this.dwell = 0; return; }
    this.dwell += dt;
    if (this.dwell < 2) return;
    this.dwell = 0;
    const remaining = r.aboard.filter(destination => destination !== r.index);
    const arrived = r.aboard.length - remaining.length;
    r.aboard = remaining.concat(stop.boarding);
    const fare = arrived * BUS_FARE;
    S.money += fare; S.earned += fare; S.busPassengers += arrived;
    Sfx.door();
    if (fare) { Sfx.cash(); addFloater(car.x, car.y - 14, '+' + fmtMoney(fare), '#39ff88'); }
    r.index++;
    if (r.index === r.stops.length) {
      S.busRoute = null; this.nextOfferT = 4; toast('Terminal final. Viagem concluída!', 'good');
    } else toast('Próximo ponto: ' + r.stops[r.index].name + '.');
    writeSave();
  },
  phoneHTML() {
    const r = S.busRoute;
    if (!r && !this.offer) return '<div class="ph-status"><span class="dot"></span>EM SERVIÇO</div><div class="ph-muted">Aguardando viagem da Linha 01…</div>';
    if (!r) {
      const stops = this.offer.stops;
      return `<div class="ph-title">LINHA 01</div><div class="ph-row">${esc(stops[0].name)} → ${esc(stops[stops.length - 1].name)}</div>
        <div class="ph-muted">${stops.length} pontos · ${fmtMoney(BUS_FARE)} por passageiro transportado</div>
        <div class="ph-timer"><div></div></div><div class="ph-btns"><button data-act="accept"><kbd>E</kbd> ACEITAR</button><button data-act="decline" class="ghost"><kbd>Q</kbd> RECUSAR</button></div>`;
    }
    const stop = r.stops[r.index], leaving = r.aboard.filter(i => i === r.index).length;
    return `<div class="ph-title">PONTO ${r.index + 1}/${r.stops.length} · ${esc(stop.name)}</div>
      <div class="ph-row">A bordo: ${r.aboard.length} · Embarques: ${stop.boarding.length} · Desembarques: ${leaving}</div>
      <div class="ph-muted">${this.dwell ? 'Portas abertas. Mantenha o ônibus parado.' : 'Siga a seta e pare no ponto.'}</div>
      <div class="ph-btns"><button data-act="cancel" class="ghost"><kbd>C</kbd> ENCERRAR VIAGEM</button></div>`;
  },
  drawWorld(g, cx, cy) {
    const r = S.busRoute;
    if (!r) return;
    const stop = r.stops[r.index], x = stop.x - cx, y = stop.y - cy;
    const color = stop.boarding.length ? '#39ff88' : '#ffd23f';
    pxRing(g, x, y, 11, color); pxDownArrow(g, x, y - 16, color);
    const doorX = player.x - cx - Math.sin(player.a) * 6, doorY = player.y - cy + Math.cos(player.a) * 6;
    const leaving = r.aboard.filter(i => i === r.index).length;
    for (let i = 0; i < leaving && this.dwell > 0; i++) {
      const t = Math.min(1, this.dwell);
      drawPedSprite(g, lerp(doorX, x - 8 - i * 3, t), lerp(doorY, y + 5, t), '#df957e', '#43352d', time * 4, false);
    }
    for (let i = 0; i < stop.boarding.length; i++) {
      const t = clamp((this.dwell - (leaving ? 1 : 0)) / (leaving ? 1 : 2), 0, 1);
      drawPedSprite(g, lerp(x + i * 4, doorX, t), lerp(y - 4, doorY, t), i % 2 ? '#71c8ab' : '#e8ba6b', '#43352d', time * 4, !this.dwell);
    }
  },
};
