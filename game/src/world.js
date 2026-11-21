// Vice Bay — the world: a seeded city, cars, pedestrians, combat, wanted level and
// police pressure. No drawing and no browser here: step() advances one fixed step
// and returns what happened as bit flags, so the caller can play sounds and screens.
import {
  BEACH_Y, CAR_ACCEL, CAR_BRAKE, CAR_H, CAR_MAX_REVERSE, CAR_MAX_SPEED, CAR_STEER,
  CAR_W, COLORS, HOSPITAL_FINE, MAX_WANTED, PLACES, PLAYER_RADIUS, PLAYER_RUN,
  PLAYER_WALK, ROAD_FIRST, ROAD_GAP, ROAD_W, START_MONEY, WANTED_DECAY_SECONDS,
  WATER_Y, WORLD_H, WORLD_W,
} from './config.js';
import { angleLerp, angleTo, clamp, dist } from './random.js';
import { updatePolice } from './police.js';
import { createMissionController } from './missions.js';

export const EVENT_SHOT = 1;
export const EVENT_PUNCH = 2;
export const EVENT_PICKUP = 4;
export const EVENT_CRASH = 8;
export const EVENT_CRIME = 16;
export const EVENT_BUSTED = 32;
export const EVENT_CASH = 64;
export const EVENT_MISSION = 128;
export const EVENT_HIT_PED = 256;

export const CAR_COLORS = ['#c23b2e', '#2e6fc2', '#e0b13c', '#3fae5a', '#8a5fc2', '#d8d8d8', '#222831', '#e07a2e'];
export const PED_COLORS = ['#e8c39e', '#c98d5f', '#8a5a3b', '#f0d0b0'];

export function roadLines() {
  const lines = [];
  for (let i = 0; i < 8; i += 1) lines.push(ROAD_FIRST + i * ROAD_GAP);
  return lines;
}

export function isOnRoad(x, y) {
  for (const line of roadLines()) {
    if (Math.abs(x - line) <= ROAD_W / 2 || Math.abs(y - line) <= ROAD_W / 2) return true;
  }
  return false;
}

export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const line of roadLines()) {
    const dV = Math.abs(x - line);
    if (dV < bestD) { bestD = dV; best = { x: line, y, axis: 'v' }; }
    const dH = Math.abs(y - line);
    if (dH < bestD) { bestD = dH; best = { x, y: line, axis: 'h' }; }
  }
  return best;
}

