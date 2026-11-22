'use strict';
// Trânsito: carros que andam na mão direita, escolhem caminhos nos cruzamentos e param atrás de obstáculos.

const NPC_COLORS = ['#c0392b', '#2e6fb0', '#27ae60', '#8e44ad', '#d35400', '#7f8c8d', '#2c3e50',
  '#f1c40f', '#16a085', '#bdc3c7', '#1c1c1c', '#a0522d', '#e8e8e8', '#f1c40f'];
const NPC_HALF_LENGTH = 9, NPC_QUEUE_GAP = 8;
const NPC_HEADWAY = 2 * NPC_HALF_LENGTH + NPC_QUEUE_GAP;
const WALKER_RADIUS = 3;
const NPC_HALF_WIDTH = 5;
const JUNCTION_CLEARANCE = NPC_HALF_LENGTH + NPC_HALF_WIDTH + 2;

// Folga entre o pedestre e a carroceria de 18 × 10 px, nos eixos do veículo.
function walkerCarGap(dx, dy, angle) {
  if (Math.abs(dx) > 16 || Math.abs(dy) > 16) return Infinity;
  const fx = Math.cos(angle), fy = Math.sin(angle);
  return Math.max(Math.abs(dx * fx + dy * fy) - NPC_HALF_LENGTH,
    Math.abs(dy * fx - dx * fy) - NPC_HALF_WIDTH) - WALKER_RADIUS;
}

// Testa os quatro eixos das duas carrocerias orientadas.
function trafficOverlap(x, y, a, other) {
  const dx = other.x - x, dy = other.y - y;
  if (dx * dx + dy * dy >= 4 * (NPC_HALF_LENGTH ** 2 + NPC_HALF_WIDTH ** 2)) return 0;
  const c = Math.abs(Math.cos(a - other.a)), s = Math.abs(Math.sin(a - other.a));
  const length = NPC_HALF_LENGTH * (1 + c) + NPC_HALF_WIDTH * s;
  const width = NPC_HALF_WIDTH * (1 + c) + NPC_HALF_LENGTH * s;
  const fx = Math.cos(a), fy = Math.sin(a), ox = Math.cos(other.a), oy = Math.sin(other.a);
  return Math.max(0, Math.min(length - Math.abs(dx * fx + dy * fy), width - Math.abs(dy * fx - dx * fy),
    length - Math.abs(dx * ox + dy * oy), width - Math.abs(dy * ox - dx * oy)));
}

class Traffic {
  constructor(city, n) {
    this.city = city;
    this.cars = [];
    this.onHonk = null; // quem usa o trânsito decide como tocar a buzina (o servidor não tem som)
    this.stopFn = null; // semáforo: (i, j, dir, distância até a faixa) → true se o carro deve parar
    for (let k = 0; k < n; k++) this.spawn();
  }

  spawn() {
    const c = this.city;
    for (let tries = 0; tries < 30; tries++) {
      const i = R.i(0, c.NX - 1), j = R.i(0, c.NY - 1);
      const ex = c.exits(i, j);
      if (!ex.length) continue;
      if (this.spawnAt(i, j, R.pick(ex), R.f(0.1, 0.9))) return;
    }
  }

