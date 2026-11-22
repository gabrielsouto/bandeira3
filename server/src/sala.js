// Uma sala do multiplayer (um Durable Object por código de sala).
//
// Cuida da parte de rede: quem está conectado, repasse das posições dos carros e envio de mensagens.
// As regras do jogo (chamadas, dinâmica, embarque, pagamento) ficam em regras.js, que não sabe de rede.
//
// Os dados de cada conexão ficam presos ao próprio WebSocket (serializeAttachment), e o estado das
// regras fica no armazenamento da sala. Se a Cloudflare hibernar a sala, nada se perde.
import { DurableObject } from 'cloudflare:workers';
import { HASH_CIDADE, VEHICLES } from './compartilhado.js';

const VEICULOS = Object.keys(VEHICLES);
import * as regras from './regras.js';

export const PROTO = 4;      // versão do protocolo; o cliente manda a dele em "entrar"
const MAX_JOGADORES = 4;
const NUM_CORES = 4;
const MAX_MSG = 1000;        // bytes; mensagem maior é ignorada
const LIMPA_SALA_VAZIA = 10 * 60 * 1000; // ms: sala vazia por mais que isso é apagada

// Códigos de fechamento (4000-4999 são livres para a aplicação). O cliente não reconecta nesses.
export const FECHA = { SUBSTITUIDO: 4000, RECUSADO: 4001 };

export function limparApelido(s) {
  s = String(s || '').normalize('NFC').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 12).trim();
  return s.length >= 2 ? s : 'Motorista';
}

function apelidoUnico(base, usados) {
  if (!usados.includes(base)) return base;
  for (let n = 2; ; n++) {
    const s = base.slice(0, 10) + ' ' + n;
    if (!usados.includes(s)) return s;
  }
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);

