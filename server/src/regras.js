// Regras da sala: fases do turno, chamadas, dinâmica, embarque, entrega, caixa e ranking.
//
// Lógica pura: não sabe de rede, de WebSocket nem de relógio. Quem chama passa "agora" (segundos)
// e "rnd" (sorteio de 0 a 1), e recebe de volta uma lista de eventos para enviar:
//   { todos: msg }      para todos na sala
//   { para: id, msg }   só para um jogador
// O estado é um objeto simples (cabe no armazenamento do Durable Object) e é alterado no lugar.
//
// Fases: espera -> contagem (3 s) -> turno (12 min) -> prorrogação (até 30 s) -> fim -> (revanche) contagem ...
// Dinheiro só muda durante o turno e a prorrogação, e cada mudança vira uma linha no livro-caixa.
import {
  CIDADE, FIRST_NAMES, pickType, rideFare, rideAllowed, rideStars, ridePay, clamp,
  PROBLEMS, CREDIT_LIMIT, TOW_COST, RUN_OVER_FINE, SHOP_MAX, CANCEL_FEE, ABANDON_FEE,
  RADAR_FINE, POLICE_FINE, ROB_MAX, INSURANCE_FEE, VEHICLES,
} from './compartilhado.js';

export const REGRAS = {
  SALDO_INICIAL: 150,    // R$ de cada um no começo do turno (o mesmo do save novo do solo)
  TURNO: 720,            // s: 12 min reais, das 07:00 às 19:00 no relógio do jogo
  CONTAGEM: 3,           // s de 3-2-1 antes do turno
  PRORROGACAO: 30,       // s para quem está com passageiro a bordo às 19:00
  CHAMADA_VIDA: 40,      // s: vida média de uma chamada aberta (sorteada entre 75% e 125%)
  CHAMADAS_EXTRA: 2,     // chamadas abertas = jogadores conectados + isto
  DINAMICAS: 3,          // áreas de tarifa dinâmica ao mesmo tempo
  RAIO_EMBARQUE: 40,     // px do passageiro (o cliente pede a 30)
  RAIO_ENTREGA: 40,      // px do destino (o cliente entrega a 30)
  TOLERANCIA_POS: 80,    // px entre a posição informada e a última posição conhecida do carro
  VEL_MAX: 230,          // px/s, velocidade máxima do carro (CARP.maxSpeed)
  EMBARQUE_T: 0.9,       // s da animação de embarque, descontados do tempo de viagem
  DIST_CHAMADAS: 48,     // px mínimos entre passageiros esperando
  TICK: 0.25,            // s entre verificações de chamadas, dinâmicas e fase
  FORA_MAX: 300,         // s que a sala guarda quem caiu (fora do turno; no turno, guarda até o fim)
  // pega (corrida de rua entre os jogadores)
  PEGA_INSCRICAO: 20,    // s para chegar na largada e entrar
  PEGA_CONTAGEM: 3,      // s de 3-2-1
  PEGA_MAX: 150,         // s até o pega acabar sozinho
  PEGA_RAIO: 56,         // px da largada para poder entrar
  PEGA_CHEGADA: 40,      // px da chegada para valer
  PEGA_APOSTA: 20,       // R$ de inscrição de cada um (só durante o turno)
  PEGA_DIST_MIN: 900,    // px em linha reta entre largada e chegada
  PEGA_DIST_MAX: 1700,
};

// teto de cada item que se compra no posto e na oficina
export const TETOS = {
  ...SHOP_MAX,
  ...Object.fromEntries(Object.entries(PROBLEMS).map(([k, p]) => [k, p.cost])),
};
// cobranças que acontecem mesmo sem dinheiro (o fiado não impede)
export const OBRIGATORIOS = { guincho: TOW_COST, multa: RUN_OVER_FINE, radar: RADAR_FINE, policia: POLICE_FINE,
  assalto: ROB_MAX, franquia: INSURANCE_FEE };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const escolhe = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
const EM_JOGO = ['contagem', 'turno', 'prorrogacao'];

