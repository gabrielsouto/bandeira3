'use strict';
// Corridas no modo sala: as chamadas vêm do servidor, são as mesmas para todos e são disputadas.
// Leva quem parar ao lado do passageiro primeiro; o servidor decide e paga.
//
// Ao entrar numa sala, RidesNet.install() troca estes métodos do Rides: update, accept, decline,
// cancel, finish, chargeFee e drawWorld. O resto do Rides (viagem, nota, avisos) é o mesmo do solo.
// Chamadas só existem durante o turno; taxas de cancelamento são cobradas pela sala.
// Fora de uma sala nada daqui roda.

const RidesNet = {
  calls: [],          // chamadas abertas na sala; "expires" é contado aqui a cada quadro
  sel: null,          // id da chamada destacada no celular (null = a mais perto)
  pendingDrop: null,  // entrega esperando o pagamento (reenviada se a conexão cair)
  solo: null,         // métodos originais do Rides que ainda são usados

  install() {
    this.solo = { cancel: Rides.cancel, drawWorld: Rides.drawWorld };
    Object.assign(Rides, { update: this.update, accept: this.accept, decline: this.decline,
      cancel: this.cancel, finish: this.finish, drawWorld: this.drawWorld, chargeFee() { /* a sala cobra */ } });
    Rides.state = 'idle'; Rides.offer = null; Rides.ride = null; Rides.surges = [];
  },

  // começo de um turno: ninguém está com corrida
  resetForTurn() {
    this.calls = []; this.sel = null; this.pendingDrop = null;
    Rides.reset();
  },

  // ---------- métodos que substituem os do Rides (aqui "this" é o Rides) ----------
  update(dt, car) {
    this.hitCd -= dt;
    for (const s of this.surges) s.age += dt; // quem troca as áreas é o servidor
    for (const c of RidesNet.calls) c.expires -= dt;
    const r = this.ride;
    switch (this.state) {
      case 'toPickup':
        if (Math.hypot(car.x - r.pick.x, car.y - r.pick.y) < 30 && car.speed < 30) { this.state = 'boarding'; r.boardT = 0; }
        break;
      case 'boarding': {
        if (car.speed > 40) {
          this.state = 'toPickup'; r.paxX = r.pick.x; r.paxY = r.pick.y;
          toast('Calma! O passageiro ainda não entrou.', 'warn');
          break;
        }
        // parou ao lado: pede o passageiro à sala (uma vez; de novo só se a conexão caiu)
        if (!r.confirmed && !r.requested) {
          r.requested = true;
          Net.send({ t: 'embarcar', chamada: r.id, x: car.x, y: car.y, veiculo: Veh.key });
        }
        r.boardT += dt;
        const k = Math.min(1, r.boardT / 0.9);
        r.paxX = lerp(r.pick.x, car.x, k); r.paxY = lerp(r.pick.y, car.y, k);
        if (r.boardT >= 0.9 && r.confirmed) {
          this.state = 'onTrip'; r.t = 0;
          Sfx.door();
          toast(`${r.name} entrou. Siga a seta amarela até o destino!`);
        }
        break;
      }
      case 'onTrip':
        if (r.retryT > 0) { r.retryT -= dt; r.t += dt; break; } // entrega recusada há pouco: espera antes de tentar de novo
        this.stepTrip(dt, car);
        break;
      case 'dropping': {
        r.dropT += dt;
        const k = Math.min(1, r.dropT / 0.9);
        r.paxX = lerp(r.carX, r.drop.x, k); r.paxY = lerp(r.carY, r.drop.y, k);
        if (r.dropT >= 1.4 && r.paid) this.reset();
        break;
      }
    }
  },

  // E: ir buscar a chamada destacada (não reserva: outros podem chegar antes)
  accept() {
    if (this.state !== 'idle') return;
    if (Multi.fase !== 'turno') return;
    if (!this.canWork()) { toast('Com o carro assim não dá pra pegar corrida.', 'warn'); return; }
    const c = RidesNet.selected();
    if (!c) return;
    if (c.type === 'exec' && Veh.cur.noExec) { toast('Executivo não anda de moto. Escolha outra chamada (Q).', 'warn'); return; }
    if (Pega.mine() && Pega.p.fase !== 'inscricao') { toast('Termina o pega primeiro!', 'warn'); return; }
    this.ride = Object.assign({}, c, { fare: RidesNet.fareFor(c),
      hits: 0, comfort: 100, t: 0, vomited: false, allowed: rideAllowed(c.tripD, c.type),
      paxX: c.pick.x, paxY: c.pick.y, requested: false, confirmed: false, paid: false,
    });
    this.state = 'toPickup';
    Sfx.tone(660, 0.08, 'square', 0.05);
    toast(`Vá buscar ${c.name} (seta verde). Quem parar ao lado primeiro leva!`);
  },

  // Q: destacar a próxima chamada da lista
  decline() {
    if (this.state !== 'idle') return;
    const list = RidesNet.sorted();
    if (!list.length) return;
    const i = list.findIndex((c) => c.id === RidesNet.sel);
    RidesNet.sel = list[(i + 1) % list.length].id;
  },

  // C: desistir. Antes do passageiro ser seu, não custa nada (você não reservou nada).
  cancel(forced) {
    const r = this.ride;
    if (!r || this.state === 'dropping') return;
    if (!r.confirmed && (this.state === 'toPickup' || this.state === 'boarding')) {
      if (!forced) toast(`Você desistiu de buscar ${r.name}.`);
      this.reset();
      return;
    }
    Net.send({ t: 'cancelar', corrida: r.id, forcado: !!forced }); // a sala cobra a taxa (o guincho não paga)
    RidesNet.solo.cancel.call(this, forced);
  },

  // chegou ao destino: a sala calcula nota e pagamento
  finish(car) {
    const r = this.ride, v = this.tripReport(r);
    RidesNet.pendingDrop = { t: 'entregar', corrida: r.id, x: Math.round(car.x), y: Math.round(car.y),
      batidas: v.hits, conforto: Math.round(r.comfort), carroRuim: v.carBad, sujo: v.dirty, defeito: v.defect };
    Net.send(RidesNet.pendingDrop);
    this.lastResult = null;
    r.paid = false;
    this.startDrop(car);
  },

  drawWorld(g, camX, camY) {
    // passageiros esperando nas outras chamadas abertas
    const mine = this.ride && this.ride.id;
    for (const c of RidesNet.calls) {
      if (c.id === mine) continue;
      const sx = c.pick.x - camX, sy = c.pick.y - camY;
      if (sx < -20 || sy < -20 || sx > view.w + 20 || sy > view.h + 20) continue;
      pxRing(g, sx, sy, 7, c.id === RidesNet.sel ? '#39ff88' : '#1f8a52');
      drawPedSprite(g, sx, sy, c.shirt, c.hair, time * 4, true);
    }
    RidesNet.solo.drawWorld.call(this, g, camX, camY);
    Pega.drawWorld(g, camX, camY);
  },

  // ---------- lista de chamadas ----------
  // valor para o seu veículo (a sala paga com o mesmo multiplicador)
  fareFor(c) { return Math.round(c.fare * Veh.cur.fare * 100) / 100; },

  sorted() {
    return [...this.calls].sort((a, b) => Math.hypot(a.pick.x - player.x, a.pick.y - player.y) - Math.hypot(b.pick.x - player.x, b.pick.y - player.y));
  },

  selected() {
    const list = this.sorted();
    return list.find((c) => c.id === this.sel) || list[0] || null;
  },

  // ---------- mensagens da sala (chamadas por Multi.onMsg) ----------
  onCalls(lista) {
    this.calls = lista.map((c) => Object.assign(c, { shirt: SHIRTS[c.id % SHIRTS.length], hair: HAIRS[(c.id * 7) % HAIRS.length] }));
    if (this.sel !== null && !this.calls.some((c) => c.id === this.sel)) this.sel = null;
    const r = Rides.ride;
    if (r && !r.confirmed && (Rides.state === 'toPickup' || Rides.state === 'boarding') && !this.calls.some((c) => c.id === r.id)) {
      toast(`A chamada de ${r.name} expirou.`, 'warn');
      Rides.reset();
    }
  },

  onSurges(lista) {
    Rides.surges = lista.map((d) => ({ x: d.x, y: d.y, r: d.r, mult: d.mult, age: d.age, life: d.life }));
  },

  onBoard(m, nome) {
    const r = Rides.ride;
    if (m.jogador === Multi.me) {
      if (r && r.id === m.chamada) r.confirmed = true;
      else Net.send({ t: 'cancelar', corrida: m.chamada }); // pedido antigo que já não vale aqui
    } else if (r && r.id === m.chamada && !r.confirmed) {
      toast(`${nome} chegou antes e levou ${r.name}!`, 'bad');
      Sfx.bad();
      Rides.reset();
    }
  },

  onRefused(m) {
    const r = Rides.ride;
    // a sala acha que você ainda está numa corrida que este navegador já largou: libera e pede de novo
    if (m.acao === 'embarcar' && m.motivo === 'ocupado' && m.atual != null && (!r || r.id !== m.atual)) {
      Net.send({ t: 'cancelar', corrida: m.atual });
      if (r && r.id === m.id) r.requested = false;
      return;
    }
    if (!r || r.id !== m.id) return;
    if (m.acao === 'embarcar' && !r.confirmed) {
      const why = { sumiu: 'Outro motorista chegou antes.', longe: 'Encoste mais perto do passageiro.', veiculo: 'Executivo não anda de moto.',
        pega: 'Termina o pega primeiro!' }[m.motivo] || 'A sala recusou o embarque.';
      toast(why, 'warn');
      Rides.reset();
    } else if (m.acao === 'entregar' && (m.motivo === 'longe' || m.motivo === 'rapido')) {
      // a corrida continua sua: volta para a viagem e entrega de novo ao parar no destino
      this.pendingDrop = null;
      Rides.state = 'onTrip';
      r.retryT = 1.5;
      toast(m.motivo === 'longe' ? 'Encoste mais perto do destino.' : 'A sala ainda não registrou a viagem toda. Tente de novo.', 'warn');
    } else if (m.acao === 'entregar') {
      this.pendingDrop = null;
      toast('A sala não tem mais esta corrida.', 'bad');
      Rides.reset();
    }
  },

  onPaid(m) {
    const r = Rides.ride;
    if (m.jogador !== Multi.me || !r || r.id !== m.corrida || r.paid) return;
    this.pendingDrop = null;
    r.paid = true;
    Rides.applyResult(player, { pay: m.pay, tip: m.tip, stars: m.stars, late: m.late });
  },

  // entrou ou voltou para a sala: acerta o que o cliente acha com o que a sala sabe
  onWelcome(m) {
    this.onCalls(m.chamadas);
    this.onSurges(m.dinamicas);
    const r = Rides.ride, srv = m.corrida && m.corrida.id;
    if (this.pendingDrop) { Net.send(this.pendingDrop); return; } // se já foi pago, a sala reenvia o recibo
    if (r && srv === r.id) r.confirmed = true;
    else if (r && r.confirmed) { toast('A sala perdeu esta corrida.', 'bad'); Rides.reset(); }
    else if (r) r.requested = false; // o pedido pode ter se perdido: pede de novo ao parar
    if (srv && (!r || r.id !== srv)) Net.send({ t: 'cancelar', corrida: srv });
  },

  // ---------- celular e minimapa ----------
  phoneHTML() {
    const st = Rides.state, r = Rides.ride;
    if (st === 'idle' && Multi.fase !== 'turno') {
      const f = Multi.fase;
      const msg = f === 'espera' ? 'O turno ainda não começou. As chamadas aparecem às 07:00.'
        : f === 'contagem' ? 'Preparar… o turno já vai começar!'
        : f === 'prorrogacao' ? 'Deu 19:00! Esperando quem ainda está com passageiro.'
        : 'Turno encerrado. Use <b>Ranking</b> para ver o resultado.';
      return `<div class="ph-title">${f === 'fim' || f === 'prorrogacao' ? 'FIM DO TURNO' : 'SALA ' + esc(Multi.sala)}</div>` +
        `<div class="ph-muted">${msg}</div>` +
        (f !== 'espera' ? `<div class="ph-stats">Corridas: ${Multi.myCorridas}<br>Lucro: ${fmtMoney(S.money - TURN_START_MONEY)}</div>` : '');
    }
    if (st === 'idle') {
      const list = this.sorted().slice(0, 4), sel = this.selected();
      const rows = list.map((c) => `<div class="ph-call${sel && c.id === sel.id ? ' sel' : ''}">` +
        `<span>${esc(c.name)}</span><b>${c.type === 'exec' && Veh.cur.noExec ? 'só carro' : fmtMoney(this.fareFor(c))}</b><small>${kmStr(Math.hypot(c.pick.x - player.x, c.pick.y - player.y))}` +
        `${c.surge > 1 ? ' · ' + multStr(c.surge) : ''}</small></div>`).join('');
      return `<div class="ph-title">CHAMADAS NA CIDADE (${this.calls.length})</div>` +
        (rows || '<div class="ph-muted">Nenhuma chamada agora…</div>') +
        (sel ? `<div class="ph-muted">${PTYPES[sel.type].label} · viagem de ${kmStr(sel.tripD)}</div>` : '') +
        `<div class="ph-btns"><button data-act="accept"><kbd>E</kbd> BUSCAR</button><button data-act="decline" class="ghost"><kbd>Q</kbd> PRÓXIMA</button></div>`;
    }
    if (st === 'toPickup' || st === 'boarding') {
      const c = this.calls.find((x) => x.id === r.id);
      const msg = r.confirmed ? 'A corrida é sua! Pare ao lado do passageiro.'
        : st === 'boarding' ? 'Confirmando com a sala…' : 'Corrida aberta: quem parar ao lado primeiro leva.';
      return `<div class="ph-title">BUSCANDO PASSAGEIRO</div>
        <div class="ph-row">${esc(r.name)} <span class="ph-type t-${r.type}">${PTYPES[r.type].label}</span></div>
        <div class="ph-muted">${msg}</div>
        ${!r.confirmed && c ? `<div class="ph-row">Expira em ${mmss(c.expires)}</div>` : ''}
        <div class="ph-fare small">${fmtMoney(r.fare)}</div>
        <div class="ph-btns"><button data-act="cancel" class="ghost">${r.confirmed ? '<kbd>C</kbd> CANCELAR (R$ 5)' : '<kbd>C</kbd> DESISTIR'}</button></div>`;
    }
    if (st === 'dropping' && r && !r.paid) {
      return '<div class="ph-title">CORRIDA CONCLUÍDA</div><div class="ph-muted">Recebendo o pagamento da sala…</div>';
    }
    return null; // em viagem e recibo: igual ao solo
  },

  drawMinimap(g, s) {
    const mine = Rides.ride && Rides.ride.id;
    for (const c of this.calls) {
      if (c.id === mine) continue;
      const x = Math.round(c.pick.x * s), y = Math.round(c.pick.y * s);
      g.fillStyle = '#000'; g.fillRect(x - 2, y - 2, 4, 4);
      g.fillStyle = '#39ff88'; g.fillRect(x - 1, y - 1, 2, 2);
    }
  },
};
