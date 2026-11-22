'use strict';
// Semáforos (sinais de trânsito) em parte dos cruzamentos.
// Sorteados pela seed, sem mudar os tiles (o hash da sala continua o mesmo). O ciclo segue o relógio do computador,
// então numa sala todo mundo vê os sinais quase iguais. Ciclo: verde na rua horizontal, amarelo, vermelho para
// todos, verde na vertical, amarelo, vermelho para todos.
// O trânsito para no vermelho (e no amarelo, se ainda dá tempo). Quem avança o vermelho leva multa de radar
// (na autoescola, perde pontos; na direção fácil do solo, só um aviso).

const SIG_GREEN = 7, SIG_YELLOW = 2.2, SIG_ALLRED = 1.2;
const SIG_HALF = SIG_GREEN + SIG_YELLOW + SIG_ALLRED, SIG_CYCLE = SIG_HALF * 2;
const SIG_SHARE = 0.5;       // fração dos cruzamentos (com 3 ou 4 saídas) que ganham semáforo
const RED_FINE = RADAR_FINE; // multa de quem avança o vermelho (no multiplayer vai como "radar", que a sala já conhece)
const RED_GRACE = 0.4;       // segundos de tolerância depois que fecha

const Signals = {
  list: [], map: new Map(), lastKey: -1, prevX: null, prevY: null, cd: 0,

  init(city) {
    this.city = city;
    this.colOf = new Int16Array(city.W).fill(-1);
    this.rowOf = new Int16Array(city.H).fill(-1);
    city.xs.forEach((x, i) => { for (let a = 0; a < city.wx[i]; a++) this.colOf[x + a] = i; });
    city.ys.forEach((y, j) => { for (let a = 0; a < city.wy[j]; a++) this.rowOf[y + a] = j; });
    const r = mulberry32((city.seed ^ 0x5e3a) >>> 0);
    for (let i = 0; i < city.NX; i++) for (let j = 0; j < city.NY; j++) {
      const ex = city.entries(i, j);
      const pick = r() < SIG_SHARE, off = r() * SIG_CYCLE; // sorteia sempre os dois (a sequência não depende do resultado)
      if (city.links(i, j) < 3 || !pick) continue;
      const s = { i, j, off, entries: ex };
      this.list.push(s);
      this.map.set(i * 100 + j, s);
    }
  },

  at(i, j) { return this.map.get(i * 100 + j) || null; },

  // posição no ciclo para quem chega andando na direção "dir" (0 leste, 1 sul, 2 oeste, 3 norte)
  phase(s, dir) {
    const t = ((Date.now() / 1000 + s.off) % SIG_CYCLE + SIG_CYCLE) % SIG_CYCLE;
    return dir % 2 === 0 ? t : (t + SIG_HALF) % SIG_CYCLE;
  },
  // 'g' verde, 'y' amarelo, 'r' vermelho
  light(s, dir) {
    const u = this.phase(s, dir);
    return u < SIG_GREEN ? 'g' : u < SIG_GREEN + SIG_YELLOW ? 'y' : 'r';
  },
  // há quantos segundos está vermelho (0 se não está)
  redFor(s, dir) { return Math.max(0, this.phase(s, dir) - SIG_GREEN - SIG_YELLOW); },

  // trânsito: o carro chegando ao cruzamento (i,j) na direção d, a "dist" px da faixa, deve parar?
  npcStop(i, j, d, dist) {
    const s = this.at(i, j);
    if (!s) return false;
    const l = this.light(s, d);
    return l === 'r' || (l === 'y' && dist >= STOP_LINE_OUTER + NPC_HALF_LENGTH);
  },

  // jogador: entrou num cruzamento com semáforo no vermelho?
  update(dt, car) {
    this.cd -= dt;
    const tx = Math.floor(car.x / 16), ty = Math.floor(car.y / 16);
    const i = this.colOf[tx] ?? -1, j = this.rowOf[ty] ?? -1;
    const key = i >= 0 && j >= 0 ? i * 100 + j : -1;
    const prevX = this.prevX, prevY = this.prevY;
    this.prevX = car.x;
    this.prevY = car.y;
    if (key === this.lastKey) return;
    const from = this.lastKey;
    this.lastKey = key;
    if (key < 0 || from >= 0 || car.speed < 25) return; // só conta quem vem da rua e entra andando
    const s = this.map.get(key);
    if (!s || prevX === null) return;
    // A rua de origem continua valendo quando o motorista começa a virar.
    const d = s.entries.find(dir => {
      const x = this.city.xs[i] * 16, y = this.city.ys[j] * 16;
      switch (dir) {
        case 0: return prevX < x && this.rowOf[Math.floor(prevY / 16)] === j;
        case 2: return prevX >= x + this.city.wx[i] * 16 && this.rowOf[Math.floor(prevY / 16)] === j;
        case 1: return prevY < y && this.colOf[Math.floor(prevX / 16)] === i;
        default: return prevY >= y + this.city.wy[j] * 16 && this.colOf[Math.floor(prevX / 16)] === i;
      }
    });
    if (d === undefined) return;
    if (this.light(s, d) === 'r' && this.redFor(s, d) > RED_GRACE) this.ranRed();
  },

  ranRed() {
    if (this.cd > 0 || (Veh.job === 'policia' && Patrulha.sirenOn)) return;
    this.cd = 3;
    if (Veh.cur.school) { Autoescola.fault('sinal'); return; }
    if (Easy.solo) { toast('Sinal vermelho! No vermelho a gente para e espera o verde. (Direção fácil: sem multa)', 'warn'); Sfx.bad(); return; }
    Care.charge(RED_FINE, 'radar');
    toast(`Avançou o sinal vermelho! Multa de ${fmtMoney(RED_FINE)}.`, 'bad');
    Sfx.bad();
  },

  // ---------- desenho ----------
  // O foco fica logo depois da linha, centralizado sobre as faixas que ele controla.
  heads(s) {
    return s.entries.map(d => {
      const a = DIRS[d], lanes = this.city.laneCount(s.i, s.j, d);
      const outer = this.city.entryPoint(s.i, s.j, d);
      const inner = this.city.entryPoint(s.i, s.j, d, lanes - 1);
      const hx = (outer.x + inner.x) / 2 - a.dx * SIGNAL_SETBACK, hy = (outer.y + inner.y) / 2 - a.dy * SIGNAL_SETBACK;
      return { d, a, lanes, hx, hy };
    });
  },

  draw(g, camX, camY, vw, vh) {
    const colors = { r: '#ff5454', y: '#ffd147', g: '#53ef89' };
    for (const s of this.list) {
      const cx = this.city.xs[s.i] * 16 + this.city.wx[s.i] * 8 - camX, cy = this.city.ys[s.j] * 16 + this.city.wy[s.j] * 8 - camY;
      const margin = Math.max(this.city.wx[s.i], this.city.wy[s.j]) * TILE / 2 + STOP_LINE_OUTER;
      if (cx < -margin || cy < -margin || cx > vw + margin || cy > vh + margin) continue;
      for (const h of this.heads(s)) {
        const light = this.light(s, h.d), halfWidth = h.lanes * 8;
        // Coordenadas locais: x aponta para o cruzamento, y para a direita do motorista.
        g.save();
        g.transform(h.a.dx, h.a.dy, -h.a.dy, h.a.dx, Math.round(h.hx - camX), Math.round(h.hy - camY));
        g.fillStyle = '#f5f3e9';
        g.fillRect(SIGNAL_SETBACK - STOP_LINE_OUTER, -halfWidth + 1, 2, halfWidth * 2 - 2);
        if (typeof drawing3D !== 'undefined' && drawing3D && !overhead) {
          world3D.props.signal(h, light);
          g.restore();
          continue;
        }
        g.fillStyle = '#181d24'; g.fillRect(-4, -8, 8, 16);
        for (const [index, phase] of ['r', 'y', 'g'].entries()) {
          g.fillStyle = light === phase ? colors[phase] : '#404752';
          g.fillRect(-2, -7 + index * 5, 4, 4);
        }
        g.restore();
      }
    }
  },

  // de noite a luz acesa aparece
  drawLights(L, camX, camY) {
    for (const s of this.list) {
      const cx = this.city.xs[s.i] * 16 + this.city.wx[s.i] * 8 - camX, cy = this.city.ys[s.j] * 16 + this.city.wy[s.j] * 8 - camY;
      if (cx < -50 || cy < -50 || cx > L.cv.width + 50 || cy > L.cv.height + 50) continue;
      for (const h of this.heads(s)) L.hole(h.hx - camX, h.hy - camY, 7, 0.9);
    }
  },
};
