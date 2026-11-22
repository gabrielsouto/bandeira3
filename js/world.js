'use strict';
// Coisas espalhadas pela cidade, sorteadas pela seed sem mudar os tiles (o hash da sala continua o mesmo):
//  - gatos e cachorros nas calçadas (atropelar um tira AURA)
//  - áreas de risco, com bandidos a pé que assaltam quem para ou passa devagar (atropelar bandido dá AURA)
//  - colégios, com trânsito parado, crianças atravessando e radar na entrada e na saída das aulas

const RISK_COUNT = 2;
const SCHOOL_COUNT = 3;
const SCHOOL_NAMES = ['E.E. Prof. Anísio', 'Colégio Santa Luzia', 'Escola Monteiro Lobato', 'Colégio Objetivo Sul'];
// horários de entrada e saída (minutos do relógio do jogo)
const SCHOOL_TIMES = [[6 * 60 + 45, 7 * 60 + 30], [11 * 60 + 45, 12 * 60 + 30], [17 * 60 + 15, 18 * 60]];
const SCHOOL_SPEED = 73;  // px/s ≈ 40 km/h no velocímetro: acima disso na zona escolar o radar pega
const BANDIT_AURA = 10;   // aura por bandido atropelado
const KID_SHIRT = '#f4f4f4';
const PET_COUNT = 16;     // gatos e cachorros soltos nas calçadas
const PET_AURA = 15;      // aura perdida por atropelar um bicho
const DOG_COLORS = ['#8a5a2b', '#d9b26a', '#2b2b2b', '#f0e6d2'];
const CAT_COLORS = ['#e08a2e', '#7d7d7d', '#1c1c1c', '#f4f4f4'];

function drawSchoolKid(g, x, y, hair, anim) {
  drawPedSprite(g, x, y, KID_SHIRT, hair, anim, false);
  g.fillStyle = '#e74c3c';
  g.fillRect(Math.round(x) - 2, Math.round(y) + 1, 1, 2); // mochila
}

