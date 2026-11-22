// Teste de fumaça da sala. Precisa do servidor rodando em outro terminal:
//   npm run dev
//   npm run fumaca            (ou: node test/fumaca.mjs ws://localhost:8787)
// Abre conexões de verdade e confere entrada, turno, corrida disputada, caixa, recusas e saída.
// No servidor local, o turno dura 30 s e o teste espera o fim para conferir o ranking.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
Object.assign(globalThis, require('../../js/util.js'));
const { generateCity, cityHash } = require('../../js/city.js');

const BASE = process.argv[2] || 'ws://localhost:8787';
const LOCAL = /^ws:\/\/(localhost|127\.0\.0\.1)/.test(BASE);
const PROTO = 4;
const codigo = () => 'T' + Math.random().toString(36).slice(2, 5).toUpperCase().replace(/[^A-Z0-9]/g, 'X').replace(/[OI01]/g, 'X');
const SALA = codigo();
const HASH = cityHash(generateCity(20261118)); // a mesma cidade do jogo
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;

function ok(cond, nome) {
  console.log((cond ? 'ok    ' : 'FALHOU') + ' ' + nome);
  if (!cond) falhas++;
}

// Cliente simples: guarda mensagens recebidas e permite esperar por um tipo.
function cliente(id, sala = SALA) {
  const ws = new WebSocket(`${BASE}/sala/${sala}`);
  const c = { ws, id, msgs: [], fechou: null };
  ws.onmessage = (e) => c.msgs.push(JSON.parse(e.data));
  ws.onclose = (e) => { c.fechou = e.code; };
  c.aberto = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  c.enviar = (m) => ws.send(JSON.stringify(m));
  c.entrar = async (extra = {}) => { await c.aberto; c.enviar({ t: 'entrar', v: PROTO, id, apelido: id.slice(0, 6), hash: HASH, ...extra }); };
  c.espera = (pred, ms = 2000) => new Promise((res) => {
    const t0 = Date.now();
    const tick = () => {
      const m = c.msgs.find(pred);
      if (m) return res(m);
      if (Date.now() - t0 > ms) return res(null);
      setTimeout(tick, 20);
    };
    tick();
  });
  c.esperaFechar = (ms = 2000) => new Promise((res) => {
    const t0 = Date.now();
    const tick = () => (c.fechou !== null ? res(c.fechou) : Date.now() - t0 > ms ? res(null) : setTimeout(tick, 20));
    tick();
  });
  c.ultima = (tipo) => c.msgs.filter((m) => m.t === tipo).pop();
  return c;
}

// espera até 30 s o servidor subir (útil logo depois do "npm run dev")
let saude = null;
for (let k = 0; k < 30 && saude !== 'ok'; k++) {
  saude = await fetch(BASE.replace(/^ws/, 'http') + '/saude').then((r) => r.text()).catch(() => null);
  if (saude !== 'ok') await dorme(1000);
}
ok(saude === 'ok', 'servidor responde /saude');
if (saude !== 'ok') { console.log('Suba o servidor com "npm run dev" antes.'); process.exit(1); }

// ---------- entrada e espera ----------
const a = cliente('aaaaaaaa01');
await a.entrar({ apelido: '<b>Bia</b>' });
const bA = await a.espera((m) => m.t === 'bemvindo');
ok(bA && bA.jogadores.length === 1, 'A entra numa sala vazia');
ok(bA && bA.jogadores[0].apelido === 'bBiab', 'apelido limpo (sem < > /)');
ok(bA && bA.fase.fase === 'espera' && bA.fase.dono === a.id, 'sala começa na espera, e A é o dono');

const b = cliente('bbbbbbbb02');
await b.entrar({ apelido: 'bBiab' });
const bB = await b.espera((m) => m.t === 'bemvindo');
ok(bB && bB.jogadores.length === 2, 'B vê 2 jogadores');
ok(bB && bB.jogadores[0].apelido === 'bBiab 2', 'apelido repetido ganha número');
ok(bB && bB.jogadores[0].cor !== bB.jogadores[1].cor, 'cores diferentes');
ok(bB && bB.chamadas.length === 0 && bB.dinamicas.length === 3, 'na espera: sem chamadas, com 3 dinâmicas');
ok(bB && bB.jogadores.every((j) => j.saldo === 150 && j.corridas === 0), 'placar começa com R$ 150 para todos');
ok(await a.espera((m) => m.t === 'entrou' && m.j.id === b.id), 'A recebe "entrou" de B');

a.enviar({ t: 'estado', s: 1.5, x: 100, y: 200, a: 0.5, vx: 10, vy: 0, b: 1, g: 0 });
const e = await b.espera((m) => m.t === 'e');
ok(e && e.id === a.id && e.x === 100 && e.b === 1, 'estado de A chega em B');
ok(!(await a.espera((m) => m.t === 'e', 300)), 'A não recebe o próprio estado');
a.enviar({ t: 'estado', s: 2, x: 'xx', y: 0, a: 0, vx: 0, vy: 0 });
ok(!(await b.espera((m) => m.t === 'e' && m.s === 2, 300)), 'estado inválido é ignorado');

