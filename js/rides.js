'use strict';
// Corridas: ofertas no celular, busca do passageiro, viagem, avaliação e tarifa dinâmica.

const FIRST_NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Heitor', 'Iara', 'João', 'Karen', 'Léo',
  'Marina', 'Nando', 'Olga', 'Paulo', 'Rafa', 'Sônia', 'Tiago', 'Vini', 'Wagner', 'Yasmin', 'Zeca', 'Dona Cida',
  'Seu Jorge', 'Lucas', 'Bia', 'Duda', 'Toninho', 'Priscila'];

const PTYPES = {
  normal: { label: 'Passageiro', fare: 1, w: 6, desc: '' },
  pressa: { label: 'Com pressa', fare: 1.4, w: 2, timeMul: 0.75, desc: 'Paga mais, mas quer chegar voando.' },
  enjoo: { label: 'Enjoa fácil', fare: 1.2, w: 2, desc: 'Nada de derrapar, senão...' },
  exec: { label: 'Executivo', fare: 1.7, w: 1, desc: 'Exige carro inteiro e direção suave.' },
  praia: { label: 'Voltando da praia', fare: 1.1, w: 1.5, desc: 'Cheio de areia: o carro vai ficar sujo.' },
};

const HIT_LINES = ['Ei! Cuidado!', 'Meu Deus do céu!', 'Isso vai pra avaliação, hein!', 'Tá maluco?!',
  'Eu tenho família!', 'Calma, piloto!', 'Ai, meu pescoço...'];

const CANCEL_FEE = 5;    // cancelar depois de aceitar, antes do passageiro entrar
const ABANDON_FEE = 15;  // largar o passageiro no meio da viagem (e nota 1)

const PX_KM = 0.08 / 16;
function kmStr(px) { return (px * PX_KM).toFixed(1).replace('.', ',') + ' km'; }

function pickType(rnd = Math.random) {
  let tot = 0;
  for (const k in PTYPES) tot += PTYPES[k].w;
  let x = rnd() * tot;
  for (const k in PTYPES) { x -= PTYPES[k].w; if (x <= 0) return k; }
  return 'normal';
}

// ---------- fórmulas da corrida (as mesmas no solo e no servidor do multiplayer) ----------

// valor da corrida em R$
function rideFare(tripD, type, surge) {
  return Math.round((6 + tripD / 16 * 0.24) * PTYPES[type].fare * surge * 100) / 100;
}

// tempo de viagem sem atraso, em segundos
function rideAllowed(tripD, type) {
  return (14 + tripD / 75) * (PTYPES[type].timeMul || 1);
}

// nota de 1 a 5. v = { hits, late, carBad, dirty, comfort, defect }
function rideStars(type, v) {
  let s = 5;
  s -= v.hits * (type === 'exec' ? 1.2 : 0.6);
  if (v.late) s -= (type === 'pressa' ? 2 : 1);
  if (v.carBad) s -= 0.8;
  if (v.dirty) s -= 1.2;
  if (type === 'enjoo') s -= (100 - Math.max(0, v.comfort)) / 60;
  if (type === 'exec' && v.defect) s -= 1;
  return clamp(Math.round(s), 1, 5);
}

// pagamento e gorjeta (só nota 5 tem chance de gorjeta)
function ridePay(fare, late, stars, rnd = Math.random) {
  const pay = Math.round(fare * (late ? 0.85 : 1) * 100) / 100;
  const tip = (stars === 5 && rnd() < 0.65) ? Math.round(fare * (0.1 + rnd() * 0.25) * 100) / 100 : 0;
  return { pay, tip };
}

let offerSeq = 0;

