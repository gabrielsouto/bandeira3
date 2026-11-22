'use strict';
// Pedestres andando pelas calçadas. Pulam pro lado quando você vem rápido.

const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f1c40f', '#e67e22', '#1abc9c', '#ecf0f1', '#34495e', '#ff6fa8', '#95a5a6'];
const HAIRS = ['#2b1d14', '#4a2f1b', '#0e0e0e', '#8a5a2b', '#d9b26a', '#6b6b6b', '#b5651d'];

function drawPedSprite(g, sx, sy, shirt, hair, anim, wave) {
  if (typeof drawing3D !== 'undefined' && drawing3D && g === ctx) {
    world3D.person(sx + camX, sy + camY, shirt, hair, anim, wave);
    return;
  }
  sx = Math.round(sx); sy = Math.round(sy);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(sx - 1, sy, 5, 3);
  const step = Math.floor(anim) % 2;
  g.fillStyle = '#222';
  g.fillRect(sx - 1 + (step ? 0 : 2), sy + 2, 1, 1);
  g.fillStyle = shirt; g.fillRect(sx - 2, sy - 1, 5, 3);
  g.fillStyle = hair; g.fillRect(sx - 1, sy - 2, 3, 3);
  if (wave) {
    const up = Math.floor(anim * 2) % 2;
    g.fillStyle = shirt; g.fillRect(sx + 3, sy - 2 - up, 1, 2);
    g.fillStyle = '#e0ac69'; g.fillRect(sx + 3, sy - 3 - up, 1, 1);
  }
}

class Peds {
  constructor(city, n) {
    this.city = city;
    this.list = [];
    for (let k = 0; k < n; k++) this.list.push(this.make());
  }

  make() {
    const t = R.pick(this.city.pedTiles);
    return { x: t.x * 16 + 8, y: t.y * 16 + 8, tx: t.x, ty: t.y, dir: R.i(0, 3), speed: R.f(10, 18),
      shirt: R.pick(SHIRTS), hair: R.pick(HAIRS), state: 'walk', t: 0, anim: R.f(0, 2), vx: 0, vy: 0, flip: false };
  }

  walkable(tx, ty) {
    const t = this.city.get(tx, ty);
    return t === T.SIDEWALK || t === T.PLAZA;
  }

  tryMove(p, mx, my) {
    const nx = p.x + mx, ny = p.y + my;
    if (!this.city.solid(Math.floor(nx / 16), Math.floor(ny / 16))) { p.x = nx; p.y = ny; }
  }

  chooseNext(p) {
    const opts = [];
    for (let d = 0; d < 4; d++) {
      if (d === (p.dir + 2) % 4) continue;
      if (this.walkable(p.tx + DIRS[d].dx, p.ty + DIRS[d].dy)) opts.push(d);
    }
    let d;
    if (opts.includes(p.dir) && R.chance(0.75)) d = p.dir;
    else if (opts.length) d = R.pick(opts);
    else d = (p.dir + 2) % 4;
    if (this.walkable(p.tx + DIRS[d].dx, p.ty + DIRS[d].dy)) {
      p.dir = d; p.tx += DIRS[d].dx; p.ty += DIRS[d].dy;
    }
  }

  // buzina: todo mundo perto se assusta
  scare(x, y) {
    for (const p of this.list) {
      if (p.state !== 'walk') continue;
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
      if (d < 60 && d > 0.1) { p.vx = dx / d * 60; p.vy = dy / d * 60; p.state = 'dodge'; p.t = 0.3; }
    }
  }

  // retorna quantos pedestres foram atropelados neste passo
  update(dt, car, airborne = false) {
    let hits = 0;
    const cs = car.speed;
    for (const p of this.list) {
      if (p.state === 'down') { p.t -= dt; if (p.t <= 0) p.state = 'walk'; continue; }
      const dx = p.x - car.x, dy = p.y - car.y, d = airborne ? Infinity : Math.hypot(dx, dy);
      if (d < 8 && cs > 28) { p.state = 'down'; p.t = 3; p.flip = R.chance(0.5); hits++; continue; }
      if (d < 8 && d > 0.01) { const k = (8 - d) / d; this.tryMove(p, dx * k, dy * k); }
      if (p.state === 'dodge') {
        this.tryMove(p, p.vx * dt, p.vy * dt);
        p.t -= dt; p.anim += dt * 10;
        if (p.t <= 0) p.state = 'walk';
        continue;
      }
      if (cs > 40 && d < 40) {
        const vx = car.vx / cs, vy = car.vy / cs;
        const ah = dx * vx + dy * vy, lat = -dx * vy + dy * vx;
        if (ah > 0 && Math.abs(lat) < 12) {
          const s = lat >= 0 ? 1 : -1;
          p.vx = -vy * s * 75; p.vy = vx * s * 75; p.state = 'dodge'; p.t = 0.35;
          continue;
        }
      }
      const gx = p.tx * 16 + 8, gy = p.ty * 16 + 8, ddx = gx - p.x, ddy = gy - p.y, dd = Math.hypot(ddx, ddy);
      if (dd < 1) this.chooseNext(p);
      else { const st = Math.min(dd, p.speed * dt); p.x += ddx / dd * st; p.y += ddy / dd * st; }
      p.anim += dt * p.speed * 0.4;
    }
    return hits;
  }

  draw(g, camX, camY, vw, vh) {
    for (const p of this.list) {
      const sx = p.x - camX, sy = p.y - camY;
      if (sx < -8 || sy < -8 || sx > vw + 8 || sy > vh + 8) continue;
      if (p.state === 'down') {
        const x = Math.round(sx), y = Math.round(sy);
        g.fillStyle = p.shirt; g.fillRect(x - 3, y - 1, 6, 3);
        g.fillStyle = p.hair; g.fillRect(p.flip ? x + 3 : x - 5, y - 1, 2, 3);
        g.fillStyle = '#fff'; g.fillRect(x - 1, y - 6 + (Math.floor(time * 3) % 2), 1, 1); // estrelinhas
        g.fillRect(x + 2, y - 5 - (Math.floor(time * 3) % 2), 1, 1);
      } else {
        drawPedSprite(g, sx, sy, p.shirt, p.hair, p.anim, false);
      }
    }
  }
}
