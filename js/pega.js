'use strict';
// Pega no multiplayer: corrida de rua com largada e chegada, decidida pela sala.
// X chama um pega (a largada é onde você está), entra num pega aberto (perto da largada) ou desiste.
// Durante o turno cada um paga a inscrição e o primeiro a chegar leva o pote. Fora do turno é só pela glória.

const PEGA_ERRORS = {
  ocupado: 'Já tem um pega rolando na sala.', fase: 'Agora não dá pra fazer pega.', corrida: 'Larga o passageiro antes do pega!',
  longe: 'Chegue mais perto da bandeira.', fiado: 'Sem dinheiro pra inscrição do pega.', chegada: 'Não achei uma chegada daqui. Tente em outro lugar.',
  rapido: 'A sala ainda não registrou o caminho todo. Pare na chegada de novo.', 'sem-pega': 'O pega já acabou.',
};

const Pega = {
  p: null, endsAt: 0, sentArrive: 0, goT: 0, lastPhase: null,

  mine() { return !!(this.p && Multi.me && this.p.inscritos.includes(Multi.me)); },
  left() { return Math.max(0, this.endsAt - performance.now() / 1000); },
  frozen() { return this.mine() && this.p.fase === 'contagem'; },

  // tecla X
  key() {
    if (!Multi.active) { toast('Pega só no multiplayer: crie uma sala e chame os amigos.', 'warn'); return; }
    const p = this.p;
    if (!p) {
      if (Rides.ride) { toast('Larga o passageiro antes do pega!', 'warn'); return; }
      Net.send({ t: 'pega', acao: 'criar', x: player.x, y: player.y });
      return;
    }
    if (this.mine()) {
      if (p.chegaram.includes(Multi.me)) return;
      Net.send({ t: 'pega', acao: 'sair' });
      toast('Você saiu do pega.' + (p.fase !== 'inscricao' && p.aposta ? ' A inscrição fica no pote.' : ''), 'warn');
      return;
    }
    if (p.fase !== 'inscricao') { toast('Esse pega já largou. Espere o próximo.', 'warn'); return; }
    if (Math.hypot(player.x - p.largada.x, player.y - p.largada.y) > 50) { toast('Vá até a bandeira de largada (seta quadriculada) e aperte X.', 'warn'); return; }
    Net.send({ t: 'pega', acao: 'entrar', x: player.x, y: player.y });
  },

  onMsg(m) {
    const prev = this.p;
    this.p = m.pega;
    if (!this.p) { this.lastPhase = null; return; }
    this.endsAt = performance.now() / 1000 + this.p.resta - Net.ping / 2000;
    const p = this.p, ph = p.fase;
    if (!prev || prev.id !== p.id) {
      const who = Multi.nameOf(p.dono);
      toast(p.dono === Multi.me ? 'Pega chamado! Espere a galera na largada (20 s).'
        : `${who} chamou pro PEGA${p.aposta ? ` (inscrição ${fmtMoney(p.aposta)})` : ''}! Vá até a largada e aperte X.`, 'good');
      Sfx.horn(0.06);
    } else {
      for (const novo of p.inscritos) {
        if (prev.inscritos.includes(novo)) continue;
        if (novo !== Multi.me) toast(`${Multi.nameOf(novo)} entrou no pega.`);
        else toast('Você está no pega! Fique na largada.', 'good');
      }
    }
    if (ph !== this.lastPhase) {
      if (ph === 'contagem' && this.mine()) toast(`Valendo ${p.pote ? fmtMoney(p.pote) : 'a glória'}! Não saia da largada...`, 'warn');
      if (ph === 'correndo' && this.mine()) { this.goT = 1.2; Sfx.tone(880, 0.3, 'square', 0.06); }
      this.lastPhase = ph;
    }
  },

  onEnd(m) {
    const was = this.p && this.p.inscritos.includes(Multi.me);
    if (m.motivo === 'poucos') { toast('Ninguém topou o pega. Fica pra próxima.', 'warn'); return; }
    const win = m.ordem[0];
    if (!win) { if (was) toast(m.pote ? 'Ninguém chegou: a inscrição voltou.' : 'O pega acabou sem vencedor.', 'warn'); return; }
    const prize = m.pote ? ` e levou ${fmtMoney(m.pote)}` : '';
    if (win === Multi.me) { toast(`VOCÊ VENCEU O PEGA${prize.toUpperCase()}!`, 'good'); Sfx.cash(); S.aura = (S.aura || 0) + 5; }
    else toast(`${Multi.nameOf(win)} venceu o pega${prize}.`, was ? 'bad' : '');
  },

  onRefused(m) { toast(PEGA_ERRORS[m.motivo] || 'A sala recusou o pega.', 'warn'); if (m.id === 'chegar') this.sentArrive = 0; },

  update(dt) {
    this.goT = Math.max(0, this.goT - dt);
    const p = this.p;
    if (!p || p.fase !== 'correndo' || !this.mine() || p.chegaram.includes(Multi.me)) return;
    this.sentArrive -= dt;
    if (Math.hypot(player.x - p.chegada.x, player.y - p.chegada.y) < 34 && this.sentArrive <= 0) {
      this.sentArrive = 1.5; // reenvia se a sala achar que foi rápido demais
      Net.send({ t: 'pega', acao: 'chegar', x: player.x, y: player.y });
    }
  },

  // seta: largada (inscrição) ou chegada (correndo)
  target() {
    const p = this.p;
    if (!p || (this.mine() && p.chegaram.includes(Multi.me))) return null;
    if (p.fase === 'inscricao' && !Rides.ride) return { x: p.largada.x, y: p.largada.y, kind: 'pega' };
    if (p.fase !== 'inscricao' && this.mine()) return { x: p.chegada.x, y: p.chegada.y, kind: 'pega' };
    return null;
  },

  // bandeira quadriculada num mastro
  flag(g, x, y, label, col) {
    x = Math.round(x); y = Math.round(y);
    pxRing(g, x, y, 12 + Math.round(Math.sin(time * 6) * 1.5), col);
    g.fillStyle = '#000'; g.fillRect(x - 1, y - 17, 3, 18);
    g.fillStyle = '#ddd'; g.fillRect(x, y - 16, 1, 16);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) { g.fillStyle = ((i + j) & 1) ? '#111' : '#fff'; g.fillRect(x + 1 + i, y - 16 + j, 1, 1); }
    g.font = '12px VT323, monospace'; g.textAlign = 'center';
    g.fillStyle = '#000'; g.fillText(label, x + 1, y - 19);
    g.fillStyle = col; g.fillText(label, x, y - 20);
  },

  drawWorld(g, camX, camY) {
    const p = this.p;
    if (!p) return;
    if (p.fase !== 'correndo') this.flag(g, p.largada.x - camX, p.largada.y - camY, p.fase === 'inscricao' ? `LARGADA ${Math.ceil(this.left())}s` : 'LARGADA', '#ff4fd8');
    if (p.fase !== 'inscricao' || this.mine()) this.flag(g, p.chegada.x - camX, p.chegada.y - camY, 'CHEGADA', '#ffd23f');
  },

  drawMinimap(g, s) {
    const p = this.p;
    if (!p) return;
    for (const [pt, col] of [[p.largada, '#ff4fd8'], [p.chegada, '#ffd23f']]) {
      const x = Math.round(pt.x * s), y = Math.round(pt.y * s);
      g.fillStyle = '#000'; g.fillRect(x - 4, y - 4, 8, 8);
      g.fillStyle = col; g.fillRect(x - 3, y - 3, 6, 6);
      g.fillStyle = '#fff'; g.fillRect(x - 3, y - 3, 3, 3); g.fillRect(x, y, 3, 3);
    }
  },

  // texto grande no meio da tela (3-2-1 do pega)
  bigText() {
    const p = this.p;
    if (p && p.fase === 'contagem' && this.mine()) return String(Math.max(1, Math.ceil(this.left())));
    return this.goT > 0 ? 'VAI!' : null;
  },

  // linha no canto da sala
  infoLine() {
    const p = this.p;
    if (!p) return '';
    const n = p.inscritos.length, pot = p.aposta ? ` · ${p.pote ? 'pote ' + fmtMoney(p.pote) : 'inscrição ' + fmtMoney(p.aposta)}` : '';
    const txt = p.fase === 'inscricao' ? `PEGA: inscrição ${Math.ceil(this.left())}s · ${n} piloto${n > 1 ? 's' : ''}${pot} · X entra`
      : p.fase === 'contagem' ? `PEGA: preparar!${pot}` : `PEGA: correndo · ${p.chegaram.length}/${n} chegaram${pot}`;
    return `<div class="ni-pega">${esc(txt)}</div>`;
  },
};
