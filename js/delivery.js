'use strict';
// Modo entregador do euComida (moto) e do 66Comida (bike): pedidos de comida em vez de passageiros (só no solo).
// A bike (Veh.cur.near) só recebe pedidos perto, nada de pedido de festa, e tem mais tempo para entregar.
// Os restaurantes são prédios sorteados pela seed, sem mudar os tiles (o hash da sala continua o mesmo).
// O pedido usa os mesmos estados do Rides: offer → toPickup (ir ao restaurante) → boarding (retirar o pedido)
// → onTrip (levar até o cliente) → dropping (o cliente desce e pega a bag). Aqui ficam só as partes que mudam;
// o Rides chama estas funções quando a corrida tem "order: true".

const REST_COUNT = 8;
// cardápio: [o que foi pedido, tipo do pedido]
const RESTAURANTS = [
  { name: 'Burguer do Zé', col: '#c0392b', menu: [['X-tudo + batata', 'lanche'], ['Combo X-bacon + refri', 'refri'], ['Combo família (6 lanches)', 'festa']] },
  { name: 'Pizzaria Bella Napoli', col: '#2e8b3a', menu: [['Pizza de calabresa', 'pizza'], ['Pizza meia mussarela, meia portuguesa', 'pizza'], ['4 pizzas gigantes', 'festa']] },
  { name: 'Pastelaria da Feira', col: '#d4a017', menu: [['Pastel de carne + caldo de cana', 'refri'], ['6 pastéis de queijo', 'lanche']] },
  { name: 'Sushi Sakura', col: '#e8e2d2', menu: [['Combinado 20 peças', 'lanche'], ['Barca de 80 peças', 'festa']] },
  { name: 'Marmitaria da Tia Nena', col: '#8e5a2b', menu: [['Marmitex de feijoada', 'lanche'], ['PF + guaraná', 'refri']] },
  { name: 'Açaí Tropical', col: '#6a2c91', menu: [['Açaí 500 ml com tudo', 'acai'], ['2 açaís de 700 ml', 'acai']] },
  { name: 'Churrascaria Gaúcha', col: '#7a1f1f', menu: [['Marmita de picanha', 'lanche'], ['Espetinho + refri 2 L', 'refri'], ['Kit churrasco 10 pessoas', 'festa']] },
  { name: 'Padaria Pão Quente', col: '#c98a3a', menu: [['Pão na chapa + pingado', 'refri'], ['Misto quente', 'lanche'], ['Cento de coxinha', 'festa']] },
];

// tipos de pedido: tarifa, o que pesa na nota e o aviso no celular
const DTYPES = {
  farmacia: { label: 'Pacote lacrado', fare: 1, desc: 'Retire no balcão da farmácia.' },
  frasco: { label: 'Frágil', fare: 1.2, hitMul: 2, desc: 'Leve com cuidado. Batidas danificam os frascos.' },
  lanche: { label: 'Lanche', fare: 1, desc: '' },
  pizza: { label: 'Pizza', fare: 1.2, hitMul: 2, desc: 'Batida desmonta a pizza. Vai liso!' },
  acai: { label: 'Açaí', fare: 1.3, timeMul: 0.7, lateMul: 2, desc: 'Derrete rápido: corre!' },
  refri: { label: 'Com refri', fare: 1.1, slosh: true, desc: 'Derrapou ou freou forte, o refri vaza.' },
  festa: { label: 'Pedido de festa', fare: 1.8, hitMul: 2, desc: 'Pedidão caro. Cliente exigente.' },
};

const FOOD_HIT_LINES = ['A bag chacoalhou feio!', 'Xi, amassou o lanche...', 'Ouviu esse barulho? Era a comida.',
  'O cliente vai abrir e chorar.', 'Segura a bag, piloto!'];
const STAFF_SHIRT = '#f4f4f4';  // avental do atendente do restaurante

