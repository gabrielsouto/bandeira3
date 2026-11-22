// Testes das regras da sala, sem rede: relógio e sorteio controlados.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novoEstado, entrar, sair, tick, mensagem, visao, comecar, podeEntrar, dono, conferirLivro, REGRAS } from '../src/regras.js';
import { CIDADE, rideFare } from '../src/compartilhado.js';

function sorteio(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T = 1000 + REGRAS.CONTAGEM; // hora em que o turno começa nos testes

// sala com dois jogadores; com "turno", Ana começa às 1000 e o turno já está rodando em T
function sala(seed = 1, { turno = true, dur } = {}) {
  const rnd = sorteio(seed);
  const e = novoEstado(1000, rnd);
  entrar(e, 'ana', 1000, rnd, 'Ana');
  entrar(e, 'leo', 1000, rnd, 'Léo');
  if (turno) { comecar(e, 'ana', 1000, dur); tick(e, T, rnd); }
  return { e, rnd };
}

const msgs = (ev, tipo) => ev.map((x) => x.todos || x.msg).filter((m) => m.t === tipo);
const recusa = (ev) => ev.length === 1 && ev[0].msg && ev[0].msg.t === 'recusado' ? ev[0].msg.motivo : null;
const embarca = (e, id, c, agora, rnd) => mensagem(e, id, { t: 'embarcar', chamada: c.id, ...c.pick }, agora, rnd, null);
const entrega = (e, id, c, agora, rnd, extra = {}) =>
  mensagem(e, id, { t: 'entregar', corrida: c.id, ...c.drop, batidas: 0, conforto: 100, ...extra }, agora, rnd, null);
const gasta = (e, id, itens, valor, agora, rnd) => mensagem(e, id, { t: 'gastar', itens, valor, ref: 7 }, agora, rnd, null);
const confere = (e) => {
  const soma = conferirLivro(e);
  for (const id in e.jogadores) assert.equal(soma[id], e.jogadores[id].saldo, `livro de ${id} bate com o saldo`);
};

// ---------- fases ----------
test('na espera não há chamadas; só o dono começa o turno', () => {
  const { e, rnd } = sala(1, { turno: false });
  assert.equal(e.fase, 'espera');
  assert.equal(e.chamadas.length, 0);
  assert.equal(dono(e), 'ana');
  assert.equal(recusa(comecar(e, 'leo', 1000)), 'dono');
  const ev = comecar(e, 'ana', 1000);
  assert.equal(msgs(ev, 'fase')[0].fase, 'contagem');
  tick(e, 1000 + REGRAS.CONTAGEM - 0.5, rnd);
  assert.equal(e.fase, 'contagem');
  tick(e, T, rnd);
  assert.equal(e.fase, 'turno');
  assert.equal(e.fimFase, T + REGRAS.TURNO);
});

test('o dono passa para o mais antigo quando sai', () => {
  const { e, rnd } = sala(1, { turno: false });
  entrar(e, 'bia', 1000, rnd, 'Bia');
  sair(e, 'ana', 1001);
  assert.equal(dono(e), 'leo');
  entrar(e, 'ana', 1002, rnd);
  assert.equal(dono(e), 'ana', 'voltou e continua sendo a mais antiga');
});

test('durante o turno só entra quem já estava nele', () => {
  const { e } = sala();
  assert.equal(podeEntrar(e, 'zeca'), 'andamento');
  assert.equal(podeEntrar(e, 'ana'), null);
});

test('turno sem ninguém com passageiro vai direto para o fim, com ranking', () => {
  const { e, rnd } = sala();
  const ev = tick(e, T + REGRAS.TURNO, rnd);
  assert.equal(e.fase, 'fim');
  assert.equal(e.chamadas.length, 0);
  const fim = msgs(ev, 'fim')[0];
  assert.deepEqual(fim.ranking.map((r) => r.lucro), [0, 0]);
});

test('prorrogação: quem está com passageiro tem 30 s, e o fim vem assim que entrega', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  embarca(e, 'ana', c, T, rnd);
  tick(e, T + REGRAS.TURNO, rnd);
  assert.equal(e.fase, 'prorrogacao');
  assert.equal(e.chamadas.length, 0, 'chamadas somem às 19:00');
  assert.equal(recusa(embarca(e, 'leo', c, T + REGRAS.TURNO + 1, rnd)), 'fase');
  const ev = entrega(e, 'ana', c, T + REGRAS.TURNO + 5, rnd);
  assert.equal(msgs(ev, 'pago').length, 1, 'entrega na prorrogação paga');
  assert.equal(e.fase, 'fim');
  assert.equal(msgs(ev, 'fim')[0].ranking[0].id, 'ana');
});