const World = {
  risks: [], schools: [], bandits: [], kids: [], pets: [], robCd: 0, warnCd: 0, radarCd: 0, schoolOn: false,

  init(city, mapCtx) {
    const r = mulberry32((city.seed ^ 0x5eed) >>> 0);
    const placeBlocks = new Set();
    for (const p of city.places) for (const b of city.blocks)
      if (p.x0 >= b.x0 && p.x1 <= b.x1 && p.y0 >= b.y0 && p.y1 <= b.y1) placeBlocks.add(b);
    const free = city.blocks.filter((b) => !placeBlocks.has(b) && !b.park);

    // áreas de risco: quarteirões afastados entre si
    for (let t = 0; t < 200 && this.risks.length < RISK_COUNT; t++) {
      const b = free[Math.floor(r() * free.length)];
      if (this.risks.some((z) => Math.abs(z.b.i - b.i) + Math.abs(z.b.j - b.j) < 4)) continue;
      const x = (b.x0 + b.x1 + 1) * 8, y = (b.y0 + b.y1 + 1) * 8;
      const rad = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 8 + 56;
      const tiles = city.pedTiles.filter((p) => Math.hypot(p.x * 16 + 8 - x, p.y * 16 + 8 - y) < rad - 8);
      if (tiles.length < 6) continue;
      this.risks.push({ b, x, y, r: rad, tiles, spawnT: 0 });
    }

    // colégios: prédios grandes de frente para uma rua
    const bigs = city.buildings.filter((bd) => bd.x1 - bd.x0 >= 2 && bd.y1 - bd.y0 >= 2);
    for (let t = 0; t < 300 && this.schools.length < SCHOOL_COUNT && bigs.length; t++) {
      const bd = bigs[Math.floor(r() * bigs.length)];
      const b = city.blocks.find((k) => bd.x0 >= k.x0 && bd.x1 <= k.x1 && bd.y0 >= k.y0 && bd.y1 <= k.y1);
      if (!b || this.schools.some((s) => s.b === b) || this.risks.some((z) => z.b === b)) continue;
      const z = this.schoolZone(city, b, bd);
      if (!z) continue;
      this.schools.push(Object.assign(z, { b, bd, name: SCHOOL_NAMES[this.schools.length % SCHOOL_NAMES.length], extra: [] }));
    }
    for (const s of this.schools) this.paintSchool(mapCtx, s);
    this.city = city;
    for (let k = 0; k < PET_COUNT; k++) this.pets.push(this.newPet());
  },

  // ---------- gatos e cachorros ----------
  newPet() {
    const t = R.pick(this.city.pedTiles), dog = R.chance(0.55);
    return { dog, col: R.pick(dog ? DOG_COLORS : CAT_COLORS), x: t.x * 16 + 8, y: t.y * 16 + 8, tx: t.x, ty: t.y,
      dir: R.i(0, 3), speed: dog ? R.f(14, 22) : R.f(9, 15), rest: R.f(0, 3), down: 0, anim: 0, flip: false, vx: 0, vy: 0, dodge: 0 };
  },

  updatePets(dt, car) {
    const c = this.city, walk = (x, y) => { const t = c.get(x, y); return t === T.SIDEWALK || t === T.PLAZA; };
    for (let k = this.pets.length - 1; k >= 0; k--) {
      const p = this.pets[k];
      if (p.down > 0) { p.down -= dt; if (p.down <= 0) this.pets[k] = this.newPet(); continue; }
      const dx = p.x - car.x, dy = p.y - car.y, d = Math.hypot(dx, dy);
      // atropelou: perde aura
      if (d < 6 && car.speed > 28) {
        p.down = 6;
        S.aura = (S.aura || 0) - PET_AURA;
        addFloater(p.x, p.y - 10, `-${PET_AURA} AURA`, '#ff4d4d');
        toast(`Você atropelou ${p.dog ? 'um cachorro' : 'um gato'}! -${PET_AURA} de AURA. Que feio...`, 'bad');
        Sfx.tone(p.dog ? 520 : 900, 0.25, 'triangle', 0.07, 0, p.dog ? -250 : -500);
        continue;
      }
      if (p.dodge > 0) { // pulo para o lado
        p.dodge -= dt;
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (!c.solid(Math.floor(nx / 16), Math.floor(ny / 16))) { p.x = nx; p.y = ny; }
        p.anim += dt * 12;
        if (p.dodge <= 0) { p.tx = Math.floor(p.x / 16); p.ty = Math.floor(p.y / 16); }
        continue;
      }
      // carro vindo rápido na direção do bicho: gato quase sempre escapa, cachorro às vezes
      if (car.speed > 40 && d < 34 && !p.tried) {
        const vx = car.vx / car.speed, vy = car.vy / car.speed, ah = dx * vx + dy * vy, lat = -dx * vy + dy * vx;
        if (ah > 0 && Math.abs(lat) < 10) {
          p.tried = true;
          if (R.chance(p.dog ? 0.55 : 0.8)) { const s = lat >= 0 ? 1 : -1; p.vx = -vy * s * 90; p.vy = vx * s * 90; p.dodge = 0.3; continue; }
        }
      }
      if (d > 60) p.tried = false;
      if (p.rest > 0) { p.rest -= dt; continue; } // parado (cachorro cheirando o poste, gato tomando sol)
      const gx = p.tx * 16 + 8, gy = p.ty * 16 + 8, ex = gx - p.x, ey = gy - p.y, ed = Math.hypot(ex, ey);
      if (ed < 1) {
        if (R.chance(0.15)) { p.rest = R.f(1, 4); continue; }
        const opts = [];
        for (let dd = 0; dd < 4; dd++) if (dd !== (p.dir + 2) % 4 && walk(p.tx + DIRS[dd].dx, p.ty + DIRS[dd].dy)) opts.push(dd);
        const nd = opts.includes(p.dir) && R.chance(0.6) ? p.dir : opts.length ? R.pick(opts) : (p.dir + 2) % 4;
        if (walk(p.tx + DIRS[nd].dx, p.ty + DIRS[nd].dy)) { p.dir = nd; p.tx += DIRS[nd].dx; p.ty += DIRS[nd].dy; }
      } else {
        const st = Math.min(ed, p.speed * dt);
        p.x += ex / ed * st; p.y += ey / ed * st;
        if (Math.abs(ex) > 0.1) p.flip = ex < 0;
        p.anim += dt * p.speed * 0.5;
      }
    }
  },

  drawPet(g, p, sx, sy) {
    if (typeof drawing3D !== 'undefined' && drawing3D && g === ctx) {
      world3D.props.pet(p, sx + camX, sy + camY);
      return;
    }
    const x = Math.round(sx), y = Math.round(sy), f = p.flip ? -1 : 1, leg = Math.floor(p.anim) % 2;
    const px = (ox, oy, w, h) => g.fillRect(f > 0 ? x + ox : x - ox - w + 1, y + oy, w, h);
    if (p.down > 0) { g.fillStyle = p.col; px(-2, 0, 5, 2); g.fillStyle = '#fff'; px(0, -4 - (Math.floor(time * 3) % 2), 1, 1); return; }
    g.fillStyle = 'rgba(0,0,0,0.3)'; px(-2, 2, 6, 1);
    g.fillStyle = shade(p.col, -0.35);
    if (p.dog) {
      px(-2, 1 + leg, 1, 1); px(2, 2 - leg, 1, 1);            // patas
      g.fillStyle = p.col; px(-2, -1, 5, 2); px(2, -2, 2, 2);  // corpo e cabeça
      px(-3, -2 + leg, 1, 1);                                 // rabo abanando
      g.fillStyle = shade(p.col, -0.35); px(4, -2, 1, 1);      // focinho
    } else {
      px(-1, 1, 1, 1); px(1, 1, 1, 1);
      g.fillStyle = p.col; px(-1, -1, 3, 2); px(2, -2, 2, 2);  // corpo e cabeça
      px(2, -3, 1, 1); px(3, -3, 1, 1);                       // orelhas
      px(-2, -2 - leg, 1, 2);                                 // rabo para cima
    }
  },

  // trecho de rua em frente ao colégio (o lado do quarteirão mais perto do prédio que tenha rua)
  schoolZone(city, b, bd) {
    const { xs, ys, hSeg, vSeg } = city;
    const sides = [
      { d: bd.y0 - b.y0, ok: hSeg[b.j][b.i], horiz: true, row: ys[b.j], i: b.i, j: b.j },
      { d: b.y1 - bd.y1, ok: hSeg[b.j + 1][b.i], horiz: true, row: ys[b.j + 1], i: b.i, j: b.j + 1 },
      { d: bd.x0 - b.x0, ok: vSeg[b.i][b.j], horiz: false, col: xs[b.i], i: b.i, j: b.j },
      { d: b.x1 - bd.x1, ok: vSeg[b.i + 1][b.j], horiz: false, col: xs[b.i + 1], i: b.i + 1, j: b.j },
    ].filter((s) => s.ok && s.d <= 2).sort((a, c) => a.d - c.d);
    const s = sides[0];
    if (!s) return null;
    if (s.horiz) {
      const x0 = Math.max((b.x0) * 16, bd.x0 * 16 - 24), x1 = Math.min((b.x1 + 1) * 16, (bd.x1 + 1) * 16 + 24);
      return { horiz: true, i: s.i, j: s.j, zone: { x0, x1, y0: s.row * 16, y1: s.row * 16 + city.wy[s.j] * 16 } };
    }
    const y0 = Math.max(b.y0 * 16, bd.y0 * 16 - 24), y1 = Math.min((b.y1 + 1) * 16, (bd.y1 + 1) * 16 + 24);
    return { horiz: false, i: s.i, j: s.j, zone: { x0: s.col * 16, x1: s.col * 16 + city.wx[s.i] * 16, y0, y1 } };
  },

  // telhado de tijolinho com uma quadra de esportes pintada em cima
  paintSchool(g, s) {
    const bd = s.bd, x = bd.x0 * 16, y = bd.y0 * 16, w = (bd.x1 - bd.x0 + 1) * 16, h = (bd.y1 - bd.y0 + 1) * 16;
    g.fillStyle = '#7a3b22'; g.fillRect(x, y, w, h);
    g.fillStyle = '#b25a34'; g.fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = '#a04e2c';
    for (let k = 3; k < h - 2; k += 3) g.fillRect(x + 2, y + k, w - 4, 1);
    const cw = Math.min(w - 10, 40), ch = Math.min(h - 10, 24), cx = x + ((w - cw) >> 1), cy = y + ((h - ch) >> 1);
    g.fillStyle = '#2f7d5a'; g.fillRect(cx, cy, cw, ch);
    g.fillStyle = '#e8e8e8';
    g.fillRect(cx, cy, cw, 1); g.fillRect(cx, cy + ch - 1, cw, 1); g.fillRect(cx, cy, 1, ch); g.fillRect(cx + cw - 1, cy, 1, ch);
    g.fillRect(cx + (cw >> 1), cy, 1, ch);
    pxRing(g, cx + (cw >> 1), cy + (ch >> 1), 3, '#e8e8e8');
    // faixa "ESCOLA" no asfalto
    const z = s.zone;
    g.fillStyle = 'rgba(255,210,63,0.75)';
    if (s.horiz) for (let k = z.x0 + 4; k < z.x1 - 4; k += 10) { g.fillRect(k, z.y0 + 2, 5, 2); g.fillRect(k, z.y1 - 4, 5, 2); }
    else for (let k = z.y0 + 4; k < z.y1 - 4; k += 10) { g.fillRect(z.x0 + 2, k, 2, 5); g.fillRect(z.x1 - 4, k, 2, 5); }
  },

  // ---------- consultas ----------
  inRisk(x, y) { return this.risks.some((z) => Math.hypot(x - z.x, y - z.y) < z.r); },
  schoolTime(min = gameMin) { const m = min % 1440; return SCHOOL_TIMES.some(([a, b]) => m >= a && m < b); },
  inZone(s, x, y, pad = 0) { const z = s.zone; return x >= z.x0 - pad && x <= z.x1 + pad && y >= z.y0 - pad && y <= z.y1 + pad; },
  // velocidade máxima do trânsito num ponto (engarrafamento na frente dos colégios)
  trafficCap(x, y) {
    if (!this.schoolOn) return Infinity;
    for (const s of this.schools) if (this.inZone(s, x, y, 24)) return 13;
    return Infinity;
  },

  // ---------- simulação ----------
  update(dt, car) {
    this.robCd -= dt; this.warnCd -= dt; this.radarCd -= dt;
    this.updateSchools(dt, car);
    this.updateBandits(dt, car);
    this.updatePets(dt, car);
  },

  updateSchools(dt, car) {
    const on = this.schoolTime();
    if (on !== this.schoolOn) {
      this.schoolOn = on;
      if (on) {
        for (const s of this.schools) this.startRush(s);
        if (mode === 'play') toast('Horário de aula: trânsito parado na frente dos colégios.', 'warn');
      } else {
        for (const s of this.schools) { for (const c of s.extra) c.leave = true; s.extra = []; }
        this.kids = [];
      }
    }
    if (!on) return;
    // crianças atravessando
    for (const s of this.schools) {
      const n = this.kids.filter((k) => k.s === s).length;
      if (n < 4 && R.chance(dt * 0.6)) this.kids.push(this.newKid(s));
    }
    for (let k = this.kids.length - 1; k >= 0; k--) {
      const kd = this.kids[k];
      kd.anim += dt * 6;
      if (kd.down > 0) { kd.down -= dt; if (kd.down <= 0) this.kids.splice(k, 1); continue; }
      if (kd.s.horiz) kd.y += kd.dir * 14 * dt; else kd.x += kd.dir * 14 * dt;
      const z = kd.s.zone, done = kd.s.horiz ? (kd.dir > 0 ? kd.y > z.y1 + 6 : kd.y < z.y0 - 6) : (kd.dir > 0 ? kd.x > z.x1 + 6 : kd.x < z.x0 - 6);
      if (done) { this.kids.splice(k, 1); continue; }
      if (Math.hypot(kd.x - car.x, kd.y - car.y) < 7 && car.speed > 28) {
        kd.down = 3;
        onPedHit('criança');
      }
    }
    // radar escolar
    for (const s of this.schools) {
      if (!this.inZone(s, car.x, car.y) || car.speed <= SCHOOL_SPEED || this.radarCd > 0) continue;
      this.radarCd = 8;
      Care.charge(RADAR_FINE, 'radar');
      toast(`Radar da zona escolar! ${Math.round(car.speed * 0.55)} km/h onde o máximo é 40. Multa de ${fmtMoney(RADAR_FINE)}.`, 'bad');
      Sfx.bad();
      Police.alert('radar');
    }
  },

  // carros extras saindo do colégio (fila nos dois sentidos)
  startRush(s) {
    const dirs = s.horiz ? [[s.i, s.j, 0], [s.i + 1, s.j, 2]] : [[s.i, s.j, 1], [s.i, s.j + 1, 3]];
    for (const [i, j, d] of dirs) for (const t of [0.2, 0.45, 0.7]) {
      const c = traffic.spawnAt(i, j, d, t);
      if (c) { c.school = true; s.extra.push(c); }
    }
  },

  newKid(s) {
    const z = s.zone, dir = R.chance(0.5) ? 1 : -1;
    if (s.horiz) return { s, dir, x: R.f(z.x0 + 8, z.x1 - 8), y: dir > 0 ? z.y0 - 4 : z.y1 + 4, anim: 0, down: 0, hair: R.pick(HAIRS) };
    return { s, dir, y: R.f(z.y0 + 8, z.y1 - 8), x: dir > 0 ? z.x0 - 4 : z.x1 + 4, anim: 0, down: 0, hair: R.pick(HAIRS) };
  },

  updateBandits(dt, car) {
    const night = Light.isNight(gameMin);
    const patrolZone = Veh.job === 'policia' && S.ocorrencia?.phase === 'ronda' ? this.risks[S.ocorrencia.zone] : null;
    for (const z of this.risks) {
      const n = this.bandits.filter((b) => b.z === z && b.state !== 'gone').length;
      z.spawnT -= dt;
      if (n < (night ? 4 : 2) && z.spawnT <= 0) {
        z.spawnT = R.f(4, 9);
        const t = R.pick(z.tiles);
        const x = t.x * 16 + 8, y = t.y * 16 + 8;
        if (Math.hypot(x - car.x, y - car.y) > (z === patrolZone ? 24 : 120)) this.bandits.push({ z, x, y, state: 'lurk', t: 0, tx: x, ty: y, anim: 0, flee: 0 });
      }
    }
    const fast = car.speed > 110;
    for (let k = this.bandits.length - 1; k >= 0; k--) {
      const b = this.bandits[k];
      const dx = car.x - b.x, dy = car.y - b.y, d = Math.hypot(dx, dy);
      b.t -= dt;
      if (b.state === 'down') { if (b.t <= 0) this.bandits.splice(k, 1); continue; }
      // atropelado: sem multa, com aura
      if (d < 8 && car.speed > 28) {
        b.state = 'down'; b.t = 4;
        S.aura = (S.aura || 0) + BANDIT_AURA;
        addFloater(b.x, b.y - 10, `+${BANDIT_AURA} AURA`, '#c77dff');
        toast(`Atropelou o bandido! +${BANDIT_AURA} de AURA.`, 'good');
        Sfx.tone(523, 0.1, 'square', 0.06); Sfx.tone(784, 0.2, 'square', 0.06, 0.1);
        continue;
      }
      if (Veh.job === 'policia' && b.state === 'approach') b.state = 'lurk';
      if (patrolZone === b.z && d < 90 && car.speed < 30 && this.inRisk(car.x, car.y)) {
        const step = Math.min(d, 32 * dt);
        if (d > 1) { b.x += dx / d * step; b.y += dy / d * step; b.anim += dt * 12; }
        continue;
      }
      let sp = 12, gx = b.tx, gy = b.ty;
      if (b.state === 'lurk') {
        if (Math.hypot(b.tx - b.x, b.ty - b.y) < 2) { const t = R.pick(b.z.tiles); b.tx = t.x * 16 + 8; b.ty = t.y * 16 + 8; }
        if (d < 100 && car.speed < 70 && this.robCd <= 0 && mode === 'play' && !Veh.cur.school && Veh.job !== 'policia') {
          // quem tem muita aura assusta o bandido
          if (R.chance(Math.min(0.85, (S.aura || 0) / 120))) {
            b.state = 'flee'; b.t = 3;
            addFloater(b.x, b.y - 10, 'Xi, é o cara da aura...', '#c77dff');
          } else {
            b.state = 'approach'; b.t = 0;
            if (this.warnCd <= 0) { this.warnCd = 10; toast('Tem alguém vindo na direção do carro... acelera!', 'warn'); }
          }
        }
      } else if (b.state === 'approach') {
        sp = night ? 58 : 46; gx = car.x; gy = car.y;
        if (d > 170 || (fast && d > 30)) { b.state = 'lurk'; }
        else if (d < 11 && car.speed < 30) { this.rob(b); continue; }
      } else if (b.state === 'flee') {
        sp = 60; gx = b.x - dx; gy = b.y - dy;
        if (b.t <= 0) { this.bandits.splice(k, 1); continue; }
      }
      const ex = gx - b.x, ey = gy - b.y, ed = Math.hypot(ex, ey);
      if (ed > 0.5) { const st = Math.min(ed, sp * dt); b.x += ex / ed * st; b.y += ey / ed * st; b.anim += dt * sp * 0.4; }
    }
  },

  // assalto: leva dinheiro, o carro ou os dois
  rob(b) {
    b.state = 'flee'; b.t = 3;
    this.robCd = 25;
    let kind = R.pick(['dinheiro', 'dinheiro', 'carro', 'tudo']);
    if (kind === 'dinheiro' && S.money < 10) kind = 'carro'; // "tá liso? então vai o carro"
    Sfx.bad(); shake = 4;
    if (kind !== 'carro' && S.money >= 10) {
      const amt = clamp(Math.round(S.money * R.f(0.3, 0.6)), 10, ROB_MAX);
      Care.charge(amt, 'assalto');
      toast(`ASSALTO! Levaram ${fmtMoney(amt)} do caixa.`, 'bad');
      addFloater(player.x, player.y - 12, '-' + fmtMoney(amt), '#ff4d4d');
    }
    if (kind !== 'dinheiro') this.carStolen();
  },

  carStolen() {
    if (Veh.job === 'onibus') Onibus.cancel(true);
    else if (Veh.job === 'policia') Patrulha.cancel();
    else if (Veh.job === 'ambulancia') Ambulancia.cancel(true);
    else if (Veh.job === 'envios') Envios.cancel(true);
    else if (Veh.cur.shuttle) Escolar.cancel(true);
    else if (Veh.cur.parcels) Parcels.cancel(true);
    else if (Rides.ride) { toast(Rides.ride.order ? `Levaram o pedido de ${Rides.ride.name} junto!` : `${Rides.ride.name} saiu correndo do carro.`, 'bad'); Rides.cancel(true); }
    let best = null, bd = Infinity;
    for (const p of city.places) {
      if (p.kind !== 'oficina') continue;
      const d = Math.hypot(p.cx - player.x, p.cy - player.y);
      if (d < bd) { bd = d; best = p; }
    }
    Care.charge(INSURANCE_FEE, 'franquia');
    const c = S.car;
    c.health = Math.max(10, c.health - 25);
    c.fuel = Math.max(5, c.fuel * 0.5);
    toast(`LEVARAM ${Veh.fem() ? 'A' : 'O'} ${Veh.noun().toUpperCase()}! O seguro achou na ${best.name}, mas cobrou ${fmtMoney(INSURANCE_FEE)} de franquia.`, 'bad');
    placeCarAt(best);
    lastPlace = best;
    Multi.onTeleport();
    cam.x = player.x; cam.y = player.y;
  },

  // ---------- desenho ----------
  draw(g, camX, camY, vw, vh) {
    const vis = (x, y, r) => x + r > camX && y + r > camY && x - r < camX + vw && y - r < camY + vh;
    g.font = '12px VT323, monospace'; g.textAlign = 'center';
    for (const z of this.risks) {
      if (!vis(z.x, z.y, z.r)) continue;
      const sx = z.x - camX, sy = z.y - camY;
      g.fillStyle = 'rgba(60,0,0,0.16)';
      g.beginPath(); g.arc(sx, sy, z.r, 0, Math.PI * 2); g.fill();
      g.setLineDash([2, 5]); g.strokeStyle = 'rgba(255,60,60,0.55)'; g.lineWidth = 1; g.stroke(); g.setLineDash([]);
      g.fillStyle = '#000'; g.fillText('ÁREA DE RISCO', Math.round(sx) + 1, Math.round(sy - z.r + 14) + 1);
      g.fillStyle = '#ff6b6b'; g.fillText('ÁREA DE RISCO', Math.round(sx), Math.round(sy - z.r + 14));
    }
    for (const s of this.schools) {
      const bd = s.bd, cx = (bd.x0 + bd.x1 + 1) * 8, cy = bd.y0 * 16 - 2;
      if (!vis(cx, cy, 80)) continue;
      g.fillStyle = '#000'; g.fillText(s.name.toUpperCase(), Math.round(cx - camX) + 1, Math.round(cy - camY) + 1);
      g.fillStyle = '#ffe58a'; g.fillText(s.name.toUpperCase(), Math.round(cx - camX), Math.round(cy - camY));
      if (this.schoolOn) {
        const z = s.zone;
        g.fillStyle = Math.floor(time * 2) % 2 ? 'rgba(255,210,63,0.16)' : 'rgba(255,210,63,0.08)';
        g.fillRect(z.x0 - camX, z.y0 - camY, z.x1 - z.x0, z.y1 - z.y0);
      }
    }
    for (const kd of this.kids) {
      if (!vis(kd.x, kd.y, 8)) continue;
      if (kd.down > 0) { g.fillStyle = KID_SHIRT; g.fillRect(Math.round(kd.x - camX) - 2, Math.round(kd.y - camY) - 1, 5, 2); continue; }
      drawSchoolKid(g, kd.x - camX, kd.y - camY, kd.hair, kd.anim);
    }
    for (const p of this.pets) if (vis(p.x, p.y, 8)) this.drawPet(g, p, p.x - camX, p.y - camY);
    for (const b of this.bandits) {
      if (!vis(b.x, b.y, 8)) continue;
      const x = Math.round(b.x - camX), y = Math.round(b.y - camY);
      if (b.state === 'down') {
        g.fillStyle = '#1b1b1b'; g.fillRect(x - 3, y - 1, 6, 3);
        g.fillStyle = '#fff'; g.fillRect(x - 1, y - 6 + (Math.floor(time * 3) % 2), 1, 1);
        continue;
      }
      drawPedSprite(g, x, y, '#1b1b1b', '#111', b.anim, false);
      g.fillStyle = '#c0392b'; g.fillRect(x - 1, y, 3, 1); // bandana
      if (b.state === 'approach') { g.fillStyle = '#ff4d4d'; g.fillRect(x, y - 8, 1, 3); g.fillRect(x, y - 4, 1, 1); }
    }
  },

  drawLights(L, camX, camY) {
    // o colégio fica iluminado no fim da tarde
    for (const s of this.schools) {
      const bd = s.bd;
      L.hole((bd.x0 + bd.x1 + 1) * 8 - camX, (bd.y0 + bd.y1 + 1) * 8 - camY, 40, 0.5);
    }
  },

  drawMinimap(g, s) {
    for (const z of this.risks) {
      g.fillStyle = 'rgba(255,40,40,0.22)';
      g.beginPath(); g.arc(z.x * s, z.y * s, z.r * s, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ff4d4d'; g.lineWidth = 1; g.stroke();
    }
    for (const sc of this.schools) {
      const x = Math.round((sc.bd.x0 + sc.bd.x1 + 1) * 8 * s), y = Math.round((sc.bd.y0 + sc.bd.y1 + 1) * 8 * s);
      g.fillStyle = '#000'; g.fillRect(x - 4, y - 4, 8, 8);
      g.fillStyle = this.schoolOn && Math.floor(time * 2) % 2 ? '#ffd23f' : '#b25a34'; g.fillRect(x - 3, y - 3, 6, 6);
    }
  },
};
