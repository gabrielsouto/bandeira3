'use strict';
// Modo entregador de pacotes (Mercado Leve, Amazoom e Xopi): em vez de um pedido por vez, uma ROTA.
// Você aceita a rota no celular, carrega os pacotes no galpão do app, entrega na ordem que quiser
// (o minimapa mostra todas as paradas numeradas) e volta ao galpão para fechar a rota e pegar o bônus.
// Os galpões são prédios sorteados pela seed, sem mudar os tiles (o hash da sala continua o mesmo).
// Estados: idle → offer → toHub → loading → route (com "stopping" em cada parada) → returning → closing.
// É um módulo à parte do Rides: o Rides só sabe lidar com uma corrida por vez.

// tipos de pacote: peso no sorteio, tarifa, tempo parado na porta e o aviso no celular
const PKTYPES = {
  comum: { label: 'Comum', w: 6, fare: 1, stop: 1.1, desc: '' },
  fragil: { label: 'Frágil', w: 2, fare: 1.3, stop: 1.1, desc: 'Batida quebra o que tem dentro.' },
  pesado: { label: 'Pesado', w: 1.5, fare: 1.7, stop: 2.6, van: true, desc: 'Geladeira, TV... Demora pra descarregar.' },
  hoje: { label: 'Chega hoje', w: 1.5, fare: 1.4, stop: 1.1, desc: 'Prazo próprio, bem mais curto.' },
  assina: { label: 'Assinatura', w: 1.5, fare: 1.2, stop: 1.6, desc: 'Só com o cliente. Se ninguém atender, volta pro galpão.' },
  coleta: { label: 'Coleta', w: 1, fare: 1.1, stop: 1.3, desc: 'Buscar uma devolução e levar ao galpão.' },
};
const PK_ORDER = ['comum', 'fragil', 'pesado', 'hoje', 'assina', 'coleta'];

// galpão de cada app (a chave é o "parcels" do veículo em js/vehicles.js)
const HUBS = {
  leve: { name: 'CD Mercado Leve', col: '#ffe600', ink: '#2d3277' },
  amazoom: { name: 'Galpão Amazoom', col: '#ff9900', ink: '#232f3e' },
  xopi: { name: 'Hub Xopi', col: '#ee4d2d', ink: '#ffffff' },
};

const ABSENT_CHANCE = 0.3;     // pacote com assinatura: chance de ninguém atender
const ROUTE_BONUS = 0.25;      // fechar a rota com tudo entregue: +25% do que a rota rendeu
const PARCEL_CANCEL_FEE = 20;  // largar a rota no meio (os pacotes voltam para o galpão por conta do app)
const PARCEL_HIT_LINES = ['Ouviu? Caiu alguma coisa lá atrás.', 'Xi, as caixas voaram!', 'Cuidado com a carga!',
  'Isso aí tava escrito FRÁGIL...'];

function pickPkType(van, random) {
  let tot = 0;
  for (const k of PK_ORDER) if (van || !PKTYPES[k].van) tot += PKTYPES[k].w;
  let x = random() * tot;
  for (const k of PK_ORDER) {
    if (!van && PKTYPES[k].van) continue;
    x -= PKTYPES[k].w;
    if (x <= 0) return k;
  }
  return 'comum';
}
// valor de um pacote em R$ (a distância do galpão conta um pouco)
function parcelFare(d, type) { return Math.round((3 + d / 16 * 0.09) * PKTYPES[type].fare * 100) / 100; }
// nota do pacote. v = { late, broken }
function parcelStars(v) { return clamp(Math.round(5 - (v.late ? 1.5 : 0) - (v.broken ? 2.5 : 0)), 1, 5); }

