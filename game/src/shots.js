// The screenshot scenes behind ?shot=start|play|end. Each plays the real simulation forward
// from a fresh world: the title over a living city, an autopilot courier run with the law
// giving chase, and a bust staged by cornering Riko on foot. The same seed always stages
// the same frame.
import { AVENUES, STREETS, STEP } from './config.js';
import { ACTION_ENTER } from './input.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const IDLE = { x: 0, y: 0, boost: false };
const TAU = Math.PI * 2;

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function nearestLine(lines, v) {
  let best = lines[0];
  for (const line of lines) if (Math.abs(line - v) < Math.abs(best - v)) best = line;
  return best;
}

/** A road-following route: out to the nearest corner, along the grid, and in to the target. */
function roadPath(from, to) {
  const startCorner = { x: nearestLine(AVENUES, from.x), y: nearestLine(STREETS, from.y) };
  const endCorner = { x: nearestLine(AVENUES, to.x), y: nearestLine(STREETS, to.y) };
  return [
    startCorner,
    { x: startCorner.x, y: endCorner.y },
    endCorner,
    { x: to.x, y: to.y },
  ];
}

/** Steer the player's car toward a point, the way a careful player would. */
function pilotCar(state, tx, ty, reverseTimer) {
  const car = state.player.car;
  if (!car) return IDLE;
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = wrapAngle(desired - car.angle);
  let steer = clamp(diff * 1.9, -1, 1);
  let y = -1;
  if (reverseTimer > 0) {
    y = 1;
    steer = -steer;
  } else if (Math.cos(diff) < -0.55) {
    y = 1;
    steer = clamp(-diff * 1.9, -1, 1);
  } else if (Math.abs(diff) > 1.25 && Math.abs(car.speed) < 40) {
    y = 0;
  }
  const d = Math.hypot(tx - car.x, ty - car.y);
  if (d < 40 && Math.abs(car.speed) < 50) y = 0;
  return { x: steer, y, boost: false };
}

function stageStart(world) {
  world.reset();
  for (let i = 0; i < 4 / STEP; i += 1) world.step(STEP, IDLE, 0, true);
  return { screen: SCREEN_TITLE, best: 0 };
}

function stagePlay(world) {
  // Two passes at most: if the law ends the run early, stage it again a touch cooler.
  for (const heat of [2, 1]) {
    world.reset();
    const state = world.state;
    const own = state.cars.find((c) => c.owned);
    state.player.x = own.x + 26;
    state.player.y = own.y;
    world.step(STEP, IDLE, ACTION_ENTER, false);
    state.wanted = heat;
    let waypoints = [];
    let waypointAt = -1;
    let reverseTimer = 0;
    let stuck = 0;
    let lastX = state.player.x;
    let lastY = state.player.y;
    // A moment for the first job to come in, then drive it for a good stretch of film.
    for (let i = 0; i < 3.2 / STEP; i += 1) world.step(STEP, IDLE, 0, false);
    for (let i = 0; i < 13 / STEP; i += 1) {
      // In the last stretch the run turns hot again, so the frame keeps its stars.
      if (i === Math.floor(11.5 / STEP)) state.wanted = Math.max(state.wanted, heat);
      const target = world.missionTarget();
      if (!target) { world.step(STEP, IDLE, 0, false); continue; }
      if (waypointAt === -1 || i % 30 === 0) {
        const focus = state.player.car ?? state.player;
        waypoints = roadPath(focus, target);
        waypointAt = 0;
      }
      while (waypointAt < waypoints.length - 1
        && Math.hypot(waypoints[waypointAt].x - state.player.x, waypoints[waypointAt].y - state.player.y) < 84) {
        waypointAt += 1;
      }
      const wp = waypoints[waypointAt];
      // Unstick: if the car has barely moved for a second and a half, back out and retry.
      if (Math.hypot(state.player.x - lastX, state.player.y - lastY) < 3) stuck += STEP;
      else { stuck = 0; lastX = state.player.x; lastY = state.player.y; }
      if (stuck > 1.5) { reverseTimer = 0.6; stuck = 0; }
      if (reverseTimer > 0) reverseTimer -= STEP;
      world.step(STEP, pilotCar(state, wp.x, wp.y, reverseTimer), 0, false);
      if (state.busted) break;
    }
    if (!state.busted) return { screen: SCREEN_PLAY, best: 0 };
  }
  return { screen: SCREEN_PLAY, best: 0 };
}

function stageEnd(world) {
  world.reset();
  const state = world.state;
  state.cash = 260; // a decent night's work, about to be confiscated by circumstance
  // The scene plays out across town from Uncle's garage — fleeing home would end it early.
  state.player.x = 2040;
  state.player.y = 1352;
  state.wanted = 3;
  // Ninety seconds of law arrive in five: Riko runs, sprinting from the nearest patrol.
  for (let i = 0; i < 5 / STEP; i += 1) {
    let nearest = null;
    let nearestD = Infinity;
    for (const car of state.cars) {
      if (car.mode !== 'police') continue;
      const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
      if (d < nearestD) { nearestD = d; nearest = car; }
    }
    let drive = IDLE;
    if (nearest) {
      const away = Math.atan2(state.player.y - nearest.y, state.player.x - nearest.x);
      drive = { x: Math.cos(away), y: Math.sin(away), boost: true };
    }
    world.step(STEP, drive, 0, false);
    if (state.busted) break;
  }
  if (!state.busted) {
    // Cornered at last: a patrol rolls up and Riko stops running.
    let nearest = null;
    let nearestD = Infinity;
    for (const car of state.cars) {
      if (car.mode !== 'police') continue;
      const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
      if (d < nearestD) { nearestD = d; nearest = car; }
    }
    if (nearest) {
      nearest.x = state.player.x + 42;
      nearest.y = state.player.y;
      nearest.speed = 0;
      nearest.angle = Math.PI;
    }
    for (let i = 0; i < 2.6 / STEP && !state.busted; i += 1) world.step(STEP, IDLE, 0, false);
  }
  return { screen: SCREEN_OVER, best: state.cash };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return
 * the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  if (name === 'play') return stagePlay(world);
  if (name === 'end') return stageEnd(world);
  return stageStart(world);
}