  // põe um carro no trecho que sai do cruzamento (i,j) na direção d, na fração t do caminho
  spawnAt(i, j, d, t) {
    const c = this.city;
    if (!c.exits(i, j).includes(d)) return null;
    const lane = R.i(0, c.laneCount(i, j, d) - 1);
    const a = c.exitPoint(i, j, d, lane);
    const ni = i + DIRS[d].dx, nj = j + DIRS[d].dy;
    const b = c.entryPoint(ni, nj, d, lane);
    const x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t);
    if (this.cars.some(o => Math.hypot(o.x - x, o.y - y) < 20 ||
      (o.ti === ni && o.tj === nj && o.dir === d && o.lane === lane && Math.hypot(o.x - x, o.y - y) < NPC_HEADWAY))) return null;
    const ang = Math.atan2(DIRS[d].dy, DIRS[d].dx);
    const car = { x, y, a: ang, ma: ang, speed: 0, cruise: R.f(55, 85),
      wps: [{ x: b.x, y: b.y, turn: false }], ti: ni, tj: nj, dir: d,
      lane, ci: R.i(0, NPC_COLORS.length - 1), stuck: 0, ghost: 0, honkT: 0, hitT: 0 };
    this.cars.push(car);
    return car;
  }

  // chegou na entrada do cruzamento (ti,tj): escolhe a saída e gera a curva
  plan(car) {
    const c = this.city;
    const ex = c.exits(car.ti, car.tj);
    let opts = ex.filter((d) => d !== (car.dir + 2) % 4);
    if (!opts.length) opts = ex;
    const d = (opts.includes(car.dir) && R.chance(0.5)) ? car.dir : R.pick(opts);
    // faixa de saída: reto segue na mesma (às vezes troca); curva escolhe uma qualquer
    const nl = c.laneCount(car.ti, car.tj, d);
    const lane = d === car.dir && !R.chance(0.2) ? Math.min(car.lane, nl - 1) : R.i(0, nl - 1);
    const E = c.entryPoint(car.ti, car.tj, car.dir, car.lane), X = c.exitPoint(car.ti, car.tj, d, lane);
    if (car.crossing) car.crossing.exit = X;
    if (d !== car.dir) {
      const C = (car.dir % 2 === 1) ? { x: E.x, y: X.y } : { x: X.x, y: E.y };
      for (const t of [0.25, 0.5, 0.75]) {
        const u = 1 - t;
        car.wps.push({ x: u * u * E.x + 2 * u * t * C.x + t * t * X.x, y: u * u * E.y + 2 * u * t * C.y + t * t * X.y, turn: true });
      }
    }
    car.wps.push({ x: X.x, y: X.y, turn: d !== car.dir });
    const ni = car.ti + DIRS[d].dx, nj = car.tj + DIRS[d].dy;
    const N = c.entryPoint(ni, nj, d, lane);
    car.wps.push({ x: N.x, y: N.y, turn: false });
    car.ti = ni; car.tj = nj; car.dir = d; car.lane = lane;
  }

  update(dt, pl, airborne = false, walking = false) {
    // carros extras (fila do colégio) somem quando ninguém está vendo
    this.cars = this.cars.filter((o) => !o.leave || Math.hypot(o.x - pl.x, o.y - pl.y) < 320);
    const cars = this.cars;
    const crossings = new Map();
    for (const car of cars) {
      if (car.crossing) crossings.set(car.crossing.key, car);
    }
    for (const car of cars) {
      car.hitT -= dt; car.ghost -= dt; car.honkT -= dt;
      const fx = Math.cos(car.a), fy = Math.sin(car.a);
      const distanceAhead = (ox, oy) => {
        const dx = ox - car.x, dy = oy - car.y;
        const ah = dx * fx + dy * fy;
        return ah > 3 && Math.abs(-dx * fy + dy * fx) < 10 ? ah : Infinity;
      };
      const playerDistance = airborne ? Infinity : distanceAhead(pl.x, pl.y);
      const byPlayer = playerDistance <= 28;
      let blocked = byPlayer || car.hitT > 0, queued = false;
      let clearance = byPlayer ? Math.max(0, playerDistance - NPC_HEADWAY) : Infinity;
      for (const o of cars) {
        if (o === car) continue;
        const distance = distanceAhead(o.x, o.y);
        if (distance > 65) continue;
        const sameLane = car.dir === o.dir && car.ti === o.ti && car.tj === o.tj && car.lane === o.lane;
        if (sameLane || o.atLight || o.queued) {
          clearance = Math.min(clearance, Math.max(0, distance - NPC_HEADWAY));
          if (distance <= NPC_HEADWAY + 1 && (o.atLight || o.queued)) queued = true;
        } else if (distance <= 28 && car.ghost <= 0) {
          blocked = true;
        }
      }
      car.queued = queued;

      const wp = car.wps[0];
      const cap = this.capFn ? this.capFn(car.x, car.y) : Infinity; // engarrafamento (colégios)
      let target = blocked ? 0 : Math.min(cap, wp && wp.turn ? 36 : car.cruise);
      // O ponto de entrada está depois da faixa. Quem já começou a atravessar libera a passagem.
      car.atLight = false;
      if (this.stopFn && car.wps.length === 1 && !wp.turn) {
        const dd = Math.hypot(wp.x - car.x, wp.y - car.y);
        if (dd < 70 && dd >= CROSSWALK_OUTER + NPC_HALF_LENGTH && this.stopFn(car.ti, car.tj, car.dir, dd)) {
          const room = Math.max(0, dd - STOP_LINE_OUTER - NPC_HALF_LENGTH - 2);
          clearance = Math.min(clearance, room);
          car.atLight = room < 1;
        }
      }
      // Só entra um carro por vez. Quem espera fica com a carroceria fora da área de conversão.
      if (!car.crossing && car.wps.length === 1 && !wp.turn && Number.isInteger(car.ti)) {
        const distance = Math.hypot(wp.x - car.x, wp.y - car.y);
        const key = car.tj * this.city.NX + car.ti;
        if (crossings.has(key) || blocked) clearance = Math.min(clearance, Math.max(0, distance - JUNCTION_CLEARANCE));
        else if (distance <= JUNCTION_CLEARANCE + (car.speed + 60 * dt) * dt && clearance > 0) {
          car.crossing = { key };
          crossings.set(key, car);
        }
      }
      target = Math.min(target, Math.sqrt(2 * 240 * clearance));
      if (car.speed < target) car.speed = Math.min(target, car.speed + 60 * dt);
      else car.speed = Math.max(target, car.speed - 240 * dt);

      if (blocked && car.hitT <= 0 && !car.queued) {
        car.stuck += dt;
        if (car.stuck > 3.5 && !byPlayer) { car.ghost = 1.5; car.stuck = 0; }
      } else car.stuck = Math.max(0, car.stuck - dt * 2);

      if (byPlayer && car.stuck > 1.2 && car.honkT <= 0) {
        car.honkT = R.f(3, 6);
        if (this.onHonk && Math.hypot(car.x - pl.x, car.y - pl.y) < 200) this.onHonk(car);
      }

      let step = Math.min(car.speed * dt, clearance), guard = 0;
      if (step === clearance) car.speed = 0;
      const turnFactor = Math.min(1, 10 * dt);
      const clear = (x, y, angle) => {
        if (walking && walkerCarGap(pl.x - x, pl.y - y, angle) < 0) return false;
        return cars.every(o => {
          if (o === car) return true;
          const overlap = trafficOverlap(x, y, angle, o);
          // Bloqueia contato mesmo durante a manobra de saída de um engarrafamento.
          return overlap <= 1e-6 || overlap < trafficOverlap(car.x, car.y, car.a, o) - 1e-6;
        });
      };
      const originalAngle = car.a;
      while (step > 1e-4 && guard++ < 8) {
        if (!car.wps.length) this.plan(car);
        const w = car.wps[0];
        const dx = w.x - car.x, dy = w.y - car.y, d = Math.hypot(dx, dy);
        const heading = d > 0.001 ? Math.atan2(dy, dx) : car.ma;
        const x = d <= step ? w.x : car.x + dx / d * step;
        const y = d <= step ? w.y : car.y + dy / d * step;
        const angle = originalAngle + angDiff(originalAngle, heading) * turnFactor;
        if (!clear(x, y, angle)) {
          car.speed = 0;
          break;
        }
        car.x = x; car.y = y; car.a = angle; car.ma = heading;
        if (d <= step) car.wps.shift();
        step -= d;
      }
      const angle = originalAngle + angDiff(originalAngle, car.ma) * turnFactor;
      if (clear(car.x, car.y, angle)) car.a = angle;
      const exit = car.crossing?.exit;
      if (exit && car.wps.length === 1 && Math.hypot(car.x - exit.x, car.y - exit.y) >= JUNCTION_CLEARANCE) {
        crossings.delete(car.crossing.key);
        car.crossing = null;
      }
    }
  }
}
