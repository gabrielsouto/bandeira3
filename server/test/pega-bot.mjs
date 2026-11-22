// Piloto falso para testar o pega: entra na sala como moto, vai até a largada de qualquer pega aberto,
// se inscreve, espera a largada e "chega" na chegada depois de um tempo plausível (devagar, para o humano ganhar).
//   node test/pega-bot.mjs TEST            (servidor local)
//   CRIAR=1 node test/pega-bot.mjs TEST    (o próprio robô chama o pega onde nasceu)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
Object.assign(globalThis, require('../../js/util.js'));
const { generateCity, cityHash } = require('../../js/city.js');

const [sala = 'TEST', dur = '180'] = process.argv.slice(2);
const BASE = process.env.SERVIDOR || 'ws://localhost:8787';
const city = generateCity(20261118);
const log = (...s) => console.log(new Date().toISOString().slice(11, 19), ...s);
const id = 'pega' + Math.random().toString(36).slice(2, 10);
const ws = new WebSocket(`${BASE}/sala/${sala.toUpperCase()}`);
const send = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
let x = city.places[1].cx, y = city.places[1].cy, alvo = null, pega = null, chegou = false, criado = false;
ws.onopen = () => send({ t: 'entrar', v: 4, id, apelido: 'Piloto', hash: cityHash(city) });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.t === 'bemvindo' || m.t === 'pega') {
    const p = m.pega;
    if (p && (!pega || pega.fase !== p.fase)) log('pega:', p.fase, 'inscritos', p.inscritos.length, 'pote', p.pote);
    pega = p;
    if (!p) { alvo = null; chegou = false; return; }
    if (p.fase === 'inscricao' && !p.inscritos.includes(id)) alvo = { ...p.largada, entrar: true };
    if (p.fase === 'correndo' && p.inscritos.includes(id) && !chegou) setTimeout(() => { alvo = { ...p.chegada, chegar: true }; }, 12000);
  } else if (m.t === 'pegaFim') log('fim do pega:', m.motivo, 'ordem', m.ordem, 'pote', m.pote);
  else if (m.t === 'recusado' && m.acao === 'pega') log('recusado:', m.motivo);
  else if (m.t === 'caixa' && m.jogador === id) log('saldo', m.saldo);
  if (process.env.CRIAR && m.t === 'bemvindo' && !criado) { criado = true; setTimeout(() => send({ t: 'pega', acao: 'criar', x, y }), 1500); }
};
let s = 0;
setInterval(() => {
  s += 1 / 15;
  if (alvo) {
    const dx = alvo.x - x, dy = alvo.y - y, d = Math.hypot(dx, dy), st = 600 / 15; // teleporta rápido (é só teste)
    if (d > st) { x += dx / d * st; y += dy / d * st; }
    else {
      x = alvo.x; y = alvo.y;
      if (alvo.entrar) send({ t: 'pega', acao: 'entrar', x, y });
      if (alvo.chegar) { send({ t: 'pega', acao: 'chegar', x, y }); chegou = true; }
      alvo = null;
    }
  }
  send({ t: 'estado', s: Math.round(s * 1000) / 1000, x, y, a: 0, vx: 0, vy: 0, b: 0, g: 0, v: 'moto' });
}, 1000 / 15);
setTimeout(() => { log('tchau'); ws.close(); process.exit(0); }, +dur * 1000);