test('prorrogação acaba em 30 s e a corrida não entregue fica sem pagamento', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  embarca(e, 'ana', c, T, rnd);
  tick(e, T + REGRAS.TURNO, rnd);
  tick(e, T + REGRAS.TURNO + REGRAS.PRORROGACAO, rnd);
  assert.equal(e.fase, 'fim');
  assert.equal(e.jogadores.ana.corrida, null);
  assert.equal(recusa(entrega(e, 'ana', c, T + REGRAS.TURNO + 31, rnd)), 'sem-corrida');
});

test('sala parada por muito tempo pula fases de uma vez', () => {
  const { e, rnd } = sala();
  tick(e, T + 5000, rnd);
  assert.equal(e.fase, 'fim');
});

test('revanche zera o caixa, esquece quem saiu e começa outra contagem', () => {
  const { e, rnd } = sala();
  gasta(e, 'ana', ['cafe'], 8, T + 1, rnd);
  tick(e, T + REGRAS.TURNO, rnd);
  sair(e, 'leo', T + REGRAS.TURNO + 1);
  const ev = comecar(e, 'ana', T + REGRAS.TURNO + 2);
  assert.equal(msgs(ev, 'fase')[0].fase, 'contagem');
  assert.equal(e.jogadores.ana.saldo, REGRAS.SALDO_INICIAL);
  assert.equal(e.jogadores.leo, undefined);
  assert.equal(e.ranking, null);
  assert.equal(e.turnos, 2);
});

test('turno curto (testes locais) tem no mínimo 20 s', () => {
  const { e } = sala(1, { dur: 5 });
  assert.equal(e.dur, 20);
});

// ---------- chamadas e corridas ----------
test('chamadas abertas = jogadores conectados + 2', () => {
  const { e, rnd } = sala();
  assert.equal(e.chamadas.length, 4);
  sair(e, 'leo', T);
  tick(e, T + 1, rnd);
  e.chamadas.pop();
  tick(e, T + 2, rnd);
  assert.equal(e.chamadas.length, 3);
});

test('chamadas nascem em calçadas, longe umas das outras, com destino a 20–85 quadras', () => {
  const { e } = sala(7);
  const curbs = new Set(CIDADE.curbs.map((c) => c.x + ',' + c.y));
  for (const c of e.chamadas) {
    assert.ok(curbs.has(c.pick.x + ',' + c.pick.y) && curbs.has(c.drop.x + ',' + c.drop.y));
    const d = (Math.abs(c.drop.x - c.pick.x) + Math.abs(c.drop.y - c.pick.y)) / 16;
    assert.ok(d > 20 && d < 85);
    assert.equal(c.fare, rideFare(c.tripD, c.type, c.surge));
    for (const o of e.chamadas) if (o !== c) assert.ok(Math.hypot(o.pick.x - c.pick.x, o.pick.y - c.pick.y) >= REGRAS.DIST_CHAMADAS);
  }
});

test('quem embarca primeiro leva; o segundo é recusado', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  const ev1 = embarca(e, 'ana', c, T + 1, rnd);
  assert.equal(msgs(ev1, 'embarque')[0].jogador, 'ana');
  assert.ok(!msgs(ev1, 'chamadas')[0].lista.some((x) => x.id === c.id), 'chamada sai da lista de todos');
  assert.equal(recusa(embarca(e, 'leo', c, T + 1, rnd)), 'sumiu');
});

test('não embarca longe do passageiro nem com outra corrida em andamento', () => {
  const { e, rnd } = sala();
  const [c1, c2] = e.chamadas;
  assert.equal(recusa(mensagem(e, 'ana', { t: 'embarcar', chamada: c1.id, x: c1.pick.x + 60, y: c1.pick.y }, T + 1, rnd, null)), 'longe');
  // posição informada perto, mas o carro estava em outro lugar
  assert.equal(recusa(mensagem(e, 'ana', { t: 'embarcar', chamada: c1.id, ...c1.pick }, T + 1, rnd, { x: c1.pick.x + 500, y: c1.pick.y })), 'longe');
  embarca(e, 'ana', c1, T + 1, rnd);
  assert.equal(recusa(embarca(e, 'ana', c2, T + 2, rnd)), 'ocupado');
});