a.enviar({ t: 'ping', c: 42 });
ok(await a.espera((m) => m.t === 'pong' && m.c === 42), 'ping responde pong');

a.enviar({ t: 'gastar', ref: 1, itens: ['cafe'], valor: 8 });
ok((await a.espera((m) => m.t === 'recusado' && m.acao === 'gastar'))?.motivo === 'fase', 'na espera não se gasta dinheiro');

// ---------- turno ----------
b.enviar({ t: 'comecar' });
ok((await b.espera((m) => m.t === 'recusado' && m.acao === 'comecar'))?.motivo === 'dono', 'só o dono começa o turno');
a.enviar({ t: 'comecar', min: 0.5 }); // turno de 30 s (o servidor publicado ignora e usa 12 min)
ok(await b.espera((m) => m.t === 'fase' && m.fase === 'contagem'), 'dono começa: contagem para todos');
const fT = await b.espera((m) => m.t === 'fase' && m.fase === 'turno', 5000);
ok(fT && fT.dur === (LOCAL ? 30 : 720), `turno começa depois do 3-2-1 (${fT && fT.dur} s)`);

const z = cliente('zzzzzzzz09');
await z.entrar();
ok((await z.espera((m) => m.t === 'erro'))?.motivo === 'andamento', 'quem chega no meio do turno é recusado');
ok((await z.esperaFechar()) === 4001, 'recusa fecha com 4001');

// corrida disputada: A e B vão ao mesmo passageiro, A chega primeiro.
// Cada jogador tem a sua conexão, e no servidor publicado elas não chegam em ordem garantida:
// por isso B só pede depois que a sala confirmou o embarque de A.
const lista = (await a.espera((m) => m.t === 'chamadas' && m.lista.length === 4))?.lista || [];
ok(lista.length === 4, 'no turno: 4 chamadas (2 jogadores + 2)');
const ch = [...lista].sort((p, q) => Math.hypot(p.drop.x - p.pick.x, p.drop.y - p.pick.y) - Math.hypot(q.drop.x - q.pick.x, q.drop.y - q.pick.y))[0];
a.enviar({ t: 'estado', s: 3, x: ch.pick.x, y: ch.pick.y, a: 0, vx: 0, vy: 0 });
a.enviar({ t: 'embarcar', chamada: ch.id, x: ch.pick.x, y: ch.pick.y });
await a.espera((m) => m.t === 'embarque' && m.chamada === ch.id);
b.enviar({ t: 'embarcar', chamada: ch.id, x: ch.pick.x, y: ch.pick.y });
const emb = await b.espera((m) => m.t === 'embarque' && m.chamada === ch.id);
ok(emb && emb.jogador === a.id, 'A leva a corrida e todos ficam sabendo');
ok((await b.espera((m) => m.t === 'recusado' && m.id === ch.id))?.motivo === 'sumiu', 'B é recusado na mesma chamada');
await dorme(Math.hypot(ch.drop.x - ch.pick.x, ch.drop.y - ch.pick.y) / 230 * 1000 + 300);
a.enviar({ t: 'estado', s: 4, x: ch.drop.x, y: ch.drop.y, a: 0, vx: 0, vy: 0 });
a.enviar({ t: 'entregar', corrida: ch.id, x: ch.drop.x, y: ch.drop.y, batidas: 0, conforto: 100 });
const pago = await b.espera((m) => m.t === 'pago' && m.corrida === ch.id, 3000);
const esperado = Math.round((150 + (pago?.pay ?? 0) + (pago?.tip ?? 0)) * 100) / 100;
ok(pago && pago.jogador === a.id && pago.pay === ch.fare && pago.saldo === esperado, `entrega paga R$ ${pago && pago.pay} a A (aviso chega a B)`);
ok((await b.espera((m) => m.t === 'caixa' && m.jogador === a.id && m.corridas === 1))?.saldo === esperado, 'placar ao vivo: B recebe o caixa de A');
a.enviar({ t: 'entregar', corrida: ch.id, x: ch.drop.x, y: ch.drop.y });
await dorme(300);
ok(a.msgs.filter((m) => m.t === 'pago').length === 2 && b.msgs.filter((m) => m.t === 'pago').length === 1,
  'entrega repetida reenvia o recibo só para A');
const pagos = a.msgs.filter((m) => m.t === 'pago');
ok(pagos[1] && pagos[1].saldo === pagos[0].saldo, 'e não paga duas vezes');

