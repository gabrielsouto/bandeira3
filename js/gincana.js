'use strict';

const RADIO_MISSIONS = [
  { name: 'Ouvinte premiado', route: ['east', 'market', 'west'], final: 'O ouvinte embarcou! Leve-o ao Cais Poente antes da partida.' },
  { name: 'Disco de ouro', route: ['garden', 'west', 'market'], final: 'Disco a bordo! Entregue na estação Mercado sem bater.' },
  { name: 'Ao vivo na orla', route: ['market', 'garden', 'east'], final: 'Vá ao Cais Nascente e fique parado por 5 segundos para transmitir.' },
];
const RADIO_CLUES = {
  east: 'Procure o cais que leva o nome de onde o sol nasce.',
  west: 'Procure o cais que leva o nome de onde o sol se põe.',
  market: 'Minha parada fica ao norte, na estação do VLT com nome de lugar de compras.',
  garden: 'Desça até a estação do VLT que floresce no nome, no lado sul da cidade.',
};

const Gincana = {
  get state() { return S.gincana ? 'route' : 'idle'; },
  point(key = RADIO_MISSIONS[S.gincana.id].route[S.gincana.step]) {
    if (key === 'east' || key === 'west') {
      const dock = Barcas.docks[Number(key === 'east')];
      return { name: dock.name, x: dock.x, y: dock.roadY };
    }
    const north = key === 'market', row = north ? 0 : city.ys.length - 1;
    const station = VLT.stations.find(s => s.name === (north ? 'Mercado' : 'Jardim Sul'));
    return { name: station.name, x: station.x, y: (city.ys[row] + city.wy[row] / 2) * TILE };
  },
  message() {
    const r = S.gincana, mission = RADIO_MISSIONS[r.id];
    if (r.step === 2) return mission.final;
    return r.reveal ? 'Estacione em ' + this.point().name + '. Siga a seta.' : RADIO_CLUES[mission.route[r.step]];
  },
  announce() { Radio.stopTalk(); Radio.say(this.message()); writeSave(); },
  accept(id = 0) {
    if (S.gincana || !RADIO_MISSIONS[id]) return;
    S.gincana = { id, step: 0, helped: false, reveal: false, dwell: 0 };
    this.announce();
  },
  decline() {
    const r = S.gincana;
    if (!r || r.step === 2) return;
    r.helped = r.reveal = true;
    this.announce();
  },
  end(message, style) {
    S.gincana = null;
    Radio.stopTalk(); Radio.say(message); toast(message, style); writeSave();
  },
  cancel() { if (S.gincana) this.end('Missão cancelada.', 'warn'); },
  onImpact(force) {
    if (S.gincana?.id === 1 && S.gincana.step === 2 && force > 10) this.end('O disco quebrou na batida. Tente de novo!', 'bad');
  },
  update(dt, car) {
    const r = S.gincana;
    if (!r) return;
    if (r.step === 2 && r.id === 0 && (r.seconds -= dt) <= 0) {
      this.end('A barca já partiu. Tente de novo!', 'warn'); return;
    }
    const p = this.point();
    if (Math.hypot(car.x - p.x, car.y - p.y) > 24 || car.speed > 4) { r.dwell = 0; return; }
    if (r.step < 2) {
      r.step++; r.reveal = false;
      if (r.step === 2 && r.id === 0) r.seconds = 90;
      toast('Pista resolvida! ' + this.message(), 'good');
      this.announce(); return;
    }
    if (r.id === 2 && (r.dwell += dt) < 5) return;
    const prize = r.helped ? 80 : 120;
    S.money += prize; S.earned += prize;
    this.end('Missão cumprida! Prêmio de ' + fmtMoney(prize) + '.', 'good');
  },
  target() { return S.gincana && (S.gincana.reveal || S.gincana.step === 2) ? { ...this.point(), kind: 'drop' } : null; },
  drawWorld(g, cx, cy) {
    if (!S.gincana) return;
    g.save();
    g.font = 'bold 7px monospace';
    g.textAlign = 'center';
    const p = this.point(), x = Math.round(p.x - cx), y = Math.round(p.y - cy);
    const width = Math.ceil(g.measureText(p.name).width) + 6;
    g.fillStyle = '#20252e';
    g.fillRect(x - width / 2, y - 18, width, 11);
    g.fillStyle = '#ffd23f';
    g.fillText(p.name, x, y - 10);
    pxRing(g, x, y, 7, '#ffd23f');
    g.restore();
  },
  phoneHTML() {
    const r = S.gincana;
    if (!r) return '<div class="ph-title">Escolha sua missão</div>' + RADIO_MISSIONS.map((m, i) =>
      '<button data-act="mission" data-mission="' + i + '">' + m.name + '</button>').join('');
    const status = r.step < 2 ? 'Pista ' + (r.step + 1) + '/2' : 'Desafio final';
    const timer = r.step === 2 && r.id === 2 && r.dwell > 0 ? ' · No ar: ' + Math.floor(r.dwell) + '/5 s' : r.step === 2 && r.id === 0 ? ' · ' + Math.ceil(r.seconds) + ' s' : '';
    return '<div class="ph-title">' + RADIO_MISSIONS[r.id].name + '</div><div class="ph-muted">' + status + timer +
      '</div><div class="ph-row">' + this.message() + '</div><div class="ph-btns">' +
      (r.step < 2 && !r.reveal ? '<button data-act="decline">Q · Dica extra (perde bônus)</button>' : '') +
      '<button data-act="cancel" class="ghost">C · Cancelar</button></div>';
  },
};
