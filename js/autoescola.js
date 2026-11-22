'use strict';
// Modo autoescola (só no solo): busque o instrutor e siga as setas pela cidade.
// Cada aula é um caminho de cruzamentos sorteado na hora. O instrutor fala (e escreve) o que fazer: vire à direita,
// siga reto, pare na placa de PARE. Perde pontos quem bate, passa do limite, sobe na calçada, anda na contramão
// ou fura o PARE. No fim, pare dentro do quadrado branco e ganhe de 0 a 3 estrelas.
// Seis aulas; a última é a prova do DETRAN, que dá a carteira de motorista. Depois vem o treino livre.
// O carro da autoescola é da escola: não gasta gasolina, não estraga e não mexe no dinheiro nem no save do solo.

const SCHOOL_KEY = 'bandeira3-autoescola';
const KMH = 0.55; // px/s → km/h do velocímetro

// nodes = cruzamentos da aula · stops = quantos têm placa de PARE · lane = conta a contramão · turns = chance de virar
const LESSONS = [
  { name: 'Primeira aula', tip: 'Vá devagar e siga as indicações no celular.', nodes: 3, limit: 40, stops: 0, lane: false, turns: 0.35 },
  { name: 'Virando a esquina', tip: 'Diminua a velocidade antes de virar.', nodes: 5, limit: 40, stops: 0, lane: false, turns: 0.75 },
  { name: 'Placa de PARE', tip: 'Na placa de PARE, o carro tem que parar de vez antes do cruzamento.', nodes: 5, limit: 40, stops: 2, lane: false, turns: 0.5 },
  { name: 'Mão direita', tip: 'Ande sempre na faixa da direita da rua.', nodes: 6, limit: 50, stops: 1, lane: true, turns: 0.6 },
  { name: 'Aula à noite', tip: 'De noite, vá mais devagar e preste atenção.', nodes: 6, limit: 40, stops: 2, lane: true, turns: 0.6, night: true },
  { name: 'Prova do DETRAN', tip: 'É a prova! Precisa de 70 pontos para passar.', nodes: 8, limit: 50, stops: 3, lane: true, turns: 0.6, exam: true },
];
const FREE_LESSON = { name: 'Treino livre', tip: 'Você já tem carteira! Treine à vontade.', nodes: 7, limit: 50, stops: 2, lane: true, turns: 0.6 };

const INSTRUCTORS = [
  { name: 'Seu Valdir', hair: '#d9d9d9' }, { name: 'Dona Marta', hair: '#3b2414' }, { name: 'Professor Jairo', hair: '#151515' },
  { name: 'Tia Rose', hair: '#8a4b20' }, { name: 'Seu Bené', hair: '#bdbdbd' }, { name: 'Professora Lia', hair: '#c8a24a' },
];
const INSTR_SHIRT = '#2f6fdb';
const GOOD_LINES = ['Muito bem!', 'Isso aí!', 'Mandou bem!', 'Perfeito!', 'Boa!', 'Show de bola!'];

// faltas: pontos perdidos, intervalo mínimo entre duas iguais (s) e o que o instrutor fala
const FAULTS = {
  bateu: { pts: 10, cd: 1.5, label: 'Batidas', line: () => R.pick(['Cuidado! Bateu!', 'Opa! Olha pra frente!', 'Calma, vai devagar que dá certo.']) },
  rapido: { pts: 5, cd: 4, label: 'Acima do limite', line: (L) => `Devagar! O limite aqui é ${L.limit}.` },
  calcada: { pts: 5, cd: 4, label: 'Fora da rua', line: () => 'Volta pra rua! A calçada é dos pedestres.' },
  contramao: { pts: 5, cd: 5, label: 'Contramão', line: () => 'Mão direita! Volte para a sua faixa.' },
  pare: { pts: 15, cd: 0, label: 'PARE furado', line: () => 'Passou direto no PARE! Tem que parar o carro.' },
  sinal: { pts: 15, cd: 0, label: 'Sinal vermelho', line: () => 'Avançou o sinal vermelho! No vermelho, pare antes da faixa e espere o verde.' },
  atropelou: { pts: 25, cd: 2, label: 'Atropelamentos', line: () => 'Nããão! Pedestre sempre tem a vez. Mais atenção!' },
  errou: { pts: 5, cd: 0, label: 'Caminho errado', line: () => 'Ops, caminho errado! Tudo bem, vou te guiar por outro.' },
};
const TURN_WORDS = { reto: 'siga reto', direita: 'vire à direita', esquerda: 'vire à esquerda', volta: 'faça o retorno' };
const TURN_ICONS = { reto: '↑', direita: '→', esquerda: '←', volta: '↓' };