export function createWorld(random) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const special = [];

  // City blocks sit between the road lines; each block holds buildings or a park.
  for (let bi = 0; bi < 7; bi += 1) {
    for (let bj = 0; bj < 7; bj += 1) {
      const x0 = ROAD_FIRST + bi * ROAD_GAP + ROAD_W / 2 + 14;
      const y0 = ROAD_FIRST + bj * ROAD_GAP + ROAD_W / 2 + 14;
      const x1 = ROAD_FIRST + (bi + 1) * ROAD_GAP - ROAD_W / 2 - 14;
      const y1 = ROAD_FIRST + (bj + 1) * ROAD_GAP - ROAD_W / 2 - 14;
      if (y0 >= BEACH_Y) continue;
      if (random.chance(0.16)) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        for (let t = 0; t < 6; t += 1) {
          trees.push({ x: random.range(x0 + 20, x1 - 20), y: random.range(y0 + 20, y1 - 20), r: random.range(10, 18) });
        }
        continue;
      }
      const count = random.int(1, 2);
      for (let b = 0; b < count; b += 1) {
        const w = random.range(90, 150);
        const h = random.range(90, 150);
        const x = random.range(x0, Math.max(x0, x1 - w));
        const y = random.range(y0, Math.max(y0, y1 - h));
        buildings.push({ x, y, w, h, color: random.pick(COLORS.buildingRoof) });
      }
    }
  }
  // Landmark buildings: hospital, garage, safehouse, docks.
  special.push({ x: PLACES.hospital.x + 70, y: PLACES.hospital.y + 70, w: 150, h: 110, color: COLORS.hospital, label: 'HOSPITAL' });
  special.push({ x: PLACES.garage.x - 220, y: PLACES.garage.y + 70, w: 150, h: 100, color: COLORS.garage, label: 'GARAGE' });
  special.push({ x: PLACES.safehouse.x + 70, y: PLACES.safehouse.y - 180, w: 130, h: 100, color: '#7a8a9a', label: 'SAFEHOUSE' });
  special.push({ x: PLACES.docks.x - 220, y: PLACES.docks.y - 160, w: 170, h: 110, color: '#4a6a7a', label: 'DOCKS' });
  for (const s of special) buildings.push(s);

  const state = {
    player: {
      x: PLACES.spawn.x, y: PLACES.spawn.y, angle: -Math.PI / 2, hp: 100,
      money: START_MONEY, ammo: 24, hasPistol: true, inCar: null, speed: 0,
      punchCooldown: 0, shootCooldown: 0, invulnerable: 0,
    },
    cars: [],
    peds: [],
    police: [],
    bullets: [],
    pickups: [],
    particles: [],
    skids: [],
    floaters: [],
    wanted: 0,
    lastCrime: -999,
    clockMinutes: 9 * 60,
    elapsed: 0,
    camera: { x: PLACES.spawn.x, y: PLACES.spawn.y },
    shake: 0,
    bustedTimer: 0,
    dialogue: null,
    stats: { carsStolen: 0, pedsHit: 0, shotsFired: 0, missionsDone: 0 },
    mission: null,
    attract: false,
  };

  function solidAt(x, y) {
    if (x < 12 || y < 12 || x > WORLD_W - 12 || y > WORLD_H - 12) return true;
    if (y > WATER_Y - 8) return true;
    for (const b of buildings) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    }
    return false;
  }

  function collideMove(entity, dx, dy, radius) {
    const nx = entity.x + dx;
    if (!solidAt(nx + Math.sign(dx) * radius, entity.y) && !solidAt(nx + Math.sign(dx) * radius, entity.y - radius * 0.7) && !solidAt(nx + Math.sign(dx) * radius, entity.y + radius * 0.7)) entity.x = nx;
    const ny = entity.y + dy;
    if (!solidAt(entity.x, ny + Math.sign(dy) * radius) && !solidAt(entity.x - radius * 0.7, ny + Math.sign(dy) * radius) && !solidAt(entity.x + radius * 0.7, ny + Math.sign(dy) * radius)) entity.y = ny;
  }

  function addParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random.range(0, Math.PI * 2);
      const s = random.range(speed * 0.3, speed);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: random.range(0.3, 0.8), max: 0.8, color, size: random.range(2, 5) });
    }
    if (state.particles.length > 400) state.particles.splice(0, state.particles.length - 400);
  }

  function addFloater(x, y, text, color) {
    state.floaters.push({ x, y, text, life: 1.4, color: color || '#ffffff' });
  }

  function addWanted(n) {
    state.wanted = clamp(state.wanted + n, 0, MAX_WANTED);
    state.lastCrime = state.elapsed;
  }

  function say(title, text, seconds) {
    state.dialogue = { title, text, t: seconds || 4 };
  }

  function makeCar(x, y, angle, kind, color) {
    return {
      x, y, angle, speed: 0, color: color || random.pick(CAR_COLORS),
      kind, axis: 'v', dir: 1, lane: 24, hp: 100, dead: false, steer: 0,
      cruise: random.range(120, 180), turnTimer: random.range(1, 4),
    };
  }

  function spawnTrafficCar(nearX, nearY) {
    const line = random.pick(roadLines());
    const axis = random.chance(0.5) ? 'v' : 'h';
    const dir = random.chance(0.5) ? 1 : -1;
    const lane = dir > 0 ? 24 : -24;
    let x;
    let y;
    if (axis === 'v') { x = line + lane; y = clamp(nearY + random.range(-700, 700), 100, WORLD_H - 100); }
    else { y = line + lane; x = clamp(nearX + random.range(-700, 700), 100, WORLD_W - 100); }
    const car = makeCar(x, y, axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI), 'traffic');
    car.axis = axis;
    car.dir = dir;
    car.lane = lane;
    car.speed = car.cruise;
    return car;
  }

  function spawnPed(nearX, nearY) {
    const line = random.pick(roadLines());
    const axis = random.chance(0.5) ? 'v' : 'h';
    const dir = random.chance(0.5) ? 1 : -1;
    const off = ROAD_W / 2 + 14;
    let x;
    let y;
    if (axis === 'v') { x = line + off * (random.chance(0.5) ? 1 : -1); y = clamp(nearY + random.range(-600, 600), 100, BEACH_Y - 40); }
    else { y = line + off * (random.chance(0.5) ? 1 : -1); x = clamp(nearX + random.range(-600, 600), 100, WORLD_W - 100); }
    return {
      x, y, angle: axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      speed: random.range(35, 70), axis, dir, off, color: random.pick(PED_COLORS),
      down: 0, hp: 30, kind: 'ped', hostile: false, shootTimer: random.range(0.5, 1.5),
    };
  }

  function spawnPickup(kind, x, y) {
    state.pickups.push({ x, y, kind, bob: random.range(0, Math.PI * 2) });
  }

  function populate() {
    state.cars = [];
    state.peds = [];
    state.police = [];
    state.bullets = [];
    state.pickups = [];
    for (let i = 0; i < 14; i += 1) state.cars.push(spawnTrafficCar(state.player.x, state.player.y));
    for (let i = 0; i < 10; i += 1) {
      const line = random.pick(roadLines());
      const axis = random.chance(0.5) ? 'v' : 'h';
      const x = axis === 'v' ? line + 24 : random.range(150, WORLD_W - 150);
      const y = axis === 'v' ? random.range(150, BEACH_Y - 100) : line + 24;
      const car = makeCar(x, y, axis === 'v' ? Math.PI / 2 : 0, 'parked');
      car.speed = 0;
      state.cars.push(car);
    }
    for (let i = 0; i < 22; i += 1) state.peds.push(spawnPed(state.player.x, state.player.y));
    for (let i = 0; i < 6; i += 1) spawnPickup('health', random.range(200, WORLD_W - 200), random.range(200, BEACH_Y - 100));
    for (let i = 0; i < 6; i += 1) spawnPickup('ammo', random.range(200, WORLD_W - 200), random.range(200, BEACH_Y - 100));
  }

  function reset() {
    state.player.x = PLACES.spawn.x;
    state.player.y = PLACES.spawn.y;
    state.player.angle = -Math.PI / 2;
    state.player.hp = 100;
    state.player.money = START_MONEY;
    state.player.ammo = 24;
    state.player.hasPistol = true;
    state.player.inCar = null;
    state.player.speed = 0;
    state.player.punchCooldown = 0;
    state.player.shootCooldown = 0;
    state.player.invulnerable = 0;
    state.wanted = 0;
    state.lastCrime = -999;
    state.clockMinutes = 9 * 60;
    state.elapsed = 0;
    state.camera.x = PLACES.spawn.x;
    state.camera.y = PLACES.spawn.y;
    state.shake = 0;
    state.bustedTimer = 0;
    state.dialogue = null;
    state.stats = { carsStolen: 0, pedsHit: 0, shotsFired: 0, missionsDone: 0 };
    state.particles = [];
    state.skids = [];
    state.floaters = [];
    populate();
    state.mission = createMissionController(state, { random, say, addWanted, addFloater, spawnPed, makeCar, addParticles });
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (car.dead) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    for (const car of state.police) {
      if (car.dead) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function damagePlayer(amount) {
    if (state.player.invulnerable > 0) return;
    state.player.hp = Math.max(0, state.player.hp - amount);
    state.player.invulnerable = 0.4;
    state.shake = Math.max(state.shake, 6);
  }

  function respawnAfterBusted() {
    const lost = Math.min(state.player.money, HOSPITAL_FINE);
    state.player.money -= lost;
    state.player.x = PLACES.hospital.x;
    state.player.y = PLACES.hospital.y + 220;
    state.player.angle = Math.PI / 2;
    state.player.hp = 100;
    state.player.inCar = null;
    state.player.speed = 0;
    state.wanted = 0;
    state.bustedTimer = 0;
    state.police = [];
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    say('St. Marina Hospital', `You woke up in a hospital bed. The fine cost you $${lost}. Lay low for a while.`, 5);
    return lost;
  }

  function updatePlayerOnFoot(dt, input, aimAngle) {
    const p = state.player;
    const speed = input.run() ? PLAYER_RUN : PLAYER_WALK;
    let dx = (input.right() ? 1 : 0) - (input.left() ? 1 : 0);
    let dy = (input.down() ? 1 : 0) - (input.up() ? 1 : 0);
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
      p.angle = angleLerp(p.angle, Math.atan2(dy, dx), Math.min(1, dt * 14));
      collideMove(p, dx * speed * dt, dy * speed * dt, PLAYER_RADIUS);
      p.speed = speed;
    } else {
      p.speed = 0;
    }
    if (aimAngle !== null && (input.mouse().down || input.takeClick())) {
      p.angle = aimAngle;
    }
    if (p.punchCooldown > 0) p.punchCooldown -= dt;
    if (p.shootCooldown > 0) p.shootCooldown -= dt;
  }

  function updatePlayerCar(dt, input) {
    const p = state.player;
    const car = p.inCar;
    if (!car) return;
    const forward = input.up() ? 1 : 0;
    const back = input.down() ? 1 : 0;
    if (forward) car.speed += CAR_ACCEL * dt;
    else if (back) {
      if (car.speed > 10) car.speed -= CAR_BRAKE * dt;
      else car.speed -= CAR_ACCEL * 0.55 * dt;
    } else {
      car.speed -= Math.sign(car.speed) * 140 * dt;
      if (Math.abs(car.speed) < 8) car.speed = 0;
    }
    car.speed = clamp(car.speed, -CAR_MAX_REVERSE, CAR_MAX_SPEED);
    const steer = (input.left() ? -1 : 0) + (input.right() ? 1 : 0);
    const steerAmount = steer * CAR_STEER * clamp(Math.abs(car.speed) / 220, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.angle += steerAmount * dt;
    car.steer = steer;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    // Building / water collision: stop hard, bounce a little, shake.
    const frontX = nx + Math.cos(car.angle) * (CAR_W / 2);
    const frontY = ny + Math.sin(car.angle) * (CAR_W / 2);
    if (solidAt(frontX, frontY) || solidAt(nx, ny)) {
      if (Math.abs(car.speed) > 200) {
        state.shake = Math.max(state.shake, 9);
        addParticles(car.x, car.y, '#888888', 10, 160);
        damagePlayer(6);
        state.events |= EVENT_CRASH;
      }
      car.speed *= -0.25;
    } else {
      car.x = nx;
      car.y = ny;
    }
    if (Math.abs(steer) > 0 && Math.abs(car.speed) > 300) {
      state.skids.push({ x: car.x - Math.cos(car.angle) * 16, y: car.y - Math.sin(car.angle) * 16, angle: car.angle, life: 5 });
      if (state.skids.length > 300) state.skids.shift();
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = Math.abs(car.speed);
  }

  function updateTraffic(dt) {
    const p = state.player;
    for (const car of state.cars) {
      if (car.kind !== 'traffic' || car.dead) continue;
      car.turnTimer -= dt;
      // Slow for a car ahead in the same lane.
      let target = car.cruise;
      for (const other of state.cars) {
        if (other === car || other.dead) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const along = car.axis === 'v' ? dy * car.dir : dx * car.dir;
        const side = car.axis === 'v' ? Math.abs(dx) : Math.abs(dy);
        if (along > 0 && along < 80 && side < 30) { target = Math.min(target, other.speed * 0.8); break; }
      }
      if (car.axis === 'v') {
        const cross = roadLines().find((line) => Math.abs(car.y - line) < 46);
        if (cross !== undefined && car.turnTimer <= 0 && random.chance(0.25)) {
          car.axis = 'h';
          car.dir = random.chance(0.5) ? 1 : -1;
          car.lane = car.dir > 0 ? 24 : -24;
          car.y = cross + car.lane;
          car.turnTimer = random.range(2, 5);
        }
      } else {
        const cross = roadLines().find((line) => Math.abs(car.x - line) < 46);
        if (cross !== undefined && car.turnTimer <= 0 && random.chance(0.25)) {
          car.axis = 'v';
          car.dir = random.chance(0.5) ? 1 : -1;
          car.lane = car.dir > 0 ? 24 : -24;
          car.x = cross + car.lane;
          car.turnTimer = random.range(2, 5);
        }
      }
      car.speed += clamp(target - car.speed, -300 * dt, 200 * dt);
      const wantAngle = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
      car.angle = angleLerp(car.angle, wantAngle, Math.min(1, dt * 6));
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (car.x < 60 || car.x > WORLD_W - 60 || car.y < 60 || car.y > WORLD_H - 60) {
        const fresh = spawnTrafficCar(p.x, p.y);
        Object.assign(car, fresh);
      }
    }
  }

  function updatePeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.down > 0) { ped.down -= dt; continue; }
      if (ped.hostile) {
        // Rivals and the boss chase the player and attack up close.
        const d = dist(ped.x, ped.y, p.x, p.y);
        const a = angleTo(ped.x, ped.y, p.x, p.y);
        ped.angle = angleLerp(ped.angle, a, Math.min(1, dt * 8));
        if (d > 34) {
          const sp = ped.kind === 'boss' ? 150 : 120;
          collideMove(ped, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt, 12);
        } else if (p.invulnerable <= 0) {
          damagePlayer(ped.kind === 'boss' ? 14 : 8);
          addParticles(p.x, p.y, '#ff5544', 6, 120);
        }
        ped.shootTimer -= dt;
        if (ped.kind === 'boss' && d < 340 && d > 60 && ped.shootTimer <= 0) {
          ped.shootTimer = 1.4;
          state.bullets.push({ x: ped.x, y: ped.y, angle: a, speed: 520, life: 1.1, from: 'enemy' });
        }
        continue;
      }
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      if (ped.axis === 'v') {
        const cross = roadLines().find((line) => Math.abs(ped.y - line) < 20);
        if (cross !== undefined && random.chance(0.01)) {
          ped.axis = 'h';
          ped.dir = random.chance(0.5) ? 1 : -1;
          ped.y = cross + ped.off * (random.chance(0.5) ? 1 : -1);
          ped.angle = ped.dir > 0 ? 0 : Math.PI;
        }
      } else {
        const cross = roadLines().find((line) => Math.abs(ped.x - line) < 20);
        if (cross !== undefined && random.chance(0.01)) {
          ped.axis = 'v';
          ped.dir = random.chance(0.5) ? 1 : -1;
          ped.x = cross + ped.off * (random.chance(0.5) ? 1 : -1);
          ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      }
      if (ped.x < 40 || ped.x > WORLD_W - 40 || ped.y < 40 || ped.y > BEACH_Y - 20) {
        Object.assign(ped, spawnPed(p.x, p.y));
      }
      // Hit by a fast car: knocked down, and the law notices.
      const car = p.inCar;
      if (car && Math.abs(car.speed) > 90 && dist(ped.x, ped.y, car.x, car.y) < 34) {
        ped.down = 4;
        ped.hp = 0;
        state.stats.pedsHit += 1;
        addWanted(1);
        addParticles(ped.x, ped.y, '#ff5544', 12, 180);
        state.events |= EVENT_HIT_PED | EVENT_CRIME;
      }
    }
    // Prune dead mission NPCs the mission controller already counted.
    state.peds = state.peds.filter((ped) => !(ped.hostile && ped.hp <= 0 && ped.down <= -99));
  }

  function updateBullets(dt) {
    for (const b of state.bullets) {
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      if (solidAt(b.x, b.y)) {
        b.life = 0;
        addParticles(b.x, b.y, '#ffcc66', 4, 90);
        continue;
      }
      if (b.from === 'player') {
        for (const car of [...state.cars, ...state.police]) {
          if (car.dead) continue;
          if (dist(b.x, b.y, car.x, car.y) < 30) {
            b.life = 0;
            car.hp -= 25;
            addParticles(b.x, b.y, '#ffcc66', 6, 120);
            if (car.hp <= 0 && !car.dead) {
              car.dead = true;
              car.speed = 0;
              addParticles(car.x, car.y, '#555555', 20, 200);
              if (car.kind === 'police') addWanted(1);
            }
            break;
          }
        }
        if (b.life <= 0) continue;
        for (const ped of state.peds) {
          if (ped.down > 0 || ped.hp <= 0) continue;
          if (dist(b.x, b.y, ped.x, ped.y) < 18) {
            b.life = 0;
            ped.hp -= 34;
            addParticles(b.x, b.y, '#ff5544', 8, 140);
            if (ped.hp <= 0) {
              ped.down = 999;
              if (!ped.hostile) { addWanted(1); state.events |= EVENT_CRIME; }
            }
            break;
          }
        }
      } else {
        const p = state.player;
        if (dist(b.x, b.y, p.x, p.y) < 16) {
          b.life = 0;
          damagePlayer(10);
          addParticles(b.x, b.y, '#ff5544', 6, 120);
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
  }

  function updatePickups(dt) {
    const p = state.player;
    for (const pk of state.pickups) {
      pk.bob += dt * 3;
      if (dist(p.x, p.y, pk.x, pk.y) < 30) {
        pk.taken = true;
        if (pk.kind === 'health') {
          p.hp = Math.min(100, p.hp + 40);
          addFloater(pk.x, pk.y, '+40 HP', '#7dff8a');
        } else {
          p.ammo += 24;
          addFloater(pk.x, pk.y, '+24 AMMO', '#ffd94a');
        }
        state.events |= EVENT_PICKUP;
      }
    }
    state.pickups = state.pickups.filter((pk) => !pk.taken);
    if (state.pickups.length < 8 && random.chance(0.002)) {
      spawnPickup(random.chance(0.5) ? 'health' : 'ammo', random.range(200, WORLD_W - 200), random.range(200, BEACH_Y - 100));
    }
  }

  function updateCarCollisions(dt) {
    const p = state.player;
    // A fast car hitting the player on foot knocks them down hard.
    if (!p.inCar) {
      for (const car of [...state.cars, ...state.police]) {
        if (car.dead || Math.abs(car.speed) < 60) continue;
        if (dist(p.x, p.y, car.x, car.y) < 30) {
          damagePlayer(12);
          addParticles(p.x, p.y, '#ff5544', 10, 160);
          state.shake = Math.max(state.shake, 8);
          state.events |= EVENT_CRASH;
          // Shove the player clear of the road.
          const a = angleTo(car.x, car.y, p.x, p.y);
          collideMove(p, Math.cos(a) * 40, Math.sin(a) * 40, PLAYER_RADIUS);
        }
      }
      return;
    }
    const playerCar = p.inCar;
    for (const car of state.cars) {
      if (car === playerCar || car.dead) continue;
      const d = dist(playerCar.x, playerCar.y, car.x, car.y);
      if (d < 44 && d > 0.01) {
        const push = (44 - d) / 2;
        const ax = (car.x - playerCar.x) / d;
        const ay = (car.y - playerCar.y) / d;
        car.x += ax * push;
        car.y += ay * push;
        playerCar.x -= ax * push;
        playerCar.y -= ay * push;
        const impact = Math.abs(playerCar.speed);
        if (impact > 220) {
          state.shake = Math.max(state.shake, 7);
          addParticles(playerCar.x, playerCar.y, '#ffcc66', 8, 150);
          state.events |= EVENT_CRASH;
          if (car.kind === 'traffic') addWanted(0);
        }
        car.speed *= 0.5;
        playerCar.speed *= 0.55;
        p.x = playerCar.x;
        p.y = playerCar.y;
      }
    }
    for (const cop of state.police) {
      if (cop.dead) continue;
      const d = dist(playerCar.x, playerCar.y, cop.x, cop.y);
      if (d < 44 && d > 0.01) {
        const push = (44 - d) / 2;
        const ax = (cop.x - playerCar.x) / d;
        const ay = (cop.y - playerCar.y) / d;
        cop.x += ax * push;
        cop.y += ay * push;
        playerCar.x -= ax * push;
        playerCar.y -= ay * push;
        if (Math.abs(playerCar.speed) > 150) {
          state.shake = Math.max(state.shake, 8);
          damagePlayer(4);
          state.events |= EVENT_CRASH;
        }
        cop.speed *= 0.4;
        playerCar.speed *= 0.6;
        p.x = playerCar.x;
        p.y = playerCar.y;
      }
    }
  }

  function step(dt, input, aimAngle, actions) {
    state.events = 0;
    state.elapsed += dt;
    state.clockMinutes += dt * 2;
    const p = state.player;
    if (p.invulnerable > 0) p.invulnerable -= dt;
    if (state.dialogue) {
      state.dialogue.t -= dt;
      if (state.dialogue.t <= 0) state.dialogue = null;
    }

    // Interact: talk to Marta to start a mission, or enter / exit a car.
    if (actions & 4) {
      if (!p.inCar && state.mission && !state.mission.active && state.mission.index >= 0) {
        const g = state.mission.giver();
        if (dist(p.x, p.y, g.x, g.y) < 90) {
          state.mission.start();
          state.events |= EVENT_MISSION;
          // Skip car entry this press: talking comes first.
          actions &= ~4;
        }
      }
    }
    if (actions & 4) {
      if (p.inCar) {
        const car = p.inCar;
        p.inCar = null;
        p.x = car.x - Math.cos(car.angle) * 40;
        p.y = car.y - Math.sin(car.angle) * 40;
        p.angle = car.angle;
        p.speed = 0;
      } else {
        const car = nearestCar(p.x, p.y, 56);
        if (car) {
          p.inCar = car;
          if (car.kind === 'parked' || car.kind === 'traffic') {
            car.kind = 'player';
            state.stats.carsStolen += 1;
            if (car.kind === 'player') addWanted(1);
            state.events |= EVENT_CRIME;
            addFloater(car.x, car.y - 30, 'Car taken!', '#ffd94a');
          }
          car.speed = 0;
          p.x = car.x;
          p.y = car.y;
        }
      }
    }

    if (p.inCar) updatePlayerCar(dt, input);
    else updatePlayerOnFoot(dt, input, aimAngle);

    // Shooting (mouse click) and punching (Space).
    if (!p.inCar) {
      if (input.mouse().down && p.shootCooldown <= 0 && p.ammo > 0 && p.hasPistol) {
        p.shootCooldown = 0.28;
        p.ammo -= 1;
        state.stats.shotsFired += 1;
        const a = aimAngle === null ? p.angle : aimAngle;
        state.bullets.push({ x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20, angle: a + random.range(-0.03, 0.03), speed: 900, life: 0.8, from: 'player' });
        state.events |= EVENT_SHOT;
        if (state.wanted < 1) addWanted(1);
        state.events |= EVENT_CRIME;
      }
      if (input.held('Space') && p.punchCooldown <= 0) {
        p.punchCooldown = 0.45;
        state.events |= EVENT_PUNCH;
        const a = aimAngle === null ? p.angle : aimAngle;
        const hx = p.x + Math.cos(a) * 40;
        const hy = p.y + Math.sin(a) * 40;
        for (const ped of state.peds) {
          if (ped.down > 0 || ped.hp <= 0) continue;
          if (dist(hx, hy, ped.x, ped.y) < 30) {
            ped.hp -= 22;
            addParticles(ped.x, ped.y, '#ff5544', 8, 140);
            if (ped.hp <= 0) {
              ped.down = 999;
              if (!ped.hostile) { addWanted(1); state.events |= EVENT_CRIME; }
            }
            break;
          }
        }
        for (const car of [...state.cars, ...state.police]) {
          if (!car.dead && dist(hx, hy, car.x, car.y) < 34) {
            car.hp -= 8;
            addParticles(hx, hy, '#ffcc66', 4, 100);
            break;
          }
        }
      }
    }

    updateTraffic(dt);
    updatePeds(dt);
    updateBullets(dt);
    updatePickups(dt);
    updateCarCollisions(dt);
    updatePolice(state, dt, { addWanted, addParticles, damagePlayer, makeCar, random });
    if (state.mission) state.mission.update(dt);

    // Wanted decays when you lay low.
    if (state.wanted > 0 && state.elapsed - state.lastCrime > WANTED_DECAY_SECONDS) {
      state.wanted -= 1;
      state.lastCrime = state.elapsed;
    }

    // Busted: caught on foot, or health gone.
    if (p.hp <= 0) {
      state.events |= EVENT_BUSTED;
    } else if (!p.inCar && state.wanted > 0) {
      let touching = false;
      for (const cop of state.police) {
        if (!cop.dead && cop.onFoot && dist(p.x, p.y, cop.x, cop.y) < 26) { touching = true; break; }
      }
      if (touching) {
        state.bustedTimer += dt;
        if (state.bustedTimer > 1.2) state.events |= EVENT_BUSTED;
      } else {
        state.bustedTimer = Math.max(0, state.bustedTimer - dt * 2);
      }
    }

    // Particles, skid fade, floaters.
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const s of state.skids) s.life -= dt;
    state.skids = state.skids.filter((s) => s.life > 0);
    for (const f of state.floaters) {
      f.y -= 30 * dt;
      f.life -= dt;
    }
    state.floaters = state.floaters.filter((f) => f.life > 0);

    // Camera follows the player smoothly.
    state.camera.x += (p.x - state.camera.x) * Math.min(1, dt * 5);
    state.camera.y += (p.y - state.camera.y) * Math.min(1, dt * 5);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 22);

    return state.events;
  }

  reset();
  return {
    state,
    buildings,
    parks,
    trees,
    reset,
    step,
    solidAt,
    nearestCar,
    addWanted,
    damagePlayer,
    respawnAfterBusted,
    say,
    addFloater,
    addParticles,
    spawnPickup,
    makeCar,
    spawnTrafficCar,
    spawnPed,
  };
}
