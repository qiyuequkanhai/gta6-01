// Vice Bay — shared constants for the open-world crime game.
// All values are the game's own tuning; nothing here comes from any other game.
export const STEP = 1 / 60;
export const SAVE_KEY = 'vicebay-save-v1';

export const WORLD_W = 3200;
export const WORLD_H = 3200;
export const ROAD_W = 96;
export const ROAD_GAP = 400; // distance between road centre lines
export const ROAD_FIRST = 200; // centre line of the first road
export const BEACH_Y = 2920; // sand starts here
export const WATER_Y = 3000; // water starts here

export const PLAYER_WALK = 185;
export const PLAYER_RUN = 305;
export const PLAYER_RADIUS = 14;

export const CAR_W = 46;
export const CAR_H = 24;
export const CAR_ACCEL = 420;
export const CAR_BRAKE = 620;
export const CAR_MAX_SPEED = 560;
export const CAR_MAX_REVERSE = 180;
export const CAR_STEER = 2.6;

export const MAX_WANTED = 5;
export const WANTED_DECAY_SECONDS = 10;

export const START_MONEY = 120;
export const HOSPITAL_FINE = 200;

export const COLORS = {
  grass: '#5d8a4a',
  grassDark: '#527a41',
  road: '#3a3d42',
  roadEdge: '#2c2e33',
  lane: '#d8c95a',
  sidewalk: '#9a9a92',
  sand: '#d9c27a',
  water: '#2f6fb2',
  waterDeep: '#2560a0',
  park: '#4c7a3d',
  buildingRoof: ['#b0563a', '#7a6a55', '#5d7a8c', '#8c5d7a', '#6a7a4a', '#a08a4a', '#4a6a7a', '#96684a'],
  hospital: '#e8e8e8',
  garage: '#c98a3a',
};

// Key places, in world coordinates (chosen on the road grid).
export const PLACES = {
  hospital: { x: 600, y: 600, label: 'St. Marina Hospital' },
  garage: { x: 2600, y: 600, label: "Rook's Garage" },
  safehouse: { x: 600, y: 2600, label: 'Safehouse' },
  docks: { x: 2600, y: 2780, label: 'Marina Docks' },
  marta: { x: 1000, y: 1000, label: "Marta's Corner" },
  spawn: { x: 1000, y: 1080 },
};
