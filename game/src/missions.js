// Vice Bay — the story. Rio, a bike courier who just lost his delivery van, gets
// pulled into a crew war between Marta's harbour crew and the Coral Kings. Five
// linked missions: deliver, steal, fight, escape, settle it at the docks. All names
// and places are invented for this game.
import { PLACES } from './config.js';
import { dist } from './random.js';

const MISSIONS = [
  {
    id: 1,
    title: 'First Delivery',
    intro: 'Marta: "Rio, my courier quit. Take this parcel to the garage on Bay Row. No questions, no stops."',
    reward: 150,
    steps: [
      { type: 'goto', target: { x: PLACES.garage.x, y: PLACES.garage.y + 240 }, label: 'Deliver the parcel to Rook\'s Garage' },
    ],
    outro: 'Rook: "Marta sends her best. The Kings took our last van — she will want a word with you."',
  },
  {
    id: 2,
    title: 'Hot Wheels',
    intro: 'Marta: "The Kings took our van, so we take one of theirs. There is a red sedan parked by the north park. Bring it to my garage."',
    reward: 300,
    steps: [
      { type: 'steal', label: 'Steal the red sedan by the north park', carColor: '#c23b2e', spot: { x: 1400, y: 620 } },
      { type: 'goto', target: { x: PLACES.garage.x, y: PLACES.garage.y + 240 }, label: 'Bring the sedan to Rook\'s Garage', needsCar: true },
    ],
    outro: 'Rook: "Nice paint. The Kings will not like this. They never do."',
  },
  {
    id: 3,
    title: 'Loud Message',
    intro: 'Marta: "Three Kings are shaking down the corner shops on Marina Row. Send them home. Fists or iron — your call."',
    reward: 400,
    steps: [
      { type: 'defeat', count: 3, label: 'Deal with 3 Coral Kings near Marina Row', spot: { x: 2200, y: 1800 } },
      { type: 'goto', target: { x: PLACES.marta.x, y: PLACES.marta.y }, label: 'Report back to Marta' },
    ],
    outro: 'Marta: "Word travels fast. Their boss, Caspian, is asking for you by name now."',
  },
  {
    id: 4,
    title: 'The Getaway',
    intro: 'Marta: "Our driver, Juno, is cornered at the west park and the heat is on. Pick him up and lose the patrol cars at the safehouse."',
    reward: 600,
    steps: [
      { type: 'goto', target: { x: 620, y: 2220 }, label: 'Reach Juno at the west park' },
      { type: 'escape', target: { x: PLACES.safehouse.x, y: PLACES.safehouse.y }, label: 'Escape the police — reach the Safehouse', wanted: 2 },
    ],
    outro: 'Juno: "You drive like the bay is on fire. Marta owes you a real cut now."',
  },
  {
    id: 5,
    title: 'Harbor Showdown',
    intro: 'Marta: "Caspian is at the docks with his crew. End this, Rio, and the bay is ours."',
    reward: 1000,
    steps: [
      { type: 'defeat', count: 1, boss: true, label: 'Defeat Caspian at the Marina Docks', spot: { x: PLACES.docks.x, y: PLACES.docks.y } },
      { type: 'goto', target: { x: PLACES.marta.x, y: PLACES.marta.y }, label: 'Return to Marta' },
    ],
    outro: 'Marta: "The bay is quiet tonight. You are family now, Rio. Vice Bay is yours."',
  },
];