test('"ocupado" diz qual corrida a sala acha que está aberta, para o cliente liberar', () => {
  const { e, rnd } = sala();
  const [c1, c2] = e.chamadas;
  embarca(e, 'ana', c1, T, rnd);
  const ev = embarca(e, 'ana', c2, T + 1, rnd);
  assert.equal(ev[0].msg.atual, c1.id);
  mensagem(e, 'ana', { t: 'cancelar', corrida: c1.id }, T + 1, rnd, null);
  assert.equal(msgs(embarca(e, 'ana', c2, T + 3, rnd), 'embarque').length, 1);
});

test('entrega paga uma vez só, mesmo se a mensagem chegar repetida', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  embarca(e, 'ana', c, T, rnd);
  const ev = entrega(e, 'ana', c, T + 10, rnd); // rápido, mas possível e sem atraso
  const p = msgs(ev, 'pago')[0];
  assert.ok(ev[0].todos, 'pagamento vai para todos (placar)');
  assert.equal(p.pay, c.fare);
  assert.equal(p.late, false);
  assert.equal(p.saldo, Math.round((REGRAS.SALDO_INICIAL + p.pay + p.tip) * 100) / 100);
  assert.equal(msgs(ev, 'caixa')[0].ganho, Math.round((p.pay + p.tip) * 100) / 100);
  const de_novo = entrega(e, 'ana', c, T + 11, rnd);
  assert.deepEqual(de_novo[0].msg, p, 'reenvia o mesmo pagamento só para quem pediu');
  assert.equal(e.jogadores.ana.saldo, p.saldo, 'saldo não muda');
  assert.equal(e.jogadores.ana.corridas, 1);
  confere(e);
});

test('entrega rápida demais ou longe do destino é recusada', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  embarca(e, 'ana', c, T, rnd);
  assert.equal(recusa(entrega(e, 'ana', c, T + 0.5, rnd)), 'rapido');
  assert.equal(recusa(mensagem(e, 'ana', { t: 'entregar', corrida: c.id, x: c.drop.x, y: c.drop.y + 100 }, T + 30, rnd, null)), 'longe');
  assert.equal(recusa(entrega(e, 'leo', c, T + 30, rnd)), 'sem-corrida');
});

test('atraso calculado pelo relógio da sala: paga 85% e tira nota', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  embarca(e, 'ana', c, T, rnd);
  const r = e.jogadores.ana.corrida;
  const p = msgs(entrega(e, 'ana', c, T + r.allowed + REGRAS.EMBARQUE_T + 5, rnd), 'pago')[0];
  assert.equal(p.late, true);
  assert.equal(p.pay, Math.round(c.fare * 0.85 * 100) / 100);
  assert.ok(p.stars <= 4);
});

test('batidas informadas tiram nota; valores absurdos são limitados', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  embarca(e, 'ana', c, T, rnd);
  const p = msgs(entrega(e, 'ana', c, T + 20, rnd, { batidas: 1e9, conforto: 'x' }), 'pago')[0];
  assert.equal(p.stars, 1);
});

test('cancelar libera o jogador; a chamada não volta', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  embarca(e, 'ana', c, T, rnd);
  mensagem(e, 'ana', { t: 'cancelar', corrida: c.id }, T + 5, rnd, null);
  assert.equal(e.jogadores.ana.corrida, null);
  assert.ok(!e.chamadas.some((x) => x.id === c.id));
  assert.equal(recusa(entrega(e, 'ana', c, T + 30, rnd)), 'sem-corrida');
});

test('chamadas vencem e são repostas; o relógio só roda a cada TICK', () => {
  const { e, rnd } = sala();
  const ids = e.chamadas.map((c) => c.id);
  assert.deepEqual(tick(e, T + REGRAS.TICK / 2, rnd), [], 'antes do TICK não faz nada');
  const ev = tick(e, T + REGRAS.CHAMADA_VIDA * 1.3, rnd);
  assert.ok(msgs(ev, 'chamadas').length === 1);
  assert.equal(e.chamadas.length, 4);
  assert.ok(e.chamadas.every((c) => !ids.includes(c.id)), 'todas trocadas');
});

test('dinâmicas vencem e são trocadas, sempre 3', () => {
  const { e, rnd } = sala();
  const ev = tick(e, 1000 + 200, rnd);
  assert.equal(msgs(ev, 'dinamica').length, 1);
  assert.equal(e.dinamicas.length, 3);
  assert.ok(e.dinamicas.every((d) => d.nasce === 1200));
});