const Autoescola = {
  state: 'idle', // idle → toPickup → boarding → lesson → result
  waitT: 0, prog: null, instr: null, pick: null, paxX: 0, paxY: 0, boardT: 0, idx: 0, L: LESSONS[0],
  route: null, score: 100, faults: {}, cd: {}, t: 0, overT: 0, offT: 0, laneT: 0, result: null, resT: 0, forced: null,

  get on() { return !!Veh.cur.school; },

  init(city) {
    this.city = city;
    // em qual rua (coluna i / linha j da grade) fica cada tile
    this.colOf = new Int16Array(city.W).fill(-1);
    this.rowOf = new Int16Array(city.H).fill(-1);
    city.xs.forEach((x, i) => { for (let a = 0; a < city.wx[i]; a++) this.colOf[x + a] = i; });
    city.ys.forEach((y, j) => { for (let a = 0; a < city.wy[j]; a++) this.rowOf[y + a] = j; });
    this.prog = { best: [], cnh: false };
    try {
      const p = JSON.parse(localStorage.getItem(SCHOOL_KEY));
      if (p && Array.isArray(p.best)) this.prog = { best: p.best, cnh: !!p.cnh };
    } catch (e) { /* sem progresso salvo */ }
  },
  saveProg() { try { localStorage.setItem(SCHOOL_KEY, JSON.stringify(this.prog)); } catch (e) { /* storage bloqueado */ } },

  // ---------- progresso ----------
  nextIdx() { for (let k = 0; k < LESSONS.length; k++) if (!(this.prog.best[k] >= 1)) return k; return LESSONS.length; },
  lessonAt(k) { return LESSONS[k] || FREE_LESSON; },
  unlocked(k) { return k === 0 || this.prog.best[k - 1] >= 1 || (k >= LESSONS.length && this.prog.cnh); },
  passed() { return LESSONS.filter((_, k) => this.prog.best[k] >= 1).length; },
  totalStars() { return LESSONS.reduce((a, _, k) => a + (this.prog.best[k] || 0), 0); },
  lessonNum() { return this.idx < LESSONS.length ? `AULA ${this.idx + 1}` : 'TREINO'; },

  // começo da partida no modo autoescola
  start() {
    this.state = 'idle'; this.waitT = 1.5; this.route = null;
    toast('Bem-vindo à autoescola! O instrutor já vai te chamar.', 'good');
  },

  // ---------- instrutor ----------
  say(text, interrupt, kind) {
    toast(`${this.instr ? this.instr.name : 'Instrutor'}: ${text}`, kind || '');
    const sp = window.speechSynthesis;
    if (!sp || Sfx.muted || typeof SpeechSynthesisUtterance === 'undefined') return;
    if (interrupt) sp.cancel();
    if (!this.voice) this.voice = sp.getVoices().find((v) => /^pt/i.test(v.lang)) || null;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR'; u.rate = 1.05; u.pitch = 1.05; u.volume = 1;
    if (this.voice) u.voice = this.voice;
    sp.speak(u);
  },

  newPickup(car) {
    const c = this.city;
    let pick = null;
    for (let t = 0; t < 120 && !pick; t++) {
      const s = R.pick(c.curbs), d = Math.hypot(s.x - car.x, s.y - car.y) / 16;
      if (d > 6 && d < 22) pick = s;
    }
    this.pick = pick || R.pick(c.curbs);
    const others = INSTRUCTORS.filter((i) => i !== this.instr);
    this.instr = R.pick(others);
    this.idx = this.forced != null ? this.forced : this.nextIdx();
    this.forced = null;
    this.L = this.lessonAt(this.idx);
    this.paxX = this.pick.x; this.paxY = this.pick.y;
    this.state = 'toPickup';
    Sfx.ding();
    this.say(`Oi! Eu sou ${this.instr.name}. Venha me buscar: siga a seta verde e pare do meu lado.`, true);
  },

  // ---------- aula ----------
  beginLesson(car) {
    const L = this.L, day = Math.floor(gameMin / 1440) * 1440, h = (gameMin - day) / 60;
    if (L.night && !Light.isNight(gameMin)) gameMin = day + 21 * 60;
    else if (!L.night && Light.isNight(gameMin)) gameMin = day + (h >= 12 ? 1440 : 0) + 8 * 60; // aula de dia é de dia
    this.score = 100; this.faults = {}; this.cd = {}; this.t = 0; this.overT = this.offT = this.laneT = 0;
    this.route = this.buildRoute(car, L.nodes, L.stops);
    this.state = 'lesson';
    this.say(`${L.name}! ${L.tip} O limite é ${L.limit} quilômetros por hora.`, true);
    this.say(this.instrText(this.route.nodes[0]));
  },

  center(nd) { return { x: this.city.xs[nd.i] * 16 + this.city.wx[nd.i] * 8, y: this.city.ys[nd.j] * 16 + this.city.wy[nd.j] * 8 }; },
  inNode(car, nd) {
    const tx = Math.floor(car.x / 16), ty = Math.floor(car.y / 16), x = this.city.xs[nd.i], y = this.city.ys[nd.j];
    return tx >= x && tx < x + this.city.wx[nd.i] && ty >= y && ty < y + this.city.wy[nd.j];
  },
  turnOf(nd) {
    if (nd.dout === nd.din) return 'reto';
    if (nd.dout === (nd.din + 1) % 4) return 'direita';
    if (nd.dout === (nd.din + 3) % 4) return 'esquerda';
    return 'volta';
  },
  instrText(nd) {
    if (!nd) return 'Agora pare o carro dentro do quadrado branco.';
    const tr = this.turnOf(nd), act = tr === 'reto' ? 'siga reto' : TURN_WORDS[tr];
    if (nd.stop) return `No próximo cruzamento tem placa de PARE. Pare o carro e depois ${act}.`;
    if (Signals.at(nd.i, nd.j)) return `No próximo cruzamento tem semáforo: no vermelho, espere o verde. Depois, ${act}.`;
    return `No próximo cruzamento, ${act}.`;
  },

  // caminho de "n" cruzamentos a partir do primeiro que está na frente do carro
  buildRoute(car, n, stops) {
    const c = this.city, fx = Math.cos(car.a), fy = Math.sin(car.a);
    let start = null, best = Infinity, near = null, nd = Infinity;
    for (let i = 0; i < c.NX; i++) for (let j = 0; j < c.NY; j++) {
      const cc = this.center({ i, j }), dx = cc.x - car.x, dy = cc.y - car.y, d = Math.hypot(dx, dy);
      if (d < nd) { nd = d; near = { i, j, dx, dy }; }
      const ah = dx * fx + dy * fy, lat = Math.abs(-dx * fy + dy * fx);
      if (ah < 24) continue;
      const s = ah + lat * 3;
      if (s < best) { best = s; start = { i, j, dx, dy }; }
    }
    start = start || near;
    let din = Math.abs(start.dx) > Math.abs(start.dy) ? (start.dx > 0 ? 0 : 2) : (start.dy > 0 ? 1 : 3);
    let i = start.i, j = start.j;
    const nodes = [], seen = new Set(), L = this.L;
    let turned = false;
    for (let k = 0; k < n; k++) {
      seen.add(i * 100 + j);
      let ex = c.exits(i, j).filter((d) => d !== (din + 2) % 4);
      if (!ex.length) ex = c.exits(i, j);
      const fresh = ex.filter((d) => !seen.has((i + DIRS[d].dx) * 100 + j + DIRS[d].dy));
      if (fresh.length) ex = fresh;
      let dout;
      const mustTurn = k === n - 1 && !turned && n >= 3; // toda aula tem pelo menos uma curva
      if (ex.includes(din) && (k === 0 || (!mustTurn && !R.chance(L.turns)))) dout = din;
      else { const tr = ex.filter((d) => d !== din); dout = R.pick(tr.length ? tr : ex); }
      if (dout !== din) turned = true;
      nodes.push({ i, j, din, dout, stop: false, stopped: false, warned: false });
      i += DIRS[dout].dx; j += DIRS[dout].dy; din = dout;
    }
    // placas de PARE (nunca no primeiro cruzamento: dá tempo de entender)
    const cand = nodes.slice(1).filter((nd) => !Signals.at(nd.i, nd.j));
    for (let k = 0; k < stops && cand.length; k++) cand.splice(Math.floor(Math.random() * cand.length), 1)[0].stop = true;
    const last = nodes[nodes.length - 1], ep = c.exitPoint(last.i, last.j, last.dout);
    const park = { x: ep.x + DIRS[last.dout].dx * 44, y: ep.y + DIRS[last.dout].dy * 44, d: last.dout };
    const p0 = this.center(nodes[0]);
    return { nodes, k: 0, park, left: null, minD: Math.hypot(p0.x - car.x, p0.y - car.y) };
  },

  // errou o caminho: novo caminho com o que faltava, a partir de onde o carro está
  reroute(car) {
    const rt = this.route, rest = rt.nodes.slice(rt.k);
    const stops = rest.filter((nd) => nd.stop).length;
    this.route = this.buildRoute(car, Math.max(1, rest.length), stops);
    this.say(this.instrText(this.route.nodes[0]));
  },

  // contramão: na rua (fora do cruzamento) e andando na faixa da esquerda
  wrongLane(car) {
    const c = this.city, tx = Math.floor(car.x / 16), ty = Math.floor(car.y / 16);
    if (c.get(tx, ty) !== T.ROAD) return false;
    const i = this.colOf[tx], j = this.rowOf[ty];
    if ((i >= 0) === (j >= 0)) return false; // cruzamento (ou fora da grade)
    const fx = Math.cos(car.a), fy = Math.sin(car.a);
    // a faixa certa para quem anda nessa direção (rua de mão única: só o sentido dela)
    const ok = (d, rel) => c.laneOffsets(i < 0 ? 0 : i, j < 0 ? 0 : j, d).some((o) => Math.floor(o / 16) === rel);
    if (j >= 0) { const rel = ty - c.ys[j]; if (fx > 0.7) return !ok(0, rel); if (fx < -0.7) return !ok(2, rel); }
    else { const rel = tx - c.xs[i]; if (fy > 0.7) return !ok(1, rel); if (fy < -0.7) return !ok(3, rel); }
    return false;
  },

  fault(kind) {
    if (this.state !== 'lesson' || (this.cd[kind] || 0) > 0) return;
    const f = FAULTS[kind];
    this.cd[kind] = f.cd;
    this.score = Math.max(0, this.score - f.pts);
    this.faults[kind] = (this.faults[kind] || 0) + 1;
    addFloater(player.x, player.y - 12, `-${f.pts}`, '#ff6b6b');
    Sfx.bad();
    this.say(f.line(this.L), true, 'bad');
  },

  stepLesson(dt, car) {
    const L = this.L, rt = this.route, c = this.city;
    this.t += dt;
    for (const k in this.cd) this.cd[k] -= dt;

    // regras de trânsito
    if (car.speed * KMH > L.limit + 4) { this.overT += dt; if (this.overT > 1) this.fault('rapido'); } else this.overT = 0;
    if (c.tileAtPx(car.x, car.y) !== T.ROAD && car.speed > 15) { this.offT += dt; if (this.offT > 0.7) this.fault('calcada'); } else this.offT = 0;
    if (L.lane && car.speed > 25 && this.wrongLane(car)) { this.laneT += dt; if (this.laneT > 1.2) this.fault('contramao'); } else this.laneT = 0;

    // saiu do cruzamento: foi para o lado certo?
    if (rt.left) {
      const p = this.center(rt.left), dx = car.x - p.x, dy = car.y - p.y;
      if (Math.hypot(dx, dy) > 36) {
        const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3), was = rt.left;
        rt.left = null;
        if (d !== was.dout) { this.fault('errou'); this.reroute(car); return; }
      }
    }

    const nd = rt.nodes[rt.k];
    if (nd) {
      const p = this.center(nd), d = Math.hypot(car.x - p.x, car.y - p.y);
      rt.minD = Math.min(rt.minD, d);
      if (nd.stop && !nd.stopped && d < 64 && car.speed < 12) { nd.stopped = true; this.say('Isso! Parou certinho. Agora pode ir.', true, 'good'); }
      const sig = Signals.at(nd.i, nd.j), lt = sig ? Signals.light(sig, nd.din) : 'g';
      if (!nd.warned && d < 84) {
        nd.warned = true;
        const tr = this.turnOf(nd);
        if (nd.stop && !nd.stopped) this.say('Placa de PARE! Pare o carro antes da faixa branca.', true, 'warn');
        else if (lt !== 'g') { nd.waitRed = true; this.say(`Sinal ${lt === 'r' ? 'vermelho' : 'amarelo'}! Pare antes da faixa branca e espere o verde.`, true, 'warn'); }
        else if (tr !== 'reto') this.say(`Agora, ${TURN_WORDS[tr]}!`, true);
      }
      if (sig && nd.warned && lt === 'r' && d < 84) nd.waitRed = true;
      if (nd.waitRed && lt === 'g' && d < 90) {
        nd.waitRed = false;
        const tr = this.turnOf(nd);
        this.say(tr === 'reto' ? 'Abriu o verde! Pode seguir reto.' : `Abriu o verde! Pode ir e ${TURN_WORDS[tr]}.`, true, 'good');
      }
      if (this.inNode(car, nd)) {
        const redRun = sig && lt === 'r' && Signals.redFor(sig, nd.din) > RED_GRACE; // a falta vem do Signals
        if (nd.stop && !nd.stopped) this.fault('pare');
        const ran = (nd.stop && !nd.stopped) || redRun;
        rt.k++; rt.left = nd;
        const nx = rt.nodes[rt.k], q = nx ? this.center(nx) : rt.park;
        rt.minD = Math.hypot(q.x - car.x, q.y - car.y);
        this.say(ran ? this.instrText(nx) : `${R.pick(GOOD_LINES)} ${this.instrText(nx)}`, !ran);
      } else if (d > rt.minD + 240) { // foi para outro lado e se perdeu
        this.fault('errou'); this.reroute(car);
      }
    } else {
      const pk = rt.park, d = Math.hypot(car.x - pk.x, car.y - pk.y);
      if (d < 17 && car.speed < 8) this.finish(car);
    }
  },

  finish(car) {
    const L = this.L, sc = Math.round(this.score);
    let stars = sc >= 90 ? 3 : sc >= 75 ? 2 : sc >= 50 ? 1 : 0;
    if (L.exam && sc < 70) stars = 0;
    let cnh = false;
    if (this.idx < LESSONS.length) {
      this.prog.best[this.idx] = Math.max(this.prog.best[this.idx] || 0, stars);
      if (L.exam && stars > 0 && !this.prog.cnh) { this.prog.cnh = true; cnh = true; }
      this.saveProg();
    }
    // o instrutor desce e vai até a calçada mais perto
    let out = null, od = Infinity;
    for (const s of this.city.curbs) { const d = Math.hypot(s.x - car.x, s.y - car.y); if (d < od) { od = d; out = s; } }
    this.result = { stars, score: sc, faults: Object.assign({}, this.faults), carX: car.x, carY: car.y,
      outX: out ? out.x : car.x, outY: out ? out.y : car.y, cnh, exam: !!L.exam, time: this.t };
    this.state = 'result'; this.resT = 0; this.route = null;
    Sfx.door();
    if (stars > 0) { Sfx.cash(); addFloater(car.x, car.y - 14, '★'.repeat(stars), '#ffd23f'); }
    const lines = L.exam
      ? (stars ? 'Parabéns! Você passou na prova do DETRAN! Agora tem carteira de motorista!' : 'Não foi dessa vez. A prova precisa de 70 pontos. Vamos tentar de novo?')
      : ['Ainda não foi dessa vez. Vamos tentar de novo?', 'Passou! Mas vamos treinar mais um pouquinho.',
        'Muito bom! Quase perfeito.', 'Excelente! Nota máxima!'][stars];
    this.say(`${sc} pontos. ${lines}`, true, stars ? 'good' : 'warn');
    if (cnh) setTimeout(() => this.showCnh(), 2200);
  },

  showCnh() {
    if (mode !== 'play') return;
    showModal('CARTEIRA DE MOTORISTA', `<div class="cnh"><div class="cnh-h">REPÚBLICA FEDERATIVA DO BRASIL · CNH</div>` +
      `<div class="cnh-b">CATEGORIA <b>B</b><br>PROVA DO DETRAN ✓<br>${this.totalStars()} ESTRELAS NAS AULAS</div></div>` +
      'Parabéns! Agora você pode trabalhar pela cidade: escolha Rebu, 66 ou Táxi na tela inicial. Ou continue no treino livre.',
    [{ label: 'Continuar treinando', run: closeModal }], 'Fechar', true);
  },

  // ---------- teclas e botões do celular ----------
  accept() { // E
    if (this.state === 'result') { this.state = 'idle'; this.waitT = 0.6; }
  },
  cancel() { // C
    if (this.state === 'toPickup' || this.state === 'boarding') { this.newPickup(player); return; }
    if (this.state === 'lesson') {
      this.say('Tudo bem, a gente para por aqui. Até a próxima!', true);
      this.state = 'idle'; this.waitT = 3; this.route = null;
    }
  },
  // escolheu uma aula no menu
  choose(k) {
    this.forced = k;
    if (this.state === 'toPickup' || this.state === 'boarding') {
      this.idx = k; this.L = this.lessonAt(k); this.forced = null;
      toast(`Próxima aula: ${this.L.name}.`, 'good');
      return;
    }
    this.route = null;
    this.state = 'idle'; this.waitT = 0.5;
  },

  // ---------- eventos do jogo ----------
  update(dt, car) {
    switch (this.state) {
      case 'idle': if ((this.waitT -= dt) <= 0) this.newPickup(car); break;
      case 'toPickup':
        if (Math.hypot(car.x - this.pick.x, car.y - this.pick.y) < 30 && car.speed < 30) { this.state = 'boarding'; this.boardT = 0; }
        break;
      case 'boarding': {
        if (car.speed > 40) {
          this.state = 'toPickup'; this.paxX = this.pick.x; this.paxY = this.pick.y;
          toast('Calma! O instrutor ainda não entrou.', 'warn');
          break;
        }
        this.boardT += dt;
        const k = Math.min(1, this.boardT / 0.9);
        this.paxX = lerp(this.pick.x, car.x, k); this.paxY = lerp(this.pick.y, car.y, k);
        if (this.boardT >= 0.9) { Sfx.door(); this.beginLesson(car); }
        break;
      }
      case 'lesson': this.stepLesson(dt, car); break;
      case 'result': {
        const r = this.result;
        this.resT += dt;
        const k = Math.min(1, this.resT / 0.9);
        this.paxX = lerp(r.carX, r.outX, k); this.paxY = lerp(r.carY, r.outY, k);
        if (this.resT > 25) { this.state = 'idle'; this.waitT = 0.5; } // ninguém apertou E: segue para a próxima
        break;
      }
    }
  },
  onImpact(imp) { if (imp > 35) this.fault('bateu'); },
  onPedHit() {
    if (this.state === 'lesson') this.fault('atropelou');
    else { toast('Cuidado com os pedestres!', 'warn'); Sfx.bad(); }
  },

  target() {
    const st = this.state;
    if (st === 'toPickup' || st === 'boarding') return { x: this.pick.x, y: this.pick.y, kind: 'pick' };
    if (st === 'lesson') {
      const rt = this.route, nd = rt.nodes[rt.k];
      return nd ? Object.assign(this.center(nd), { kind: 'drop' }) : { x: rt.park.x, y: rt.park.y, kind: 'drop' };
    }
    return null;
  },

  // ---------- celular ----------
  starsHTML(n) { return `<span class="es-st">${'★'.repeat(n)}<span>${'☆'.repeat(3 - n)}</span></span>`; },
  progHTML() {
    const rows = LESSONS.map((L, k) => {
      const b = this.prog.best[k];
      return `<div class="es-p ${this.unlocked(k) ? '' : 'lock'}">${k + 1}. ${esc(L.name)} ${b != null ? this.starsHTML(b) : ''}</div>`;
    }).join('');
    return `<div class="es-prog">${rows}</div>` + (this.prog.cnh ? '<div class="ph-row ok">CARTEIRA DE MOTORISTA ✓</div>' : '');
  },

  phoneHTML() {
    const st = this.state, L = this.L;
    if (st === 'idle') return `<div class="ph-title">SUAS AULAS</div><div class="ph-muted">Chamando o instrutor…</div>${this.progHTML()}`;
    if (st === 'toPickup' || st === 'boarding') {
      return `<div class="ph-title">BUSCAR O INSTRUTOR</div>
        <div class="ph-row">${esc(this.instr.name)}</div>
        <div class="ph-row">${this.lessonNum()}: <b>${esc(L.name)}</b></div>
        <div class="ph-muted">${st === 'boarding' ? 'Entrando no carro… segura o freio!' : 'Siga a seta verde e pare do lado do instrutor.'}</div>
        <div class="ph-btns"><button data-act="cancel" class="ghost"><kbd>C</kbd> OUTRO INSTRUTOR</button></div>`;
    }
    if (st === 'lesson') {
      const rt = this.route, nd = rt.nodes[rt.k], over = player.speed * KMH > L.limit + 4;
      let icon = 'P', text = 'Pare dentro do quadrado branco', cls = 'park';
      if (nd) {
        const tr = this.turnOf(nd);
        icon = TURN_ICONS[tr]; cls = ''; text = TURN_WORDS[tr].replace(/^./, (s) => s.toUpperCase());
        if (nd.stop && !nd.stopped) { icon = 'PARE'; cls = 'stop'; text = `Pare o carro, depois ${TURN_WORDS[tr]}`; }
        const sig = Signals.at(nd.i, nd.j);
        if (sig) {
          const lt = Signals.light(sig, nd.din);
          text += `<div class="es-sig"><i class="${lt}"></i>${lt === 'g' ? 'Sinal verde' : lt === 'y' ? 'Sinal amarelo' : 'Sinal vermelho: espere'}</div>`;
        }
      }
      return `<div class="ph-title">${this.lessonNum()} · ${esc(L.name.toUpperCase())}</div>
        <div class="es-next"><div class="es-arrow ${cls}">${icon}</div><div class="es-txt">${text}</div></div>
        <div class="es-info"><div class="es-limit ${over ? 'over' : ''}">${L.limit}</div>
          <div>Pontos: <b>${Math.round(this.score)}</b><br>Cruzamentos: ${Math.min(rt.k, rt.nodes.length)}/${rt.nodes.length}</div></div>
        <div class="ph-btns"><button data-act="cancel" class="ghost"><kbd>C</kbd> PARAR A AULA</button></div>`;
    }
    if (st === 'result') {
      const r = this.result, fl = Object.keys(r.faults).map((k) => `${FAULTS[k].label}: ${r.faults[k]}`).join('<br>');
      const head = r.exam ? (r.stars ? 'PASSOU NA PROVA!' : 'NÃO PASSOU') : r.stars ? 'AULA CONCLUÍDA' : 'VAMOS TENTAR DE NOVO';
      return `<div class="ph-title">${head}</div>
        <div class="ph-stars">${'★'.repeat(r.stars)}<span>${'☆'.repeat(3 - r.stars)}</span></div>
        <div class="ph-big">${r.score} pts</div>
        <div class="ph-muted">${fl || 'Nenhuma falta. Perfeito!'}</div>
        ${r.cnh ? '<div class="ph-row ok">GANHOU A CARTEIRA!</div>' : ''}
        <div class="ph-btns"><button data-act="accept"><kbd>E</kbd> ${r.stars ? 'PRÓXIMA AULA' : 'TENTAR DE NOVO'}</button></div>`;
    }
    return '';
  },

  // ---------- desenho ----------
  drawWorld(g, camX, camY) {
    if (!this.on) return;
    const st = this.state, bob = Math.round(Math.sin(time * 5) * 1.5), pulse = 10 + Math.round(Math.sin(time * 6) * 1.5);
    if (st === 'toPickup' || st === 'boarding') {
      const sx = this.pick.x - camX, sy = this.pick.y - camY;
      pxRing(g, sx, sy, pulse, '#39ff88');
      drawPedSprite(g, this.paxX - camX, this.paxY - camY, INSTR_SHIRT, this.instr.hair, time * 4, st === 'toPickup');
      if (st === 'toPickup') pxDownArrow(g, sx, sy - 15 + bob, '#39ff88');
    } else if (st === 'lesson') {
      const rt = this.route;
      for (let k = Math.min(rt.nodes.length, rt.k + 2) - 1; k >= rt.k; k--) this.drawStop(g, rt.nodes[k], camX, camY);
      if (rt.k >= rt.nodes.length - 1) this.drawPark(g, rt.park, camX, camY, rt.k >= rt.nodes.length);
    } else if (st === 'result' && this.resT < 3) {
      drawPedSprite(g, this.paxX - camX, this.paxY - camY, INSTR_SHIRT, this.instr.hair, time * 4, this.resT > 0.9);
    }
  },

  drawStop(g, nd, camX, camY) {
    if (!nd.stop) return;
    const a = DIRS[nd.din];
    const e = this.city.entryPoint(nd.i, nd.j, nd.din), rx = -a.dy, ry = a.dx;
    const lx = Math.round(e.x - a.dx * 2 - camX), ly = Math.round(e.y - a.dy * 2 - camY);
    g.fillStyle = nd.stopped ? 'rgba(255,255,255,0.5)' : '#fff';
    if (a.dx) g.fillRect(lx - 1, ly - 7, 2, 14); else g.fillRect(lx - 7, ly - 1, 14, 2);
    const sx = Math.round(e.x - a.dx * 8 + rx * 15 - camX), sy = Math.round(e.y - a.dy * 8 + ry * 15 - camY);
    g.fillStyle = '#555'; g.fillRect(sx, sy, 1, 6);
    pxCircle(g, sx, sy - 2, 5, '#fff');
    pxCircle(g, sx, sy - 2, 4, '#d4161c');
    g.fillStyle = '#fff'; g.fillRect(sx - 2, sy - 2, 5, 1);
  },

  // vaga do fim da aula
  drawPark(g, pk, camX, camY, cur) {
    const x = Math.round(pk.x - camX), y = Math.round(pk.y - camY), horiz = pk.d % 2 === 0, w = horiz ? 24 : 14, h = horiz ? 14 : 24;
    g.save();
    g.globalAlpha = cur ? 1 : 0.45;
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x - w / 2, y - h / 2, w, h);
    g.setLineDash([3, 2]); g.lineDashOffset = -time * 6;
    g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
    g.setLineDash([]);
    if (!cur || Math.floor(time * 3) % 2 === 0) {
      g.font = '12px VT323, monospace'; g.textAlign = 'center';
      g.fillStyle = '#000'; g.fillText('P', x + 1, y + 5);
      g.fillStyle = '#ffd23f'; g.fillText('P', x, y + 4);
    }
    g.restore();
  },

  // de noite, o trajeto e o instrutor ficam iluminados
  drawLights(L, camX, camY) {
    if (!this.on) return;
    if (this.state === 'toPickup' || this.state === 'boarding') L.hole(this.pick.x - camX, this.pick.y - camY, 24, 0.6);
    if (this.state !== 'lesson') return;
    const rt = this.route, nd = rt.nodes[rt.k];
    if (nd) { const p = this.center(nd); L.hole(p.x - camX, p.y - camY, 30, 0.7); }
    else L.hole(rt.park.x - camX, rt.park.y - camY, 22, 0.7);
  },

  drawMinimap(g, s) {
    if (!this.on || this.state !== 'lesson') return;
    const rt = this.route;
    g.fillStyle = '#ffd23f';
    for (let k = rt.k; k < rt.nodes.length; k++) {
      const p = this.center(rt.nodes[k]);
      g.fillRect(Math.round(p.x * s) - 1, Math.round(p.y * s) - 1, 2, 2);
    }
  },

  // menu "Escolher a aula" (pausa)
  lessonMenu() {
    const items = LESSONS.map((L, k) => ({
      label: `${k + 1}. ${L.name} ${this.prog.best[k] != null ? '★'.repeat(this.prog.best[k]) + '☆'.repeat(3 - this.prog.best[k]) : ''}${this.unlocked(k) ? '' : ' (passe na anterior)'}`,
      disabled: !this.unlocked(k), run: () => { this.choose(k); closeModal(); },
    }));
    if (this.prog.cnh) items.push({ label: 'Treino livre', run: () => { this.choose(LESSONS.length); closeModal(); } });
    items.push({ label: 'Apagar o progresso da autoescola', run: () => {
      this.prog = { best: [], cnh: false }; this.saveProg(); this.choose(0); closeModal(); toast('Progresso da autoescola apagado.');
    } });
    showModal('AUTOESCOLA · AULAS', 'Escolha a aula. A próxima abre quando você ganha pelo menos 1 estrela na anterior.', items, 'Voltar', true);
  },
};