export function novoEstado(agora, rnd) {
  const e = { seq: 0, ultimoTick: 0, chegada: 0, fase: 'espera', fimFase: 0, dur: REGRAS.TURNO, turnos: 0,
    chamadas: [], dinamicas: [], jogadores: {}, livro: [], ranking: null, pega: null };
  for (let k = 0; k < REGRAS.DINAMICAS; k++) {
    const d = novaDinamica(e, agora, rnd);
    d.nasce = agora - (2 + rnd() * (d.vida * 0.6 - 2)); // já começam com idade, como no solo
    e.dinamicas.push(d);
  }
  return e;
}

// ---------- dinâmica ----------
function novaDinamica(e, agora, rnd) {
  const t = escolhe(CIDADE.roadTiles, rnd);
  return { id: ++e.seq, x: t.x * 16 + 8, y: t.y * 16 + 8, r: (7 + rnd() * 5) * 16,
    mult: Math.round((1.3 + rnd() * 1.3) * 10) / 10, nasce: agora, vida: 60 + rnd() * 70 };
}

function dinamicaEm(e, p, agora) {
  let m = 1;
  for (const d of e.dinamicas) if (agora - d.nasce > 1 && dist(p, d) < d.r) m = Math.max(m, d.mult);
  return m;
}

// ---------- chamadas ----------
function livre(e, p) { return e.chamadas.every((c) => dist(c.pick, p) >= REGRAS.DIST_CHAMADAS); }

function novaChamada(e, agora, rnd) {
  const curbs = CIDADE.curbs;
  let pick = null, drop = null;
  // às vezes a chamada nasce dentro de uma dinâmica (é lá que tem demanda), como no solo
  const ativas = e.dinamicas.filter((d) => agora - d.nasce > 1);
  if (ativas.length && rnd() < 0.35) {
    const d = escolhe(ativas, rnd);
    for (let t = 0; t < 40 && !pick; t++) {
      const s = escolhe(curbs, rnd);
      if (dist(s, d) < d.r * 0.9 && livre(e, s)) pick = s;
    }
  }
  for (let t = 0; t < 40 && !pick; t++) {
    const s = escolhe(curbs, rnd);
    if (livre(e, s)) pick = s;
  }
  if (!pick) return null;
  for (let t = 0; t < 60 && !drop; t++) {
    const s = escolhe(curbs, rnd);
    const d = (Math.abs(s.x - pick.x) + Math.abs(s.y - pick.y)) / 16;
    if (d > 20 && d < 85) drop = s;
  }
  if (!drop) return null;
  const type = pickType(rnd);
  const tripD = Math.abs(drop.x - pick.x) + Math.abs(drop.y - pick.y);
  const surge = dinamicaEm(e, pick, agora);
  return { id: ++e.seq, pick: { x: pick.x, y: pick.y }, drop: { x: drop.x, y: drop.y }, type, surge,
    fare: rideFare(tripD, type, surge), tripD, name: escolhe(FIRST_NAMES, rnd),
    stars: (4.2 + rnd() * 0.8).toFixed(1).replace('.', ','),
    morre: agora + REGRAS.CHAMADA_VIDA * (0.75 + rnd() * 0.5) };
}

const conectados = (e) => Object.entries(e.jogadores).filter(([, j]) => j.fora == null);
// chamadas só existem durante o turno
const alvo = (e) => { const n = conectados(e).length; return e.fase === 'turno' && n ? n + REGRAS.CHAMADAS_EXTRA : 0; };

function completar(e, agora, rnd) {
  let mudou = false;
  while (e.chamadas.length < alvo(e)) {
    const c = novaChamada(e, agora, rnd);
    if (!c) break;
    e.chamadas.push(c);
    mudou = true;
  }
  return mudou;
}

// ---------- caixa ----------
function zerarCaixa(j) {
  Object.assign(j, { saldo: REGRAS.SALDO_INICIAL, ganho: 0, gasto: 0, corridas: 0, notas: [], corrida: null, ultimaPaga: null });
}

const notaMedia = (j) => (j.notas.length ? r2(j.notas.reduce((a, b) => a + b, 0) / j.notas.length) : null);

// lança no livro e muda o saldo; "valor" é positivo para entrada e negativo para saída
function lancar(e, id, tipo, valor, ref) {
  const j = e.jogadores[id];
  valor = r2(valor);
  j.saldo = r2(j.saldo + valor);
  // entradas contam como ganho; saídas e estornos (devolução de um gasto) mexem no gasto
  if (valor > 0 && tipo !== 'estorno') j.ganho = r2(j.ganho + valor); else j.gasto = r2(j.gasto - valor);
  e.livro.push({ j: id, tipo, valor, ...(ref != null ? { ref } : {}) });
}

