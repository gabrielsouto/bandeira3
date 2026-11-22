'use strict';

const RESCUE_WALK_TIME = 2;
const Ambulancia = {
  hospital: null, offer: null, nextOfferT: 3, dwell: 0,
  get state() { return S.rescue?.phase || (this.offer ? 'offer' : 'idle'); },

  init(city, g) {
    const occupied = new Set([...World.schools, ...Delivery.rests, ...Object.values(Parcels.hubs)].map(p => p.bd));
    const distance = b => Math.hypot(b.x0 + b.x1 + 1 - city.W, b.y0 + b.y1 + 1 - city.H);
    const buildings = city.buildings.filter(b => !occupied.has(b)).sort((a, b) => distance(a) - distance(b));
    for (const b of buildings) {
      const door = Delivery.doorOf(b);
      if (!door || World.inRisk(door.x, door.y) || Math.hypot(door.x - Garagem.home.cx, door.y - Garagem.home.cy) < 50) continue;
      this.hospital = door;
      const x = (b.x0 + b.x1 + 1) * TILE / 2, y = (b.y0 + b.y1 + 1) * TILE / 2;
      g.fillStyle = '#f2f6ef'; g.fillRect(x - 7, y - 7, 14, 14);
      g.fillStyle = '#2674a1'; g.fillRect(x - 5, y - 5, 3, 10); g.fillRect(x + 2, y - 5, 3, 10); g.fillRect(x - 2, y - 1, 4, 3);
      break;
    }
  },
  makeOffer(car) {
    if (!this.hospital) return null;
    const distance = p => Math.hypot(p.x - this.hospital.x, p.y - this.hospital.y);
    const stops = Parcels.doors.filter(p => distance(p) >= 160);
    const nearby = stops.filter(p => Math.hypot(p.x - car.x, p.y - car.y) < 480);
    const pick = R.pick(nearby.length ? nearby : stops);
    if (!pick) return null;
    return { name: R.pick(FIRST_NAMES), pick, fare: Math.round(15 + distance(pick) / TILE * 0.35), expires: 18, expMax: 18 };
  },
  accept() {
    if (this.state !== 'offer' || !Rides.canWork()) return;
    S.rescue = { ...this.offer, phase: 'pickup' };
    this.decline(); writeSave();
    toast('Chamado aceito. Siga a seta verde até ' + S.rescue.name + '.');
  },
  decline() { this.offer = null; this.nextOfferT = 3; },
  cancel() {
    if (!S.rescue) return;
    S.rescue = null; this.dwell = 0; this.nextOfferT = 3;
    writeSave(); toast('A central encaminhou o chamado para outra ambulância.');
  },
  target() {
    if (!S.rescue) return null;
    return this.state === 'pickup' ? { ...S.rescue.pick, kind: 'pick' } : { ...this.hospital, kind: 'drop' };
  },
  onImpact() {},
  update(dt, car) {
    const r = S.rescue;
    if (!r) {
      if (this.offer) {
        this.offer.expires -= dt;
        if (this.offer.expires <= 0) this.decline();
      } else if (Rides.canWork() && (this.nextOfferT -= dt) <= 0) {
        this.offer = this.makeOffer(car); this.nextOfferT = 3;
        if (this.offer) Sfx.ding();
      }
      return;
    }
    const p = this.target();
    if (car.speed >= 8 || Math.hypot(p.x - car.x, p.y - car.y) >= 26) { this.dwell = 0; return; }
    this.dwell += dt;
    if (this.dwell < RESCUE_WALK_TIME) return;
    this.dwell = 0;
    if (r.phase === 'pickup') {
      r.phase = 'hospital'; Sfx.door();
      toast(r.name + ' a bordo. Siga a seta amarela até o hospital.', 'good');
    } else {
      S.rescues++; S.money += r.fare; S.earned += r.fare;
      S.rescue = null; this.nextOfferT = 4; Sfx.cash();
      toast('O hospital recebeu ' + r.name + '. +' + fmtMoney(r.fare), 'good');
    }
    writeSave();
  },
  phoneHTML() {
    const r = S.rescue || this.offer;
    if (!r) return '<div class="ph-status"><span class="dot"></span>DE PLANTÃO</div><div class="ph-muted">Aguardando chamado da central…</div>';
    const offer = this.state === 'offer', pickup = this.state === 'pickup';
    const title = offer ? 'CHAMADO DE RESGATE' : pickup ? 'BUSCAR PACIENTE' : 'LEVAR AO HOSPITAL';
    const detail = offer ? 'Destino: pronto-socorro' : pickup ? 'Pare junto ao paciente na seta verde.' : 'Pare na entrada do hospital na seta amarela.';
    const buttons = offer ? '<button data-act="accept"><kbd>E</kbd> ACEITAR</button><button class="ghost" data-act="decline"><kbd>Q</kbd> RECUSAR</button>' : '<button class="ghost" data-act="cancel"><kbd>C</kbd> CANCELAR</button>';
    return `<div class="ph-title">${title}</div><div class="ph-fare">${fmtMoney(r.fare)}</div><div class="ph-row">Paciente: ${esc(r.name)}</div>
      <div class="ph-muted">${this.dwell ? (pickup ? 'Embarcando paciente…' : 'Equipe recebendo paciente…') : detail}</div>
      ${offer ? '<div class="ph-timer"><div></div></div>' : ''}<div class="ph-btns">${buttons}</div>`;
  },
  drawWorld(g, cx, cy) {
    const p = this.target();
    if (!p) return;
    const x = p.x - cx, y = p.y - cy, pickup = p.kind === 'pick';
    const color = pickup ? '#39ff88' : '#ffd23f';
    pxRing(g, x, y, 10, color); pxDownArrow(g, x, y - 15, color);
    if (!pickup && !this.dwell) return;

    const street = DIRS.find(d => city.tileAtPx(p.x + d.dx * TILE, p.y + d.dy * TILE) === T.ROAD);
    const nx = street?.dx ?? 0, ny = street?.dy ?? 1;
    const curbX = p.x - nx * 6 + ny * 12, curbY = p.y - ny * 6 - nx * 12;
    const sideX = -Math.sin(player.a), sideY = Math.cos(player.a);
    const side = (curbX - player.x) * sideX + (curbY - player.y) * sideY >= 0 ? 1 : -1;
    const doorX = player.x + side * sideX * 6, doorY = player.y + side * sideY * 6;
    const progress = this.dwell / RESCUE_WALK_TIME;
    const towardDoor = pickup ? progress : 1 - progress;
    drawPedSprite(g, lerp(curbX, doorX, towardDoor) - cx, lerp(curbY, doorY, towardDoor) - cy,
      '#8eb5ff', '#51372c', this.dwell ? progress * 12 : time, !this.dwell);
  },
};
