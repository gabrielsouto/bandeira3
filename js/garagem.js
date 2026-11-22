'use strict';

const Garagem = {
  home: null, charger: null, pushing: false,
  get enabled() { return GAME.mode === 'solo' && !Veh.cur.school; },
  init() {
    this.charger = city.places.find(p => p.kind === 'posto');
    this.home = this.findHome();
  },
  findHome() {
    const candidates = [];
    const add = (tx, ty, span, d) => {
      const a = DIRS[d], b = DIRS[(d + 1) % 4];
      const offset = Math.floor((span - 6) / 2);
      const x = (tx + a.dx * offset) * TILE, y = (ty + a.dy * offset) * TILE;
      const tile = (u, v) => ({ x: Math.floor(x / TILE + a.dx * (u + 0.5) + b.dx * (v + 0.5)),
        y: Math.floor(y / TILE + a.dy * (u + 0.5) + b.dy * (v + 0.5)) });
      const first = tile(3, 0), last = tile(4, 2);
      candidates.push({ kind: 'casa', name: 'Sua casa', side: ['top', 'right', 'bottom', 'left'][d],
        x, y, a, b, tile, cx: x + (4 * a.dx + 1.5 * b.dx) * TILE, cy: y + (4 * a.dy + 1.5 * b.dy) * TILE,
        x0: Math.min(first.x, last.x), x1: Math.max(first.x, last.x),
        y0: Math.min(first.y, last.y), y1: Math.max(first.y, last.y) });
    };
    for (const { i, j, x0, y0, x1, y1, park } of city.blocks) {
      if (!park) continue;
      if (city.hSeg[j][i]) add(x0 + 1, y0 + 1, x1 - x0 - 1, 0);
      if (city.vSeg[i + 1][j]) add(x1, y0 + 1, y1 - y0 - 1, 1);
      if (city.hSeg[j + 1][i]) add(x1, y1, x1 - x0 - 1, 2);
      if (city.vSeg[i][j]) add(x0 + 1, y1, y1 - y0 - 1, 3);
    }
    // A margem externa também tem espaço para uma casa quando a cidade não tem praças disponíveis.
    if (!candidates.length) {
      const row = city.hSeg[0];
      row.forEach((road, i) => {
        if (road) add(city.xs[i + 1], city.ys[0] - 1, city.xs[i + 1] - city.xs[i] - city.wx[i], 2);
      });
    }
    const distance = p => Math.hypot(p.cx - this.charger.cx, p.cy - this.charger.cy);
    return candidates.reduce((best, p) => !best || distance(p) < distance(best) ? p : best, null);
  },
  buildHome() {
    const p = this.home;
    if (!p || city.places.includes(p)) return;
    // O lote só entra na cidade ao iniciar o solo, depois da escolha de jogar em sala.
    for (let v = 0; v < 3; v++) for (let u = 0; u < 6; u++) {
      const pos = p.tile(u, v);
      city.tiles[pos.y * city.W + pos.x] = u === 3 || u === 4 ? T.LOT : u < 3 && v > 0 ? T.BUILDING : T.GRASS;
    }
    city.places.push(p);
    drawHome(mapCtx, p);
    const g = minimapBase.getContext('2d');
    const start = p.tile(0, 0), end = p.tile(5, 2);
    drawMinimapTiles(city, g, Math.min(start.x, end.x), Math.min(start.y, end.y), Math.max(start.x, end.x) + 1, Math.max(start.y, end.y) + 1);
    Light.lamps.push({ x: p.cx, y: p.cy, r: 52 });
  },
  atHome() { return this.enabled && this.home === city.placeAt(player.x, player.y); },
  takeVehicle(key, job) {
    if (S.carSlot) S.garage[S.carSlot] = S.car;
    if (Veh.cur.guided && key !== Veh.key) activeJob().leave(player, city);
    Veh.set(key); Veh.setJob(job);
    S.car = S.garage[key] || (S.carSlot ? defaultSave().car : S.car);
    S.carSlot = key;
    delete S.garage[key];
    S.vehicle = key; S.job = Veh.job;
    Care.resetState(); this.pushing = false; applyVehicle();
    if (Veh.cur.guided) activeJob().enter(player);
  },
  canSwitch() {
    if (player.speed >= 8 || this.pushing) return false;
    if (Veh.cur.shuttle) return !Escolar.busy;
    return ['idle', 'offer'].includes(activeJob().state);
  },
  clearOffer() {
    activeJob().decline?.();
    HUD.lastPhone = ''; HUD.t = 0;
  },
  jobsMenu() {
    if (!this.enabled) return;
    const ready = this.canSwitch();
    const items = VEH_ORDER.filter(k => !VEHICLES[k].school).map(key => {
      const current = Veh.key === key && Veh.job === (key === 'eletrico' ? 'uber' : key);
      return {
        label: VEHICLES[key].name + ' · ' + Veh.noun(key) + (current ? ' (atual)' : ''), disabled: !ready || current,
        run: () => {
          this.clearOffer(); this.takeVehicle(key); Nav.clear(); closeModal();
          toast('Você está online no ' + Veh.cur.app + '.', 'good');
        },
      };
    });
    showModal('MODALIDADE DE TRABALHO', ready ? 'Escolha a modalidade para pegar o veículo dela aqui.' :
      'Estacione e conclua ou cancele o serviço atual para trocar.', items);
  },
  fleetMenu() {
    const options = { uber: 'Carro Rebu', n99: 'Carro 66', taxi: 'Táxi', eletrico: 'Carro elétrico', escolar: 'Van', moto: 'Moto', comida66: 'Bicicleta' };
    showModal('VEÍCULOS DE CASA', 'Cada veículo guarda seu combustível, desgaste e estepe.', Object.entries(options).map(([key, label]) => ({
      label, disabled: key === Veh.key || !this.canSwitch(),
      run: () => {
        this.clearOffer(); this.takeVehicle(key); Nav.clear(); writeSave(); this.menu();
      },
    })));
  },
  menu() {
    const c = S.car;
    const items = [{
      label: c.problems.dirty ? 'Lavar à mão · grátis' : 'Veículo limpo', disabled: !c.problems.dirty,
      run: () => { c.problems.dirty = false; writeSave(); toast('Lavagem feita em casa!', 'good'); this.menu(); },
    }];
    if (!Veh.twoWheel() && !Veh.cur.guided) {
      let label = 'Trocar pneu com o estepe · grátis';
      if (!c.spare) label = 'Sem estepe · reponha na oficina';
      else if (!c.problems.flat) label = 'Pneus em bom estado · estepe disponível';
      items.push({
        label, disabled: !c.spare || !c.problems.flat || player.speed >= 8,
        run: () => { this.spare(); this.menu(); },
      });
    }
    if (!Veh.twoWheel() && !Veh.cur.electric && !c.kitGas) items.push({
      label: 'Instalar kit GNV · grátis',
      run: () => {
        c.kitGas = true; c.gas = 0; writeSave();
        toast('Kit instalado. Encha o cilindro em um posto.'); this.menu();
      },
    });
    items.push({ label: 'Trocar de veículo', disabled: !this.canSwitch(), run: () => this.fleetMenu() });
    showModal('SUA CASA', this.canSwitch() ? Veh.cur.name : 'Termine o serviço para trocar de veículo.', items);
  },
  spare() {
    if (!this.enabled || Veh.twoWheel()) return;
    const c = S.car;
    if (player.speed >= 8) { toast('Pare para trocar o pneu.', 'warn'); return; }
    if (!c.problems.flat || !c.spare) { toast(c.spare ? 'Os pneus estão bons.' : 'Reponha o estepe na oficina.', 'warn'); return; }
    c.spare = false; c.problems.flat = false;
    Sfx.door(); writeSave(); toast('Você montou o estepe. Pneu trocado de graça!', 'good');
  },
  push() {
    if (!this.enabled) return;
    if (!this.pushing && (player.speed >= 8 || (Rides.canWork() && Care.stallT <= 0))) {
      toast('Pare o veículo. Você pode empurrar se ele estiver sem força.', 'warn'); return;
    }
    this.pushing = !this.pushing;
    if (this.pushing) {
      Nav.go(S.car.health > 0 && Care.empty() ? Care.station() : 'oficina');
      if (this.pushing) toast('Você desceu. Use os controles de direção para empurrar.');
    } else toast('Você voltou ao volante.');
  },
  stepPush(car, inp, dt) {
    car.a += ((+inp.right) - (+inp.left)) * 2.1 * dt;
    const v = inp.hb ? 0 : ((+inp.up) - (+inp.down)) * 21;
    car.vF = v; car.vR = car.throttle = 0; car.braking = true; car.speed = Math.abs(v);
    car.vx = Math.cos(car.a) * v; car.vy = Math.sin(car.a) * v;
    car.x += car.vx * dt; car.y += car.vy * dt;
  },
};