export class Sala extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.estado = null;          // estado das regras (regras.js)
    this.alarmeEm = 0;           // fim de fase já agendado no alarme (ms)
    this.pos = new Map();        // id -> última posição informada do carro (só em memória)
    ctx.blockConcurrencyWhile(async () => { this.estado = (await ctx.storage.get('estado')) || null; });
  }

  agora() { return Date.now() / 1000; }

  get regras() {
    if (!this.estado) this.estado = regras.novoEstado(this.agora(), Math.random);
    return this.estado;
  }

  salvar() { this.ctx.storage.put('estado', this.estado); }

  async fetch(req) {
    const [cliente, servidor] = Object.values(new WebSocketPair());
    // servidor rodando na própria máquina (wrangler dev): aceita turnos curtos para testar
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(req.url).hostname);
    this.ctx.acceptWebSocket(servidor, local ? ['local'] : []);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  // jogadores já identificados (que mandaram "entrar"), menos o socket "exceto"
  jogadores(exceto) {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exceto) continue;
      const j = ws.deserializeAttachment();
      if (j) out.push({ ws, j });
    }
    return out;
  }

  enviar(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (e) { /* conexão já caiu */ } }

  espalhar(msg, exceto) {
    const s = JSON.stringify(msg);
    for (const { ws } of this.jogadores(exceto)) { try { ws.send(s); } catch (e) { /* idem */ } }
  }

  // entrega os eventos devolvidos pelas regras e guarda o estado se algo mudou
  despachar(eventos) {
    if (!eventos.length) return;
    for (const ev of eventos) {
      if (ev.todos) this.espalhar(ev.todos);
      else for (const { ws, j } of this.jogadores()) if (j.id === ev.para) this.enviar(ws, ev.msg);
      if (ev.todos && ev.todos.t === 'fim') this.registrarFim(ev.todos.ranking);
    }
    this.salvar();
    this.agendar();
  }

  // a fase vira sozinha na hora certa, mesmo que ninguém mande mensagem (abas em segundo plano)
  agendar() {
    const fim = this.estado && this.estado.fimFase ? Math.ceil(this.estado.fimFase * 1000) + 50 : 0;
    if (!fim || fim === this.alarmeEm || !this.jogadores().length) return;
    this.alarmeEm = fim;
    this.ctx.storage.setAlarm(fim);
  }

  // log do fim do turno (npx wrangler tail): ranking e conferência com a soma do livro-caixa
  registrarFim(ranking) {
    const soma = regras.conferirLivro(this.regras);
    const bate = ranking.every((r) => Math.abs((soma[r.id] ?? 0) - r.saldo) < 0.005);
    console.log(`[fim do turno ${this.regras.turnos}] livro ${bate ? 'confere' : 'NÃO CONFERE'} · ` +
      ranking.map((r) => `${r.apelido}: lucro ${r.lucro} (saldo ${r.saldo}, livro ${soma[r.id]})`).join(' · '));
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MAX_MSG) return;
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const eu = ws.deserializeAttachment();

    if (!eu) { if (m.t === 'entrar') this.entrar(ws, m); return; }

    // o relógio da sala anda a cada mensagem (chegam ~15 por segundo por jogador); sem jogadores, nada precisa andar
    this.despachar(regras.tick(this.regras, this.agora(), Math.random));

    if (m.t === 'estado') {
      const { s, x, y, a, vx, vy } = m;
      if (![s, x, y, a, vx, vy].every(num)) return;
      this.pos.set(eu.id, { x, y });
      const v = VEICULOS.includes(m.v) ? m.v : 'uber';
      this.espalhar({ t: 'e', id: eu.id, s, x, y, a, vx, vy, b: m.b ? 1 : 0, g: m.g ? 1 : 0, v }, ws);
    } else if (m.t === 'ping') {
      this.enviar(ws, { t: 'pong', c: num(m.c) ? m.c : 0 });
    } else if (m.t === 'embarcar' || m.t === 'entregar' || m.t === 'cancelar' || m.t === 'gastar' || m.t === 'pega') {
      this.despachar(regras.mensagem(this.regras, eu.id, m, this.agora(), Math.random, this.pos.get(eu.id) || null));
    } else if (m.t === 'comecar') {
      // "min" (turno curto) só vale com o servidor rodando localmente
      const local = this.ctx.getTags(ws).includes('local');
      const dur = local && num(m.min) ? m.min * 60 : null;
      this.despachar(regras.comecar(this.regras, eu.id, this.agora(), dur));
    }
  }

  entrar(ws, m) {
    const recusar = (motivo, extra) => {
      this.enviar(ws, { t: 'erro', motivo, ...extra });
      try { ws.close(FECHA.RECUSADO, motivo); } catch (e) { /* já fechado */ }
    };
    if (m.v !== PROTO) return recusar('versao');
    const id = String(m.id || '');
    if (!/^[a-z0-9]{8,32}$/.test(id)) return recusar('id');
    if (String(m.hash || '') !== HASH_CIDADE) return recusar('cidade');

    const agora = this.agora(), e = this.regras;
    this.despachar(regras.tick(e, agora, Math.random)); // a fase pode ter acabado enquanto a sala estava vazia
    const barrado = regras.podeEntrar(e, id);
    if (barrado) return recusar(barrado, { resta: regras.msgFase(e, agora).resta });

    const outros = this.jogadores(ws);
    const velho = outros.find((o) => o.j.id === id);          // mesma aba reconectando
    const resto = outros.filter((o) => o.j.id !== id);
    if (resto.length >= MAX_JOGADORES) return recusar('cheia');

    const cor = velho ? velho.j.cor : [...Array(NUM_CORES).keys()].find((c) => !resto.some((o) => o.j.cor === c));
    const apelido = velho ? velho.j.apelido : apelidoUnico(limparApelido(m.apelido), resto.map((o) => o.j.apelido));
    const j = { id, apelido, cor };

    if (velho) {
      // a conexão antiga é descartada sem avisar "saiu" para os outros
      velho.ws.serializeAttachment(null);
      try { velho.ws.close(FECHA.SUBSTITUIDO, 'substituido'); } catch (e) { /* já fechado */ }
    }
    ws.serializeAttachment(j);

    // quem consta nas regras mas não tem conexão (a sala reiniciou) passa a contar como fora
    const ligados = new Set([id, ...resto.map((o) => o.j.id)]);
    for (const k in e.jogadores) if (!ligados.has(k) && e.jogadores[k].fora == null) regras.sair(e, k, agora);
    const eventos = regras.entrar(e, id, agora, Math.random, apelido);

    const v = regras.visao(e, id, agora);
    const comPlacar = (x) => ({ id: x.id, apelido: x.apelido, cor: x.cor, ...v.placar[x.id] });
    this.enviar(ws, { t: 'bemvindo', voce: id, jogadores: [j, ...resto.map((o) => o.j)].map(comPlacar),
      chamadas: v.chamadas, dinamicas: v.dinamicas, corrida: v.corrida, fase: v.fase, ranking: v.ranking, pega: v.pega });
    if (!velho) this.espalhar({ t: 'entrou', j: comPlacar(j) }, ws);
    this.alarmeEm = 0;
    this.ctx.storage.deleteAlarm(); // cancela a limpeza da sala vazia; agendar() remarca o fim da fase
    this.despachar(eventos);
    this.salvar();
    this.agendar();
  }

  sair(ws) {
    const j = ws.deserializeAttachment();
    ws.serializeAttachment(null);
    if (!j) return;
    this.espalhar({ t: 'saiu', id: j.id }, ws);
    this.pos.delete(j.id);
    this.despachar(regras.sair(this.regras, j.id, this.agora()));
    if (!this.jogadores().length) { this.alarmeEm = 0; this.ctx.storage.setAlarm(Date.now() + LIMPA_SALA_VAZIA); }
  }

  // alarme: fim de uma fase (com gente na sala) ou sala vazia por um tempo (apaga tudo; o código pode ser usado de novo)
  async alarm() {
    if (this.jogadores().length) {
      this.alarmeEm = 0;
      this.regras.ultimoTick = 0; // o alarme sempre confere a fase, mesmo logo depois de outra mensagem
      this.despachar(regras.tick(this.regras, this.agora(), Math.random));
      this.agendar();
      return;
    }
    this.estado = null;
    await this.ctx.storage.deleteAll();
  }

  async webSocketClose(ws, code) {
    this.sair(ws);
    // close() só aceita 1000 ou 3000-4999; códigos como 1005/1006 viram 1000
    const c = code === 1000 || (code >= 3000 && code <= 4999) ? code : 1000;
    try { ws.close(c, 'tchau'); } catch (e) { /* já fechado */ }
  }

  async webSocketError(ws) { this.sair(ws); }
}
