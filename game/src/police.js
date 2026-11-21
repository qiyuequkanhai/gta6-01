// Vice Bay — police pressure. Patrol cars spawn on the roads near the player while
// the wanted level is above zero, chase and ram; at higher stars foot officers join
// the hunt. The count and speed scale with the wanted level, and the force stands
// down as the heat decays.
import { CAR_MAX_SPEED, MAX_WANTED, ROAD_FIRST, ROAD_GAP, WORLD_H, WORLD_W } from './config.js';
import { angleLerp, clamp, dist } from './random.js';

function onRoad(x, y) {
  for (let i = 0; i < 8; i += 1) {
    const line = ROAD_FIRST + i * ROAD_GAP;
    if (Math.abs(x - line) <= 48 || Math.abs(y - line) <= 48) return true;
  }
  return false;
}

function spawnSpot(state, random) {
  const p = state.player;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const angle = random.range(0, Math.PI * 2);
    const d = random.range(500, 800);
    const x = clamp(p.x + Math.cos(angle) * d, 120, WORLD_W - 120);
    const y = clamp(p.y + Math.sin(angle) * d, 120, WORLD_H - 120);
    if (onRoad(x, y)) return { x, y };
  }
  const angle = random.range(0, Math.PI * 2);
  const d = random.range(500, 800);
  return {
    x: clamp(p.x + Math.cos(angle) * d, 120, WORLD_W - 120),
    y: clamp(p.y + Math.sin(angle) * d, 120, WORLD_H - 120),
  };
}

export function updatePolice(state, dt, helpers) {
  const { addParticles, damagePlayer, makeCar, random } = helpers;
  const p = state.player;
  const wanted = state.wanted;

  // Desired force: one patrol car per star (up to 4), plus foot officers at 3+.
  const wantCars = wanted === 0 ? 0 : Math.min(4, wanted);
  const wantFoot = wanted >= 3 ? Math.min(3, wanted - 1) : 0;

  let aliveCars = 0;
  for (const cop of state.police) if (!cop.dead && !cop.onFoot) aliveCars += 1;
  let aliveFoot = 0;
  for (const cop of state.police) if (!cop.dead && cop.onFoot) aliveFoot += 1;

  if (aliveCars < wantCars) {
    const spot = spawnSpot(state, random);
    const car = makeCar(spot.x, spot.y, 0, 'police', '#1c2f6e');
    car.axis = 'v';
    car.dir = 1;
    car.hp = 120;
    car.cruise = 0;
    state.police.push(car);
  }
  if (aliveFoot < wantFoot) {
    const spot = spawnSpot(state, random);
    state.police.push({
      x: spot.x, y: spot.y, angle: 0, speed: 0, color: '#1c2f6e',
      kind: 'police', onFoot: true, hp: 60, dead: false, radius: 13,
    });
  }

  // No heat: the force drives off and despawns far away.
  if (wanted === 0) {
    state.police = state.police.filter((cop) => {
      if (cop.dead) return false;
      return dist(cop.x, cop.y, p.x, p.y) < 1100;
    });
  }

  for (const cop of state.police) {
    if (cop.dead) continue;
    if (cop.onFoot) {
      const d = dist(cop.x, cop.y, p.x, p.y);
      const a = Math.atan2(p.y - cop.y, p.x - cop.x);
      cop.angle = angleLerp(cop.angle, a, Math.min(1, dt * 8));
      const speed = 185 + wanted * 12;
      if (d > 24) {
        cop.x += Math.cos(a) * speed * dt;
        cop.y += Math.sin(a) * speed * dt;
      } else if (!p.inCar && p.invulnerable <= 0) {
        damagePlayer(6);
      }
      if (d > 1500) cop.dead = true;
      continue;
    }
    // Patrol car chase: steer toward the player, faster at higher stars.
    const d = dist(cop.x, cop.y, p.x, p.y);
    const targetAngle = Math.atan2(p.y - cop.y, p.x - cop.x);
    cop.angle = angleLerp(cop.angle, targetAngle, Math.min(1, dt * (1.6 + wanted * 0.35)));
    const topSpeed = Math.min(CAR_MAX_SPEED + 40, 300 + wanted * 55);
    cop.speed += clamp(topSpeed - cop.speed, -500 * dt, 320 * dt);
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    // Ramming the player on foot hurts.
    if (!p.inCar && d < 30 && p.invulnerable <= 0) {
      damagePlayer(12);
      addParticles(p.x, p.y, '#ff5544', 8, 150);
    }
    if (d > 1800) cop.dead = true;
  }
  state.police = state.police.filter((cop) => {
    if (!cop.dead) return true;
    if (cop.onFoot) return false;
    cop.wreckTimer = (cop.wreckTimer || 0) + dt;
    return cop.wreckTimer <= 8;
  });
}

export { MAX_WANTED };