const Rides = {
  city: null, state: 'idle', nextOfferT: 4, offer: null, ride: null, surges: [], lastResult: null, hitCd: 0,

  init(city) {
    this.city = city;
    this.surges = [];
    for (let k = 0; k < 3; k++) {
      const s = this.newSurge();
      s.age = R.f(2, s.life * 0.6);
      this.surges.push(s);
    }
  },

  newSurge() {
    const t = R.pick(this.city.roadTiles);
    return { x: t.x * 16 + 8, y: t.y * 16 + 8, r: R.f(7, 12) * 16,
      mult: Math.round(R.f(1.3, 2.6) * 10) / 10, life: R.f(60, 130), age: 0 };
  },

  surgeAt(x, y) {
    let m = 1;
    for (const s of this.surges) if (s.age > 1 && Math.hypot(x - s.x, y - s.y) < s.r) m = Math.max(m, s.mult);
    return m;
  },

  nearestSurge(x, y) {
    let best = null;
    for (const s of this.surges) {
      const d = Math.max(0, Math.hypot(x - s.x, y - s.y) - s.r);
      if (!best || d < best.d) best = { mult: s.mult, d, s };
    }
    return best;
  },

  ratingAvg() { return S.ratings.reduce((a, b) => a + b, 0) / S.ratings.length; },
  canWork() { return S.car.health > 0 && !Care.empty(); },

  target() {
    const r = this.ride;
    if (!r) return null;
    if (this.state === 'toPickup' || this.state === 'boarding') return { x: r.pick.x, y: r.pick.y, kind: 'pick' };
    if (this.state === 'onTrip') return { x: r.drop.x, y: r.drop.y, kind: 'drop' };
    return null;
  },

  makeOffer(px, py) {
    if (Veh.cur.delivery) return Delivery.makeOffer(px, py); // entregador do euComida: pedidos de comida
    const c = this.city;
    let pick = null, drop = null;
    // às vezes a chamada vem de dentro de uma área de dinâmica (é lá que tem demanda)
    const ns = this.nearestSurge(px, py);
    if (ns && ns.d < 40 * 16 && R.chance(0.35)) {
      for (let t = 0; t < 40 && !pick; t++) {
        const s = R.pick(c.curbs);
        if (Math.hypot(s.x - ns.s.x, s.y - ns.s.y) < ns.s.r * 0.9) pick = s;
      }
    }
    for (let t = 0; t < 40 && !pick; t++) {
      const s = R.pick(c.curbs);
      const d = Math.hypot(s.x - px, s.y - py) / 16;
      if (d > 5 && d < 30) pick = s;
    }
    if (!pick) return null;
    for (let t = 0; t < 60 && !drop; t++) {
      const s = R.pick(c.curbs);
      const d = (Math.abs(s.x - pick.x) + Math.abs(s.y - pick.y)) / 16;
      if (d > 20 && d < 85) drop = s;
    }
    if (!drop) return null;
    let type = pickType();
    if (type === 'exec' && Veh.cur.noExec) type = 'normal'; // executivo não anda de moto
    const tripD = Math.abs(drop.x - pick.x) + Math.abs(drop.y - pick.y);
    const surge = this.surgeAt(pick.x, pick.y);
    const fare = Math.round(rideFare(tripD, type, surge) * Veh.fareMul(gameMin) * 100) / 100;
    return { id: ++offerSeq, pick, drop, type, surge, fare, tripD, pickD: Math.hypot(pick.x - px, pick.y - py),
      name: R.pick(FIRST_NAMES), stars: R.f(4.2, 5).toFixed(1).replace('.', ','),
      expires: 12, expMax: 12, shirt: R.pick(SHIRTS), hair: R.pick(HAIRS) };
  },

  accept() {
    if (this.state !== 'offer') return;
    const o = this.offer;
    this.offer = null;
    this.ride = Object.assign({}, o, o.order ? Delivery.rideFields(o) : {
      waitT: 0, maxWait: 75 + o.pickD / 16 * 0.8, hits: 0, comfort: 100, t: 0, vomited: false,
      allowed: rideAllowed(o.tripD, o.type), paxX: o.pick.x, paxY: o.pick.y,
    });
    this.state = 'toPickup';
    Sfx.tone(660, 0.08, 'square', 0.05);
    toast(o.order ? `Pedido aceito! Retire em ${o.rest.name} (seta verde).` : `Corrida aceita! Vá buscar ${o.name} (seta verde).`);
  },

  decline() {
    if (this.state !== 'offer') return;
    this.offer = null;
    this.state = 'idle';
    this.nextOfferT = R.f(3, 6);
  },

  cancel(forced) {
    const st = this.state, order = this.ride && this.ride.order;
    if (st === 'toPickup' || st === 'boarding') {
      if (!forced) { this.chargeFee(CANCEL_FEE); toast(`${order ? 'Pedido' : 'Corrida'} cancelad${order ? 'o' : 'a'}. Taxa de R$ 5,00.`, 'warn'); }
      this.reset();
    } else if (st === 'onTrip') {
      S.ratings.push(1); if (S.ratings.length > 30) S.ratings.shift();
      if (!forced) {
        this.chargeFee(ABANDON_FEE);
        toast(order ? 'Você sumiu com o pedido! -R$ 15,00 e nota 1.' : 'Você largou o passageiro no meio do caminho! -R$ 15,00 e nota 1.', 'bad');
      } else toast(order ? `O pedido de ${this.ride.name} não chegou. Nota 1.` : `${this.ride.name} desceu e foi de ônibus. Nota 1.`, 'bad');
      Sfx.bad();
      this.reset();
    }
  },

  // taxa de cancelamento (no multiplayer quem cobra é a sala, ao receber o "cancelar")
  chargeFee(v) { S.money -= v; },

  reset() {
    this.ride = null;
    this.state = 'idle';
    this.nextOfferT = R.f(2, 5);
  },

  onImpact(imp) {
    if (this.state !== 'onTrip' && this.state !== 'boarding') return;
    if (imp < 45) return;
    const r = this.ride;
    if (r.order) { // a bag só sofre depois de retirada
      if (this.state !== 'onTrip') return;
      r.hits++;
      if (DTYPES[r.type].slosh) r.comfort -= imp * 0.25;
      if (this.hitCd <= 0) { toast(r.pharmacy ? 'O pacote bateu dentro da mochila!' : R.pick(FOOD_HIT_LINES), 'warn'); this.hitCd = 2.5; }
      return;
    }
    r.hits++;
    if (r.type === 'enjoo') r.comfort -= imp * 0.25;
    if (this.hitCd <= 0) { toast(`${r.name}: "${R.pick(HIT_LINES)}"`, 'warn'); this.hitCd = 2.5; }
  },

  // o que o passageiro avalia, medido durante a viagem
  tripReport(r) {
    return { hits: r.hits, late: r.t > r.allowed, carBad: S.car.health < 35, dirty: S.car.problems.dirty && !r.vomited,
      comfort: r.comfort, defect: Object.values(S.car.problems).some(Boolean) };
  },

  finish(car) {
    const r = this.ride, v = r.order ? Delivery.report(r) : this.tripReport(r);
    const stars = r.order ? deliveryStars(r.type, v) : rideStars(r.type, v);
    const { pay, tip } = ridePay(r.fare, v.late, stars);
    this.applyResult(car, { pay, tip, stars, late: v.late });
    this.startDrop(car);
  },

  // credita a corrida e avisa (no multiplayer, os valores vêm do servidor)
  applyResult(car, res) {
    const { pay, tip, stars, late } = res;
    S.money += pay + tip; S.earned += pay + tip; S.rides++;
    S.ratings.push(stars); if (S.ratings.length > 30) S.ratings.shift();
    this.lastResult = { pay, tip, total: pay + tip, stars, late };
    toast(`${this.ride && this.ride.order ? 'Entrega' : 'Corrida'} concluída! +${fmtMoney(pay + tip)} · ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`, 'good');
    Sfx.cash();
    addFloater(car.x, car.y - 12, '+' + fmtMoney(pay + tip), '#39ff88');
  },

  // passageiro descendo do carro
  startDrop(car) {
    const r = this.ride;
    if (r.type === 'praia' && !Veh.cur.noDirty && !S.car.problems.dirty) {
      S.car.problems.dirty = true;
      toast(`${r.name} deixou areia por todo lado. Hora do lava jato!`, 'warn');
    }
    this.state = 'dropping';
    r.dropT = 0; r.carX = car.x; r.carY = car.y; r.paxX = car.x; r.paxY = car.y;
  },

  stepSurges(dt) {
    for (let k = 0; k < this.surges.length; k++) {
      const s = this.surges[k];
      s.age += dt;
      if (s.age >= s.life) this.surges[k] = this.newSurge();
    }
  },

  // viagem em andamento: conforto do passageiro e chegada ao destino
  stepTrip(dt, car) {
    const r = this.ride;
    r.t += dt;
    if (r.order) Delivery.stepTrip(r, dt, car);
    if (r.type === 'enjoo') {
      const slide = Math.abs(car.vR);
      if (slide > 45) r.comfort -= dt * (slide - 45) * 0.9;
      if (car.speed > 190) r.comfort -= dt * 6;
      r.comfort = Math.min(100, r.comfort + dt * 2);
      if (r.comfort <= 0 && !r.vomited) {
        r.vomited = true;
        if (Veh.cur.noDirty) toast(`Eca! ${r.name} passou mal na garupa. Pelo menos foi na rua.`, 'bad');
        else {
          S.car.problems.dirty = true;
          toast(`Eca! ${r.name} passou mal no carro. Leve ao lava jato.`, 'bad');
        }
        Sfx.bad();
      }
    }
    if (Math.hypot(car.x - r.drop.x, car.y - r.drop.y) < 30 && car.speed < (r.pharmacy ? 8 : 30)) this.finish(car);
  },

  update(dt, car) {
    this.hitCd -= dt;
    this.stepSurges(dt);
    const r = this.ride;
    if (r && r.order && r.prep > 0) r.prep -= dt; // a cozinha prepara enquanto você vai até lá
    switch (this.state) {
      case 'idle': {
        if (!this.canWork()) break;
        this.nextOfferT -= dt;
        if (this.nextOfferT <= 0) {
          const avg = this.ratingAvg();
          const f = avg >= 4.7 ? 0.8 : avg >= 4.3 ? 1 : avg >= 4 ? 1.4 : 2;
          this.nextOfferT = R.f(3, 7) * f * Veh.cur.offerMul;
          const o = this.makeOffer(car.x, car.y);
          if (o) { this.offer = o; this.state = 'offer'; Sfx.ding(); }
        }
        break;
      }
      case 'offer': {
        this.offer.expires -= dt;
        if (this.offer.expires <= 0) { this.offer = null; this.state = 'idle'; this.nextOfferT = R.f(2, 4); }
        break;
      }
      case 'toPickup': {
        r.waitT += dt;
        if (r.waitT > r.maxWait) {
          toast(r.order ? `${r.rest.name} passou o pedido para outro entregador: você demorou demais.` : `${r.name} cancelou: você demorou demais.`, 'bad');
          Sfx.bad();
          this.reset();
          break;
        }
        if (Math.hypot(car.x - r.pick.x, car.y - r.pick.y) < (r.pharmacy ? 26 : 30) && car.speed < (r.pharmacy ? 8 : 30)) {
          this.state = 'boarding'; r.boardT = 0;
          if (r.order && r.prep > 0 && !r.waitedMsg) { r.waitedMsg = true; toast(`${r.rest.name}: "Tá saindo, só um minutinho!"`); }
        }
        break;
      }
      case 'boarding': {
        if (r.order) { Delivery.stepPickup.call(this, dt, car); break; }
        if (car.speed > 40) {
          this.state = 'toPickup'; r.paxX = r.pick.x; r.paxY = r.pick.y;
          toast('Calma! O passageiro ainda não entrou.', 'warn');
          break;
        }
        r.boardT += dt;
        const k = Math.min(1, r.boardT / 0.9);
        r.paxX = lerp(r.pick.x, car.x, k); r.paxY = lerp(r.pick.y, car.y, k);
        if (r.boardT >= 0.9) {
          this.state = 'onTrip'; r.t = 0;
          Sfx.door();
          toast(`${r.name} entrou. Siga a seta amarela até o destino!`);
        }
        break;
      }
      case 'onTrip': this.stepTrip(dt, car); break;
      case 'dropping': {
        r.dropT += dt;
        const k = Math.min(1, r.dropT / 0.9);
        r.paxX = lerp(r.carX, r.drop.x, k); r.paxY = lerp(r.carY, r.drop.y, k);
        if (r.dropT >= 1.4) this.reset();
        break;
      }
    }
  },

  drawWorld(g, camX, camY) {
    const r = this.ride;
    if (!r) return;
    if (r.order) { Delivery.drawRide(g, camX, camY, r, this.state); return; }
    const bob = Math.round(Math.sin(time * 5) * 1.5);
    const pulse = 10 + Math.round(Math.sin(time * 6) * 1.5);
    if (this.state === 'toPickup' || this.state === 'boarding') {
      const sx = r.pick.x - camX, sy = r.pick.y - camY;
      pxRing(g, sx, sy, pulse, '#39ff88');
      drawPedSprite(g, r.paxX - camX, r.paxY - camY, r.shirt, r.hair, time * 4, this.state === 'toPickup');
      if (this.state === 'toPickup') pxDownArrow(g, sx, sy - 15 + bob, '#39ff88');
    } else if (this.state === 'onTrip') {
      const sx = Math.round(r.drop.x - camX), sy = Math.round(r.drop.y - camY);
      pxRing(g, sx, sy, pulse, '#ffd23f');
      g.fillStyle = '#000'; g.fillRect(sx - 1, sy - 13, 3, 14);
      g.fillStyle = '#ddd'; g.fillRect(sx, sy - 12, 1, 12);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
        g.fillStyle = ((i + j) & 1) ? '#111' : '#ffd23f';
        g.fillRect(sx + 1 + i, sy - 12 + j + (i > 2 ? bob * 0 : 0), 1, 1);
      }
    } else if (this.state === 'dropping') {
      drawPedSprite(g, r.paxX - camX, r.paxY - camY, r.shirt, r.hair, time * 4, false);
    }
  },
};

// No navegador esta linha não faz nada; no Node (servidor do multiplayer) exporta o que é compartilhado.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FIRST_NAMES, PTYPES, pickType, rideFare, rideAllowed, rideStars, ridePay, CANCEL_FEE, ABANDON_FEE };
}
