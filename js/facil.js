'use strict';
// Direção fácil: pensada para quem está aprendendo (criança, primeira vez no jogo).
//  - carro mais lento, que acelera mais suave e quase não derrapa
//  - volante que se endireita sozinho na direção da rua quando você solta a seta
//  - bateu no muro? O carro raspa e continua, em vez de quicar
//  - freio automático na frente de pedestres, crianças, bichos e carros
//  - só no solo: o carro estraga menos, não quebra sozinho e gasta menos gasolina
// A escolha fica guardada no navegador. Na sala ela também vale (só deixa o carro mais lento e mais seguro).

const EASY_KEY = 'bandeira3-facil';

const Easy = {
  on: false,

  load() {
    try { this.on = localStorage.getItem(EASY_KEY) === '1'; } catch (e) { /* storage bloqueado */ }
  },
  set(v) {
    this.on = !!v;
    try { localStorage.setItem(EASY_KEY, this.on ? '1' : '0'); } catch (e) { /* idem */ }
    this.refresh();
  },
  toggle(quiet) {
    this.set(!this.on);
    if (!quiet) toast(this.on ? 'Direção fácil ligada: carro mais lento e com ajuda no volante.' : 'Direção fácil desligada.', this.on ? 'good' : '');
  },
  // ajudas que mexem no carro e no dinheiro: só no solo (na sala o dinheiro é de verdade)
  get solo() { return this.on && GAME.mode === 'solo'; },

  // botão da tela inicial e selo no painel
  refresh() {
    const b = $('easybtn');
    if (b) b.setAttribute('aria-pressed', this.on);
    const tag = $('easytag');
    if (tag) tag.classList.toggle('hidden', !this.on);
  },

  // modificadores da física (Care.mods monta o resto)
  mods(m) {
    if (!this.on) return m;
    m.speedMul *= 0.6;   // ~75 km/h no máximo
    m.accelMul *= 0.75;
    m.gripMul *= 2.2;    // quase não derrapa
    m.hbGripMul = 3;     // nem com o freio de mão
    m.brakeMul *= 1.2;
    m.steerBias *= 0.3;  // pneu furado puxa bem menos
    m.wallSlide = true;  // raspa no muro em vez de quicar
    return m;
  },

  // volante que se endireita: sem seta apertada, o carro alinha com a rua (leste, sul, oeste ou norte)
  assist(c, inp, dt) {
    if (!this.on || inp.left || inp.right || inp.hb || c.vF < 12) return;
    const q = Math.PI / 2, tgt = Math.round(c.a / q) * q, d = angDiff(c.a, tgt);
    if (Math.abs(d) > 0.6) return; // no meio de uma curva fechada não mexe
    const turn = d * Math.min(1, 5 * dt);
    c.a += turn;
    // a velocidade acompanha o carro (senão ele "escorrega" de lado)
    const cs = Math.cos(turn), sn = Math.sin(turn), vx = c.vx;
    c.vx = vx * cs - c.vy * sn; c.vy = vx * sn + c.vy * cs;
  },

  // freio automático: algo na frente e perto? Segura o carro.
  autoBrake(c, dt) {
    if (!this.on || c.vF < 20) return;
    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    let near = Infinity;
    const look = (x, y, wide) => {
      const dx = x - c.x, dy = y - c.y, ah = dx * fx + dy * fy;
      if (ah <= 4 || ah > 70) return;
      if (Math.abs(-dx * fy + dy * fx) > wide) return;
      near = Math.min(near, ah);
    };
    for (const p of peds.list) if (p.state !== 'down') look(p.x, p.y, 7);
    for (const k of World.kids) if (!(k.down > 0)) look(k.x, k.y, 7);
    for (const p of World.pets) if (!(p.down > 0)) look(p.x, p.y, 7);
    for (const n of traffic.cars) look(n.x, n.y, 9);
    if (near === Infinity) return;
    const maxV = Math.max(0, (near - 16) * 2.2); // para uns 16 px antes
    if (c.vF <= maxV) return;
    const cut = Math.min(c.vF - maxV, 420 * dt) / c.vF;
    c.vx -= c.vx * cut; c.vy -= c.vy * cut;
    c.braking = true;
  },

  // dano das batidas (só no solo)
  dmgMul() { return this.solo ? 0.5 : 1; },
};
Easy.load();
