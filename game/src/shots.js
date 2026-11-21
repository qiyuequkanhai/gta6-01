// Vice Bay — the screenshot scenes behind ?shot=start|drive|chase|mission.
// Each one plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a tiny autopilot, so the frame is what a short game really
// looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { EVENT_BUSTED } from './world.js';

const START_SECONDS = 5;
const DRIVE_SECONDS = 3.5;
const CHASE_SECONDS = 4;
const MISSION_SECONDS = 1.2;

// An input-shaped object whose answers the autopilot rewrites before every step.
function autopilotInput() {
  const flags = { up: false, down: false, left: false, right: false, run: false };
  return {
    flags,
    up() { return flags.up; },
    down() { return flags.down; },
    left() { return flags.left; },
    right() { return flags.right; },
    run() { return flags.run; },
    held() { return false; },
    mouse() { return { x: 0, y: 0, down: false }; },
    takeClick() { return false; },
    takeActions() { return 0; },
  };
}

function driveToward(car, targetAngle, input) {
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  input.flags.up = true;
  input.flags.left = diff < -0.08;
  input.flags.right = diff > 0.08;
}

function runSteps(world, seconds, steer) {
  const input = autopilotInput();
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (steer) steer(input, world);
    const events = world.step(STEP, input, null, 0);
    if (events & EVENT_BUSTED) break;
  }
  return input;
}

/**
 * Set `world` to the named scene (start, drive, chase or mission; anything else is
 * start) and return the screen to draw over it.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'drive' && name !== 'chase' && name !== 'mission') {
    runSteps(world, START_SECONDS, null);
    return { screen: SCREEN_TITLE };
  }

  if (name === 'drive' || name === 'chase') {
    // Put the player in a car heading south down Bay Row (x = 1400) with traffic.
    const car = state.cars.find((c) => c.kind === 'parked') || state.cars[0];
    car.kind = 'player';
    car.x = 1424;
    car.y = 900;
    car.angle = Math.PI / 2;
    car.speed = 0;
    state.player.inCar = car;
    state.player.x = car.x;
    state.player.y = car.y;
    state.camera.x = car.x;
    state.camera.y = car.y;
    // Traffic ahead on the same road, so the frame shows a living street.
    const traffic = state.cars.filter((c) => c.kind === 'traffic');
    for (let i = 0; i < Math.min(4, traffic.length); i += 1) {
      const t = traffic[i];
      t.axis = 'v';
      t.dir = 1;
      t.lane = 24;
      t.x = 1424;
      t.y = car.y + 280 + i * 230;
      t.angle = Math.PI / 2;
      t.speed = 150;
      t.cruise = 150;
    }
    if (name === 'chase') {
      state.wanted = 3;
      state.lastCrime = 0;
      for (let i = 0; i < 2; i += 1) {
        const cop = world.makeCar(car.x + (i === 0 ? -90 : 90), car.y - 320 - i * 160, Math.PI / 2, 'police', '#1c2f6e');
        cop.hp = 120;
        cop.speed = 380;
        state.police.push(cop);
      }
      world.say('Patrols on you', 'Three stars — lose them or outrun them.', 5);
    }
    runSteps(world, name === 'chase' ? CHASE_SECONDS : DRIVE_SECONDS, (input) => {
      const c = state.player.inCar;
      if (c) driveToward(c, Math.PI / 2, input);
    });
    return { screen: SCREEN_PLAY };
  }

  // Mission: Marta's first delivery, player on foot near the garage target.
  state.player.x = 2100;
  state.player.y = 1100;
  state.player.angle = Math.PI / 4;
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  state.mission.start();
  runSteps(world, MISSION_SECONDS, (input) => {
    const marker = state.mission.marker;
    if (!marker) return;
    const p = state.player;
    const dx = marker.x - p.x;
    const dy = marker.y - p.y;
    input.flags.up = dy < -20;
    input.flags.down = dy > 20;
    input.flags.left = dx < -20;
    input.flags.right = dx > 20;
    input.flags.run = true;
  });
  return { screen: SCREEN_PLAY };
}
