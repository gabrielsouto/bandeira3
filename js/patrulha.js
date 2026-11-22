'use strict';

const Patrulha = {
  offer: null, nextOfferT: 3, dwell: 0,
  get state() { return S.ocorrencia ? 'atendimento' : this.offer ? 'offer' : 'idle'; },

  sirenOn: false, prison: null,
  setSiren(on) {
    this.sirenOn = on;
    if (!this.sound && on) this.sound = Object.create(SirenSound);
    if (on) { this.sound.startSiren(); this.sound.sirenVol(0); }
    else this.sound?.stopSiren();
  },

  init(city, g) {
    const occupied = new Set([...World.schools, ...Delivery.rests, ...Delivery.pharmacies, ...Object.values(Parcels.hubs)].map(p => p.bd));
    for (const b of city.buildings) {
      if (occupied.has(b)) continue;
      const p = Delivery.doorOf(b);
      if (!p || World.inRisk(p.x, p.y) || Math.hypot(p.x - Garagem.home.cx, p.y - Garagem.home.cy) < 64 ||
          (Ambulancia.hospital && Math.hypot(p.x - Ambulancia.hospital.x, p.y - Ambulancia.hospital.y) < 64)) continue;
      this.prison = p;
      const x = (b.x0 + b.x1 + 1) * TILE / 2, y = (b.y0 + b.y1 + 1) * TILE / 2;
      g.fillStyle = '#182737'; g.fillRect(x - 8, y - 7, 16, 14);
      g.fillStyle = '#d1dce6';
      for (let i = -5; i <= 5; i += 5) g.fillRect(x + i, y - 5, 2, 10);
      return;
    }
  },
  startRound() {
    if (S.ocorrencia || !this.prison || !Rides.canWork()) return;
    const distance = z => Math.hypot(z.x - player.x, z.y - player.y);
    const zone = World.risks.reduce((best, z) => !best || distance(z) < distance(best) ? z : best, null);
    if (!zone) return;
    this.decline();
    S.ocorrencia = { title: 'Ronda em área de risco', phase: 'ronda', zone: World.risks.indexOf(zone),
      stop: this.prison, fare: Math.round(20 + Math.hypot(zone.x - this.prison.x, zone.y - this.prison.y) / TILE * 0.5) };
    Nav.clear(); writeSave(); toast('Siga a seta verde e encoste perto de um bandido.');
  },
  suspect(car) {
    const zone = World.risks[S.ocorrencia.zone];
    let closest = null, distance = Infinity;
    for (const b of World.bandits) {
      if (b.z !== zone || b.state === 'down') continue;
      const d = Math.hypot(b.x - car.x, b.y - car.y);
      if (d < distance) { distance = d; closest = b; }
    }
    return closest;
  },
  makeOffer(car) {
    const distance = p => Math.hypot(p.x - car.x, p.y - car.y);
    const nearby = city.curbs.filter(p => distance(p) >= 120 && distance(p) <= 520);
    const stop = R.pick(nearby.length ? nearby : city.curbs);
    if (!stop) return null;
    const title = R.pick(['Colisão sem feridos', 'Pessoa perdida', 'Veículo em pane']);
    return { title, stop, fare: Math.round(12 + distance(stop) / TILE * 0.5), expires: 18, expMax: 18 };
  },
  accept() {
    if (this.state !== 'offer' || !Rides.canWork()) return;
    const { title, stop, fare } = this.offer;
    S.ocorrencia = { title, stop, fare };
    this.decline();
    writeSave();
    toast('Chamado aceito. Siga a seta até a ocorrência.');
  },
  decline() { this.offer = null; this.nextOfferT = 3; },
  cancel() {
    if (!S.ocorrencia) return;
    S.ocorrencia = null; this.dwell = 0; this.nextOfferT = 3;
    writeSave(); toast('A central enviou outra viatura.');
  },
  target() {
    const call = S.ocorrencia;
    if (!call) return null;
    if (call.phase === 'ronda') {
      const p = this.suspect(player) || World.risks[call.zone];
      return { x: p.x, y: p.y, kind: 'pick' };
    }
    return { ...call.stop, kind: call.phase === 'transporte' ? 'drop' : 'pick' };
  },
  onImpact() {},
  update(dt, car) {
    const call = S.ocorrencia;
    if (!call) {
      if (this.offer) {
        this.offer.expires -= dt;
        if (this.offer.expires <= 0) this.decline();
      } else if (Rides.canWork() && (this.nextOfferT -= dt) <= 0) {
        this.offer = this.makeOffer(car); this.nextOfferT = 3;
        if (this.offer) Sfx.ding();
      }
      return;
    }
    if (call.phase === 'ronda') {
      const b = this.suspect(car);
      if (b && car.speed < 8 && Math.hypot(car.x - b.x, car.y - b.y) < 24 && World.inRisk(car.x, car.y) && Rides.canWork() && !Garagem.pushing) {
        World.bandits.splice(World.bandits.indexOf(b), 1);
        call.phase = 'transporte'; this.dwell = 0;
        writeSave(); Sfx.door(); toast('Detido a bordo. Siga a seta amarela até a prisão.');
      }
      return;
    }
    if (car.speed >= 8 || Math.hypot(car.x - call.stop.x, car.y - call.stop.y) >= 26) {
      this.dwell = 0;
      return;
    }
    this.dwell += dt;
    if (this.dwell < 3) return;
    S.money += call.fare; S.earned += call.fare; S.ocorrencias++;
    S.ocorrencia = null; this.dwell = 0; this.nextOfferT = 4;
    writeSave(); Sfx.cash(); toast((call.phase === 'transporte' ? 'Detido entregue à prisão. +' : 'Ocorrência atendida. +') + fmtMoney(call.fare), 'good');
  },
  phoneHTML() {
    const call = S.ocorrencia || this.offer;
    const tools = `<div class="ph-btns"><button data-act="siren" aria-pressed="${this.sirenOn}"><kbd>K</kbd> ${this.sirenOn ? 'Desligar' : 'Ligar'} sirene</button>${!S.ocorrencia ? '<button data-act="round"><kbd>Z</kbd> Iniciar ronda</button>' : ''}</div>`;
    if (!call) return tools + '<div class="ph-status"><span class="dot"></span>EM PATRULHA</div><div class="ph-muted">Aguardando chamado da central…</div>';
    const controls = this.offer
      ? '<div class="ph-timer"><div></div></div><div class="ph-btns"><button data-act="accept"><kbd>E</kbd> ACEITAR</button><button class="ghost" data-act="decline"><kbd>Q</kbd> RECUSAR</button></div>'
      : '<div class="ph-btns"><button class="ghost" data-act="cancel"><kbd>C</kbd> CANCELAR</button></div>';
    const detail = this.offer ? 'Chamado da central' : call.phase === 'ronda' ? 'Encoste perto de um bandido na área indicada.'
      : call.phase === 'transporte' ? (this.dwell ? 'Desembarcando detido…' : 'Detido a bordo. Pare na prisão por 3 segundos.')
      : this.dwell ? 'Atendendo… ' + Math.ceil(3 - this.dwell) + ' s' : 'Siga a seta e pare no local por 3 segundos.';
    return `<div class="ph-title">${esc(call.title)}</div><div class="ph-fare">${fmtMoney(call.fare)}</div><div class="ph-muted">${detail}</div>${controls}${tools}`;
  },
  drawWorld(g, cx, cy) {
    const p = this.target();
    if (!p) return;
    const x = p.x - cx, y = p.y - cy;
    const color = p.kind === 'drop' ? '#ffd23f' : '#39ff88';
    pxRing(g, x, y, 12, color); pxDownArrow(g, x, y - 16, color);
    if (S.ocorrencia.phase) return;
    drawPedSprite(g, x, y - 5, '#598ad4', '#735243', time, true);
  },
};
