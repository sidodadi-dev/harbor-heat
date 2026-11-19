// Harbor Heat — every tuning number and colour in one place. The view is a fixed 1280x720
// logical area that the renderer scales to the window; the world is Port Meridian, a coastal
// city of 4200x3120 px that the camera roams over.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const WORLD = { width: 4200, height: 3120 };

/** Roads: half the road width, and the lane offset from a road's centre line (right-hand traffic). */
export const ROAD_HALF = 64;
export const LANE = 32;

/** Vertical road centre lines (west to east) and horizontal ones (north to south). */
export const AVENUES = [240, 840, 1440, 2040, 2640, 3240, 3900];
export const STREETS = [240, 780, 1320, 1860, 2400, 2940];
export const AVENUE_NAMES = ['Breakwater', 'Palm', 'Meridian', 'Dockside', 'Coral', 'Harbor', 'Promenade'];
export const STREET_NAMES = ['Anchor', 'Beacon', 'Compass', 'Driftwood', 'Ember', 'Ferry'];

/** The sea starts here; between the promenade's east edge and the water is a sand seawall. */
export const WATER_X = 4032;

export const PLAYER = {
  radius: 10,
  walk: 152,
  sprint: 238,
};

export const CAR = {
  length: 46,
  width: 22,
  radius: 19, // collision circle at the centre; two smaller circles guard the nose and tail
  endRadius: 15,
  endOffset: 13,
  accel: 265,
  brake: 430,
  reverseMax: 135,
  maxSpeed: 432,
  drag: 0.55, // per-second velocity bleed with no throttle
  rollDrag: 2.2, // extra bleed while coasting
  grip: 3.4, // steering strength in the bicycle-lite model below
  health: 100,
};

export const TRAFFIC = {
  count: 16,
  speedMin: 185,
  speedMax: 262,
  accel: 170,
};

export const POLICE = {
  maxSpeed: 478,
  accel: 330,
  spawnGap: 560, // never materialise closer than this to the player
  bustRadius: 54,
  bustSeconds: 2,
  sightRange: 720,
};

export const WANTED = {
  max: 5,
  coolSeconds: 7, // unseen for this long, one star drains
  theftSight: 470, // a theft is seen inside this range with a clear view
};

export const PED = { count: 22, walkMin: 34, walkMax: 58, flee: 168, radius: 9 };

export const MISSION = {
  cooldown: 5, // seconds between one mission ending and the next being offered
  minPickup: 480, // mission points are at least this far from the player…
  maxPickup: 1750, // …and at most this far
  minLeg: 620,
  maxLeg: 2100,
};

export const PALETTE = {
  backdrop: '#10151d',
  grass: '#7cab58',
  parkGrass: '#63a047',
  parkPath: '#d9c9a3',
  pond: '#3f8fb5',
  blockBase: '#b3a893',
  sidewalk: '#d8d1c1',
  lot: '#8f8c85',
  road: '#3f434b',
  roadEdge: '#2f333a',
  lane: '#e9c46a',
  crosswalk: '#cfd4d9',
  sand: '#e7d8a4',
  water: '#2f7ea6',
  waterDeep: '#276e92',
  buildingTrim: 'rgba(0,0,0,0.16)',
  tree: '#3e7d32',
  treeTop: '#57a047',
  text: '#f4f1e8',
  muted: '#b9c0c9',
  accent: '#ffb703',
  danger: '#ef476f',
  good: '#06d6a0',
  police: '#4361ee',
  panel: 'rgba(16, 21, 29, 0.88)',
  minimapBg: 'rgba(16, 21, 29, 0.72)',
};

export const BUILDING_COLORS = [
  '#e8b4a0', '#e9d8a6', '#a8d5e5', '#c3e0b0', '#e5a3b4',
  '#d9c7e7', '#f2e3c6', '#ffb38a', '#bfe3dd', '#f4acb7',
];

export const CAR_COLORS = ['#d94f30', '#3a7bd5', '#f2b134', '#5cb85c', '#9b59b6', '#ecf0f1', '#e67e22', '#16a3a3'];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best cash haul is kept between visits (this browser only). */
export const BEST_KEY = 'harbor-heat.best';