// taxa de entrega em R$ (a distância até o restaurante conta um pouco)
function deliveryFare(tripD, pickD, type, surge) {
  return Math.round((4 + (tripD + pickD * 0.4) / 16 * 0.2) * DTYPES[type].fare * surge * 100) / 100;
}
// tempo de entrega sem atraso, em segundos (contado a partir da retirada); a bike é mais lenta e ganha mais tempo
function deliveryAllowed(tripD, type) { return (12 + tripD / 75) * (DTYPES[type].timeMul || 1) * (Veh.cur.timeMul || 1); }
// nota de 1 a 5. v = { hits, late, cold, spilled }
function deliveryStars(type, v) {
  const t = DTYPES[type];
  let s = 5 - v.hits * 0.6 * (t.hitMul || 1);
  if (v.late) s -= (t.lateMul || 1);
  if (v.cold) s -= 1;
  if (v.spilled) s -= 2;
  return clamp(Math.round(s), 1, 5);
}

const Delivery = {
  rests: [], pharmacies: [],
  get shops() { return Veh.job === 'farmacia' ? this.pharmacies : this.rests; },

  get on() { return !!Veh.cur.delivery; },

  init(city, mapCtx) {
    this.city = city;
    const r = mulberry32((city.seed ^ 0xf00d) >>> 0);
    const schoolBds = new Set(World.schools.map((s) => s.bd)), riskBlocks = new Set(World.risks.map((z) => z.b));
    const cands = city.buildings.filter((bd) => !schoolBds.has(bd));
    for (let t = 0; t < 400 && this.rests.length < REST_COUNT && cands.length; t++) {
      const bd = cands[Math.floor(r() * cands.length)];
      const b = city.blocks.find((k) => bd.x0 >= k.x0 && bd.x1 <= k.x1 && bd.y0 >= k.y0 && bd.y1 <= k.y1);
      if (!b || riskBlocks.has(b) || this.rests.some((x) => Math.abs(x.b.i - b.i) + Math.abs(x.b.j - b.j) < 2)) continue;
      const door = this.doorOf(bd);
      if (!door) continue;
      this.rests.push(Object.assign({}, RESTAURANTS[this.rests.length], { bd, b, door,
        x: (bd.x0 + bd.x1 + 1) * 8, y: (bd.y0 + bd.y1 + 1) * 8 }));
    }
    for (const rs of this.rests) this.paint(mapCtx, rs);
  },

  initPharmacies(city, g) {
    const occupied = new Set([...this.rests, ...World.schools, ...Object.values(Parcels.hubs)].map(p => p.bd));
    const candidates = city.buildings.filter(b => !occupied.has(b));
    const menu = [['Kit de curativos', 'farmacia'], ['Protetor solar e hidratante', 'farmacia'],
      ['Medicamentos em caixa lacrada', 'farmacia'], ['Frasco de xampu em vidro', 'frasco']];
    this.pharmacies = [];
    for (const [name, fx, fy] of [['Farmácia Primavera', .25, .25], ['Drogaria Central', .5, .5],
      ['Farmácia do Sol', .75, .25], ['Drogaria do Parque', .25, .75], ['Farmácia Boa Vista', .75, .75]]) {
      const distance = b => Math.hypot((b.x0 + b.x1 + 1) / 2 - fx * city.W, (b.y0 + b.y1 + 1) / 2 - fy * city.H);
      candidates.sort((a, b) => distance(a) - distance(b));
      for (const bd of candidates) {
        const door = this.doorOf(bd);
        if (!door || World.inRisk(door.x, door.y) || this.pharmacies.some(p => Math.hypot(p.x - door.x, p.y - door.y) < 100)) continue;
        if (Ambulancia.hospital && Math.hypot(door.x - Ambulancia.hospital.x, door.y - Ambulancia.hospital.y) < 65) continue;
        if (Math.hypot(door.x - Garagem.home.cx, door.y - Garagem.home.cy) < 50) continue;
        const x = (bd.x0 + bd.x1 + 1) * TILE / 2, y = (bd.y0 + bd.y1 + 1) * TILE / 2;
        this.pharmacies.push({ name, bd, door, x, y, menu });
        g.fillStyle = '#f0fff5'; g.fillRect(x - 7, y - 7, 14, 14);
        g.fillStyle = '#178458'; g.fillRect(x - 2, y - 5, 4, 10); g.fillRect(x - 5, y - 2, 10, 4);
        candidates.splice(candidates.indexOf(bd), 1);
        break;
      }
    }
  },

  // meio-fio mais perto do prédio (onde a moto encosta para retirar o pedido)
  doorOf(bd) {
    const x0 = bd.x0 * 16, x1 = (bd.x1 + 1) * 16, y0 = bd.y0 * 16, y1 = (bd.y1 + 1) * 16;
    let best = null, bdist = 40;
    for (const c of this.city.curbs) {
      const dx = Math.max(x0 - c.x, 0, c.x - x1), dy = Math.max(y0 - c.y, 0, c.y - y1), d = Math.hypot(dx, dy);
      if (d < bdist) { bdist = d; best = c; }
    }
    return best;
  },

  // toldo listrado na fachada virada para a rua
  paint(g, rs) {
    const bd = rs.bd, x = bd.x0 * 16, y = bd.y0 * 16, w = (bd.x1 - bd.x0 + 1) * 16, h = (bd.y1 - bd.y0 + 1) * 16;
    const d = rs.door, horiz = d.y < y || d.y > y + h;
    const ax = horiz ? x : (d.x < x ? x : x + w - 6), ay = horiz ? (d.y < y ? y : y + h - 6) : y;
    const aw = horiz ? w : 6, ah = horiz ? 6 : h;
    g.fillStyle = '#0b0b0b'; g.fillRect(ax, ay, aw, ah);
    for (let k = 0; k < (horiz ? aw : ah); k += 3) {
      g.fillStyle = (k / 3) % 2 ? '#f4f4f4' : rs.col;
      if (horiz) g.fillRect(ax + k, ay + 1, Math.min(3, aw - k), ah - 2);
      else g.fillRect(ax + 1, ay + k, aw - 2, Math.min(3, ah - k));
    }
  },

  // ---------- pedidos ----------
  makeOffer(px, py) {
    const shops = this.shops, pharmacy = Veh.job === 'farmacia';
    if (!shops.length) return null;
    const bike = !!Veh.cur.near, reach = bike ? 22 : 35, [dMin, dMax] = bike ? [6, 26] : [10, 50];
    const near = shops.filter((rs) => Math.hypot(rs.door.x - px, rs.door.y - py) / 16 < reach);
    const distance = shop => Math.hypot(shop.door.x - px, shop.door.y - py);
    const rs = near.length ? R.pick(near) : pharmacy ? shops.reduce((a, b) => distance(a) < distance(b) ? a : b) : R.pick(shops);
    const pick = rs.door;
    const destinations = pharmacy ? Parcels.doors : this.city.curbs;
    let drop = null;
    for (let t = 0; t < 60 && !drop; t++) {
      const s = R.pick(destinations);
      const d = (Math.abs(s.x - pick.x) + Math.abs(s.y - pick.y)) / 16;
      if (d > dMin && d < dMax) drop = s;
    }
    if (!drop) return null;
    const menu = bike ? rs.menu.filter(([, t]) => t !== 'festa') : rs.menu; // pedidão de festa não cabe na mochila
    const [item, type] = R.pick(menu.length ? menu : rs.menu);
    const tripD = Math.abs(drop.x - pick.x) + Math.abs(drop.y - pick.y), pickD = Math.hypot(pick.x - px, pick.y - py);
    const surge = Rides.surgeAt(pick.x, pick.y);
    const fare = Math.round(deliveryFare(tripD, pickD, type, surge) * Veh.fareMul(gameMin) * 100) / 100;
    return { id: ++offerSeq, order: true, pharmacy, rest: rs, item, pick, drop, type, surge, fare, tripD, pickD,
      name: R.pick(FIRST_NAMES), stars: R.f(4.2, 5).toFixed(1).replace('.', ','),
      expires: 12, expMax: 12, shirt: R.pick(SHIRTS), hair: R.pick(HAIRS), prep: R.chance(0.3) ? 0 : R.f(4, 22) };
  },

  // campos extras da entrega aceita
  rideFields(o) {
    return { waitT: 0, maxWait: 75 + o.pickD / 16 * 0.8 + o.prep, hits: 0, comfort: 100, t: 0, spilled: false,
      allowed: deliveryAllowed(o.tripD, o.type), paxX: o.pick.x, paxY: o.pick.y };
  },

  // parado na porta do restaurante: espera a cozinha e o atendente traz a bag (aqui "this" é o Rides)
  stepPickup(dt, car) {
    const r = this.ride;
    if (car.speed > 40 || (r.pharmacy && (car.speed >= 8 || Math.hypot(car.x - r.pick.x, car.y - r.pick.y) >= 26))) {
      this.state = 'toPickup'; r.paxX = r.pick.x; r.paxY = r.pick.y;
      toast('Calma! O pedido ainda não está na bag.', 'warn');
      return;
    }
    if (r.prep > 0) { r.boardT = 0; return; }
    r.boardT += dt;
    const k = Math.min(1, r.boardT / 0.9);
    r.paxX = lerp(r.pick.x, car.x, k); r.paxY = lerp(r.pick.y, car.y, k);
    if (r.boardT >= 0.9) {
      this.state = 'onTrip'; r.t = 0;
      Sfx.door();
      toast(`Pedido na bag! Leve para ${r.name} (seta amarela).`);
    }
  },

  // a caminho do cliente: o refri vaza com derrapada e freada forte
  stepTrip(r, dt, car) {
    if (!DTYPES[r.type].slosh || r.spilled) return;
    const slide = Math.abs(car.vR);
    if (slide > 45) r.comfort -= dt * (slide - 45) * 0.9;
    if (car.braking && car.speed > 120) r.comfort -= dt * 25;
    r.comfort = Math.min(100, r.comfort + dt * 2);
    if (r.comfort <= 0) {
      r.spilled = true;
      toast('Vazou refri na bag inteira! O cliente não vai gostar.', 'bad');
      Sfx.bad();
    }
  },

  report(r) { return { hits: r.hits, late: r.t > r.allowed, cold: !r.pharmacy && r.t > r.allowed * 1.5, spilled: r.spilled }; },

  heatLabel(r) {
    const k = r.t / r.allowed;
    if (r.type === 'acai') return k > 1.5 ? 'DERRETEU' : k > 1 ? 'DERRETENDO' : 'GELADINHO';
    return k > 1.5 ? 'FRIA' : k > 1 ? 'MORNA' : 'QUENTINHA';
  },

  // ---------- celular ----------
  phoneHTML() {
    const st = Rides.state, r = Rides.ride;
    if (st === 'idle') {
      const ns = Rides.nearestSurge(player.x, player.y);
      return `<div class="ph-status"><span class="dot"></span>ONLINE</div><div class="ph-muted">Esperando pedidos…</div>` +
        (ns ? `<div class="ph-surge">Dinâmica <b>${multStr(ns.mult)}</b> ${ns.d < 1 ? 'bem aqui!' : 'a ' + kmStr(ns.d)}</div>` : '') +
        `<div class="ph-stats">Entregas: ${S.rides}<br>Total ganho: ${fmtMoney(S.earned)}</div>`;
    }
    if (st === 'offer') {
      const o = Rides.offer, dt = DTYPES[o.type];
      return `<div class="ph-title">NOVO PEDIDO</div>
        <div class="ph-fare">${fmtMoney(o.fare)}</div>
        ${o.surge > 1 ? `<div class="ph-badge">DINÂMICA ${multStr(o.surge)}</div>` : ''}
        <div class="ph-row">${esc(o.rest.name)}</div>
        <div class="ph-muted">${esc(o.item)}</div>
        <div class="ph-type t-${o.type}">${dt.label}</div>
        ${dt.desc ? `<div class="ph-muted">${dt.desc}</div>` : ''}
        <div class="ph-muted">Retirar a ${kmStr(o.pickD)} · entregar a ${kmStr(o.tripD)}</div>
        <div class="ph-timer"><div></div></div>
        <div class="ph-btns"><button data-act="accept"><kbd>E</kbd> ACEITAR</button><button data-act="decline" class="ghost"><kbd>Q</kbd> RECUSAR</button></div>`;
    }
    if (st === 'toPickup' || st === 'boarding') {
      const ready = r.prep <= 0;
      const msg = r.pharmacy ? (st === 'boarding' ? 'Aguarde a retirada no balcão.' : 'Siga a seta verde e pare junto à farmácia.') : st === 'boarding' ? (ready ? 'O atendente está trazendo a bag…' : `Esperando a cozinha… segura a ${Veh.noun()}.`)
        : 'Siga a seta verde e pare na porta do restaurante.';
      return `<div class="ph-title">RETIRAR PEDIDO</div>
        <div class="ph-row">${esc(r.rest.name)}</div>
        <div class="ph-muted">${esc(r.item)} <span class="ph-type t-${r.type}">${DTYPES[r.type].label}</span></div>
        <div class="ph-row">${ready ? '<b class="ok">PEDIDO PRONTO</b>' : `${r.pharmacy ? 'Em separação' : 'Na cozinha'}: pronto em ${mmss(r.prep)}`}</div>
        <div class="ph-muted">${msg}</div>
        ${st === 'toPickup' ? `<div class="ph-row">Espera máx.: ${mmss(r.maxWait - r.waitT)}</div>` : ''}
        <div class="ph-fare small">${fmtMoney(r.fare)}</div>
        <div class="ph-btns"><button data-act="cancel" class="ghost"><kbd>C</kbd> CANCELAR</button></div>`;
    }
    if (st === 'onTrip') {
      const left = r.allowed - r.t, heat = this.heatLabel(r);
      return `<div class="ph-title">ENTREGANDO</div>
        <div class="ph-row">Para ${esc(r.name)} <span class="ph-type t-${r.type}">${DTYPES[r.type].label}</span></div>
        <div class="ph-muted">${esc(r.item)}</div>
        <div class="ph-big ${left < 0 ? 'late' : ''}">${mmss(left)}</div>
        ${r.pharmacy ? '<div class="ph-row">Pacote: ' + (r.hits ? 'sofreu impacto' : 'intacto') + '</div>' :
          `<div class="ph-row">Comida: <b class="${left < 0 ? 'late' : 'ok'}">${heat}</b></div>`}
        <div class="ph-row">Valor: ${fmtMoney(r.fare)} · Batidas: ${r.hits}</div>
        ${DTYPES[r.type].slosh ? (r.spilled ? '<div class="ph-row late">Refri vazou!</div>'
          : `<div class="ph-row">Refri</div><div class="ph-comfort"><div style="width:${Math.max(0, Math.round(r.comfort / 5) * 5)}%"></div></div>`) : ''}
        <div class="ph-btns"><button data-act="cancel" class="ghost"><kbd>C</kbd> DESISTIR DO PEDIDO</button></div>`;
    }
    if (st === 'dropping' && Rides.lastResult) {
      const res = Rides.lastResult;
      return `<div class="ph-title">ENTREGA CONCLUÍDA</div>
        <div class="ph-fare">+${fmtMoney(res.total)}</div>
        <div class="ph-stars">${'★'.repeat(res.stars)}<span>${'☆'.repeat(5 - res.stars)}</span></div>
        ${res.tip ? `<div class="ph-row">Gorjeta: ${fmtMoney(res.tip)}</div>` : ''}
        ${res.late ? '<div class="ph-row late">Atrasou: desconto de 15%</div>' : ''}`;
    }
    return '';
  },

  // ---------- desenho ----------
  drawRide(g, camX, camY, r, st) {
    const bob = Math.round(Math.sin(time * 5) * 1.5), pulse = 10 + Math.round(Math.sin(time * 6) * 1.5);
    if (st === 'toPickup' || st === 'boarding') {
      const sx = r.pick.x - camX, sy = r.pick.y - camY;
      pxRing(g, sx, sy, pulse, '#39ff88');
      if (r.prep <= 0 || st === 'boarding') { // atendente esperando na porta com a bag
        const px = r.paxX - camX, py = r.paxY - camY;
        drawPedSprite(g, px, py, STAFF_SHIRT, '#2b1d14', time * 4, false);
        this.drawBag(g, px + 3, py - 1);
      }
      if (st === 'toPickup') pxDownArrow(g, sx, sy - 15 + bob, '#39ff88');
    } else if (st === 'onTrip') {
      const sx = r.drop.x - camX, sy = r.drop.y - camY;
      pxRing(g, sx, sy, pulse, '#ffd23f');
      drawPedSprite(g, sx, sy, r.shirt, r.hair, time * 4, true); // cliente acenando na calçada
      pxDownArrow(g, sx, sy - 15 + bob, '#ffd23f');
    } else if (st === 'dropping') {
      // o cliente vem até a moto (ou bike), pega a bag e volta
      const k = r.dropT < 0.7 ? r.dropT / 0.7 : Math.max(0, 1 - (r.dropT - 0.7) / 0.7);
      const px = lerp(r.drop.x, r.carX, k) - camX, py = lerp(r.drop.y, r.carY, k) - camY;
      drawPedSprite(g, px, py, r.shirt, r.hair, time * 4, false);
      if (r.dropT >= 0.7) this.drawBag(g, px + 3, py - 1);
    }
  },

  drawBag(g, x, y) {
    x = Math.round(x); y = Math.round(y);
    g.fillStyle = '#0b0b0b'; g.fillRect(x - 1, y - 1, 5, 5);
    g.fillStyle = typeof Veh.cur.bag === 'string' ? Veh.cur.bag : '#e3262e'; g.fillRect(x, y, 3, 3);
  },

  // nomes dos restaurantes (só para quem está de entregador)
  draw(g, camX, camY, vw, vh) {
    if (!this.on) return;
    g.font = '12px VT323, monospace'; g.textAlign = 'center';
    for (const rs of this.shops) {
      const cx = rs.x, cy = rs.bd.y0 * 16 - 2;
      if (cx + 80 < camX || cy + 80 < camY || cx - 80 > camX + vw || cy - 80 > camY + vh) continue;
      g.fillStyle = '#000'; g.fillText(rs.name.toUpperCase(), Math.round(cx - camX) + 1, Math.round(cy - camY) + 1);
      g.fillStyle = Veh.job === 'farmacia' ? '#72e6b5' : '#ff8a7a'; g.fillText(rs.name.toUpperCase(), Math.round(cx - camX), Math.round(cy - camY));
    }
  },

  drawLights(L, camX, camY) {
    if (!this.on) return;
    for (const rs of this.shops) L.hole(rs.door.x - camX, rs.door.y - camY, 26, 0.45);
  },

  drawMinimap(g, s) {
    if (!this.on) return;
    for (const rs of this.shops) {
      const x = Math.round(rs.x * s), y = Math.round(rs.y * s);
      g.fillStyle = '#000'; g.fillRect(x - 3, y - 3, 6, 6);
      if (Veh.job === 'farmacia') {
        g.fillStyle = '#37c396'; g.fillRect(x - 1, y - 3, 2, 6); g.fillRect(x - 3, y - 1, 6, 2);
      } else { g.fillStyle = '#ff6fa8'; g.fillRect(x - 2, y - 2, 4, 4); }
    }
  },
};
