'use strict';

const Passeador = {
  dwell: 0,
  get state() { return S.dogWalk ? 'route' : 'idle'; },

  restore(walk) {
    if (!walk || walk.dogs) return walk;
    // O passeio individual antigo usava a primeira esquina como casa e as demais como paradas.
    const { stops: [home, ...stops], stage, name, color, fare, ...saved } = walk;
    const phase = stage === 0 ? 'pickup' : stage > stops.length ? 'return' : 'walk';
    return { ...saved, dogs: [{ ...home, name, color, fare }], stops, phase, index: phase === 'walk' ? stage - 1 : 0 };
  },
  onLeash(w, i) {
    if (w.phase === 'pickup') return i < w.index;
    if (w.phase === 'return') return i >= w.index;
    return true;
  },
  enter(person) {
    const distance = p => Math.hypot(p.x - person.x, p.y - person.y);
    const p = S.dogWalk || city.curbs.reduce((a, b) => distance(a) < distance(b) ? a : b);
    Object.assign(person, { x: p.x, y: p.y, a: 0, speed: 0, vx: 0, vy: 0, vF: 0, vR: 0,
      throttle: 0, steer: 0, braking: false });
    this.dwell = 0;
  },
  leave(person) {
    const distance = p => Math.hypot((p.x + 0.5) * TILE - person.x, (p.y + 0.5) * TILE - person.y);
    const road = city.roadTiles.reduce((a, b) => distance(a) < distance(b) ? a : b);
    person.x = (road.x + 0.5) * TILE; person.y = (road.y + 0.5) * TILE;
  },
  neighborhoodLoop() {
    const routes = [];
    // Contorna três quadras alinhadas, com uma parada em cada calçada da quadra central.
    const addLoop = (near, middle, far, sideA, sideB, vertical) => {
      const points = [[near, sideA], [near, sideB], [middle, sideB],
        [far, sideB], [far, sideA], [middle, sideA]].map(([along, across]) => ({
          x: ((vertical ? across : along) + 0.5) * TILE,
          y: ((vertical ? along : across) + 0.5) * TILE,
        }));
      routes.push(points, points.slice(3).concat(points.slice(0, 3)));
    };
    for (const b of city.blocks) {
      if (b.i + 3 < city.NX) {
        const middle = (city.xs[b.i + 1] + city.wx[b.i + 1] + city.xs[b.i + 2] - 1) / 2;
        addLoop(b.x0, middle, city.xs[b.i + 3] - 1, b.y0, b.y1, false);
      }
      if (b.j + 3 < city.NY) {
        const middle = (city.ys[b.j + 1] + city.wy[b.j + 1] + city.ys[b.j + 2] - 1) / 2;
        addLoop(b.y0, middle, city.ys[b.j + 3] - 1, b.x0, b.x1, true);
      }
    }
    const distance = ([home]) => Math.hypot(player.x - home.x, player.y - home.y);
    routes.sort((a, b) => distance(a) - distance(b));
    return R.pick(routes.slice(0, 3));
  },
  tutorHomes(route, count) {
    const [start, firstStop, , opposite] = route;
    const horizontal = start.x === firstStop.x;
    const blocks = city.blocks.filter(b => {
      const x = (b.x0 + b.x1 + 1) * TILE / 2, y = (b.y0 + b.y1 + 1) * TILE / 2;
      return x > Math.min(start.x, opposite.x) && x < Math.max(start.x, opposite.x) &&
        y > Math.min(start.y, opposite.y) && y < Math.max(start.y, opposite.y);
    });
    const homes = [];
    const firstSide = R.chance(0.5);
    for (let i = 0; i < count; i++) {
      const [block] = blocks.splice(R.i(0, blocks.length - 1), 1);
      // O miolo de cada face mantém os tutores afastados até em quadras vizinhas.
      const min = horizontal ? block.x0 : block.y0, max = horizontal ? block.x1 : block.y1;
      const margin = Math.ceil((max - min) / 4);
      const along = R.i(min + margin, max - margin);
      const farSide = i === 0 ? firstSide : i === 1 ? !firstSide : R.chance(0.5);
      const x = horizontal ? along : (farSide ? block.x1 : block.x0);
      const y = horizontal ? (farSide ? block.y1 : block.y0) : along;
      homes.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });
    }
    return homes;
  },
  accept(count = 3) {
    if (S.dogWalk || ![1, 2, 3].includes(count)) return;
    const route = this.neighborhoodLoop();
    const stops = route.slice(1);
    const perimeter = route.reduce((sum, p, i) => {
      const next = route[(i + 1) % route.length];
      return sum + Math.hypot(next.x - p.x, next.y - p.y);
    }, 0);
    const fare = 12 + Math.round(perimeter / 40);
    const names = ['Paçoca', 'Mel', 'Fubá', 'Pipoca', 'Nina'], colors = [...DOG_COLORS];
    const dogs = this.tutorHomes(route, count).map(home => ({ ...home, fare,
      name: names.splice(R.i(0, names.length - 1), 1)[0], color: colors.splice(R.i(0, colors.length - 1), 1)[0] }));
    S.dogWalk = { dogs, stops, phase: 'pickup', index: 0, trail: [], x: player.x, y: player.y };
    this.dwell = 0;
    writeSave(); toast('Passeio aceito. Busque ' + dogs[0].name + ' na calçada.');
  },
  cancel() {
    if (!S.dogWalk) return;
    S.dogWalk = null; this.dwell = 0;
    writeSave(); toast('Passeio cancelado. Os tutores foram avisados.');
  },
  target() {
    const walk = S.dogWalk;
    if (!walk) return null;
    const p = walk.phase === 'walk' ? walk.stops[walk.index] : walk.dogs[walk.index];
    return { x: p.x, y: p.y, kind: walk.phase === 'pickup' ? 'pick' : 'drop' };
  },
  drive(person, input, dt, cars = []) {
    const dx = Number(!!input.right) - Number(!!input.left), dy = Number(!!input.down) - Number(!!input.up);
    const step = person.p.maxSpeed * dt / (Math.hypot(dx, dy) || 1);
    const x = person.x, y = person.y;
    const clear = (nx, ny, mx, my) => {
      if (city.solid(Math.floor((nx + mx * WALKER_RADIUS) / TILE), Math.floor((ny + my * WALKER_RADIUS) / TILE))) return false;
      return cars.every(car => {
        const gap = walkerCarGap(nx - car.x, ny - car.y, car.a);
        // Se o save reabrir sobre um carro, permita sair pelo lado mais próximo.
        return gap >= 0 || gap >= walkerCarGap(person.x - car.x, person.y - car.y, car.a);
      });
    };
    if (dx && clear(x + dx * step, y, dx, 0)) person.x += dx * step;
    if (dy && clear(person.x, y + dy * step, 0, dy)) person.y += dy * step;
    person.vx = dt ? (person.x - x) / dt : 0; person.vy = dt ? (person.y - y) / dt : 0;
    person.speed = Math.hypot(person.vx, person.vy);
    if (person.speed) person.a = Math.atan2(person.vy, person.vx);
    const walk = S.dogWalk;
    if (!walk) return;
    walk.x = person.x; walk.y = person.y;
    const last = walk.trail.at(-1);
    if (!last || Math.hypot(person.x - last.x, person.y - last.y) >= 2) {
      walk.trail.push({ x: person.x, y: person.y });
      if (walk.trail.length > 5 + 3 * (walk.dogs.length - 1)) walk.trail.shift();
    }
  },
  update(dt, person) {
    const w = S.dogWalk;
    if (!w) return;
    const p = this.target();
    if (person.speed || Math.hypot(p.x - person.x, p.y - person.y) > 12) { this.dwell = 0; return; }
    this.dwell += dt;
    if (this.dwell < 1) return;
    this.dwell = 0;
    if (w.phase === 'pickup') {
      toast(w.dogs[w.index].name + ' na guia!');
      if (++w.index === w.dogs.length) { w.phase = 'walk'; w.index = 0; }
    } else if (w.phase === 'walk') {
      if (++w.index === w.stops.length) { w.phase = 'return'; w.index = 0; toast('Hora de voltar aos tutores.'); }
    } else {
      const dog = w.dogs[w.index++];
      S.money += dog.fare; S.earned += dog.fare;
      Sfx.cash(); toast(dog.name + ' voltou para o tutor! +' + fmtMoney(dog.fare), 'good');
      if (w.index === w.dogs.length) { S.dogWalks++; S.dogWalk = null; }
    }
    writeSave();
  },
  phoneHTML() {
    const w = S.dogWalk;
    if (!w) return '<div class="ph-title">Passeio pelo bairro</div><div class="ph-row">Quantos cachorros você vai levar?</div>' +
      '<div class="ph-btns"><button data-act="walk" data-count="1" aria-label="1 cachorro">1</button>' +
      '<button data-act="walk" data-count="2" aria-label="2 cachorros">2</button>' +
      '<button data-act="accept" aria-label="3 cachorros" aria-keyshortcuts="E"><kbd>E</kbd> 3</button></div>';
    const dog = w.dogs[w.index];
    const task = w.phase === 'walk' ? 'Passeio · parada ' + (w.index + 1) + ' de ' + w.stops.length
      : (w.phase === 'pickup' ? 'Busque ' : 'Devolva ') + esc(dog.name);
    const roster = w.dogs.map((d, i) => {
      const status = this.onLeash(w, i) ? 'na guia' : w.phase === 'pickup' ? 'aguardando' : 'entregue';
      return esc(d.name) + ' · ' + status + ' · ' + fmtMoney(d.fare);
    }).join('<br>');
    return '<div class="ph-title">' + task + '</div><div class="ph-row">' + roster + '</div><div class="ph-muted">Pare no marcador por 1 segundo.</div><div class="ph-btns"><button data-act="cancel" class="ghost"><kbd>C</kbd> Cancelar</button></div>';
  },
  drawWorld(g, cx, cy) {
    const w = S.dogWalk;
    if (!w) return;
    const p = this.target();
    pxRing(g, p.x - cx, p.y - cy, 10, p.kind === 'pick' ? '#39ff88' : '#ffd23f');
    for (const [i, dog] of w.dogs.entries()) {
      const leashed = this.onLeash(w, i);
      drawPedSprite(g, dog.x - cx, dog.y - cy, '#c87bdf', '#614332', time * 3, w.phase !== 'walk' && w.index === i);
      let x = dog.x + 7, y = dog.y;
      if (leashed) {
        const behind = w.trail[Math.max(0, w.trail.length - 5 - 3 * i)] || player;
        const side = [0, 5, -5][i];
        x = behind.x - Math.sin(player.a) * side; y = behind.y + Math.cos(player.a) * side;
        g.strokeStyle = '#ebbc78'; g.lineWidth = 1; g.beginPath();
        g.moveTo(player.x - cx, player.y - cy); g.lineTo(x - cx, y - cy); g.stroke();
      }
      World.drawPet(g, { dog: true, col: dog.color, anim: leashed && player.speed ? time * 8 + i : 0, flip: leashed && x > player.x },
        x - cx, y - cy);
    }
  },
  drawMinimap(g, scale) {
    const w = S.dogWalk;
    if (!w) return;
    g.fillStyle = '#c87bdf';
    for (const d of w.dogs) g.fillRect(d.x * scale - 1, d.y * scale - 1, 3, 3);
  },
};
