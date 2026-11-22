'use strict';
// Multiplayer, lado do jogo: tela de entrada na sala, rivais na tela, interpolação e colisão entre jogadores,
// fases do turno (espera, contagem, turno, prorrogação, fim), caixa da sala, ranking e revanche.
// A conexão fica em net.js. Fora de uma sala (GAME.mode === 'solo') nada daqui roda.
//
// O dinheiro do multiplayer mora na sala: S.money é só um espelho do saldo que ela manda ("caixa").
// Compras no posto e na oficina são pedidos que esperam a resposta da sala.

const PLAYER_COLORS = ['#ff4fd8', '#00d9ff', '#b4ff39', '#9d7bff']; // fora da paleta do trânsito
const SALA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';             // sem 0, O, 1, I
const INTERP_DELAY = 0.12; // s: rivais são desenhados no passado, entre dois pontos já recebidos
const EXTRAP_MAX = 0.15;   // s: se a rede engasgar, segue em linha reta por até isso e depois para
const SNAP_DIST = 64;      // px: salto maior que isso (guincho) teleporta em vez de deslizar
const AWAY_AFTER = 5;      // s sem notícias de um rival = ausente (fantasma)
const SEND_EVERY = 1 / 15; // s entre envios do próprio estado
const SPAWN_GHOST = 3;     // s de fantasma ao entrar na sala ou usar o guincho
const TURN_START_MONEY = 150; // R$ de cada um no começo do turno (REGRAS.SALDO_INICIAL do servidor)
const BUY_TIMEOUT = 5;    // s esperando a sala responder uma compra

const CODE_HINT = 'Os códigos de sala têm 4 caracteres e não usam I, O, 0 nem 1.';

const NET_ERRORS = {
  cidade: 'Sua versão do jogo gera uma cidade diferente da sala. Recarregue a página.',
  versao: 'Sua versão do jogo é diferente da do servidor. Recarregue a página.',
  cheia: 'A sala está cheia (máximo de 4 jogadores).',
  id: 'Erro de identificação. Recarregue a página.',
  recusado: 'O servidor recusou a entrada na sala.',
  'sem-servidor': 'Não consegui falar com o servidor da sala. Tente de novo daqui a pouco.',
  substituido: 'Você abriu esta sala em outra aba, então esta aba saiu dela.',
  andamento: 'O turno desta sala já começou. Dá pra entrar quando ele acabar.',
};
const BUY_ERRORS = {
  fiado: 'Passou do limite do fiado. Faça umas corridas antes.',
  teto: 'A sala recusou o valor dessa compra.',
  fase: 'Fora do turno não tem compra.',
};
const PHASE_LABEL = { espera: 'ESPERANDO', contagem: 'PREPARAR', turno: 'TURNO', prorrogacao: 'PRORROGAÇÃO', fim: 'FIM DO TURNO' };