// ---------- caixa ----------
test('taxas de cancelamento cobradas pela sala: R$ 5 no embarque, R$ 15 e nota 1 com o passageiro a bordo', () => {
  const { e, rnd } = sala();
  const [c1, c2] = e.chamadas;
  embarca(e, 'ana', c1, T, rnd);
  mensagem(e, 'ana', { t: 'cancelar', corrida: c1.id }, T + 0.5, rnd, null);
  assert.equal(e.jogadores.ana.saldo, REGRAS.SALDO_INICIAL - 5);
  embarca(e, 'ana', c2, T + 1, rnd);
  const ev = mensagem(e, 'ana', { t: 'cancelar', corrida: c2.id }, T + 10, rnd, null);
  assert.equal(msgs(ev, 'caixa')[0].saldo, REGRAS.SALDO_INICIAL - 20);
  assert.equal(msgs(ev, 'caixa')[0].nota, 1);
  confere(e);
});

test('guincho tira o passageiro sem taxa, mas a nota 1 vale', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  embarca(e, 'ana', c, T, rnd);
  mensagem(e, 'ana', { t: 'cancelar', corrida: c.id, forcado: true }, T + 10, rnd, null);
  assert.equal(e.jogadores.ana.saldo, REGRAS.SALDO_INICIAL);
  assert.deepEqual(e.jogadores.ana.notas, [1]);
});

test('gasto dentro do teto é aceito e entra no livro', () => {
  const { e, rnd } = sala();
  const ev = gasta(e, 'ana', ['tanque'], 19.5, T + 1, rnd);
  assert.deepEqual(ev[0], { para: 'ana', msg: { t: 'gasto', id: 7, valor: 19.5, saldo: 130.5 } });
  assert.equal(msgs(ev, 'caixa')[0].gasto, 19.5);
  gasta(e, 'ana', ['funilaria', 'flat', 'revisao'], 300, T + 2, rnd);
  assert.equal(e.jogadores.ana.saldo, -169.5);
  confere(e);
});

test('gasto acima do teto ou com item desconhecido é recusado', () => {
  const { e, rnd } = sala();
  assert.equal(recusa(gasta(e, 'ana', ['tanque'], 65.01, T + 1, rnd)), 'teto');
  assert.equal(recusa(gasta(e, 'ana', ['flat', 'flat'], 140, T + 1, rnd)), 'teto', 'item repetido conta uma vez');
  assert.equal(recusa(gasta(e, 'ana', ['nitro'], 10, T + 1, rnd)), 'invalido');
  assert.equal(recusa(gasta(e, 'ana', ['cafe'], -8, T + 1, rnd)), 'invalido', 'gasto negativo não vira dinheiro');
  assert.equal(recusa(gasta(e, 'ana', ['cafe'], 'oito', T + 1, rnd)), 'invalido');
  assert.equal(e.jogadores.ana.saldo, REGRAS.SALDO_INICIAL);
});

test('limite do fiado: compra recusada abaixo de −R$ 200; guincho e multa cobram mesmo assim', () => {
  const { e, rnd } = sala();
  gasta(e, 'ana', ['overheat', 'battery'], 330, T + 1, rnd); // saldo −180
  assert.equal(recusa(gasta(e, 'ana', ['dirty'], 35, T + 2, rnd)), 'fiado');
  assert.equal(msgs(gasta(e, 'ana', ['gasolina'], 20, T + 3, rnd), 'gasto').length, 1, 'até −200 pode');
  gasta(e, 'ana', ['guincho'], 120, T + 4, rnd);
  gasta(e, 'ana', ['multa'], 40, T + 5, rnd);
  assert.equal(e.jogadores.ana.saldo, -360);
  assert.equal(recusa(gasta(e, 'ana', ['guincho'], 500, T + 6, rnd)), 'teto');
  confere(e);
});

test('fora do turno o dinheiro não muda', () => {
  const { e, rnd } = sala(1, { turno: false });
  assert.equal(recusa(gasta(e, 'ana', ['cafe'], 8, 1001, rnd)), 'fase');
  comecar(e, 'ana', 1001);
  assert.equal(recusa(gasta(e, 'ana', ['cafe'], 8, 1002, rnd)), 'fase', 'nem na contagem');
});