export function msgCaixa(e, id) {
  const j = e.jogadores[id];
  return { t: 'caixa', jogador: id, saldo: j.saldo, ganho: j.ganho, gasto: j.gasto, corridas: j.corridas, nota: notaMedia(j) };
}

// soma do livro por jogador: confere que o saldo de cada um é exatamente o que os lançamentos dizem
export function conferirLivro(e) {
  const soma = {};
  for (const l of e.livro) soma[l.j] = r2((soma[l.j] || 0) + l.valor);
  return soma;
}

// ---------- mensagens para os clientes ----------
export function msgChamadas(e, agora) {
  return { t: 'chamadas', lista: e.chamadas.map((c) => ({ id: c.id, pick: c.pick, drop: c.drop, type: c.type,
    surge: c.surge, fare: c.fare, tripD: c.tripD, name: c.name, stars: c.stars, expires: r1(c.morre - agora) })) };
}

export function msgDinamicas(e, agora) {
  return { t: 'dinamica', lista: e.dinamicas.map((d) => ({ id: d.id, x: d.x, y: d.y, r: d.r, mult: d.mult,
    age: r1(agora - d.nasce), life: r1(d.vida) })) };
}

// dono = o conectado que chegou primeiro; é quem começa o turno e pede revanche
export function dono(e) {
  let best = null;
  for (const [id, j] of conectados(e)) if (!best || j.chegou < e.jogadores[best].chegou) best = id;
  return best;
}

export function msgFase(e, agora) {
  return { t: 'fase', fase: e.fase, resta: e.fimFase ? r1(Math.max(0, e.fimFase - agora)) : 0, dur: e.dur,
    dono: dono(e), turno: e.turnos };
}

function placar(e) {
  const p = {};
  for (const k in e.jogadores) {
    const j = e.jogadores[k];
    p[k] = { saldo: j.saldo, ganho: j.ganho, gasto: j.gasto, corridas: j.corridas, nota: notaMedia(j) };
  }
  return p;
}

// o que um jogador precisa saber ao entrar (ou voltar) na sala
export function visao(e, id, agora) {
  const j = e.jogadores[id];
  return { chamadas: msgChamadas(e, agora).lista, dinamicas: msgDinamicas(e, agora).lista, placar: placar(e),
    corrida: j && j.corrida ? { id: j.corrida.id } : null, fase: msgFase(e, agora), ranking: e.ranking, pega: msgPega(e, agora).pega };
}

// ---------- entrada, saída e relógio ----------
// motivo para não deixar entrar, ou null. Durante o turno só volta quem já estava nele.
export function podeEntrar(e, id) {
  if (EM_JOGO.includes(e.fase) && !e.jogadores[id]) return 'andamento';
  return null;
}

export function entrar(e, id, agora, rnd, apelido) {
  const j = e.jogadores[id];
  if (j) { delete j.fora; if (apelido) j.apelido = apelido; } // voltou depois de cair: mantém saldo e corrida
  else {
    e.jogadores[id] = { apelido: apelido || id, chegou: ++e.chegada };
    zerarCaixa(e.jogadores[id]);
    // (no turno, podeEntrar barra novatos; se mesmo assim entrar, o livro continua fechando com o saldo)
    if (EM_JOGO.includes(e.fase)) e.livro.push({ j: id, tipo: 'inicio', valor: REGRAS.SALDO_INICIAL });
  }
  const ev = [{ todos: msgFase(e, agora) }]; // o dono pode ter mudado
  if (completar(e, agora, rnd)) ev.push({ todos: msgChamadas(e, agora) });
  return ev;
}

export function sair(e, id, agora) {
  const j = e.jogadores[id];
  if (j) j.fora = agora;
  const ev = [{ todos: msgFase(e, agora) }];
  const p = e.pega;
  if (p && p.fase === 'inscricao' && p.inscritos.includes(id)) {
    p.inscritos = p.inscritos.filter((k) => k !== id);
    ev.push({ todos: msgPega(e, agora) });
  }
  return ev;
}

