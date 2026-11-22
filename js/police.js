'use strict';
// Polícia: quando você apronta (atropela alguém, passa no radar da escola, bate numa viatura), uma viatura aparece
// e vem atrás. Ela segue um mapa de distâncias até o seu carro (busca em largura nos tiles), então contorna quarteirões.
// Pego = viatura colada e você parado. Despistou = ficou bem longe por um tempo, e ganha AURA.

const COP_PHYS = { maxSpeed: 245, accel: 175 };
const COP_CATCH_DIST = 32;   // px (a colisão deixa os carros a ~22 px)
const COP_CATCH_T = 1.2;     // s colado e parado
const COP_LOSE_DIST = 420;   // px
const COP_LOSE_T = 6;        // s longe
const ESCAPE_AURA = 15;
const FLOW_EVERY = 0.35;     // s entre recálculos do mapa de distâncias

const Police = {
  cops: [], wanted: false, chaseT: 0, caughtT: 0, lostT: 0, flowT: 0, dist: null, queue: null, spr: null,
  ...SirenSound, why: '',

  // começa (ou piora) uma perseguição
  alert(why) {
    if (mode !== 'play' || Veh.cur.school) return; // na autoescola o instrutor cuida das broncas
    if (this.wanted) { if (this.cops.length < 2 && this.chaseT > 8) this.spawn(); return; }
    this.wanted = true; this.why = why;
    this.chaseT = 0; this.caughtT = 0; this.lostT = 0;
    this.spawn();
    this.startSiren();
    toast('A polícia está atrás de você! Fuja ou encoste o carro.', 'bad');
  },

  spawn() {
    const c = city, vw = view.w / 2 + 30, vh = view.h / 2 + 30;
    let best = null;
    for (let t = 0; t < 80; t++) {
      const rt = R.pick(c.roadTiles);
      const x = rt.x * 16 + 8, y = rt.y * 16 + 8, d = Math.hypot(x - player.x, y - player.y);
      const hidden = Math.abs(x - player.x) > vw || Math.abs(y - player.y) > vh;
      if (d > 220 && d < 460 && hidden) { best = { x, y }; break; }
      if (!best && d > 200) best = { x, y };
    }
    if (!best) return;
    const cop = makePlayer(best.x, best.y, Math.atan2(player.y - best.y, player.x - best.x));
    cop.p = Object.assign({}, CARP, COP_PHYS);
    cop.revT = 0; cop.slowT = 0;
    this.cops.push(cop);
  },

  // sem perseguição (começo de turno no multiplayer)
  reset() { this.wanted = false; this.cops = []; this.stopSiren(); },

  end(caught) {
    this.wanted = false;
    this.cops = [];
    this.stopSiren();
    if (caught) {
      Care.charge(POLICE_FINE, 'policia');
      Care.stallT = Math.max(Care.stallT, 2);
      if (Veh.job === 'onibus') Onibus.cancel(true);
      else if (Veh.job === 'policia') Patrulha.cancel();
      else if (Veh.job === 'ambulancia') Ambulancia.cancel(true);
      else if (Veh.job === 'envios') Envios.cancel(true);
      else if (Veh.cur.shuttle) Escolar.cancel(true);
      else if (Veh.cur.parcels) Parcels.cancel(true);
      else if (Rides.ride && Rides.state !== 'dropping') { toast(Rides.ride.order ? `Parado na blitz: o pedido de ${Rides.ride.name} foi cancelado.` : `${Rides.ride.name} desceu na blitz.`, 'bad'); Rides.cancel(true); }
      toast(`Encosta o carro! Documento e multa de ${fmtMoney(POLICE_FINE)}.`, 'bad');
      Sfx.bad();
    } else {
      S.aura = (S.aura || 0) + ESCAPE_AURA;
      addFloater(player.x, player.y - 14, `+${ESCAPE_AURA} AURA`, '#c77dff');
      toast(`Você despistou a polícia! +${ESCAPE_AURA} de AURA.`, 'good');
    }
  },

  // ---------- mapa de distâncias até o jogador (em tiles) ----------
  flow() {
    const W = city.W, H = city.H, n = W * H;
    if (!this.dist) { this.dist = new Int32Array(n); this.queue = new Int32Array(n); }
    const dist = this.dist, q = this.queue;
    dist.fill(-1);
    const sx = clamp(Math.floor(player.x / 16), 0, W - 1), sy = clamp(Math.floor(player.y / 16), 0, H - 1);
    let head = 0, tail = 0;
    dist[sy * W + sx] = 0; q[tail++] = sy * W + sx;
    while (head < tail) {
      const k = q[head++], x = k % W, y = (k / W) | 0, dd = dist[k] + 1;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (dist[nk] >= 0 || city.solid(nx, ny)) continue;
        dist[nk] = dd; q[tail++] = nk;
      }
    }
  },

  // ponto para onde a viatura mira: descendo o mapa de distâncias alguns tiles
  waypoint(cop) {
    const W = city.W, dist = this.dist;
    let x = Math.floor(cop.x / 16), y = Math.floor(cop.y / 16);
    for (let s = 0; s < 3; s++) {
      let bx = x, by = y, bd = dist[y * W + x] >= 0 ? dist[y * W + x] : 1e9;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy, v = dist[ny * W + nx];
        if (v >= 0 && v < bd) { bd = v; bx = nx; by = ny; }
      }
      if (bx === x && by === y) break;
      x = bx; y = by;
    }
    return { x: x * 16 + 8, y: y * 16 + 8 };
  },

  // ---------- simulação ----------
  update(dt, pl) {
    if (!this.wanted) return;
    this.chaseT += dt;
    this.flowT -= dt;
    if (this.flowT <= 0) { this.flowT = FLOW_EVERY; this.flow(); }
    if (this.chaseT > 25 && this.cops.length < 2) this.spawn();
    let near = Infinity;
    for (const cop of this.cops) {
      const d = Math.hypot(pl.x - cop.x, pl.y - cop.y);
      near = Math.min(near, d);
      const tg = d < 70 ? { x: pl.x + pl.vx * 0.25, y: pl.y + pl.vy * 0.25 } : this.waypoint(cop);
      const diff = angDiff(cop.a, Math.atan2(tg.y - cop.y, tg.x - cop.x));
      let inp;
      if (cop.revT > 0) {
        cop.revT -= dt;
        inp = { up: false, down: true, left: diff > 0, right: diff < 0, hb: false };
      } else {
        // chegando perto: diminui para encostar em vez de passar direto e ficar rodando
        // colada no carro: para (senão vai empurrando o jogador pela rua)
        const want = d < 30 ? 0 : d < 90 ? pl.speed + 25 + d * 1.2 : Infinity;
        const sharp = (Math.abs(diff) > 0.8 && cop.speed > 110) || cop.speed > want;
        inp = { up: !sharp && cop.speed < want, down: sharp, left: diff < -0.12, right: diff > 0.12, hb: Math.abs(diff) > 1.3 && cop.speed > 90 };
      }
      // presa num canto: dá ré um pouco
      if (cop.speed < 12 && d > 30) { cop.slowT += dt; if (cop.slowT > 1.2) { cop.slowT = 0; cop.revT = 0.8; } } else cop.slowT = 0;
      const surf = city.tileAtPx(cop.x, cop.y);
      const m = { power: 1, speedMul: surf === T.GRASS ? 0.5 : 1, accelMul: 1, brakeMul: 1, gripMul: 1, dragMul: 1, steerBias: 0 };
      stepPlayer(cop, inp, dt, m);
      collidePlayer(cop, city, traffic.cars);
    }
    // pego ou despistou
    const stuck = near < COP_CATCH_DIST && pl.speed < 30;
    this.caughtT = stuck ? this.caughtT + dt : Math.max(0, this.caughtT - dt);
    if (this.caughtT > COP_CATCH_T) { this.end(true); return; }
    this.lostT = near > COP_LOSE_DIST ? this.lostT + dt : 0;
    if (this.lostT > COP_LOSE_T) { this.end(false); return; }
    this.sirenVol(near);
  },

  // o jogador batendo nas viaturas (bater numa viatura também chama a polícia)
  collide(car) {
    if (!this.cops.length) return 0;
    const imp = collideCars(car, this.cops, false, 1.2);
    if (imp > 35) this.alert('viatura');
    return imp;
  },

  // ---------- som ----------
  // ---------- desenho ----------
  draw() {
    if (!this.cops.length) return;
    if (!this.spr) this.spr = makeCarSprites('#e9e9e9', false, 'car');
    const flip = Math.floor(time * 8) % 2;
    for (const cop of this.cops) {
      drawCar(this.spr, cop.x, cop.y, cop.a, cop.braking);
      const sx = Math.round(cop.x - camX), sy = Math.round(cop.y - camY);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(cop.a);
      ctx.fillStyle = '#111'; ctx.fillRect(-6, -5, 3, 10); ctx.fillRect(4, -5, 3, 10); // portas pretas
      ctx.fillStyle = flip ? '#ff2a2a' : '#2a6bff'; ctx.fillRect(-1, -3, 2, 3);
      ctx.fillStyle = flip ? '#2a6bff' : '#ff2a2a'; ctx.fillRect(-1, 0, 2, 3);
      ctx.restore();
    }
  },

  lightCars(list) { for (const c of this.cops) list.push({ x: c.x, y: c.y, a: c.a, front: 8, len: 80, k: 0.9 }); },

  // giroflex: brilho vermelho e azul por cima da noite
  drawGlow() {
    if (!this.cops.length) return;
    const flip = Math.floor(time * 8) % 2;
    ctx.globalCompositeOperation = 'lighter';
    for (const c of this.cops) {
      const x = c.x - camX, y = c.y - camY;
      if (x < -60 || y < -60 || x > view.w + 60 || y > view.h + 60) continue;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, 34);
      gr.addColorStop(0, flip ? 'rgba(255,40,40,0.45)' : 'rgba(40,90,255,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - 34, y - 34, 68, 68);
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  drawMinimap(g, s) {
    if (Math.floor(time * 6) % 2) return;
    for (const c of this.cops) {
      const x = Math.round(c.x * s), y = Math.round(c.y * s);
      g.fillStyle = '#000'; g.fillRect(x - 3, y - 3, 6, 6);
      g.fillStyle = '#2a6bff'; g.fillRect(x - 2, y - 2, 4, 4);
    }
  },
};