test('ranking: lucro do turno, desempate pela nota média', () => {
  const { e, rnd } = sala();
  entrar(e, 'bia', T, rnd, 'Bia'); // não está no turno pelas regras de entrada, mas aqui testa só a ordem
  const [c1, c2] = e.chamadas;
  embarca(e, 'ana', c1, T, rnd);
  entrega(e, 'ana', c1, T + 20, rnd, { batidas: 9 }); // nota baixa
  embarca(e, 'leo', c2, T, rnd);
  entrega(e, 'leo', c2, T + 20, rnd);
  // iguala o lucro dos dois para testar o desempate
  const diff = e.jogadores.leo.saldo - e.jogadores.ana.saldo;
  if (diff > 0) gasta(e, 'leo', ['funilaria'], Math.round(diff * 100) / 100, T + 21, rnd);
  else if (diff < 0) gasta(e, 'ana', ['funilaria'], Math.round(-diff * 100) / 100, T + 21, rnd);
  gasta(e, 'bia', ['cafe'], 8, T + 21, rnd);
  const fim = msgs(tick(e, T + REGRAS.TURNO, rnd), 'fim')[0];
  assert.deepEqual(fim.ranking.map((r) => r.id), ['leo', 'ana', 'bia']);
  assert.equal(fim.ranking[0].lucro, fim.ranking[1].lucro);
  assert.ok(fim.ranking[0].nota > fim.ranking[1].nota);
  assert.equal(fim.ranking[2].lucro, -8);
  confere(e);
});

// ---------- conexão ----------
test('quem cai guarda saldo e corrida; no turno fica até o ranking', () => {
  const { e, rnd } = sala();
  const c = e.chamadas[0];
  embarca(e, 'ana', c, T, rnd);
  sair(e, 'ana', T + 10);
  assert.deepEqual(entrega(e, 'ana', c, T + 11, rnd), [], 'fora da sala não age');
  tick(e, T + 100, rnd);
  assert.equal(e.chamadas.length, 3, 'chamadas contam só quem está conectado');
  entrar(e, 'ana', T + 100, rnd);
  assert.deepEqual(visao(e, 'ana', T + 100).corrida, { id: c.id });
  sair(e, 'ana', T + 200);
  tick(e, T + 200 + REGRAS.FORA_MAX + 1, rnd);
  assert.ok(e.jogadores.ana, 'no turno não some');
  tick(e, T + REGRAS.TURNO + REGRAS.PRORROGACAO, rnd);
  assert.ok(e.ranking.some((r) => r.id === 'ana'), 'aparece no ranking mesmo desconectada');
  tick(e, T + REGRAS.TURNO + REGRAS.PRORROGACAO + REGRAS.FORA_MAX + 1, rnd);
  assert.equal(e.jogadores.ana, undefined, 'depois do turno, 5 min fora e sai de vez');
});

test('o estado sobrevive a JSON (armazenamento do Durable Object)', () => {
  const { e, rnd } = sala();
  const copia = JSON.parse(JSON.stringify(e));
  const c = copia.chamadas[0];
  assert.equal(msgs(embarca(copia, 'ana', c, T + 1, rnd), 'embarque').length, 1);
});

test('visão de quem entra traz fase, chamadas, dinâmicas e placar', () => {
  const { e } = sala();
  const v = visao(e, 'leo', T);
  assert.equal(v.fase.fase, 'turno');
  assert.equal(v.fase.resta, REGRAS.TURNO);
  assert.equal(v.chamadas.length, 4);
  assert.equal(v.dinamicas.length, 3);
  assert.deepEqual(Object.keys(v.placar).sort(), ['ana', 'leo']);
  assert.equal(v.placar.ana.saldo, REGRAS.SALDO_INICIAL);
  assert.ok(v.chamadas.every((c) => c.expires > 0 && c.expires <= REGRAS.CHAMADA_VIDA * 1.25));
});

// ---------- veículos, cobranças novas e pega ----------
test('moto paga 40% menos e não leva executivo; táxi paga mais', () => {
  const { e, rnd } = sala(3);
  const c = e.chamadas.find((x) => x.type !== 'exec');
  mensagem(e, 'ana', { t: 'embarcar', chamada: c.id, ...c.pick, veiculo: 'moto' }, T + 1, rnd, null);
  assert.equal(e.jogadores.ana.corrida.fare, Math.round(c.fare * 0.6 * 100) / 100);
  const c2 = e.chamadas.find((x) => x.id !== c.id);
  mensagem(e, 'leo', { t: 'embarcar', chamada: c2.id, ...c2.pick, veiculo: 'taxi' }, T + 1, rnd, null);
  assert.equal(e.jogadores.leo.corrida.fare, Math.round(c2.fare * 1.15 * 100) / 100);
  e.chamadas.push({ ...c2, id: 999, type: 'exec', morre: T + 99 });
  e.jogadores.ana.corrida = null;
  const ev = mensagem(e, 'ana', { t: 'embarcar', chamada: 999, ...c2.pick, veiculo: 'moto' }, T + 2, rnd, null);
  assert.equal(recusa(ev), 'veiculo');
});