// dono pede para começar (na espera) ou revanche (no fim). "dur" (s) só vale para testes locais.
export function comecar(e, id, agora, dur) {
  if (id !== dono(e)) return [{ para: id, msg: { t: 'recusado', acao: 'comecar', motivo: 'dono' } }];
  if (e.fase !== 'espera' && e.fase !== 'fim') return [{ para: id, msg: { t: 'recusado', acao: 'comecar', motivo: 'fase' } }];
  // quem não está conectado fica de fora deste turno
  for (const [k, j] of Object.entries(e.jogadores)) {
    if (j.fora != null) delete e.jogadores[k];
    else zerarCaixa(j);
  }
  e.dur = num(dur) ? clamp(dur, 20, REGRAS.TURNO) : REGRAS.TURNO;
  e.fase = 'contagem';
  e.fimFase = agora + REGRAS.CONTAGEM;
  e.turnos++;
  e.livro = [];
  e.ranking = null;
  e.chamadas = [];
  e.pega = null;
  for (const k in e.jogadores) e.livro.push({ j: k, tipo: 'inicio', valor: REGRAS.SALDO_INICIAL });
  const ev = [{ todos: msgFase(e, agora) }, { todos: msgChamadas(e, agora) }, { todos: msgPega(e, agora) }];
  for (const k in e.jogadores) ev.push({ todos: msgCaixa(e, k) });
  return ev;
}

function ranking(e) {
  return Object.entries(e.jogadores).map(([id, j]) => ({ id, apelido: j.apelido, lucro: r2(j.saldo - REGRAS.SALDO_INICIAL),
    saldo: j.saldo, ganho: j.ganho, gasto: j.gasto, corridas: j.corridas, nota: notaMedia(j) }))
    .sort((a, b) => b.lucro - a.lucro || (b.nota ?? 0) - (a.nota ?? 0));
}

// passa de fase quando o tempo acaba (pode pular mais de uma se a sala ficou parada)
function avancar(e, agora) {
  const ev = [];
  for (let n = 0; n < 4; n++) {
    const comCorrida = Object.values(e.jogadores).some((j) => j.corrida);
    if (e.fase === 'contagem' && agora >= e.fimFase) {
      e.fase = 'turno';
      e.fimFase = e.fimFase + e.dur;
    } else if (e.fase === 'turno' && agora >= e.fimFase) {
      e.chamadas = [];
      ev.push({ todos: msgChamadas(e, agora) });
      if (comCorrida) { e.fase = 'prorrogacao'; e.fimFase = e.fimFase + REGRAS.PRORROGACAO; }
      else e.fase = 'fim';
    } else if (e.fase === 'prorrogacao' && (agora >= e.fimFase || !comCorrida)) {
      for (const j of Object.values(e.jogadores)) j.corrida = null; // não entregou a tempo: fica sem pagamento
      e.fase = 'fim';
    } else break;
    if (e.fase === 'fim') { if (e.pega) ev.push(...fimPega(e, agora, 'turno')); e.fimFase = 0; e.ranking = ranking(e); }
    ev.push({ todos: msgFase(e, agora) });
    if (e.fase === 'fim') ev.push({ todos: { t: 'fim', ranking: e.ranking } });
  }
  return ev;
}

export function tick(e, agora, rnd) {
  if (agora - e.ultimoTick < REGRAS.TICK) return [];
  e.ultimoTick = agora;
  // fora do turno, quem caiu é esquecido depois de um tempo; no turno, fica até o ranking
  if (!EM_JOGO.includes(e.fase)) {
    for (const id in e.jogadores) {
      const j = e.jogadores[id];
      if (j.fora != null && agora - j.fora > REGRAS.FORA_MAX) delete e.jogadores[id];
    }
  }
  const ev = avancar(e, agora);
  ev.push(...avancarPega(e, agora));
  let mudouD = false;
  e.dinamicas = e.dinamicas.map((d) => {
    if (agora - d.nasce < d.vida) return d;
    mudouD = true;
    return novaDinamica(e, agora, rnd);
  });
  const antes = e.chamadas.length;
  e.chamadas = e.chamadas.filter((c) => c.morre > agora);
  const mudouC = completar(e, agora, rnd) || e.chamadas.length !== antes;
  if (mudouD) ev.push({ todos: msgDinamicas(e, agora) });
  if (mudouC) ev.push({ todos: msgChamadas(e, agora) });
  return ev;
}

