'use strict';
// Interface: painel do carro, celular com o app, minimapa e avisos.

const $ = (id) => document.getElementById(id);

function toast(msg, kind = '') {
  const box = $('toasts');
  const d = document.createElement('div');
  d.className = 'toast ' + kind;
  d.textContent = msg;
  box.appendChild(d);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, 3800);
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function mmss(s) { const neg = s < 0; s = Math.abs(Math.ceil(s)); return (neg ? '-' : '') + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function multStr(m) { return 'x' + m.toFixed(1).replace('.', ','); }
function setBar(el, v, col) { el.style.width = clamp(v, 0, 100) + '%'; el.style.background = col; }

const PLACE_COLORS = { posto: '#e74c3c', oficina: '#f1c40f', lavajato: '#3fb6ff', casa: '#ce8cff' };

const HUD = {
  t: 0, lastPhone: '', lastProbs: '',

  init() {
    this.el = {
      money: $('money'), rating: $('rating'), spd: $('spd'), fuel: $('fuelbar'), hp: $('hpbar'), wear: $('wearbar'),
      temp: $('tempbar'), tempwrap: $('tempwrap'), probs: $('problems'), phone: $('phonebody'), actions: $('phoneactions'),
      offerTime: $('offertime'), offerBar: $('offertime').querySelector('.ph-timer > div'), offerLeft: $('offerleft'),
      clock: $('clock'), mm: $('minimap'),
    };
    this.el.mm.width = city.W * 2; this.el.mm.height = city.H * 2;
    this.mmCtx = this.el.mm.getContext('2d');
    this.mmCtx.imageSmoothingEnabled = false;
    $('phone').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !canDrive()) return;
      const a = b.dataset.act;
      const tgt = activeJob();
      if (a === 'mission' && Veh.job === 'gincana') tgt.accept(Number(b.dataset.mission));
      else if (a === 'walk' && tgt === Passeador) tgt.accept(Number(b.dataset.count));
      else if (a === 'accept') tgt.accept(); else if (a === 'decline') tgt.decline?.(); else if (a === 'cancel') tgt.cancel();
      else if (a === 'siren' && tgt === Patrulha) onKey('KeyK');
      else if (a === 'round' && tgt === Patrulha) onKey('KeyZ');
      else if (a === 'circle' && tgt === Barcas) Barcas.accept(true);
      else if (a === 'return' && tgt === Parcels && tgt.state === 'route') tgt.startReturn();
      else if (a === 'tow') onKey('KeyG');
      else if (a === 'push') onKey('KeyU');
    });
  },

  update(dt) {
    const c = S.car, e = this.el;
    const pedal = !!Veh.cur.pedal, f = pedal ? Care.legs : Care.level(); // bike: a barra do tanque vira o fôlego
    setBar(e.fuel, f, f < (pedal ? LEGS_TIRED : 15) ? '#ff4d4d' : f < 35 ? '#ffb020' : '#39ff88');
    setBar(e.hp, c.health, c.health < 30 ? '#ff4d4d' : c.health < 60 ? '#ffb020' : '#39ff88');
    setBar(e.wear, c.wear, c.wear > 70 ? '#ff4d4d' : c.wear > 40 ? '#ffb020' : '#7fb2ff');
    const showTemp = !pedal && (c.problems.overheat || Care.overheated);
    e.tempwrap.style.display = showTemp ? '' : 'none';
    if (showTemp) setBar(e.temp, (c.temp - 40) / 70 * 100, Care.overheated ? '#ff4d4d' : '#ffb020');
    const offer = activeJob().offer;
    e.offerTime.hidden = !offer || !this.showOfferTime;
    if (!e.offerTime.hidden) {
      e.offerBar.style.width = clamp(100 * offer.expires / offer.expMax, 0, 100) + '%';
      const remaining = `${Math.max(0, Math.ceil(offer.expires))} s`;
      if (e.offerLeft.textContent !== remaining) e.offerLeft.textContent = remaining;
    }

    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.1;
    if (c.kitGas) $('fuellbl').textContent = Care.usingGas() ? 'GNV' : 'GASOLINA';

    e.money.textContent = fmtMoney(S.money);
    e.money.classList.toggle('neg', S.money < 0);
    // no multiplayer a nota é a média do turno, calculada pela sala
    const nota = GAME.mode === 'multi' ? Multi.myNota : Rides.ratingAvg();
    e.rating.textContent = Veh.cur.school ? `Aulas: ${Autoescola.passed()}/${LESSONS.length} · ${Autoescola.totalStars()} ★`
      : Veh.job === 'passeador' ? S.dogWalks + (S.dogWalks === 1 ? ' passeio concluído' : ' passeios concluídos')
      : Veh.job === 'aereo' ? S.airTrips + (S.airTrips === 1 ? ' voo' : ' voos')
      : Veh.job === 'barcas' ? S.ferryTrips + (S.ferryTrips === 1 ? ' travessia' : ' travessias')
      : Veh.job === 'vlt' ? 'Linha Circular · ' + S.vltTrips + (S.vltTrips === 1 ? ' viagem' : ' viagens')
      : Veh.job === 'onibus' ? S.busPassengers + (S.busPassengers === 1 ? ' passageiro transportado' : ' passageiros transportados')
      : Veh.job === 'policia' ? S.ocorrencias + (S.ocorrencias === 1 ? ' ocorrência' : ' ocorrências')
      : Veh.job === 'ambulancia' ? S.rescues + (S.rescues === 1 ? ' resgate' : ' resgates')
      : Veh.job === 'envios' ? `★ ${nota.toFixed(2).replace('.', ',')} · ${S.envios} envio${S.envios === 1 ? '' : 's'}`
      : Veh.cur.shuttle ? 'Escolar · ' + S.schoolLegs + ' trechos pagos' : Veh.cur.parcels ? `★ ${nota.toFixed(2).replace('.', ',')} · ${S.parcels} pacote${S.parcels === 1 ? '' : 's'}`
      : `★ ${nota == null ? '–' : nota.toFixed(2).replace('.', ',')} · ${S.rides} ${Veh.cur.delivery ? 'entrega' : 'corrida'}${S.rides === 1 ? '' : 's'}`;
    e.spd.textContent = Math.round(player.speed * 0.55);
    e.clock.textContent = clockStr();
    const au = `AURA ${Math.round(S.aura || 0)}`;
    if (au !== this.lastAura) { $('aura').textContent = au; this.lastAura = au; }
    const rs = Radio.station.id === 'off' ? '' : '♪ ' + Radio.station.name;
    if (rs !== this.lastRadio) { $('radio').textContent = rs; this.lastRadio = rs; }

    const probs = [];
    if (c.health <= 0) probs.push('QUEBRADO');
    if (Care.empty()) probs.push(Veh.cur.electric ? 'SEM CARGA' : 'SEM COMBUSTÍVEL');
    if (Garagem.pushing) probs.push('EMPURRANDO');
    if (pedal && Care.legs < LEGS_TIRED) probs.push('PERNA BAMBA');
    if (!pedal && Care.overheated) probs.push('SUPERAQUECIDO');
    if (!pedal && Care.badFuel() > 0.25) probs.push('GASOLINA BATIZADA');
    if (Police.wanted) probs.push('POLÍCIA NA COLA');
    for (const k in PROBLEMS) if (c.problems[k]) {
      const noSpare = k === 'flat' && Garagem.enabled && !Veh.twoWheel() && !c.spare;
      probs.push(noSpare ? 'PNEU FURADO · SEM ESTEPE' : PROBLEMS[k].label);
    }
    const ph = probs.map((p) => `<span class="prob">${p}</span>`).join('');
    if (ph !== this.lastProbs) { e.probs.innerHTML = ph; this.lastProbs = ph; }

    const school = Garagem.enabled && !Veh.cur.shuttle && S.schoolRoute;
    const reminder = school && ['aula', 'saida'].includes(school.phase) ? '<div class="ph-muted">' +
      (school.phase === 'aula' ? 'Saída da escola em ' + mmss(school.wait) : 'A turma espera na escola') + '</div>' : '';
    const html = this.phoneHTML() + reminder;
    if (html !== this.lastPhone) {
      const template = document.createElement('template');
      template.innerHTML = html;
      const timer = template.content.querySelector('.ph-timer');
      this.showOfferTime = !!timer;
      timer?.remove();
      const actions = template.content.querySelector('.ph-btns');
      const actionHTML = actions?.outerHTML || '';
      actions?.remove();
      if (actionHTML !== this.lastActions) {
        e.actions.replaceChildren(...(actions ? [actions] : []));
        this.lastActions = actionHTML;
      }
      const scroll = e.phone.scrollTop;
      const stops = e.phone.querySelector('.ph-stops')?.scrollTop || 0;
      e.phone.replaceChildren(template.content);
      e.phone.scrollTop = scroll;
      const stopList = e.phone.querySelector('.ph-stops');
      if (stopList) stopList.scrollTop = stops;
      this.lastPhone = html;
    }
    this.drawMinimap();
  },

  phoneHTML() {
    if (Veh.cur.guided) return activeJob().phoneHTML();
    const c = S.car, st = Rides.state, r = Veh.cur.parcels ? Parcels.route : Rides.ride;
    if ((Garagem.enabled || !r) && (c.health <= 0 || Care.empty())) {
      const alert = c.health <= 0 ? 'VEÍCULO QUEBRADO' : Veh.cur.electric ? 'BATERIA ESGOTADA' : 'SEM COMBUSTÍVEL';
      return `<div class="ph-alert">${alert}</div><div class="ph-muted">Guincho: ${fmtMoney(TOW_COST)}</div>` +
        '<div class="ph-btns"><button data-act="tow"><kbd>G</kbd> Guincho</button>' +
        (Garagem.enabled ? `<button data-act="push" class="ghost"><kbd>U</kbd> ${Garagem.pushing ? 'Voltar ao volante' : 'Empurrar'}</button>` : '') + '</div>';
    }
    if (GAME.mode === 'multi') { const h = RidesNet.phoneHTML(); if (h !== null) return h; }
    if (Veh.job === 'onibus') return Onibus.phoneHTML();
    if (Veh.job === 'gincana') return Gincana.phoneHTML();
    if (Veh.job === 'policia') return Patrulha.phoneHTML();
    if (Veh.job === 'ambulancia') return Ambulancia.phoneHTML();
    if (Veh.job === 'envios') return Envios.phoneHTML();
    if (Veh.cur.school) return Autoescola.phoneHTML();
    if (Veh.cur.shuttle) return Escolar.phoneHTML();
    if (Veh.cur.parcels) return Parcels.phoneHTML();
    if (Veh.cur.delivery) return Delivery.phoneHTML();
    if (st === 'idle') {
      const ns = Rides.nearestSurge(player.x, player.y);
      return `<div class="ph-status"><span class="dot"></span>ONLINE</div><div class="ph-muted">Procurando corridas…</div>` +
        (ns ? `<div class="ph-surge">Dinâmica <b>${multStr(ns.mult)}</b> ${ns.d < 1 ? 'bem aqui!' : 'a ' + kmStr(ns.d)}</div>` : '') +
        `<div class="ph-stats">Corridas: ${S.rides}<br>Total ganho: ${fmtMoney(S.earned)}</div>`;
    }
    if (st === 'offer') {
      const o = Rides.offer, pt = PTYPES[o.type];
      return `<div class="ph-title">NOVA CORRIDA</div>
        <div class="ph-fare">${fmtMoney(o.fare)}</div>
        ${o.surge > 1 ? `<div class="ph-badge">DINÂMICA ${multStr(o.surge)}</div>` : ''}
        ${Veh.cur.bandeira2 && Veh.isNight(gameMin) ? '<div class="ph-badge b2">BANDEIRA 2</div>' : ''}
        <div class="ph-row">${esc(o.name)} <span class="star">★ ${o.stars}</span></div>
        <div class="ph-type t-${o.type}">${pt.label}</div>
        ${pt.desc ? `<div class="ph-muted">${pt.desc}</div>` : ''}
        <div class="ph-muted">Buscar a ${kmStr(o.pickD)} · viagem de ${kmStr(o.tripD)}</div>
        <div class="ph-timer"><div></div></div>
        <div class="ph-btns"><button data-act="accept"><kbd>E</kbd> ACEITAR</button><button data-act="decline" class="ghost"><kbd>Q</kbd> RECUSAR</button></div>`;
    }
    if (st === 'toPickup' || st === 'boarding') {
      return `<div class="ph-title">BUSCANDO PASSAGEIRO</div>
        <div class="ph-row">${esc(r.name)} <span class="ph-type t-${r.type}">${PTYPES[r.type].label}</span></div>
        <div class="ph-muted">${st === 'boarding' ? 'Embarcando… segura o carro!' : 'Siga a seta verde e pare do lado do passageiro.'}</div>
        <div class="ph-row">Espera máx.: ${mmss(r.maxWait - r.waitT)}</div>
        <div class="ph-fare small">${fmtMoney(r.fare)}</div>
        <div class="ph-btns"><button data-act="cancel" class="ghost"><kbd>C</kbd> CANCELAR</button></div>`;
    }
    if (st === 'onTrip') {
      const left = r.allowed - r.t;
      return `<div class="ph-title">EM VIAGEM</div>
        <div class="ph-row">${esc(r.name)} <span class="ph-type t-${r.type}">${PTYPES[r.type].label}</span></div>
        <div class="ph-muted">Siga a seta amarela até o destino.</div>
        <div class="ph-big ${left < 0 ? 'late' : ''}">${mmss(left)}</div>
        <div class="ph-row">Valor: ${fmtMoney(r.fare)} · Batidas: ${r.hits}</div>
        ${r.type === 'enjoo' ? `<div class="ph-row">Estômago</div><div class="ph-comfort"><div style="width:${Math.max(0, Math.round(r.comfort / 5) * 5)}%"></div></div>` : ''}
        <div class="ph-btns"><button data-act="cancel" class="ghost"><kbd>C</kbd> LARGAR PASSAGEIRO</button></div>`;
    }
    if (st === 'dropping' && Rides.lastResult) {
      const res = Rides.lastResult;
      return `<div class="ph-title">CORRIDA CONCLUÍDA</div>
        <div class="ph-fare">+${fmtMoney(res.total)}</div>
        <div class="ph-stars">${'★'.repeat(res.stars)}<span>${'☆'.repeat(5 - res.stars)}</span></div>
        ${res.tip ? `<div class="ph-row">Gorjeta: ${fmtMoney(res.tip)}</div>` : ''}
        ${res.late ? '<div class="ph-row late">Atrasou: desconto de 15%</div>' : ''}`;
    }
    return '';
  },

  drawMinimap() {
    const g = this.mmCtx, s = 2 / 16;
    g.drawImage(minimapBase, 0, 0);
    for (const z of Veh.cur.school || Veh.cur.parcels || Veh.cur.shuttle || Veh.job === 'policia' || Veh.job === 'ambulancia' || Veh.job === 'onibus' || Veh.cur.guided ? [] : Rides.surges) {
      const a = Math.min(1, z.age / 2, (z.life - z.age) / 2);
      if (a <= 0) continue;
      g.globalAlpha = a;
      g.fillStyle = 'rgba(255,128,20,0.35)';
      g.beginPath(); g.arc(z.x * s, z.y * s, z.r * s, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ff8a1f'; g.lineWidth = 1; g.stroke();
      g.globalAlpha = 1;
    }
    for (const p of city.places) {
      const x = Math.round(p.cx * s), y = Math.round(p.cy * s);
      g.fillStyle = '#000'; g.fillRect(x - 4, y - 4, 8, 8);
      g.fillStyle = PLACE_COLORS[p.kind]; g.fillRect(x - 3, y - 3, 6, 6);
    }
    if (Garagem.enabled) {
      const charger = Garagem.charger;
      const x = Math.round(charger.cx * s), y = Math.round(charger.cy * s);
      g.fillStyle = '#000'; g.fillRect(x + 4, y - 4, 5, 8);
      g.fillStyle = '#5af2ce'; g.fillRect(x + 5, y - 3, 3, 6);
    }
    if (Nav.place && Math.floor(time * 4) % 2 === 0) { // destino da navegação piscando
      const x = Math.round(Nav.place.cx * s), y = Math.round(Nav.place.cy * s);
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x - 5.5, y - 5.5, 11, 11);
    }
    if (Veh.cur.guided) activeJob().drawMinimap(g, s);
    const tg = activeJob().target();
    if (tg && Math.floor(time * 4) % 2 === 0) {
      const x = Math.round(tg.x * s), y = Math.round(tg.y * s);
      g.fillStyle = '#000'; g.fillRect(x - 4, y - 4, 8, 8);
      g.fillStyle = tg.kind === 'pick' ? '#39ff88' : '#ffd23f'; g.fillRect(x - 3, y - 3, 6, 6);
    }
    World.drawMinimap(g, s);
    Delivery.drawMinimap(g, s);
    Parcels.drawMinimap(g, s);
    Autoescola.drawMinimap(g, s);
    Police.drawMinimap(g, s);
    Multi.drawMinimap(g, s);
    const px = Math.round(player.x * s), py = Math.round(player.y * s);
    g.fillStyle = '#000'; g.fillRect(px - 3, py - 3, 6, 6);
    g.fillStyle = '#fff'; g.fillRect(px - 2, py - 2, 4, 4);
    g.fillStyle = '#39ff88';
    g.fillRect(Math.round(px + Math.cos(player.a) * 5) - 1, Math.round(py + Math.sin(player.a) * 5) - 1, 2, 2);
  },
};