const Parcels = {
  hubs: {}, state: 'idle', offer: null, route: null, nextOfferT: 4, hitCd: 0, lastResult: null,

  get on() { return !!Veh.cur.parcels; },
  get hub() { return this.hubs[Veh.cur.parcels]; },

  init(city, mapCtx) {
    this.city = city;
    this.hubs = {};
    this.random = mulberry32((city.seed ^ 0x4ca7) >>> 0);
    const r = mulberry32((city.seed ^ 0xb0c5) >>> 0);
    this.doors = city.curbs.filter(({ x, y }) => DIRS.some(({ dx, dy }) => city.tileAtPx(x + dx * TILE, y + dy * TILE) === T.BUILDING));
    const used = new Set([...World.schools.map((s) => s.bd), ...Delivery.rests.map((rs) => rs.bd)]);
    const riskBlocks = new Set(World.risks.map((z) => z.b));
    // galpão é prédio grande: os maiores da cidade, sorteados entre si
    const cands = city.buildings.filter((bd) => !used.has(bd))
      .sort((a, b) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) - (a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1));
    const taken = [];
    for (const k in HUBS) {
      while (cands.length && !this.hubs[k]) {
        const index = Math.floor(r() * Math.min(40, cands.length));
        const [bd] = cands.splice(index, 1);
        const b = city.blocks.find((q) => bd.x0 >= q.x0 && bd.x1 <= q.x1 && bd.y0 >= q.y0 && bd.y1 <= q.y1);
        if (!b || riskBlocks.has(b) || taken.some((x) => Math.abs(x.b.i - b.i) + Math.abs(x.b.j - b.j) < 3)) continue;
        const door = Delivery.doorOf(bd);
        if (!door) continue;
        const hb = Object.assign({ key: k }, HUBS[k], { bd, b, door, x: (bd.x0 + bd.x1 + 1) * 8, y: (bd.y0 + bd.y1 + 1) * 8 });
        this.hubs[k] = hb; taken.push(hb);
        this.paint(mapCtx, hb);
      }
    }
  },

  // telhado com a faixa do app e a doca virada para a rua
  paint(g, hb) {
    const bd = hb.bd, x = bd.x0 * 16, y = bd.y0 * 16, w = (bd.x1 - bd.x0 + 1) * 16, h = (bd.y1 - bd.y0 + 1) * 16;
    g.fillStyle = '#9aa0a8'; g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle = '#8a9098';
    for (let k = 6; k < h - 4; k += 4) g.fillRect(x + 2, y + k, w - 4, 1); // telha metálica
    const sh = Math.min(10, h >> 2);
    g.fillStyle = hb.col; g.fillRect(x + 2, y + (h >> 1) - (sh >> 1), w - 4, sh);
    g.fillStyle = hb.ink; g.fillRect(x + (w >> 1) - 4, y + (h >> 1) - 2, 8, 4);
    // doca: portões de enrolar na fachada da rua
    const d = hb.door, horiz = d.y < y || d.y > y + h;
    g.fillStyle = '#3a3d42';
    if (horiz) { const yy = d.y < y ? y : y + h - 4; for (let k = 4; k < w - 8; k += 10) g.fillRect(x + k, yy, 7, 4); }
    else { const xx = d.x < x ? x : x + w - 4; for (let k = 4; k < h - 8; k += 10) g.fillRect(xx, y + k, 4, 7); }
  },

  // ---------- ofertas de rota ----------
  makeOffer() {
    const hb = this.hub;
    if (!hb) return null;
    const v = Veh.cur, van = v.art === 'van', n = Math.round(v.cap * (0.6 + this.random() * 0.4));
    const pick = (items) => items[Math.floor(this.random() * items.length)];
    const [dMin, dMax] = van ? [8, 60] : [5, 32];
    const stops = [];
    for (let t = 0; t < 400 && stops.length < n; t++) {
      const s = pick(this.doors);
      const d = (Math.abs(s.x - hb.door.x) + Math.abs(s.y - hb.door.y)) / 16;
      if (d < dMin || d > dMax || stops.some((o) => Math.hypot(o.x - s.x, o.y - s.y) < 48)) continue;
      const type = pickPkType(van, this.random);
      stops.push({ x: s.x, y: s.y, type, d: d * 16, fare: Math.round(parcelFare(d * 16, type) * Veh.fareMul(gameMin) * 100) / 100,
        name: pick(FIRST_NAMES), shirt: pick(SHIRTS), hair: pick(HAIRS), absent: type === 'assina' && this.random() < ABSENT_CHANCE, status: 'pending' });
    }
    if (stops.length < 2) return null;
    stops.forEach((s, i) => { s.n = i + 1; });
    const far = Math.max(...stops.map((s) => s.d));
    // prazo da rota: o tempo de ir e voltar mais um tanto por parada
    const allowed = 50 + stops.length * 16 + far / 40;
    for (const s of stops) if (s.type === 'hoje') s.allowed = 20 + s.d / 55;
    const total = stops.reduce((a, s) => a + s.fare, 0);
    return { id: ++offerSeq, stops, allowed, total, far, hubD: Math.hypot(hb.door.x - player.x, hb.door.y - player.y),
      expires: 15, expMax: 15 };
  },

  accept() {
    if (this.state !== 'offer') return;
    const o = this.offer;
    this.offer = null;
    this.route = Object.assign(o, { t: 0, loadT: 0, loaded: 0, hits: 0, earned: 0, cur: null, stopT: 0, warnedLate: false });
    this.state = 'toHub';
    Sfx.tone(660, 0.08, 'square', 0.05);
    toast(`Rota de ${o.stops.length} paradas aceita! Vá até o ${this.hub.name} (seta verde).`);
  },

  decline() {
    if (this.state !== 'offer') return;
    this.offer = null; this.state = 'idle'; this.nextOfferT = R.f(3, 6);
  },

  cancel(forced) {
    const st = this.state, r = this.route;
    if (!r || st === 'closing') return;
    if (st === 'toHub' || st === 'loading') {
      if (!forced) { S.money -= CANCEL_FEE; toast(`Rota cancelada. Taxa de ${fmtMoney(CANCEL_FEE)}.`, 'warn'); }
    } else {
      const left = r.stops.filter((s) => ['pending', 'returned', 'skipped', 'collected'].includes(s.status)).length;
      for (let k = 0; k < left; k++) { S.ratings.push(1); if (S.ratings.length > 30) S.ratings.shift(); }
      if (!forced) {
        S.money -= PARCEL_CANCEL_FEE;
        toast(`Rota abandonada. Taxa de ${fmtMoney(PARCEL_CANCEL_FEE)}.${left ? ` Nota 1 em ${left === 1 ? 'uma parada pendente' : `cada uma das ${left} paradas pendentes`}.` : ''}`, 'bad');
      } else toast(`A rota foi passada para outro entregador. ${left ? `Nota 1 nos ${left} pacotes que faltavam.` : ''}`, 'bad');
      Sfx.bad();
    }
    this.reset();
  },

  reset() { this.route = null; this.state = 'idle'; this.nextOfferT = R.f(2, 5); },

  target() {
    const r = this.route;
    if (!r) return null;
    const hd = this.hub.door;
    if (this.state === 'toHub' || this.state === 'loading' || this.state === 'returning') return { x: hd.x, y: hd.y, kind: 'pick' };
    if (this.state === 'route' || this.state === 'stopping') {
      // a seta aponta para a parada pendente mais perto (a ordem é você quem escolhe)
      let best = null, bd = Infinity;
      for (const s of r.stops) {
        if (s.status !== 'pending') continue;
        const d = Math.hypot(s.x - player.x, s.y - player.y);
        if (d < bd) { bd = d; best = s; }
      }
      return best ? { x: best.x, y: best.y, kind: 'drop' } : null;
    }
    return null;
  },

  onImpact(imp) {
    const r = this.route;
    if (!r || imp < 45 || (this.state !== 'route' && this.state !== 'stopping' && this.state !== 'returning')) return;
    r.hits++;
    let broke = 0;
    for (const s of r.stops) if (s.type === 'fragil' && s.status === 'pending' && !s.broken && imp > 60) { s.broken = true; broke++; }
    if (broke) { toast(`Crack! ${broke === 1 ? 'Um pacote frágil quebrou' : broke + ' pacotes frágeis quebraram'}.`, 'bad'); Sfx.bad(); }
    else if (this.hitCd <= 0) { toast(R.pick(PARCEL_HIT_LINES), 'warn'); this.hitCd = 2.5; }
  },

  // ---------- simulação ----------
  update(dt, car) {
    this.hitCd -= dt;
    const r = this.route, hd = this.hub && this.hub.door;
    const near = (x, y) => Math.hypot(car.x - x, car.y - y) < 30 && car.speed < 8;
    if (r && this.state !== 'toHub' && this.state !== 'loading') r.t += dt;
    switch (this.state) {
      case 'idle': {
        if (!Rides.canWork()) break;
        this.nextOfferT -= dt;
        if (this.nextOfferT <= 0) {
          const avg = Rides.ratingAvg();
          this.nextOfferT = R.f(3, 6) * (avg >= 4.5 ? 1 : avg >= 4 ? 1.4 : 2) * Veh.cur.offerMul;
          const o = this.makeOffer();
          if (o) { this.offer = o; this.state = 'offer'; Sfx.ding(); }
        }
        break;
      }
      case 'offer':
        this.offer.expires -= dt;
        if (this.offer.expires <= 0) { this.offer = null; this.state = 'idle'; this.nextOfferT = R.f(2, 4); }
        break;
      case 'toHub':
        if (near(hd.x, hd.y)) { this.state = 'loading'; r.loadT = 0; }
        break;
      case 'loading': {
        if (!near(hd.x, hd.y)) { r.loaded = 0; this.state = 'toHub'; toast('Calma! Ainda estão carregando.', 'warn'); break; }
        r.loadT += dt;
        // cada pacote leva um tempinho para subir (coleta não sobe: ela vem da casa do cliente)
        const toLoad = r.stops.filter((s) => s.type !== 'coleta').length;
        r.loaded = Math.min(toLoad, Math.floor(r.loadT / 0.35));
        if (r.loaded >= toLoad && r.loadT > 0.9) {
          this.state = 'route'; r.t = 0;
          Sfx.door();
          toast(`Carregado! Entregue na ordem que quiser: as paradas estão numeradas no minimapa.`, 'good');
        }
        break;
      }
      case 'route': {
        if (!r.warnedLate && r.t > r.allowed) { r.warnedLate = true; toast('O prazo da rota estourou: as próximas entregas vão ganhar nota menor.', 'warn'); }
        for (const s of r.stops) {
          if (s.status !== 'pending' || !near(s.x, s.y)) continue;
          r.cur = s; r.stopT = 0; s.carX = car.x; s.carY = car.y;
          r.stopDuration = PKTYPES[s.type].stop + Math.hypot(car.x - s.x, car.y - s.y) / 28;
          this.state = 'stopping';
          break;
        }
        if (this.state === 'route' && !r.stops.some((s) => s.status === 'pending')) this.startReturn();
        break;
      }
      case 'stopping': {
        const s = r.cur;
        if (!near(s.x, s.y)) { this.state = 'route'; r.cur = null; toast('Opa! Ainda não deu tempo de entregar.', 'warn'); break; }
        r.stopT += dt;
        if (r.stopT >= r.stopDuration) this.finishStop(s, car);
        break;
      }
      case 'returning':
        if (near(hd.x, hd.y)) this.closeRoute(car);
        break;
      case 'closing':
        r.closeT += dt;
        if (r.closeT > 2.5) this.reset();
        break;
    }
  },

  finishStop(s, car) {
    const r = this.route;
    r.cur = null; this.state = 'route';
    if (s.absent) {
      s.status = 'absent';
      toast(`Ninguém atendeu na casa de ${s.name}. O pacote volta para o galpão.`, 'warn');
      return;
    }
    if (s.type === 'coleta') {
      s.status = 'collected';
      Sfx.door();
      toast(`Devolução de ${s.name} na ${Veh.noun()}. Ela é paga quando chegar no galpão.`);
      return;
    }
    const late = s.type === 'hoje' ? r.t > s.allowed : r.t > r.allowed;
    const stars = parcelStars({ late, broken: s.broken });
    const pay = Math.round(s.fare * (s.broken ? 0.3 : late ? 0.85 : 1) * 100) / 100;
    s.status = 'done'; s.stars = stars; s.late = late;
    S.money += pay; S.earned += pay; S.parcels++; r.earned += pay;
    S.ratings.push(stars); if (S.ratings.length > 30) S.ratings.shift();
    Sfx.cash();
    addFloater(car.x, car.y - 12, '+' + fmtMoney(pay), s.broken ? '#ff8a7a' : '#39ff88');
    if (s.broken) toast(`${s.name} abriu a caixa e estava tudo quebrado. ${'★'.repeat(stars)}`, 'bad');
  },

  startReturn() {
    const r = this.route;
    this.state = 'returning';
    for (const s of r.stops) {
      if (s.status === 'pending') s.status = s.type === 'coleta' ? 'skipped' : 'returned';
    }
    toast('Volte à doca do galpão para conferir a carga e fechar a rota.', 'good');
  },

  closeRoute(car) {
    const r = this.route;
    let pay = 0;
    for (const s of r.stops) if (s.status === 'collected') {
      const late = r.t > r.allowed;
      pay += Math.round(s.fare * (late ? 0.85 : 1) * 100) / 100;
      S.parcels++; S.ratings.push(parcelStars({ late }));
    }
    while (S.ratings.length > 30) S.ratings.shift();
    const perfect = r.stops.every((s) => (s.status === 'done' && !s.broken && !s.late) || s.status === 'collected');
    const bonus = perfect && r.t <= r.allowed ? Math.round((r.earned + pay) * ROUTE_BONUS * 100) / 100 : 0;
    pay = Math.round((pay + bonus) * 100) / 100;
    S.money += pay; S.earned += pay; r.earned += pay;
    this.lastResult = { total: Math.round(r.earned * 100) / 100, bonus, done: r.stops.filter((s) => s.status === 'done').length,
      collected: r.stops.filter((s) => s.status === 'collected').length,
      returned: r.stops.filter((s) => s.status === 'returned' || s.status === 'absent').length,
      skipped: r.stops.filter((s) => s.status === 'skipped').length, late: r.t > r.allowed };
    this.state = 'closing'; r.closeT = 0;
    Sfx.cash();
    if (pay > 0) addFloater(car.x, car.y - 12, '+' + fmtMoney(pay), '#39ff88');
    toast(`Rota fechada! ${fmtMoney(r.earned)} no total${bonus ? ` (bônus de ${fmtMoney(bonus)} por rota perfeita)` : ''}.`, 'good');
  },

  // ---------- celular ----------
  stopRow(s) {
    const ic = { pending: '·', done: '✓', absent: '✗', collected: '↩', returned: '↪', skipped: '–' }[s.status];
    const cls = s.status === 'done' ? (s.broken || s.late ? 'late' : 'ok') : s.status === 'absent' ? 'late' : '';
    return `<div class="ph-stop ${cls}"><b>${s.n}</b> ${ic} ${esc(s.name)} <span class="ph-type t-${s.type}">${PKTYPES[s.type].label}</span>${s.type === 'hoje' && s.status === 'pending' ? ' ' + mmss(s.allowed - this.route.t) : ''}${s.broken && s.status === 'pending' ? ' <span class="late">quebrado</span>' : ''}</div>`;
  },

  phoneHTML() {
    const st = this.state, r = this.route, hb = this.hub;
    if (st === 'idle') {
      return `<div class="ph-status"><span class="dot"></span>ONLINE</div><div class="ph-muted">Esperando rotas no ${esc(hb ? hb.name : 'galpão')}…</div>` +
        `<div class="ph-stats">Pacotes: ${S.parcels}<br>Total ganho: ${fmtMoney(S.earned)}</div>`;
    }
    if (st === 'offer') {
      const o = this.offer, cnt = {};
      for (const s of o.stops) cnt[s.type] = (cnt[s.type] || 0) + 1;
      const types = PK_ORDER.filter((k) => cnt[k]).map((k) => `<span class="ph-type t-${k}" title="${esc(PKTYPES[k].desc)}">${cnt[k]} ${PKTYPES[k].label}</span>`).join(' ');
      return `<div class="ph-title">NOVA ROTA</div>
        <div class="ph-fare">${fmtMoney(o.total)}</div>
        <div class="ph-badge">+${Math.round(ROUTE_BONUS * 100)}% SE FOR PERFEITA</div>
        <div class="ph-row">${o.stops.length} pacotes · prazo ${mmss(o.allowed)}</div>
        <div class="ph-row">${types}</div>
        <div class="ph-muted">Galpão a ${kmStr(o.hubD)} · parada mais longe a ${kmStr(o.far)}</div>
        <div class="ph-timer"><div></div></div>
        <div class="ph-btns"><button data-act="accept"><kbd>E</kbd> ACEITAR</button><button data-act="decline" class="ghost"><kbd>Q</kbd> RECUSAR</button></div>`;
    }
    if (st === 'toHub' || st === 'loading') {
      const toLoad = r.stops.filter((s) => s.type !== 'coleta').length;
      return `<div class="ph-title">CARREGAR</div>
        <div class="ph-row">${esc(hb.name)}</div>
        <div class="ph-muted">${st === 'loading' ? `Carregando… segura a ${Veh.noun()}.` : 'Siga a seta verde e pare na doca do galpão.'}</div>
        <div class="ph-row">Pacotes: ${r.loaded}/${toLoad}</div>
        <div class="ph-comfort"><div style="width:${Math.round(r.loaded / Math.max(1, toLoad) * 100)}%"></div></div>
        <div class="ph-fare small">${fmtMoney(r.total)}</div>
        <div class="ph-btns"><button data-act="cancel" class="ghost"><kbd>C</kbd> CANCELAR</button></div>`;
    }
    if (st === 'route' || st === 'stopping' || st === 'returning') {
      const left = r.allowed - r.t, pend = r.stops.filter((s) => s.status === 'pending').length;
      const cur = st === 'stopping' ? r.cur : null;
      const msg = st === 'returning' ? 'Volte ao galpão (seta verde) para fechar a rota.'
        : cur ? (cur.absent ? 'Tocando a campainha… ninguém atende.' : cur.type === 'pesado' ? 'Descarregando o pesadão…' : cur.type === 'coleta' ? 'Pegando a devolução…' : 'Entregando…')
          : 'A seta amarela aponta a parada mais perto.';
      return `<div class="ph-title">${st === 'returning' ? 'VOLTANDO AO GALPÃO' : `EM ROTA · ${pend} restante${pend === 1 ? '' : 's'}`}</div>
        <div class="ph-big ${left < 0 ? 'late' : ''}">${mmss(left)}</div>
        <div class="ph-muted">${msg}</div>
        <div class="ph-stops">${r.stops.map((s) => this.stopRow(s)).join('')}</div>
        <div class="ph-row">Ganho: ${fmtMoney(r.earned)} · Batidas: ${r.hits}</div>
        <div class="ph-btns">${st === 'route' && pend ? '<button data-act="return"><kbd>V</kbd> VOLTAR COM A CARGA</button>' : ''}<button data-act="cancel" class="ghost"><kbd>C</kbd> CANCELAR</button></div>`;
    }
    if (st === 'closing' && this.lastResult) {
      const res = this.lastResult;
      return `<div class="ph-title">ROTA FECHADA</div>
        <div class="ph-fare">+${fmtMoney(res.total)}</div>
        <div class="ph-row">Entregues: ${res.done} · Coletas: ${res.collected} · Devolvidos: ${res.returned}${res.skipped ? ` · Coletas pendentes: ${res.skipped}` : ''}</div>
        ${res.bonus ? `<div class="ph-row ok">Bônus rota perfeita: ${fmtMoney(res.bonus)}</div>` : ''}
        ${res.late ? '<div class="ph-row late">Estourou o prazo</div>' : ''}`;
    }
    return '';
  },

  // ---------- desenho ----------
  drawWorld(g, camX, camY) {
    const r = this.route;
    if (!r) return;
    const bob = Math.round(Math.sin(time * 5) * 1.5), pulse = 10 + Math.round(Math.sin(time * 6) * 1.5);
    const st = this.state, hd = this.hub.door;
    if (st === 'toHub' || st === 'loading' || st === 'returning') {
      pxRing(g, hd.x - camX, hd.y - camY, pulse, '#39ff88');
      if (st !== 'loading') pxDownArrow(g, hd.x - camX, hd.y - camY - 15 + bob, '#39ff88');
      else { // estoquista levando caixa até a van
        const k = (r.loadT / 0.35) % 1, px = lerp(hd.x, player.x, k) - camX, py = lerp(hd.y, player.y, k) - camY;
        drawPedSprite(g, px, py, '#f4f4f4', '#2b1d14', time * 4, false);
        this.drawBox(g, px + 3, py - 2);
      }
    }
    if (st === 'route' || st === 'stopping') {
      g.font = '12px VT323, monospace'; g.textAlign = 'center';
      for (const s of r.stops) {
        if (s.status !== 'pending') continue;
        const sx = s.x - camX, sy = s.y - camY;
        if (sx < -30 || sy < -30 || sx > view.w + 30 || sy > view.h + 30) continue;
        pxRing(g, sx, sy, 8, '#ffd23f');
        g.fillStyle = '#000'; g.fillText(String(s.n), Math.round(sx) + 1, Math.round(sy) - 10);
        g.fillStyle = '#ffd23f'; g.fillText(String(s.n), Math.round(sx), Math.round(sy) - 11);
        if (r.cur === s) { // entregador indo até a porta com a caixa (e o cliente vindo, se estiver em casa)
          const k = Math.min(1, r.stopT / (r.stopDuration * 0.55));
          const px = lerp(s.carX, s.x, k) - camX, py = lerp(s.carY, s.y, k) - camY;
          drawPedSprite(g, px, py, this.hub.col, '#2b1d14', time * 4, false);
          if (s.type !== 'coleta') this.drawBox(g, px + 3, py - 2, s.type === 'pesado');
          if (!s.absent) drawPedSprite(g, sx + 4, sy, s.shirt, s.hair, time * 4, true);
        } else if (!s.absent) drawPedSprite(g, sx, sy, s.shirt, s.hair, time * 4, false);
      }
    }
  },

  drawBox(g, x, y, big) {
    if (typeof drawing3D !== 'undefined' && drawing3D && g === ctx) {
      world3D.props.parcel(x + camX, y + camY, big);
      return;
    }
    x = Math.round(x); y = Math.round(y);
    const w = big ? 6 : 4;
    g.fillStyle = '#3b2a17'; g.fillRect(x - 1, y - 1, w + 2, w + 1);
    g.fillStyle = '#c8955a'; g.fillRect(x, y, w, w - 1);
    g.fillStyle = '#e0c08a'; g.fillRect(x + (w >> 1) - 1, y, 1, w - 1);
  },

  // nome do galpão do seu app (só quem está de entregador de pacote vê)
  draw(g, camX, camY, vw, vh) {
    const hb = this.on && this.hub;
    if (!hb) return;
    const cx = hb.x, cy = hb.bd.y0 * 16 - 2;
    if (cx + 90 < camX || cy + 90 < camY || cx - 90 > camX + vw || cy - 90 > camY + vh) return;
    g.font = '12px VT323, monospace'; g.textAlign = 'center';
    g.fillStyle = '#000'; g.fillText(hb.name.toUpperCase(), Math.round(cx - camX) + 1, Math.round(cy - camY) + 1);
    g.fillStyle = hb.col; g.fillText(hb.name.toUpperCase(), Math.round(cx - camX), Math.round(cy - camY));
  },

  drawLights(L, camX, camY) {
    const hb = this.on && this.hub;
    if (hb) L.hole(hb.door.x - camX, hb.door.y - camY, 34, 0.5);
  },

  // galpão e as paradas numeradas
  drawMinimap(g, s) {
    const hb = this.on && this.hub;
    if (!hb) return;
    const x = Math.round(hb.door.x * s), y = Math.round(hb.door.y * s);
    g.fillStyle = '#000'; g.fillRect(x - 4, y - 4, 9, 9);
    g.fillStyle = hb.col; g.fillRect(x - 3, y - 3, 7, 7);
    const r = this.route;
    if (!r || (this.state !== 'route' && this.state !== 'stopping' && this.state !== 'returning')) return;
    g.font = '10px VT323, monospace'; g.textAlign = 'center';
    for (const p of r.stops) {
      if (p.status !== 'pending') continue;
      const px = Math.round(p.x * s), py = Math.round(p.y * s);
      g.fillStyle = '#000'; g.fillRect(px - 3, py - 3, 6, 6);
      g.fillStyle = '#ffd23f'; g.fillRect(px - 2, py - 2, 4, 4);
      g.fillStyle = '#000'; g.fillText(String(p.n), px + 1, py - 4);
      g.fillStyle = '#fff'; g.fillText(String(p.n), px, py - 5);
    }
  },
};