// ---------- pedidos dos jogadores ----------
// pos = última posição conhecida do carro (das mensagens "estado"), ou null
export function mensagem(e, id, m, agora, rnd, pos) {
  const j = e.jogadores[id];
  if (!j || j.fora != null) return [];
  const recusa = (acao, motivo, ref, extra) => [{ para: id, msg: { t: 'recusado', acao, id: ref, motivo, ...extra } }];
  const longe = (p, alvoP, raio) => !num(p.x) || !num(p.y) || dist(p, alvoP) > raio ||
    (pos && dist(pos, p) > REGRAS.TOLERANCIA_POS);
  const valeDinheiro = e.fase === 'turno' || e.fase === 'prorrogacao';

  if (m.t === 'embarcar') {
    // "atual" deixa o cliente perceber uma corrida que ele já largou e liberá-la
    if (j.corrida) return recusa('embarcar', 'ocupado', m.chamada, { atual: j.corrida.id });
    if (e.fase !== 'turno') return recusa('embarcar', 'fase', m.chamada);
    if (e.pega && e.pega.fase !== 'inscricao' && e.pega.inscritos.includes(id)) return recusa('embarcar', 'pega', m.chamada);
    const i = e.chamadas.findIndex((c) => c.id === m.chamada);
    if (i < 0) return recusa('embarcar', 'sumiu', m.chamada); // já levada por outro ou expirada
    const c = e.chamadas[i];
    if (longe(m, c.pick, REGRAS.RAIO_EMBARQUE)) return recusa('embarcar', 'longe', c.id);
    // o veículo muda a tarifa (moto mais barata, táxi mais caro); executivo não anda de moto
    const veh = VEHICLES[m.veiculo] || VEHICLES.uber;
    if (veh.noExec && c.type === 'exec') return recusa('embarcar', 'veiculo', c.id);
    e.chamadas.splice(i, 1);
    j.corrida = { id: c.id, type: c.type, fare: r2(c.fare * veh.fare), tripD: c.tripD, pick: c.pick, drop: c.drop,
      embarque: agora, allowed: rideAllowed(c.tripD, c.type) };
    return [{ todos: { t: 'embarque', chamada: c.id, jogador: id } }, { todos: msgChamadas(e, agora) }];
  }

  if (m.t === 'entregar') {
    // repetido (a resposta se perdeu numa reconexão): reenvia o mesmo pagamento, sem pagar de novo
    if (j.ultimaPaga && j.ultimaPaga.corrida === m.corrida) return [{ para: id, msg: j.ultimaPaga }];
    const r = j.corrida;
    if (!r || r.id !== m.corrida) return recusa('entregar', 'sem-corrida', m.corrida);
    if (longe(m, r.drop, REGRAS.RAIO_ENTREGA)) return recusa('entregar', 'longe', r.id);
    const decorrido = agora - r.embarque;
    if (decorrido < dist(r.pick, r.drop) / REGRAS.VEL_MAX) return recusa('entregar', 'rapido', r.id);
    const late = decorrido - REGRAS.EMBARQUE_T > r.allowed;
    const stars = rideStars(r.type, {
      hits: clamp(Math.floor(num(m.batidas) ? m.batidas : 0), 0, 99), late,
      carBad: !!m.carroRuim, dirty: !!m.sujo, defect: !!m.defeito,
      comfort: clamp(num(m.conforto) ? m.conforto : 100, -1000, 100),
    });
    const { pay, tip } = ridePay(r.fare, late, stars, rnd);
    lancar(e, id, 'corrida', pay + tip, r.id);
    j.corridas++;
    j.notas.push(stars);
    j.corrida = null;
    const msg = { t: 'pago', jogador: id, corrida: r.id, pay, tip, stars, late, saldo: j.saldo, corridas: j.corridas };
    j.ultimaPaga = msg;
    const ev = [{ todos: msg }, { todos: msgCaixa(e, id) }];
    if (e.fase === 'prorrogacao') ev.push(...avancar(e, agora)); // foi a última corrida: acaba já
    return ev;
  }

  if (m.t === 'cancelar') {
    const r = j.corrida;
    if (!r || r.id !== m.corrida) return [];
    j.corrida = null;
    const ev = [];
    // a sala cobra a taxa: quem desiste logo no embarque paga a menor; quem larga o passageiro paga a maior e leva nota 1.
    // "forcado" = guincho (o passageiro desce sem taxa, mas a nota 1 vale igual)
    const largou = agora - r.embarque > REGRAS.EMBARQUE_T + 0.5;
    if (largou) j.notas.push(1);
    if (!m.forcado && valeDinheiro) lancar(e, id, 'cancelamento', -(largou ? ABANDON_FEE : CANCEL_FEE), r.id);
    if (largou || (!m.forcado && valeDinheiro)) ev.push({ todos: msgCaixa(e, id) });
    if (e.fase === 'prorrogacao') ev.push(...avancar(e, agora));
    return ev;
  }

  if (m.t === 'gastar') {
    // { itens: ['tanque'] | ['funilaria', 'flat', ...] | ['guincho'] | ['multa'], valor, ref }
    const ref = m.ref;
    const itens = Array.isArray(m.itens) ? [...new Set(m.itens.map(String))].slice(0, 12) : [];
    const valor = num(m.valor) ? r2(m.valor) : NaN;
    const nega = (motivo) => recusa('gastar', motivo, ref, { saldo: j.saldo });
    if (!valeDinheiro) return nega('fase');
    if (!itens.length || !(valor > 0)) return nega('invalido');
    const obrig = itens.length === 1 && OBRIGATORIOS[itens[0]] != null;
    const teto = obrig ? OBRIGATORIOS[itens[0]] : itens.reduce((a, k) => a + (TETOS[k] ?? NaN), 0);
    if (!(teto >= 0)) return nega('invalido');
    if (valor > teto + 0.001) return nega('teto');
    if (!obrig && j.saldo - valor < CREDIT_LIMIT - 0.001) return nega('fiado');
    lancar(e, id, itens.join('+'), -valor, ref);
    return [{ para: id, msg: { t: 'gasto', id: ref, valor, saldo: j.saldo } }, { todos: msgCaixa(e, id) }];
  }

  if (m.t === 'pega') return pedidoPega(e, id, j, m, agora, rnd, pos, recusa, longe, valeDinheiro);
  return [];
}

