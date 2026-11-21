// Vice Bay — boot and the one loop. Input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. Screens: title, play,
// paused, busted. Progress (money, mission, position) autosaves to localStorage.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CASH, EVENT_CRASH, EVENT_CRIME, EVENT_PICKUP, EVENT_PUNCH, EVENT_SHOT } from './world.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const AUTOSAVE_SECONDS = 10;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    const p = world.state.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: p.money,
      hp: p.hp,
      ammo: p.ammo,
      x: p.x,
      y: p.y,
      mission: world.state.mission ? world.state.mission.index : -1,
      missionsDone: world.state.stats.missionsDone,
    }));
    return true;
  } catch {
    return false;
  }
}

function applySave(save) {
  const p = world.state.player;
  p.money = save.money ?? 120;
  p.hp = save.hp ?? 100;
  p.ammo = save.ammo ?? 24;
  p.x = save.x ?? p.x;
  p.y = save.y ?? p.y;
  world.state.camera.x = p.x;
  world.state.camera.y = p.y;
  if (world.state.mission) world.state.mission.restore(save.mission ?? 0);
  world.state.stats.missionsDone = save.missionsDone ?? 0;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, { hasSave: false, saveFlash: 0 });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let saveTimer = AUTOSAVE_SECONDS;
  let saveFlash = 0;
  let missionsDone = 0;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame(fresh) {
    if (fresh) {
      world.reset();
      try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      save = null;
    }
    missionsDone = world.state.stats.missionsDone;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing Vice Bay. Follow the gold marker — Marta is waiting.');
  }

  function continueGame() {
    world.reset();
    const loaded = readSave();
    if (loaded) applySave(loaded);
    missionsDone = world.state.stats.missionsDone;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Continued your saved game.');
  }

  function aimAngle() {
    const m = input.mouse();
    const scale = Math.max(renderer.view.w / 1280, renderer.view.h / 720);
    const wx = world.state.camera.x + (m.x - renderer.view.w / 2) / scale;
    const wy = world.state.camera.y + (m.y - renderer.view.h / 2) / scale;
    const p = world.state.player;
    return Math.atan2(wy - p.y, wx - p.x);
  }

  function step(actions) {
    const events = world.step(STEP, input, aimAngle(), actions);
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_CASH) audio.cash();
    if (world.state.stats.missionsDone !== missionsDone) {
      missionsDone = world.state.stats.missionsDone;
      audio.mission();
      if (writeSave()) saveFlash = 2;
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      world.respawnAfterBusted();
      screen = SCREEN_BUSTED;
      announce('Busted. You woke up at the hospital.');
    }
    // Autosave while playing.
    saveTimer -= STEP;
    if (saveTimer <= 0) {
      saveTimer = AUTOSAVE_SECONDS;
      if (writeSave()) saveFlash = 2;
    }
    if (saveFlash > 0) saveFlash -= STEP;
    // Engine hum and sirens follow the action.
    const p = world.state.player;
    audio.engine(p.inCar ? Math.abs(p.inCar.speed) / 560 : 0, !!p.inCar);
    audio.siren(world.state.wanted > 0, STEP);
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame(true);
      else if (input.takeClick()) startGame(true);
      else if (input.held('KeyC') && save) continueGame();
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_BUSTED) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Back on the streets.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_PLAY) {
      let firstStep = true;
      while (accumulator >= STEP) {
        step(firstStep ? actions : 0);
        firstStep = false;
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) { accumulator = 0; break; }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, { hasSave: !!save, saveFlash });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Vice Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