const Multi = {
  active: false, sala: null, urlSala: null, me: null, myColor: 0, myName: '', myGanho: 0, myCorridas: 0,
  rivals: new Map(), sprites: null, el: null,
  sendAcc: 0, infoT: 0, lastInfo: '', lastPanel: '', ghostT: 0, lostToast: false,
  // turno (vem da sala)
  fase: 'espera', faseEnd: 0, dur: 720, dono: null, turnoVisto: null, ranking: null,
  mySaldo: TURN_START_MONEY, myNota: null, buyPending: null, buyRef: 0, owed: [], warnedMin: false, goT: 0, lastCount: null,

  // ---------- tela inicial ----------
  initTitle() {
    this.el = { box: $('multibox'), nick: $('nick'), code: $('code'), coderow: $('coderow'), create: $('createbtn'),
      join: $('joinbtn'), msg: $('multimsg'), solo: $('startbtn'), info: $('netinfo'), panel: $('roompanel') };
    this.el.panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      b.blur(); // senão o Enter seguinte "clica" de novo
      if (b.dataset.act === 'start') this.start(); else if (b.dataset.act === 'ranking') this.showRanking();
      else if (b.dataset.act === 'link') this.copyLink();
    });
    const rawSala = new URLSearchParams(location.search).get('sala') || '';
    const urlSala = this.normCode(rawSala);
    if (!Net.available()) {
      if (rawSala) {
        $('multiform').classList.add('hidden');
        this.say('O multiplayer ainda não está disponível nesta versão. Dá pra jogar sozinho.', true);
      }
      return;
    }
    this.el.box.classList.remove('hidden');
    if (rawSala && urlSala.length !== 4) this.say(`O código "${rawSala.slice(0, 8)}" do link não existe. ${CODE_HINT}`, true);
    try { this.el.nick.value = localStorage.getItem('bandeira3-apelido') || ''; } catch (e) { /* storage bloqueado */ }
    if (urlSala.length === 4) {
      this.urlSala = urlSala;
      this.el.code.value = urlSala;
      this.el.coderow.classList.add('hidden');
      this.el.create.classList.add('hidden');
      this.el.box.open = true;
      this.el.solo.before(this.el.box);
      this.el.box.classList.add('invite');
      this.el.join.textContent = 'Entrar na sala ' + urlSala;
      this.el.join.classList.remove('ghost');
      this.el.solo.textContent = 'Jogar sozinho';
      this.el.solo.classList.add('ghost');
    }
    this.el.create.addEventListener('click', () => this.join(this.newCode()));
    this.el.join.addEventListener('click', () => this.join(this.el.code.value));
    this.el.code.addEventListener('input', () => {
      const raw = this.el.code.value.toUpperCase(), clean = this.normCode(raw);
      if (raw.replace(/[^A-Z0-9]/g, '') !== clean) this.say(CODE_HINT, true);
      this.el.code.value = clean;
    });
    for (const inp of [this.el.nick, this.el.code]) {
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (this.urlSala || this.el.code.value.length === 4) this.join(this.el.code.value);
        else this.el.code.focus();
      });
    }
  },

  // tecla na tela inicial fora dos campos de texto: com ?sala= no link, Enter entra na sala
  titleKey(code) {
    if (!this.urlSala || code !== 'Enter') return false;
    this.join(this.urlSala);
    return true;
  },

  normCode(s) {
    return String(s).toUpperCase().split('').filter((c) => SALA_CHARS.includes(c)).join('').slice(0, 4);
  },

  newCode() {
    let s = '';
    for (let k = 0; k < 4; k++) s += SALA_CHARS[Math.floor(Math.random() * SALA_CHARS.length)];
    return s;
  },

  say(text, bad) {
    this.el.msg.textContent = text;
    this.el.msg.classList.toggle('bad', !!bad);
    this.el.box.classList.remove('hidden');
    this.el.box.open = true;
  },

  setBusy(b) {
    for (const k of ['create', 'join', 'solo']) this.el[k].disabled = b;
  },

  join(code) {
    if (this.active || Net.status === 'conectando') return;
    code = this.normCode(code);
    if (code.length !== 4) { this.say('O código da sala tem 4 letras ou números.', true); this.el.code.focus(); return; }
    const apelido = this.el.nick.value.trim();
    if (apelido.length < 2) { this.say('Escolha um apelido com pelo menos 2 letras.', true); this.el.nick.focus(); return; }
    Sfx.init(); // desbloqueia o áudio no gesto, antes da resposta do WebSocket
    try { localStorage.setItem('bandeira3-apelido', apelido); } catch (e) { /* storage bloqueado */ }
    this.sala = code;
    const u = new URL(location.href);
    u.searchParams.set('sala', code);
    history.replaceState(null, '', u);
    this.refusalText = null;
    this.say('Conectando à sala ' + code + '…');
    this.setBusy(true);
    Net.onMsg = (m) => this.onMsg(m);
    Net.onStatus = (s, motivo) => this.onStatus(s, motivo);
    Net.connect(code, apelido, cityHash(city));
  },

  leave() {
    Net.leave();
    const u = new URL(location.href);
    u.searchParams.delete('sala');
    location.href = u.toString();
  },

  // ---------- rede ----------
  onStatus(s, motivo) {
    if (s === 'erro') {
      // a sala manda o motivo ("erro") antes de fechar; o fechamento só diz "recusado"
      const text = (motivo === 'recusado' && this.refusalText) || NET_ERRORS[motivo] || NET_ERRORS.recusado;
      if (!this.active) { this.say(text, true); this.setBusy(false); return; }
      toast(text, 'bad');
      this.rivals.clear();
      RidesNet.onCalls([]);
    } else if (s === 'conectando' && this.active && !this.lostToast) {
      this.lostToast = true;
      toast('Conexão com a sala perdida. Reconectando…', 'warn');
    } else if (s === 'on' && this.lostToast) {
      this.lostToast = false;
      toast('Reconectado à sala!', 'good');
    }
    this.updateInfo();
  },

  onMsg(m) {
    switch (m.t) {
      case 'bemvindo': this.welcome(m); break;
      case 'entrou':
        if (m.j.id !== this.me && !this.rivals.has(m.j.id)) {
          this.rivals.set(m.j.id, this.newRival(m.j));
          toast(`${m.j.apelido} entrou na sala.`, 'good');
        }
        break;
      case 'saiu': {
        const r = this.rivals.get(m.id);
        if (r) { this.rivals.delete(m.id); toast(`${r.apelido} saiu da sala.`); }
        break;
      }
      case 'e': this.sample(m); break;
      case 'chamadas': RidesNet.onCalls(m.lista); break;
      case 'pega': Pega.onMsg(m); break;
      case 'pegaFim': Pega.onEnd(m); break;
      case 'dinamica': RidesNet.onSurges(m.lista); break;
      case 'embarque': RidesNet.onBoard(m, this.nameOf(m.jogador)); break;
      case 'recusado':
        if (m.acao === 'gastar') this.onBuyRefused(m);
        else if (m.acao === 'pega') Pega.onRefused(m);
        else if (m.acao === 'comecar') toast(m.motivo === 'dono' ? 'Só quem criou a sala pode começar.' : 'Agora não dá pra começar.', 'warn');
        else RidesNet.onRefused(m);
        break;
      case 'pago': {
        const r = this.rivals.get(m.jogador);
        if (r) toast(`${r.apelido} recebeu ${fmtMoney(m.pay + m.tip)} numa corrida.`);
        RidesNet.onPaid(m);
        break;
      }
      case 'caixa': this.onCaixa(m); break;
      case 'gasto': this.onBought(m); break;
      case 'fase': this.onFase(m); break;
      case 'fim': this.ranking = m.ranking; this.showRanking(); break;
      case 'erro': // chega depois do aviso genérico de recusa e traz o motivo certo
        if (!this.active) {
          let text = NET_ERRORS[m.motivo] || NET_ERRORS.recusado;
          if (m.motivo === 'andamento' && m.resta > 0) text += m.resta < 60 ? ' Falta menos de 1 min.' : ` Faltam uns ${Math.ceil(m.resta / 60)} min.`;
          this.refusalText = text;
          this.say(text, true); this.setBusy(false);
        }
        break;
    }
    this.updateInfo();
  },

  welcome(m) {
    this.me = m.voce;
    const old = this.rivals;
    this.rivals = new Map();
    for (const j of m.jogadores) {
      if (j.id === this.me) {
        this.myColor = j.cor; this.myName = j.apelido;
        this.onCaixa(Object.assign({ jogador: this.me }, j));
        continue;
      }
      const r = old.get(j.id);
      this.rivals.set(j.id, r ? Object.assign(r, { apelido: j.apelido, cor: j.cor }) : this.newRival(j));
      this.onCaixa(Object.assign({ jogador: j.id }, j));
    }
    this.ranking = m.ranking;
    const first = !this.active;
    if (first) { this.turnoVisto = m.fase.turno; this.begin(); }
    this.onFase(m.fase);
    RidesNet.onWelcome(m);
    Pega.onMsg({ pega: m.pega || null });
    for (const msg of this.owed.splice(0)) Net.send(msg); // guincho ou multa de quando a conexão caiu
    if (first && this.fase === 'fim' && this.ranking) this.showRanking();
  },

  nameOf(id) {
    if (id === this.me) return this.myName;
    const r = this.rivals.get(id);
    return r ? r.apelido : 'Outro motorista';
  },

  begin() {
    this.active = true;
    GAME.mode = 'multi';
    S = defaultSave(); // estado só desta sessão: o save do solo não é lido nem gravado
    if (Veh.cur.soloOnly) { // euComida e autoescola ainda não existem na sala (a escolha guardada não muda)
      const was = Veh.cur.name, k = Veh.twoWheel() ? 'moto' : 'uber';
      Veh.set(k, false); applyVehicle();
      setTimeout(() => toast(`${was} ainda é só no solo. Na sala você vai de ${VEHICLES[k].name}.`, 'warn'), 1500);
    }
    S.money = this.mySaldo; S.earned = this.myGanho; S.rides = this.myCorridas; // pode estar voltando no meio do turno
    RidesNet.install();
    placeCarAt(city.places[this.myColor % city.places.length]); // cada cor nasce num lugar diferente
    cam.x = player.x; cam.y = player.y;
    this.ghostT = SPAWN_GHOST;
    this.el.info.classList.remove('hidden');
    this.setBusy(false);
    startGame();
    toast(`Sala ${this.sala}: mande o link da barra de endereço para os amigos.`, 'good');
  },

  // ---------- turno ----------
  isOwner() { return this.active && this.dono === this.me; },
  frozen() { return this.active && (this.fase === 'contagem' || Pega.frozen()); }, // carro parado no 3-2-1 (turno ou pega)
  moneyLive() { return this.active && (this.fase === 'turno' || this.fase === 'prorrogacao'); },
  phaseLeft() { return Math.max(0, this.faseEnd - performance.now() / 1000); },

  // mensagem "fase" da sala: { fase, resta, dur, dono, turno }
  onFase(f) {
    if (!f) return;
    const prev = this.fase;
    if (f.turno !== this.turnoVisto) { this.turnoVisto = f.turno; this.resetForTurn(); } // revanche ou turno novo
    this.fase = f.fase; this.dur = f.dur; this.dono = f.dono;
    this.faseEnd = performance.now() / 1000 + f.resta - Net.ping / 2000;
    if (prev === this.fase) return;
    if (this.fase === 'turno' && prev === 'contagem') {
      this.goT = 1.2; this.warnedMin = false;
      Sfx.tone(880, 0.3, 'square', 0.06);
      toast('Valendo! As chamadas já estão no celular.', 'good');
    } else if (this.fase === 'prorrogacao') {
      toast(Rides.ride ? 'Deu 19:00! Você tem 30 s para entregar o passageiro.' : 'Deu 19:00! Esperando quem ainda está com passageiro.', 'warn');
    } else if (this.fase === 'fim') {
      const r = Rides.ride;
      if (r && !(Rides.state === 'dropping' && r.paid)) {
        toast(`O turno acabou e ${r.name} desceu sem pagar.`, 'bad');
        RidesNet.resetForTurn();
      }
    }
  },

  // começo de um turno: todos largam iguais, cada cor no seu ponto de partida
  resetForTurn() {
    if (mode === 'menu') closeModal();
    S = defaultSave();
    S.money = TURN_START_MONEY;
    Care.resetState();
    Police.reset();
    Pega.p = null;
    RidesNet.resetForTurn();
    this.buyPending = null;
    this.ranking = null;
    placeCarAt(city.places[this.myColor % city.places.length]);
    cam.x = player.x; cam.y = player.y;
    this.ghostT = SPAWN_GHOST + 3; // fantasma na contagem e nos primeiros segundos
    this.lastCount = null;
  },

  // relógio do jogo a partir do tempo da sala, contagem e avisos
  stepPhase(now) {
    const left = this.faseEnd - now;
    if (this.fase === 'turno') {
      gameMin = 7 * 60 + clamp(1 - left / this.dur, 0, 1) * 720; // 07:00 às 19:00, seja qual for a duração
      if (!this.warnedMin && left < 60 && this.dur > 90) { this.warnedMin = true; toast('Falta 1 minuto para as 19:00!', 'warn'); }
    } else if (this.fase === 'prorrogacao') gameMin = 19 * 60 + clamp(30 - left, 0, 30);
    else if (this.fase === 'fim') gameMin = 19 * 60 + 30;
    else gameMin = 7 * 60;
    if (this.fase === 'contagem') {
      const n = Math.max(1, Math.ceil(left));
      if (n !== this.lastCount) { this.lastCount = n; Sfx.tone(440, 0.12, 'square', 0.05); }
    }
  },

  // dono: começa o turno (na espera) ou pede revanche (no fim). ?turno=2 = turno de 2 min (só no servidor local)
  start() {
    if (!this.active || (this.fase !== 'espera' && this.fase !== 'fim')) return;
    if (!this.isOwner()) { toast(`Quem começa é ${this.nameOf(this.dono)}, que está há mais tempo na sala.`, 'warn'); return; }
    const min = +Net.params().get('turno');
    Net.send({ t: 'comecar', ...(min > 0 ? { min } : {}) });
  },

  // teclas da sala durante o jogo (Enter começa ou pede revanche, R mostra o ranking)
  roomKey(code) {
    if (!this.active) return false;
    if (code === 'Enter' && (this.fase === 'espera' || this.fase === 'fim')) { this.start(); return true; }
    if (code === 'KeyR' && this.fase === 'fim' && this.ranking) { this.showRanking(); return true; }
    return false;
  },

  pauseItems() {
    const items = [];
    if (this.isOwner() && (this.fase === 'espera' || this.fase === 'fim'))
      items.push({ label: this.fase === 'fim' ? 'Revanche' : 'Começar o turno', run: () => { closeModal(); this.start(); } });
    if (this.fase === 'fim' && this.ranking) items.push({ label: 'Ver o ranking', run: () => this.showRanking() });
    return items;
  },

  copyLink() {
    navigator.clipboard.writeText(location.href).then(() => toast('Link copiado!', 'good'),
      () => toast('Não deu pra copiar. Use o endereço da barra do navegador.', 'warn'));
  },

  showRanking() {
    if (!this.ranking) return;
    const color = (id) => (id === this.me ? PLAYER_COLORS[this.myColor % PLAYER_COLORS.length]
      : this.rivals.has(id) ? PLAYER_COLORS[this.rivals.get(id).cor % PLAYER_COLORS.length] : '#666');
    const nota = (n) => (n == null ? '–' : '★ ' + n.toFixed(2).replace('.', ','));
    const rows = this.ranking.map((r, i) => `<tr class="${r.id === this.me ? 'me' : ''}"><td>${i + 1}º</td>` +
      `<td><i style="background:${color(r.id)}"></i>${esc(r.apelido)}</td><td class="${r.lucro < 0 ? 'neg' : 'pos'}">${fmtMoney(r.lucro)}</td>` +
      `<td>${r.corridas}</td><td>${fmtMoney(r.ganho)}</td><td>${fmtMoney(r.gasto)}</td><td>${nota(r.nota)}</td></tr>`).join('');
    const table = '<table class="rank"><tr><th></th><th>Motorista</th><th>Lucro</th><th>Corr.</th><th>Ganhos</th><th>Gastos</th><th>Nota</th></tr>' +
      rows + '</table>';
    const items = [];
    if (this.isOwner() && this.fase === 'fim') items.push({ label: 'Revanche', run: () => { closeModal(); this.start(); } });
    items.push({ label: 'Continuar dirigindo', run: closeModal });
    items.push({ label: 'Sair da sala', run: () => this.leave() });
    const wait = this.isOwner() ? '' : `<div class="rank-wait">${esc(this.nameOf(this.dono))} pode pedir revanche.</div>`;
    showModal(`FIM DO TURNO · SALA ${this.sala}`, table + wait, items, 'Fechar');
    Sfx.cash();
  },

  // ---------- caixa ----------
  // saldo de um jogador mandado pela sala (a cada corrida, gasto ou taxa)
  onCaixa(m) {
    const c = { saldo: m.saldo ?? TURN_START_MONEY, ganho: m.ganho || 0, gasto: m.gasto || 0, corridas: m.corridas || 0, nota: m.nota ?? null };
    if (m.jogador === this.me) {
      this.mySaldo = c.saldo; this.myGanho = c.ganho; this.myCorridas = c.corridas; this.myNota = c.nota;
      if (this.active) { S.money = c.saldo; S.earned = c.ganho; S.rides = c.corridas; }
    } else {
      const r = this.rivals.get(m.jogador);
      if (r) Object.assign(r, c);
    }
  },

  // compra no posto ou na oficina: só vale quando a sala aceita
  buy(kinds, cost, onOk) {
    if (this.buyPending) return;
    if (Net.status !== 'on') { toast('Sem conexão com a sala. Espere reconectar.', 'warn'); return; }
    const ref = ++this.buyRef;
    this.buyPending = { ref, onOk, at: performance.now() / 1000 };
    Net.send({ t: 'gastar', ref, itens: kinds, valor: cost });
  },

  onBought(m) {
    const p = this.buyPending;
    if (!p || p.ref !== m.id) return;
    this.buyPending = null;
    this.mySaldo = S.money = m.saldo;
    p.onOk(mode === 'menu'); // pago: o efeito vale mesmo que o menu já tenha fechado
  },

  onBuyRefused(m) {
    if (m.saldo != null) this.mySaldo = S.money = m.saldo;
    const p = this.buyPending;
    if (!p || p.ref !== m.id) return; // guincho e multa recusados (fora do turno): nada a avisar
    this.buyPending = null;
    toast(BUY_ERRORS[m.motivo] || 'A sala recusou a compra.', 'warn');
  },

  // guincho e multa: a sala desconta; sem conexão, guarda para mandar quando voltar
  charge(kind, value) {
    if (!this.moneyLive()) return;
    const msg = { t: 'gastar', ref: 'c' + (++this.buyRef), itens: [kind], valor: value };
    if (Net.status === 'on') Net.send(msg); else this.owed.push(msg);
  },

  newRival(j) {
    return { id: j.id, apelido: j.apelido, cor: j.cor, saldo: j.saldo ?? TURN_START_MONEY, ganho: j.ganho || 0, gasto: j.gasto || 0,
      corridas: j.corridas || 0, nota: j.nota ?? null, buf: [], off: null, lastRecv: -1e9,
      x: 0, y: 0, a: 0, speed: 0, b: 0, g: 1, seen: false, away: false };
  },

  // guarda um estado recebido de um rival. "s" é o relógio do rival na hora do envio.
  sample(m) {
    const r = this.rivals.get(m.id);
    if (!r) return;
    const now = performance.now() / 1000;
    const buf = r.buf, last = buf[buf.length - 1];
    if (last && m.s <= last.s) {
      if (m.s > last.s - 1) return; // repetido ou atrasado: ignora
      buf.length = 0; r.off = null; // o relógio dele recomeçou (recarregou a página)
    }
    // off = quanto o relógio dele está "atrás" do nosso, já com a demora da rede.
    // Pega o menor atraso visto e relaxa devagar, para acompanhar mudanças de rota.
    const d = now - m.s;
    r.off = r.off === null || d < r.off ? d : r.off + (d - r.off) * 0.01;
    buf.push({ s: m.s, x: m.x, y: m.y, a: m.a, vx: m.vx, vy: m.vy, b: m.b, g: m.g });
    if (buf.length > 40) buf.shift();
    r.lastRecv = now;
    if (VEHICLES[m.v]) r.v = m.v;
  },

  // ---------- a cada quadro ----------
  update(dt) {
    if (!this.active) return;
    this.ghostT = Math.max(0, this.ghostT - dt);
    this.goT = Math.max(0, this.goT - dt);
    const now = performance.now() / 1000;
    this.stepPhase(now);
    if (this.buyPending && now - this.buyPending.at > BUY_TIMEOUT) {
      this.buyPending = null;
      toast('A sala não respondeu a compra. Tente de novo.', 'warn');
    }
    for (const r of this.rivals.values()) this.interp(r, now);
    Pega.update(dt);

    this.sendAcc += dt;
    if (this.sendAcc >= SEND_EVERY) {
      this.sendAcc = Math.min(this.sendAcc - SEND_EVERY, SEND_EVERY);
      if (Net.status === 'on') {
        const r1 = (v) => Math.round(v * 10) / 10;
        Net.send({ t: 'estado', s: Math.round(now * 1000) / 1000, x: r1(player.x), y: r1(player.y),
          a: Math.round(player.a * 1000) / 1000, vx: r1(player.vx), vy: r1(player.vy),
          b: player.braking ? 1 : 0, g: this.ghostT > 0 ? 1 : 0, v: Veh.key });
      }
    }
    this.infoT -= dt;
    if (this.infoT <= 0) { this.infoT = 0.25; this.updateInfo(); }
  },

  // posição do rival em (agora − off − INTERP_DELAY), no relógio dele
  interp(r, now) {
    const buf = r.buf;
    r.away = now - r.lastRecv > AWAY_AFTER;
    if (!buf.length) { r.seen = false; return; }
    r.seen = true;
    const t = now - r.off - INTERP_DELAY;
    while (buf.length > 2 && buf[1].s <= t) buf.shift(); // descarta o que já passou, mas guarda um ponto antes de t
    const A = buf[0], B = buf[1];
    let x, y, a, vx, vy, src;
    if (!B || t >= B.s) {
      const P = B || A, k = clamp(t - P.s, 0, EXTRAP_MAX);
      x = P.x + P.vx * k; y = P.y + P.vy * k; a = P.a; vx = P.vx; vy = P.vy; src = P;
    } else if (t <= A.s) {
      x = A.x; y = A.y; a = A.a; vx = A.vx; vy = A.vy; src = A;
    } else {
      const u = (t - A.s) / (B.s - A.s);
      if (Math.hypot(B.x - A.x, B.y - A.y) > SNAP_DIST) {
        src = u < 0.5 ? A : B;
        x = src.x; y = src.y; a = src.a; vx = src.vx; vy = src.vy;
      } else {
        x = lerp(A.x, B.x, u); y = lerp(A.y, B.y, u); a = A.a + angDiff(A.a, B.a) * u;
        vx = lerp(A.vx, B.vx, u); vy = lerp(A.vy, B.vy, u); src = u < 0.5 ? A : B;
      }
    }
    r.x = x; r.y = y; r.a = a;
    r.speed = vx * Math.cos(a) + vy * Math.sin(a); // velocidade para frente (negativa de ré)
    r.b = src.b; r.g = src.g;
  },

  // colisão do próprio carro com os rivais; o rival não é empurrado (cada um cuida do seu carro)
  collide(car) {
    if (!this.active || this.ghostT > 0) return 0;
    const list = [];
    for (const r of this.rivals.values()) if (r.seen && !r.away && !r.g) list.push(r);
    return list.length ? collideCars(car, list, false, 1.1) : 0;
  },

  onTeleport() { if (this.active) this.ghostT = SPAWN_GHOST; },

  // ---------- desenho ----------
  // carro do rival na cor dele, com o formato do veículo que ele escolheu
  sprite(cor, v = 'uber') {
    if (!this.sprites) this.sprites = {};
    const k = cor + ':' + v;
    if (!this.sprites[k]) this.sprites[k] = makeCarSprites(PLAYER_COLORS[cor % PLAYER_COLORS.length], true, (VEHICLES[v] || VEHICLES.uber).art, (VEHICLES[v] || VEHICLES.uber).bag);
    return this.sprites[k];
  },

  drawCars() {
    if (!this.active) return;
    for (const r of this.rivals.values()) {
      if (!r.seen) continue;
      ctx.globalAlpha = r.g || r.away ? 0.45 : 1;
      drawCar(this.sprite(r.cor, r.v), r.x, r.y, r.a, r.b);
    }
    ctx.globalAlpha = 1;
  },

  // faróis dos rivais (noite)
  lightCars(list) {
    if (!this.active) return;
    for (const r of this.rivals.values()) if (r.seen) list.push({ x: r.x, y: r.y, a: r.a, front: 8, len: 80, k: 0.8 });
  },

  drawTags() {
    if (!this.active) return;
    for (const r of this.rivals.values()) {
      if (r.seen) world3D.worldText(r.apelido + (r.away ? ' (ausente)' : ''), r.x, r.y,
        r.away ? '#9aa3b5' : PLAYER_COLORS[r.cor % PLAYER_COLORS.length]);
    }
    const big = this.fase === 'contagem' ? String(Math.max(1, Math.ceil(this.phaseLeft()))) : this.goT > 0 ? 'VALENDO!' : Pega.bigText();
    if (big) world3D.announcement(big);
  },

  drawMinimap(g, s) {
    if (!this.active) return;
    RidesNet.drawMinimap(g, s);
    Pega.drawMinimap(g, s);
    for (const r of this.rivals.values()) {
      if (!r.seen) continue;
      const x = Math.round(r.x * s), y = Math.round(r.y * s);
      g.fillStyle = '#000'; g.fillRect(x - 3, y - 3, 6, 6);
      g.fillStyle = r.away ? '#666' : PLAYER_COLORS[r.cor % PLAYER_COLORS.length]; g.fillRect(x - 2, y - 2, 4, 4);
    }
  },

  // linha da sala no canto superior esquerdo: código, ping, fase com o tempo e o placar ao vivo (saldo)
  updateInfo() {
    if (!this.active) return;
    const st = Net.status;
    const net = st === 'on' ? `ping ${Math.round(Net.ping)} ms` : st === 'conectando' ? 'reconectando…' : 'desconectado';
    const dot = (cor, away) => `<i style="background:${away ? '#666' : PLAYER_COLORS[cor % PLAYER_COLORS.length]}"></i>`;
    const money = (v) => `<em class="${v < 0 ? 'neg' : ''}">${fmtMoney(v)}</em>`;
    const rows = [{ me: true, cor: this.myColor, nome: this.myName + ' (você)', saldo: this.mySaldo }];
    for (const r of this.rivals.values()) rows.push({ cor: r.cor, away: r.away, nome: r.apelido, saldo: r.saldo });
    const live = this.fase !== 'espera';
    if (live) rows.sort((a, b) => b.saldo - a.saldo);
    const list = rows.map((p) => `<span class="${p.away ? 'away' : ''}">${dot(p.cor, p.away)}${esc(p.nome)}${live ? money(p.saldo) : ''}</span>`).join('');
    const timed = this.fase === 'turno' || this.fase === 'prorrogacao';
    const phase = PHASE_LABEL[this.fase] + (timed ? ` · faltam ${mmss(this.phaseLeft())}` : '');
    const html = `<div class="ni-top">SALA ${this.sala} · <span class="${st === 'on' ? '' : 'bad'}">${net}</span></div>` +
      `<div class="ni-phase ${this.fase}">${phase}</div>${Pega.infoLine()}<div class="ni-list">${list}</div>`;
    if (html !== this.lastInfo) { this.el.info.innerHTML = html; this.lastInfo = html; }
    this.updatePanel();
  },

  // painel no meio da tela na espera e no fim: começar o turno, ranking, revanche
  updatePanel() {
    const f = this.fase, owner = this.isOwner(), dono = esc(this.nameOf(this.dono));
    let html = '';
    if (f === 'espera') {
      const n = 1 + this.rivals.size;
      html = `<div class="rp-title">SALA ${this.sala} · ${n} MOTORISTA${n > 1 ? 'S' : ''}</div>` +
        '<div class="rp-text">Turno das 07:00 às 19:00. Ganha quem tiver mais lucro no fim.<br>Até lá, dá pra dar umas voltas pela cidade.</div>' +
        (owner ? '' : `<div class="rp-text">Esperando ${dono} começar o turno…</div>`) +
        `<div class="rp-btns">${owner ? '<button data-act="start"><kbd>ENTER</kbd> COMEÇAR O TURNO</button>' : ''}` +
        '<button data-act="link" class="ghost">COPIAR O LINK</button></div>';
    } else if (f === 'fim') {
      html = '<div class="rp-title">TURNO ENCERRADO</div>' +
        (owner ? '' : `<div class="rp-text">Esperando ${dono} pedir revanche…</div>`) +
        `<div class="rp-btns">${owner ? '<button data-act="start"><kbd>ENTER</kbd> REVANCHE</button>' : ''}` +
        '<button data-act="ranking" class="ghost"><kbd>R</kbd> RANKING</button></div>';
    }
    if (html !== this.lastPanel) { this.el.panel.innerHTML = html; this.el.panel.classList.toggle('hidden', !html); this.lastPanel = html; }
  },
};
