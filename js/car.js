'use strict';
// Física arcade do carro do jogador (com derrapagem) e colisões.

const CARP = {
  accel: 160, maxSpeed: 230, reverseMax: 75, brake: 340,
  drag: 0.28, coast: 30, grip: 13, hbGrip: 1.8, steerRate: 3.1,
  r: 5, off: 5, // dois círculos de colisão (frente e traseira)
};

function makePlayer(x, y, a) {
  return { x, y, a, vx: 0, vy: 0, steer: 0, speed: 0, vF: 0, vR: 0, throttle: 0, braking: false, p: CARP };
}

// m = modificadores vindos do estado do carro (combustível, pneu furado, grama...)
function stepPlayer(c, inp, dt, m) {
  const P = c.p || CARP; // física do veículo escolhido (vehicles.js)
  const steerIn = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  c.steer += (steerIn - c.steer) * Math.min(1, 14 * dt);

  let fx = Math.cos(c.a), fy = Math.sin(c.a);
  let vF = c.vx * fx + c.vy * fy;
  const sp = Math.abs(vF);
  const sf = clamp(sp / 50, 0, 1) * (1 - 0.4 * clamp(sp / P.maxSpeed, 0, 1));
  const bias = m.steerBias * clamp(sp / 60, 0, 1);
  c.a += (c.steer * (inp.hb ? 1.4 : 1) + bias) * P.steerRate * sf * (vF >= 0 ? 1 : -1) * dt;

  // decompõe a velocidade no novo referencial do carro: o que sobra de lateral vira derrapagem
  fx = Math.cos(c.a); fy = Math.sin(c.a);
  const rx = -fy, ry = fx;
  vF = c.vx * fx + c.vy * fy;
  let vR = c.vx * rx + c.vy * ry;
  const maxS = P.maxSpeed * m.speedMul;

  c.throttle = 0; c.braking = false;
  if (inp.up) {
    if (vF < -5) { vF += P.brake * m.brakeMul * dt; c.braking = true; }
    else if (m.power > 0) {
      const k = 1 - Math.pow(clamp(vF / maxS, 0, 1), 2);
      vF += P.accel * m.power * m.accelMul * k * dt;
      c.throttle = m.power;
    }
  }
  if (inp.down) {
    if (vF > 5) { vF -= P.brake * m.brakeMul * dt; c.braking = true; if (vF < 0) vF = 0; }
    else if (m.power > 0) {
      vF -= P.accel * 0.7 * m.power * dt;
      if (vF < -P.reverseMax) vF = -P.reverseMax;
      c.throttle = m.power * 0.6;
    }
  }
  if (!inp.up && !inp.down) vF -= Math.sign(vF) * Math.min(Math.abs(vF), P.coast * dt);
  vF -= vF * P.drag * m.dragMul * dt;
  if (vF > maxS) vF += (maxS - vF) * Math.min(1, 1.5 * dt);
  if (inp.hb) { vF -= Math.sign(vF) * Math.min(Math.abs(vF), 110 * dt); c.braking = true; }

  const grip = inp.hb ? P.hbGrip * (m.hbGripMul || 1) : P.grip * m.gripMul;
  vR *= Math.exp(-grip * dt);

  c.vx = fx * vF + rx * vR;
  c.vy = fy * vF + ry * vR;
  c.vF = vF; c.vR = vR;
  c.speed = Math.hypot(c.vx, c.vy);
  c.x += c.vx * dt;
  c.y += c.vy * dt;
}

// Resolve colisões com o cenário e com o trânsito. Retorna a força do impacto (px/s).
// Os carros de outros jogadores usam collideCars() direto (ver Multi.collide).
// slide = true (direção fácil): o carro raspa no muro e segue, em vez de quicar
function collidePlayer(c, city, npcs, slide) {
  let impact = 0;
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  const P = c.p || CARP, rad = P.r;

  for (const off of [P.off, -P.off]) {
    for (let iter = 0; iter < 2; iter++) {
      let cx = c.x + fx * off, cy = c.y + fy * off;
      const tx0 = Math.floor((cx - rad) / 16), tx1 = Math.floor((cx + rad) / 16);
      const ty0 = Math.floor((cy - rad) / 16), ty1 = Math.floor((cy + rad) / 16);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (!city.solid(tx, ty)) continue;
        const qx = clamp(cx, tx * 16, tx * 16 + 16), qy = clamp(cy, ty * 16, ty * 16 + 16);
        const dx = cx - qx, dy = cy - qy, d2 = dx * dx + dy * dy;
        if (d2 >= rad * rad) continue;
        let nx, ny, pen;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = rad - d;
        } else {
          const l = cx - tx * 16, rr = tx * 16 + 16 - cx, t = cy - ty * 16, b = ty * 16 + 16 - cy;
          const mn = Math.min(l, rr, t, b);
          if (mn === l) { nx = -1; ny = 0; pen = l + rad; }
          else if (mn === rr) { nx = 1; ny = 0; pen = rr + rad; }
          else if (mn === t) { nx = 0; ny = -1; pen = t + rad; }
          else { nx = 0; ny = 1; pen = b + rad; }
        }
        c.x += nx * pen; c.y += ny * pen; cx += nx * pen; cy += ny * pen;
        const vn = c.vx * nx + c.vy * ny;
        if (vn < 0) {
          const k = slide ? 1 : 1.35, keep = slide ? 0.97 : 0.92;
          c.vx -= k * vn * nx; c.vy -= k * vn * ny;
          c.vx *= keep; c.vy *= keep;
          impact = Math.max(impact, -vn);
        }
      }
    }
  }

  return Math.max(impact, collideCars(c, npcs, true, slide ? 1 : 1.3));
}

// Colisão do carro c contra uma lista de carros com { x, y, a, speed }. Só c é deslocado.
// push = true deixa o outro carro "sentir" a batida (NPC freia); false não mexe nele.
function collideCars(c, list, push, bounce) {
  let impact = 0;
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  const P = c.p || CARP, rr = P.r + 5; // os outros carros têm raio 5 (moto de rival conta como carro)
  for (const n of list) {
    if (Math.abs(n.x - c.x) > 30 || Math.abs(n.y - c.y) > 30) continue;
    const nfx = Math.cos(n.a), nfy = Math.sin(n.a);
    for (const po of [P.off, -P.off]) for (const no of [5, -5]) {
      const ax = c.x + fx * po, ay = c.y + fy * po, bx = n.x + nfx * no, by = n.y + nfy * no;
      const dx = ax - bx, dy = ay - by, d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = rr - d;
      c.x += nx * pen; c.y += ny * pen;
      const rvn = (c.vx - nfx * n.speed) * nx + (c.vy - nfy * n.speed) * ny;
      if (rvn < 0) {
        c.vx -= bounce * rvn * nx; c.vy -= bounce * rvn * ny;
        impact = Math.max(impact, -rvn);
        if (push && -rvn > 30) { n.hitT = 1.2; n.speed *= 0.3; }
      }
    }
  }
  return impact;
}