// ---------- pega: corrida de rua entre os jogadores ----------
// inscrição (20 s, quem estiver na largada entra) -> contagem (3 s) -> correndo (até todos chegarem ou 150 s) -> resultado.
// Durante o turno cada um paga a inscrição e o primeiro a chegar leva o pote.
export function msgPega(e, agora) {
  const p = e.pega;
  if (!p) return { t: 'pega', pega: null };
  return { t: 'pega', pega: { id: p.id, dono: p.dono, fase: p.fase, resta: r1(Math.max(0, p.fim - agora)),
    largada: p.largada, chegada: p.chegada, inscritos: p.inscritos, chegaram: p.chegaram, aposta: p.aposta, pote: p.pote } };
}

const podePagar = (j, aposta) => !aposta || j.saldo - aposta >= CREDIT_LIMIT - 0.001;

function pedidoPega(e, id, j, m, agora, rnd, pos, recusa, longe, valeDinheiro) {
  const p = e.pega, nega = (motivo) => recusa('pega', motivo, m.acao);
  if (m.acao === 'criar') {
    if (p) return nega('ocupado');
    if (e.fase === 'contagem' || e.fase === 'prorrogacao' || e.fase === 'fim') return nega('fase');
    if (j.corrida) return nega('corrida');
    if (!num(m.x) || !num(m.y) || (pos && dist(pos, m) > REGRAS.TOLERANCIA_POS)) return nega('longe');
    const aposta = valeDinheiro ? REGRAS.PEGA_APOSTA : 0;
    if (!podePagar(j, aposta)) return nega('fiado');
    const largada = { x: Math.round(m.x), y: Math.round(m.y) };
    let chegada = null;
    for (let t = 0; t < 200 && !chegada; t++) {
      const s = escolhe(CIDADE.curbs, rnd), d = dist(s, largada);
      if (d >= REGRAS.PEGA_DIST_MIN && d <= REGRAS.PEGA_DIST_MAX) chegada = { x: s.x, y: s.y };
    }
    if (!chegada) return nega('chegada');
    e.pega = { id: ++e.seq, dono: id, fase: 'inscricao', fim: agora + REGRAS.PEGA_INSCRICAO, largada, chegada,
      inscritos: [id], chegaram: [], aposta, pote: 0, inicio: 0 };
    return [{ todos: msgPega(e, agora) }];
  }
  if (!p) return nega('sem-pega');
  if (m.acao === 'entrar') {
    if (p.fase !== 'inscricao') return nega('fase');
    if (p.inscritos.includes(id)) return [];
    if (j.corrida) return nega('corrida');
    if (longe(m, p.largada, REGRAS.PEGA_RAIO)) return nega('longe');
    if (!podePagar(j, p.aposta)) return nega('fiado');
    p.inscritos.push(id);
    return [{ todos: msgPega(e, agora) }];
  }
  if (m.acao === 'sair') {
    if (!p.inscritos.includes(id) || p.chegaram.includes(id)) return [];
    p.inscritos = p.inscritos.filter((k) => k !== id); // desistiu (com o pega rolando, a inscrição fica no pote)
    if (p.fase === 'inscricao' && !p.inscritos.length) { e.pega = null; return [{ todos: msgPega(e, agora) }]; }
    if (p.fase !== 'inscricao' && p.chegaram.length >= p.inscritos.length) return fimPega(e, agora, 'todos');
    return [{ todos: msgPega(e, agora) }];
  }
  if (m.acao === 'chegar') {
    if (p.fase !== 'correndo' || !p.inscritos.includes(id)) return nega('fase');
    if (p.chegaram.includes(id)) return [];
    if (longe(m, p.chegada, REGRAS.PEGA_CHEGADA)) return nega('longe');
    if (agora - p.inicio < dist(p.largada, p.chegada) / REGRAS.VEL_MAX) return nega('rapido');
    p.chegaram.push(id);
    if (p.chegaram.length >= p.inscritos.length) return fimPega(e, agora, 'todos');
    return [{ todos: msgPega(e, agora) }];
  }
  return [];
}