export function createMissionController(state, helpers) {
  const { random, say, addWanted, addFloater, spawnPed, makeCar, addParticles } = helpers;
  let index = 0; // 0-based mission index; -1 means the story is finished
  let stepIndex = 0;
  let active = false;
  let spawned = [];
  let defeated = 0;
  let targetCar = null;
  let marker = null;
  let announced = false;

  function current() {
    return index >= 0 && index < MISSIONS.length ? MISSIONS[index] : null;
  }

  function currentStep() {
    const m = current();
    return m ? m.steps[stepIndex] : null;
  }

  function clearSpawned() {
    for (const ped of spawned) {
      ped.hp = 0;
      ped.down = 999;
    }
    spawned = [];
    targetCar = null;
  }

  function setupStep() {
    const step = currentStep();
    if (!step) return;
    defeated = 0;
    marker = step.target || step.spot || null;
    if (step.type === 'defeat') {
      const n = step.count;
      for (let i = 0; i < n; i += 1) {
        const ped = spawnPed(state.player.x, state.player.y);
        ped.x = step.spot.x + random.range(-90, 90);
        ped.y = step.spot.y + random.range(-90, 90);
        ped.kind = step.boss ? 'boss' : 'rival';
        ped.hostile = true;
        ped.hp = step.boss ? 170 : 60;
        ped.color = '#c23b2e';
        ped.down = 0;
        state.peds.push(ped);
        spawned.push(ped);
      }
      marker = step.spot;
    } else if (step.type === 'steal') {
      const car = makeCar(step.spot.x, step.spot.y, 0, 'parked', step.carColor);
      car.speed = 0;
      state.cars.push(car);
      targetCar = car;
      marker = step.spot;
    } else if (step.type === 'escape') {
      addWanted(step.wanted || 2);
    }
  }

  function start() {
    const m = current();
    if (!m) return;
    active = true;
    stepIndex = 0;
    announced = false;
    say(`Mission ${m.id} — ${m.title}`, m.intro, 6);
    setupStep();
  }

  function completeStep() {
    const m = current();
    stepIndex += 1;
    if (stepIndex >= m.steps.length) {
      // Mission done: pay out and roll to the next one.
      state.player.money += m.reward;
      state.stats.missionsDone += 1;
      addFloater(state.player.x, state.player.y - 30, `+$${m.reward}`, '#7dff8a');
      say(`Mission ${m.id} complete`, `${m.outro}  (+$${m.reward})`, 6);
      clearSpawned();
      index += 1;
      stepIndex = 0;
      active = false;
      if (index >= MISSIONS.length) {
        index = -1;
        say('Vice Bay', 'Story complete. The city is yours — keep driving, keep earning.', 8);
      }
      return 'done';
    }
    setupStep();
    return 'step';
  }

  function update(dt) {
    if (!active) return;
    const step = currentStep();
    if (!step) return;
    const p = state.player;
    if (step.type === 'goto') {
      if (step.needsCar && !p.inCar) return;
      if (dist(p.x, p.y, step.target.x, step.target.y) < 70) completeStep();
    } else if (step.type === 'steal') {
      if (p.inCar === targetCar) completeStep();
    } else if (step.type === 'defeat') {
      defeated = spawned.filter((ped) => ped.hp <= 0).length;
      if (defeated >= step.count) completeStep();
    } else if (step.type === 'escape') {
      if (dist(p.x, p.y, step.target.x, step.target.y) < 80) {
        if (state.wanted <= 1) completeStep();
        else if (!announced) {
          announced = true;
          say('The Getaway', 'Lose the heat first — stay out of sight until the stars drop.', 4);
        }
      }
    }
  }

  return {
    get index() { return index; },
    get active() { return active; },
    get marker() { return marker; },
    get step() { return currentStep(); },
    get mission() { return current(); },
    get defeated() { return defeated; },
    get targetCar() { return targetCar; },
    start,
    update,
    // Restore progress after loading a save.
    restore(missionIndex) {
      index = missionIndex;
      stepIndex = 0;
      active = false;
      spawned = [];
      targetCar = null;
      marker = null;
      if (index >= 0 && index < MISSIONS.length) {
        marker = { x: PLACES.marta.x, y: PLACES.marta.y };
      }
    },
    // Where the mission giver stands, for the minimap.
    giver() { return { x: PLACES.marta.x, y: PLACES.marta.y }; },
    label() {
      const m = current();
      if (!m) return 'Story complete — free roam';
      if (!active) return `Talk to Marta to start: ${m.title}`;
      const step = currentStep();
      if (!step) return m.title;
      let label = step.label;
      if (step.type === 'defeat') label += `  (${defeated}/${step.count})`;
      return `${m.title}: ${label}`;
    },
  };
}