test('assalto, franquia, radar e polícia cobram mesmo no fiado, até o teto', () => {
  const { e, rnd } = sala(4);
  e.jogadores.ana.saldo = -190;
  e.livro.push({ j: 'ana', tipo: 'ajuste', valor: -340 });
  for (const [k, v] of [['assalto', 50], ['franquia', 100], ['radar', 60], ['policia', 150]]) {
    assert.equal(msgs(gasta(e, 'ana', [k], v, T + 1, rnd), 'gasto').length, 1, k);
  }
  assert.equal(recusa(gasta(e, 'ana', ['assalto'], 999, T + 1, rnd)), 'teto');
  confere(e);
});

const pega = (e, id, acao, p, agora, rnd) => mensagem(e, id, { t: 'pega', acao, x: p.x, y: p.y }, agora, rnd, null);

test('pega: inscrição, aposta, ordem de chegada e prêmio no livro', () => {
  const { e, rnd } = sala(5);
  const L = { x: CIDADE.curbs[0].x, y: CIDADE.curbs[0].y };
  assert.equal(msgs(pega(e, 'ana', 'criar', L, T + 1, rnd), 'pega')[0].pega.fase, 'inscricao');
  assert.equal(recusa(pega(e, 'leo', 'criar', L, T + 1, rnd)), 'ocupado');
  assert.equal(recusa(pega(e, 'leo', 'entrar', { x: L.x + 300, y: L.y }, T + 2, rnd)), 'longe');
  pega(e, 'leo', 'entrar', L, T + 2, rnd);
  assert.deepEqual(e.pega.inscritos, ['ana', 'leo']);
  const t0 = T + 1 + REGRAS.PEGA_INSCRICAO;
  tick(e, t0, rnd);
  assert.equal(e.pega.fase, 'contagem');
  assert.equal(e.jogadores.ana.saldo, REGRAS.SALDO_INICIAL - REGRAS.PEGA_APOSTA);
  tick(e, t0 + REGRAS.PEGA_CONTAGEM + 0.3, rnd);
  assert.equal(e.pega.fase, 'correndo');
  const C = e.pega.chegada, ini = e.pega.inicio;
  assert.equal(recusa(pega(e, 'leo', 'chegar', C, ini + 0.5, rnd)), 'rapido');
  pega(e, 'leo', 'chegar', C, ini + 30, rnd);
  const ev = pega(e, 'ana', 'chegar', C, ini + 31, rnd);
  const fim = msgs(ev, 'pegaFim')[0];
  assert.deepEqual(fim.ordem, ['leo', 'ana']);
  assert.equal(e.pega, null);
  assert.equal(e.jogadores.leo.saldo, REGRAS.SALDO_INICIAL + REGRAS.PEGA_APOSTA);
  assert.equal(e.jogadores.leo.ganho, REGRAS.PEGA_APOSTA * 2);
  confere(e);
});

test('pega: sozinho não corre; ninguém chegando devolve a aposta', () => {
  const { e, rnd } = sala(6);
  const L = { x: CIDADE.curbs[0].x, y: CIDADE.curbs[0].y };
  pega(e, 'ana', 'criar', L, T + 1, rnd);
  const ev = tick(e, T + 1 + REGRAS.PEGA_INSCRICAO, rnd);
  assert.equal(msgs(ev, 'pegaFim')[0].motivo, 'poucos');
  assert.equal(e.pega, null);
  pega(e, 'ana', 'criar', L, T + 30, rnd);
  pega(e, 'leo', 'entrar', L, T + 31, rnd);
  tick(e, T + 30 + REGRAS.PEGA_INSCRICAO, rnd);
  tick(e, T + 30 + REGRAS.PEGA_INSCRICAO + REGRAS.PEGA_CONTAGEM, rnd);
  tick(e, T + 30 + REGRAS.PEGA_INSCRICAO + REGRAS.PEGA_CONTAGEM + REGRAS.PEGA_MAX + 1, rnd);
  assert.equal(e.pega, null);
  assert.equal(e.jogadores.ana.saldo, REGRAS.SALDO_INICIAL);
  assert.equal(e.jogadores.ana.gasto, 0);
  confere(e);
});