// o tempo de cada fase do pega
function avancarPega(e, agora) {
  const p = e.pega;
  if (!p || agora < p.fim) return [];
  if (p.fase === 'inscricao') {
    // só corre quem está conectado, sem passageiro e pode pagar; com menos de 2, não tem pega
    p.inscritos = p.inscritos.filter((k) => e.jogadores[k] && e.jogadores[k].fora == null && !e.jogadores[k].corrida &&
      podePagar(e.jogadores[k], p.aposta));
    if (p.inscritos.length < 2) {
      e.pega = null;
      return [{ todos: { t: 'pegaFim', id: p.id, motivo: 'poucos', ordem: [], pote: 0 } }, { todos: msgPega(e, agora) }];
    }
    if (!(e.fase === 'turno' || e.fase === 'prorrogacao')) p.aposta = 0; // a aposta só vale com o dinheiro valendo
    const ev = [];
    for (const k of p.inscritos) if (p.aposta) { lancar(e, k, 'pega', -p.aposta, p.id); ev.push({ todos: msgCaixa(e, k) }); }
    p.pote = r2(p.aposta * p.inscritos.length);
    p.fase = 'contagem'; p.fim = agora + REGRAS.PEGA_CONTAGEM;
    return [{ todos: msgPega(e, agora) }, ...ev];
  }
  if (p.fase === 'contagem') {
    p.fase = 'correndo'; p.inicio = p.fim; p.fim = p.fim + REGRAS.PEGA_MAX;
    return [{ todos: msgPega(e, agora) }];
  }
  return fimPega(e, agora, 'tempo');
}

// resultado: o primeiro leva o pote; se ninguém chegou, quem ainda está no pega recebe a inscrição de volta
function fimPega(e, agora, motivo) {
  const p = e.pega;
  if (!p) return [];
  e.pega = null;
  const ev = [];
  if (p.pote > 0) {
    const vencedor = p.chegaram.find((k) => e.jogadores[k]);
    if (vencedor) { lancar(e, vencedor, 'pega-premio', p.pote, p.id); ev.push({ todos: msgCaixa(e, vencedor) }); }
    else for (const k of p.inscritos) if (e.jogadores[k]) { lancar(e, k, 'estorno', p.aposta, p.id); ev.push({ todos: msgCaixa(e, k) }); }
  }
  return [{ todos: { t: 'pegaFim', id: p.id, motivo, ordem: p.chegaram, pote: p.pote } }, { todos: msgPega(e, agora) }, ...ev];
}