// ---------- caixa ----------
a.enviar({ t: 'gastar', ref: 2, itens: ['cafe'], valor: 8 });
const g = await a.espera((m) => m.t === 'gasto' && m.id === 2);
ok(g && g.saldo === Math.round((esperado - 8) * 100) / 100, 'café de R$ 8 descontado pela sala');
a.enviar({ t: 'gastar', ref: 3, itens: ['tanque'], valor: 100 });
ok((await a.espera((m) => m.t === 'recusado' && m.acao === 'gastar' && m.id === 3))?.motivo === 'teto', 'tanque de R$ 100 recusado (teto R$ 65)');
b.enviar({ t: 'gastar', ref: 4, itens: ['overheat', 'battery', 'brakes'], valor: 440 });
// (o id de um pedido de compra pode coincidir com o de uma chamada: por isso confere também a "acao")
ok((await b.espera((m) => m.t === 'recusado' && m.acao === 'gastar' && m.id === 4))?.motivo === 'fiado', 'compra que passa do fiado é recusada');
b.enviar({ t: 'gastar', ref: 5, itens: ['guincho'], valor: 120 });
b.enviar({ t: 'gastar', ref: 6, itens: ['multa'], valor: 40 });
ok((await b.espera((m) => m.t === 'gasto' && m.id === 6))?.saldo === -10, 'guincho e multa cobrados (saldo de B: −R$ 10)');

// ---------- reconexão ----------
// mesma aba reconectando: a conexão antiga cai com 4000 e ninguém recebe "saiu"
const a2 = cliente(a.id);
await a2.entrar();
const bA2 = await a2.espera((m) => m.t === 'bemvindo');
ok(bA2 && bA2.jogadores[0].apelido === 'bBiab' && bA2.jogadores.length === 2, 'reconexão no meio do turno mantém apelido e lugar');
ok(bA2 && bA2.jogadores[0].saldo === g?.saldo && bA2.fase.fase === 'turno', 'reconexão mantém o saldo da sala e a fase');
ok((await a.esperaFechar()) === 4000, 'conexão antiga fecha com 4000');
ok(!(await b.espera((m) => m.t === 'saiu' && m.id === a.id, 400)), 'reconexão não avisa "saiu"');

// ---------- fim do turno (só no servidor local, onde o turno dura 30 s) ----------
if (LOCAL) {
  const resta = (a2.ultima('fase')?.resta ?? bA2.fase.resta) * 1000;
  const fim = await a2.espera((m) => m.t === 'fim', resta + 3000);
  const rk = fim?.ranking || [];
  ok(rk.length === 2 && rk[0].id === a.id && rk[0].lucro === Math.round((g.saldo - 150) * 100) / 100 && rk[1].lucro === -160,
    'fim do turno: ranking com o lucro certo de cada um');
  ok(rk[0] && rk[0].nota != null && rk[1].nota === null, 'nota média de quem fez corrida; "–" de quem não fez');
  ok(a2.ultima('chamadas')?.lista.length === 0, 'chamadas somem no fim');
  const antes = b.msgs.filter((m) => m.t === 'recusado' && m.acao === 'comecar').length;
  b.enviar({ t: 'comecar' });
  await dorme(400);
  ok(b.msgs.filter((m) => m.t === 'recusado' && m.acao === 'comecar' && m.motivo === 'dono').length === antes + 1, 'revanche só pelo dono');
  a2.enviar({ t: 'comecar', min: 0.5 });
  const rev = await b.espera((m) => m.t === 'fase' && m.fase === 'contagem' && m.turno === 2);
  ok(rev, 'revanche: nova contagem (turno 2)');
  ok((await b.espera((m) => m.t === 'caixa' && m.jogador === b.id && m.saldo === 150 && m.gasto === 0)), 'revanche zera o caixa de todos');
}

b.ws.close();
ok(await a2.espera((m) => m.t === 'saiu' && m.id === b.id), 'fechar B avisa "saiu" para os outros');
a2.ws.close();

// ---------- recusas em outra sala ----------
const SALA2 = codigo();
const v = cliente('vvvvvvvv08', SALA2);
await v.entrar({ v: 99 });
ok((await v.espera((m) => m.t === 'erro'))?.motivo === 'versao', 'versão diferente é recusada');
const w = cliente('wwwwwwww07', SALA2);
await w.entrar({ hash: 'outro' });
ok((await w.espera((m) => m.t === 'erro'))?.motivo === 'cidade', 'cidade diferente é recusada');

const cheios = ['cccccccc03', 'dddddddd04', 'eeeeeeee05', 'ffffffff06'].map((id) => cliente(id, SALA2));
for (const k of cheios) { await k.entrar(); await k.espera((m) => m.t === 'bemvindo'); }
const x = cliente('xxxxxxxx05', SALA2);
await x.entrar();
ok((await x.espera((m) => m.t === 'erro'))?.motivo === 'cheia', 'quinto jogador é recusado (sala cheia)');
for (const k of cheios) k.ws.close();

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
