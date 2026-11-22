'use strict';
// Conexão com a sala do multiplayer: WebSocket, reconexão, ping e atraso simulado.
// Não sabe nada do jogo: entrega cada mensagem recebida para Net.onMsg e avisa mudanças em Net.onStatus.
//
// Parâmetros de URL úteis para testar:
//   ?servidor=ws://host:porta  usa outro servidor
//   ?lag=200                   soma 200 ms de ida e volta (metade em cada sentido)
//   ?jitter=60                 soma até 60 ms aleatórios por mensagem, sem embaralhar a ordem

const NET_PROTO = 4; // igual ao PROTO de server/src/sala.js
// Endereço do servidor publicado ("npm run deploy" na pasta server/).
// Vazio = multiplayer escondido no site publicado; em localhost usa o servidor local.
const NET_SERVER_PROD = 'wss://bandeira2-servidor.gabrielsouto.workers.dev';
const NET_RETRY = [0.5, 1, 2, 4, 8]; // segundos entre tentativas de reconexão

const Net = {
  ws: null, sala: null, hello: null,
  status: 'off',            // off | conectando | on | erro
  persist: false,           // depois do primeiro "bemvindo", reconecta sozinho se cair
  tries: 0, retryTimer: 0, pingTimer: 0,
  ping: 0,                  // ida e volta em ms (já com o lag simulado)
  lagOut: 0, lagIn: 0, jitter: 0, lastOut: 0, lastIn: 0,
  onMsg: null, onStatus: null,

  params() { return new URLSearchParams(location.search); },

  serverUrl() {
    const q = this.params().get('servidor');
    if (q) return q.replace(/\/+$/, '');
    if (location.protocol === 'file:') return 'ws://127.0.0.1:8787';
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return 'ws://' + location.hostname + ':8787';
    return NET_SERVER_PROD;
  },

  available() { return !!this.serverUrl() && typeof WebSocket !== 'undefined'; },

  // id aleatório por aba: cada aba é um jogador, e recarregar a página mantém o mesmo id
  tabId() {
    let id = null;
    try { id = sessionStorage.getItem('bandeira3-aba'); } catch (e) { /* storage bloqueado */ }
    if (!id || !/^[a-z0-9]{8,32}$/.test(id)) {
      id = '';
      for (let k = 0; k < 16; k++) id += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)];
      try { sessionStorage.setItem('bandeira3-aba', id); } catch (e) { /* idem */ }
    }
    return id;
  },

  connect(sala, apelido, hash) {
    const p = this.params();
    const lag = clamp(+p.get('lag') || 0, 0, 2000);
    this.lagOut = lag / 2; this.lagIn = lag / 2;
    this.jitter = clamp(+p.get('jitter') || 0, 0, 1000);
    this.sala = sala;
    this.hello = { t: 'entrar', v: NET_PROTO, id: this.tabId(), apelido, hash };
    this.persist = false;
    this.tries = 0;
    this.open();
  },

  open() {
    clearTimeout(this.retryTimer);
    this.setStatus('conectando');
    let ws;
    try { ws = new WebSocket(this.serverUrl() + '/sala/' + this.sala); } catch (e) { this.dropped(null); return; }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.send(this.hello);
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
    };
    ws.onmessage = (e) => { if (this.ws === ws) this.later(this.lagIn, 'lastIn', () => this.receive(e.data)); };
    ws.onclose = (e) => { if (this.ws === ws) this.dropped(e.code); };
  },

  receive(data) {
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (m.t === 'bemvindo') { this.persist = true; this.tries = 0; this.setStatus('on'); }
    if (m.t === 'pong') {
      const rtt = performance.now() - m.c;
      this.ping = this.ping ? this.ping + (rtt - this.ping) * 0.3 : rtt;
      return;
    }
    if (this.onMsg) this.onMsg(m);
  },

  // a conexão caiu: 4000/4001 são definitivos (outra aba assumiu ou o servidor recusou)
  dropped(code) {
    this.ws = null;
    clearInterval(this.pingTimer);
    if (code === 4000) { this.fail('substituido'); return; }
    if (code === 4001 || this.status === 'erro') { if (this.status !== 'erro') this.fail('recusado'); return; }
    if (!this.persist) { this.fail('sem-servidor'); return; }
    const wait = NET_RETRY[Math.min(this.tries, NET_RETRY.length - 1)];
    this.tries++;
    this.setStatus('conectando');
    this.retryTimer = setTimeout(() => this.open(), wait * 1000);
  },

  fail(motivo) {
    this.persist = false;
    this.setStatus('erro', motivo);
  },

  leave() {
    this.persist = false;
    clearTimeout(this.retryTimer); clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws) try { ws.close(1000, 'saiu'); } catch (e) { /* já fechado */ }
    this.setStatus('off');
  },

  send(msg) {
    const ws = this.ws;
    if (!ws) return;
    const s = JSON.stringify(msg);
    this.later(this.lagOut, 'lastOut', () => { if (ws.readyState === 1) ws.send(s); });
  },

  // atraso simulado: cada mensagem sai depois da anterior (como no TCP de verdade)
  later(lag, key, fn) {
    if (!lag && !this.jitter) { fn(); return; }
    const now = performance.now();
    const at = Math.max(this[key], now + lag + Math.random() * this.jitter);
    this[key] = at;
    setTimeout(fn, at - now);
  },

  setStatus(s, motivo) {
    if (this.status === s && !motivo) return;
    this.status = s;
    if (this.onStatus) this.onStatus(s, motivo);
  },
};
