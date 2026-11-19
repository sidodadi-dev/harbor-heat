// Harbor Heat's rules and state, with no drawing and no browser in it: Riko on foot and in
// cars, the traffic that follows Port Meridian's lanes, the police who hunt by line of
// sight, pedestrians, the wanted heat, and the jobs that pay. step() advances one fixed
// step under a drive input ({x, y, boost}) and returns what happened as EV bit flags, so
// the caller can react with sound and announcements.
import {
  AVENUES, STREETS, ROAD_HALF, LANE, STEP, WORLD,
  PLAYER, CAR, TRAFFIC, POLICE, WANTED, PED, MISSION, CAR_COLORS,
} from './config.js';
import { createCity } from './city.js';
import { createRandom } from './random.js';

export const EV = {
  PICKUP: 1, DELIVER: 2, SUCCESS: 4, FAIL: 8, CRASH: 16, CRASH_HARD: 32,
  PED_HIT: 64, THEFT: 128, BUSTED: 256, WANTED_UP: 512, MISSION_NEW: 1024, BOARD: 2048,
};

const TAU = Math.PI * 2;

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

const MISSION_ORDER = ['courier', 'fare', 'getaway'];
const INTROS = {
  courier: [
    'A sealed parcel, a nervous client, no questions. Get it across Port Meridian.',
    'Dockside Danny needs this crate moved before anyone thinks to look inside.',
    'Small box, big hurry. The harbour pays cash and forgets faces.',
  ],
  fare: [
    'A fare is waiting, thumb out and patience thin. Pick them up gently.',
    'Someone across town is late for the ferry and paying like it.',
    'A passenger, a destination, and a tip that hates dents. Drive smooth.',
  ],
  getaway: [
    'A job went loud two streets over. You are the way out — reach the hideout.',
    'Sirens already. Get to the marked garage before the net closes.',
    'Everyone is looking for this car. Everyone but the hideout, that is.',
  ],
};

export function createWorld(seed) {
  const city = createCity(createRandom(seed));
  const random = createRandom((seed ^ 0x9e3779b9) >>> 0);

  const state = {
    city,
    time: 0,
    player: null,
    cars: [],
    peds: [],
    cash: 0,
    wanted: 0,
    bust: 0,
    busted: false,
    mission: null,
    missionTarget: null,
    missionCooldown: 2.5,
    missionsDone: 0,
    missionCount: 0,
    toasts: [],
    hint: '',
    seenTimer: 0,
    starCooldown: 0,
    policeTimer: 0,
    crashLevel: 0, // the hardest impact this step, 0..1, for sound
  };

  function toast(text) {
    state.toasts.push({ text, t: 0 });
    if (state.toasts.length > 3) state.toasts.shift();
  }

  function playerPos() {
    return state.player.car ?? state.player;
  }

  function playerSpeed() {
    return state.player.car ? Math.abs(state.player.car.speed) : state.player.footSpeed;
  }

  // ----- spawning -----------------------------------------------------------

  function makeCar(x, y, angle, color, mode) {
    return {
      x, y, angle, speed: 0, color, mode, health: 100,
      driver: mode === 'traffic' || mode === 'police' ? 'ai' : 'none',
      owned: false, stolen: false,
      // traffic lane-following state
      axis: 'v', road: 0, dir: 1, targetSpeed: 220, decidedFor: -1, pivot: null,
      nextAxis: 'v', nextRoad: 0, nextDir: 1, stunned: 0, angleTarget: angle,
      // police pursuit state
      lastKnown: null, stuck: 0, reverse: 0, seen: false,
    };
  }

  function laneCoord(car) {
    // The cross-axis coordinate of the car's lane centre.
    if (car.axis === 'v') return AVENUES[car.road] - car.dir * LANE;
    return STREETS[car.road] + car.dir * LANE;
  }

  function spawnTraffic() {
    for (let n = 0; n < TRAFFIC.count; n += 1) {
      const onAvenue = random() < 0.55;
      const road = Math.floor(random() * (onAvenue ? AVENUES.length : STREETS.length));
      const dir = random() < 0.5 ? 1 : -1;
      const along = random() * (onAvenue ? WORLD.height : WORLD.width);
      const car = makeCar(0, 0, 0, CAR_COLORS[Math.floor(random() * CAR_COLORS.length)], 'traffic');
      car.axis = onAvenue ? 'v' : 'h';
      car.road = road;
      car.dir = dir;
      car.targetSpeed = TRAFFIC.speedMin + random() * (TRAFFIC.speedMax - TRAFFIC.speedMin);
      if (car.axis === 'v') { car.x = laneCoord(car); car.y = along; car.angle = car.angleTarget = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { car.y = laneCoord(car); car.x = along; car.angle = car.angleTarget = dir > 0 ? 0 : Math.PI; }
      if (dist(car.x, car.y, state.player.x, state.player.y) < 460) {
        // Too close to the player's start: wrap the spawn to the far side of town.
        if (car.axis === 'v') car.y = (car.y + 1500) % WORLD.height;
        else car.x = (car.x + 1900) % WORLD.width;
      }
      state.cars.push(car);
    }
  }

  function spawnParked() {
    for (const spot of city.parkingSpots) {
      if (random() > 0.55) continue;
      const car = makeCar(spot.x, spot.y, spot.angle, CAR_COLORS[Math.floor(random() * CAR_COLORS.length)], 'parked');
      car.health = 55 + random() * 45;
      state.cars.push(car);
    }
    // Riko's own battered runabout waits in Uncle's driveway. Taking it is never theft.
    const door = city.safehouse.door;
    const own = makeCar(door.x - 52, door.y, 0, '#e67e22', 'parked');
    own.owned = true;
    own.health = 88;
    state.cars.push(own);
  }

  function spawnPeds() {
    const walkable = city.blocks.filter((b) => b.type !== 'safehouse');
    for (let n = 0; n < PED.count; n += 1) {
      const block = walkable[Math.floor(random() * walkable.length)];
      state.peds.push({
        x: 0, y: 0, angle: 0, block,
        s: random(), dir: random() < 0.5 ? 1 : -1,
        speed: PED.walkMin + random() * (PED.walkMax - PED.walkMin),
        mode: 'walk', fleeX: 0, fleeY: 0, calm: 0, down: 0,
        color: CAR_COLORS[Math.floor(random() * CAR_COLORS.length)],
      });
    }
  }

  function reset() {
    const door = city.safehouse.door;
    state.player = {
      x: door.x + 30, y: door.y + 74, angle: Math.PI / 2, car: null, footSpeed: 0,
    };
    state.cars = [];
    state.peds = [];
    state.cash = 0;
    state.wanted = 0;
    state.bust = 0;
    state.busted = false;
    state.mission = null;
    state.missionTarget = null;
    state.missionCooldown = 2.5;
    state.missionsDone = 0;
    state.missionCount = 0;
    state.toasts = [];
    state.hint = '';
    state.seenTimer = 0;
    state.starCooldown = 0;
    state.policeTimer = 0;
    state.time = 0;
    spawnParked();
    spawnTraffic();
    spawnPeds();
  }

  // ----- crime and heat -----------------------------------------------------

  function addStar(cause) {
    if (state.wanted >= WANTED.max) return 0;
    state.wanted += 1;
    state.starCooldown = 1.2;
    state.seenTimer = 0;
    if (cause === 'theft') toast('Spotted! The law saw that ride change hands.');
    else if (cause === 'ped') toast('You flattened a pedestrian! Heat rising.');
    else if (cause === 'police') toast('You rammed a police car! Bad idea.');
    return EV.WANTED_UP;
  }

  function policeSeePlayer(range = POLICE.sightRange) {
    const p = playerPos();
    for (const car of state.cars) {
      if (car.mode !== 'police') continue;
      if (dist(car.x, car.y, p.x, p.y) < range && city.lineOfSight(car.x, car.y, p.x, p.y)) return true;
    }
    return false;
  }

  function anyPoliceNear(range) {
    const p = playerPos();
    for (const car of state.cars) {
      if (car.mode === 'police' && dist(car.x, car.y, p.x, p.y) < range) return true;
    }
    return false;
  }

  // ----- missions -----------------------------------------------------------

  function pickPoi(minD, maxD, fromX, fromY) {
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < 28; i += 1) {
      const poi = city.pois[Math.floor(random() * city.pois.length)];
      const d = dist(fromX, fromY, poi.x, poi.y);
      if (d >= minD && d <= maxD) return poi;
      const score = -Math.abs(d - (minD + maxD) / 2);
      if (score > bestScore) { bestScore = score; best = poi; }
    }
    return best;
  }

  function newMission() {
    const p = playerPos();
    const type = MISSION_ORDER[state.missionCount % MISSION_ORDER.length];
    state.missionCount += 1;
    const pickup = pickPoi(MISSION.minPickup, MISSION.maxPickup, p.x, p.y);
    const dropoff = pickPoi(MISSION.minLeg, MISSION.maxLeg, pickup.x, pickup.y);
    const leg1 = dist(p.x, p.y, pickup.x, pickup.y);
    const leg2 = dist(pickup.x, pickup.y, dropoff.x, dropoff.y);
    const intro = INTROS[type][Math.floor(random() * INTROS[type].length)];
    const mission = {
      type, phase: 'toPickup', pickup, dropoff, intro,
      boardTimer: 0, tip: 0, pay: 0, timeLeft: 0,
    };
    if (type === 'courier') {
      mission.pay = Math.round(55 + leg2 / 11);
      mission.timeLeft = (leg1 + leg2) / 225 + 34;
    } else if (type === 'fare') {
      mission.pay = Math.round(45 + leg2 / 13);
      mission.tip = 40;
      mission.timeLeft = (leg1 + leg2) / 215 + 36;
    } else {
      mission.pay = 160;
      mission.phase = 'toTarget';
      mission.dropoff = pickup; // the hideout is the one far point; there is no second leg
      mission.timeLeft = leg1 / 235 + 40;
      if (state.wanted < 2) state.wanted = 2;
      toast('The job went loud. You are hot — two stars.');
    }
    mission.timeTotal = mission.timeLeft;
    state.mission = mission;
    toast(intro);
    return EV.MISSION_NEW;
  }

  function missionTarget() {
    const m = state.mission;
    if (!m) return null;
    return m.phase === 'toPickup' ? m.pickup : m.dropoff;
  }

  function updateMission(dt) {
    let events = 0;
    if (!state.mission) {
      state.missionCooldown -= dt;
      if (state.missionCooldown <= 0) events |= newMission();
      return events;
    }
    const m = state.mission;
    m.timeLeft -= dt;
    if (m.timeLeft <= 0) {
      toast('Too slow. The job falls through.');
      state.mission = null;
      state.missionCooldown = MISSION.cooldown;
      return events | EV.FAIL;
    }
    const p = playerPos();
    const target = missionTarget();
    const d = dist(p.x, p.y, target.x, target.y);
    const finish = (text) => {
      state.cash += m.pay + (m.type === 'fare' ? m.tip : 0);
      state.missionsDone += 1;
      toast(text);
      state.mission = null;
      state.missionCooldown = MISSION.cooldown;
      return EV.SUCCESS;
    };
    if (m.type === 'courier') {
      if (m.phase === 'toPickup' && d < 46) {
        m.phase = 'toDropoff';
        toast(`Parcel aboard. Take it to ${m.dropoff.name}.`);
        events |= EV.PICKUP;
      } else if (m.phase === 'toDropoff' && d < 50) {
        events |= finish(`Delivered. $${m.pay} in your pocket.`);
      }
    } else if (m.type === 'fare') {
      const inCar = state.player.car !== null;
      const stopped = inCar && Math.abs(state.player.car.speed) < 26;
      if (m.phase === 'toPickup') {
        if (inCar && stopped && d < 56) {
          m.boardTimer += dt;
          if (m.boardTimer > 0.8) {
            m.phase = 'toDropoff';
            toast(`Passenger in. Destination: ${m.dropoff.name}. Mind the paintwork.`);
            events |= EV.BOARD;
          }
        } else m.boardTimer = 0;
      } else if (inCar && stopped && d < 56) {
        events |= finish(`Fare paid $${m.pay} plus a $${m.tip} tip.`);
      }
    } else if (m.type === 'getaway' && d < 54) {
      events |= finish(`Made it to the hideout. $${m.pay} richer.`);
    }
    return events;
  }

  // ----- cars ---------------------------------------------------------------

  function carCircles(car) {
    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);
    return [
      { x: car.x, y: car.y, r: CAR.radius },
      { x: car.x + c * CAR.endOffset, y: car.y + s * CAR.endOffset, r: CAR.endRadius },
      { x: car.x - c * CAR.endOffset, y: car.y - s * CAR.endOffset, r: CAR.endRadius },
    ];
  }

  /** Resolve a car against the solid city; returns the impact speed it shed, if any. */
  function collideCar(car) {
    let shed = 0;
    for (const circle of carCircles(car)) {
      const fixed = city.collideCircle(circle.x, circle.y, circle.r);
      if (fixed.hit) {
        car.x += fixed.x - circle.x;
        car.y += fixed.y - circle.y;
        shed = Math.max(shed, Math.abs(car.speed));
      }
    }
    return shed;
  }

  function damageCar(car, amount, events) {
    car.health -= amount;
    if (car.health < 0) car.health = 0;
    return events;
  }

  function updatePlayerCar(dt, drive) {
    const car = state.player.car;
    let events = 0;
    const surface = city.surfaceFactor(car.x, car.y);
    const fwd = -drive.y;
    const handbrake = drive.boost;
    if (car.health <= 0) {
      car.speed -= car.speed * 2.4 * dt;
    } else if (fwd > 0) {
      car.speed += CAR.accel * dt;
    } else if (fwd < 0) {
      car.speed -= (car.speed > 12 ? CAR.brake : CAR.accel * 0.72) * dt;
    } else {
      car.speed -= car.speed * CAR.rollDrag * 0.32 * dt;
    }
    if (handbrake) car.speed -= car.speed * 2.6 * dt;
    car.speed -= car.speed * CAR.drag * 0.22 * dt;
    const topSpeed = CAR.maxSpeed * (0.45 + 0.55 * surface);
    car.speed = clamp(car.speed, -CAR.reverseMax, topSpeed);
    if (car.speed !== 0) {
      const sf = car.speed / (Math.abs(car.speed) + 110);
      car.angle += drive.x * CAR.grip * sf * dt * (handbrake ? 1.5 : 1);
    }
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const shed = collideCar(car);
    if (shed > 165) {
      damageCar(car, (shed - 150) / 26, events);
      car.speed *= 0.32;
      state.crashLevel = Math.max(state.crashLevel, Math.min(1, shed / 430));
      events |= EV.CRASH_HARD;
    } else if (shed > 55) {
      car.speed *= 0.55;
      state.crashLevel = Math.max(state.crashLevel, 0.25);
      events |= EV.CRASH;
    }
    state.player.x = car.x;
    state.player.y = car.y;
    state.player.angle = car.angle;
    return events;
  }

  function updateTrafficCar(dt, car) {
    let events = 0;
    if (car.stunned > 0) {
      car.stunned -= dt;
      car.speed = 0;
      return events;
    }
    const h = car.axis === 'v' ? { x: 0, y: car.dir } : { x: car.dir, y: 0 };
    const r = { x: -h.y, y: h.x };
    const cross = car.axis === 'v' ? AVENUES : STREETS;
    const along = car.axis === 'v' ? STREETS : AVENUES;

    // The next junction ahead, and a decision about it while there is time to make it.
    let junction = -1;
    let junctionDist = Infinity;
    for (let i = 0; i < along.length; i += 1) {
      const d = car.axis === 'v' ? (along[i] - car.y) * car.dir : (along[i] - car.x) * car.dir;
      if (d > -ROAD_HALF && d < junctionDist) { junctionDist = d; junction = i; }
    }
    if (junction >= 0 && junctionDist < ROAD_HALF + 52 && car.decidedFor !== junction) {
      car.decidedFor = junction;
      car.pivot = null;
      const atEdge = junction === 0 || junction === along.length - 1;
      const roll = random();
      let move = 'straight';
      if (atEdge) move = roll < 0.5 ? 'left' : 'right';
      else if (roll > 0.775) move = 'right';
      else if (roll > 0.55) move = 'left';
      if (move !== 'straight') {
        const c = car.axis === 'v' ? { x: cross[car.road], y: along[junction] } : { x: along[junction], y: cross[car.road] };
        const s = move === 'right' ? -1 : 1;
        car.pivot = { x: c.x + r.x * LANE + h.x * LANE * s, y: c.y + r.y * LANE + h.y * LANE * s };
        const nh = move === 'right' ? r : { x: -r.x, y: -r.y };
        car.nextAxis = nh.x !== 0 ? 'h' : 'v';
        car.nextDir = nh.x !== 0 ? Math.sign(nh.x) : Math.sign(nh.y);
        car.nextRoad = junction;
      }
    }
    // Take the turn when the pivot is reached.
    if (car.pivot) {
      const passed = car.axis === 'v' ? (car.y - car.pivot.y) * car.dir >= 0 : (car.x - car.pivot.x) * car.dir >= 0;
      if (passed) {
        if (car.axis === 'v') car.y = car.pivot.y; else car.x = car.pivot.x;
        car.axis = car.nextAxis;
        car.road = car.nextRoad;
        car.dir = car.nextDir;
        car.pivot = null;
        car.decidedFor = -1;
      }
    }

    // Ease the cross-axis coordinate onto the lane centre (collisions may have shoved it).
    const lane = laneCoord(car);
    if (car.axis === 'v') car.x += (lane - car.x) * Math.min(1, 5 * dt);
    else car.y += (lane - car.y) * Math.min(1, 5 * dt);

    // Slow for whatever is in the lane ahead: cars, the player, a pedestrian in the road.
    let desired = car.targetSpeed;
    const aheadOf = (ox, oy, radius) => {
      const dx = ox - car.x;
      const dy = oy - car.y;
      const along2 = dx * h.x + dy * h.y;
      const perp = Math.abs(dx * r.x + dy * r.y);
      return perp < 30 + radius && along2 > 0 ? along2 : Infinity;
    };
    let gap = Infinity;
    for (const other of state.cars) {
      if (other === car) continue;
      gap = Math.min(gap, aheadOf(other.x, other.y, 6));
    }
    const p = state.player;
    if (!p.car) gap = Math.min(gap, aheadOf(p.x, p.y, 0));
    if (gap < 88) desired = gap < 46 ? 0 : Math.min(desired, 110);
    if (car.speed < desired) car.speed = Math.min(desired, car.speed + TRAFFIC.accel * dt);
    else car.speed = Math.max(desired, car.speed - 320 * dt);

    if (car.axis === 'v') car.y += car.dir * car.speed * dt;
    else car.x += car.dir * car.speed * dt;
    car.angleTarget = Math.atan2(h.y, h.x);
    if (car.pivot) car.angleTarget = Math.atan2(car.nextAxis === 'h' ? 0 : car.nextDir, car.nextAxis === 'h' ? car.nextDir : 0);
    car.angle += wrapAngle(car.angleTarget - car.angle) * Math.min(1, 7 * dt);
    collideCar(car);
    return events;
  }

  function spawnPolice() {
    const p = playerPos();
    let best = null;
    let bestD = Infinity;
    for (const ax of AVENUES) {
      for (const sy of STREETS) {
        const d = dist(ax, sy, p.x, p.y);
        if (d >= POLICE.spawnGap && d < bestD) { bestD = d; best = { x: ax, y: sy }; }
      }
    }
    if (!best) return;
    const car = makeCar(best.x, best.y, Math.atan2(p.y - best.y, p.x - best.x), '#f4f6f7', 'police');
    car.health = 130;
    car.lastKnown = { x: p.x, y: p.y };
    state.cars.push(car);
  }

  function nearestLine(lines, v) {
    let best = lines[0];
    for (const line of lines) if (Math.abs(line - v) < Math.abs(best - v)) best = line;
    return best;
  }

  /** A road-following route between two points: out to a corner, along the grid, and in. */
  function gridWaypoints(from, to) {
    const startCorner = { x: nearestLine(AVENUES, from.x), y: nearestLine(STREETS, from.y) };
    const endCorner = { x: nearestLine(AVENUES, to.x), y: nearestLine(STREETS, to.y) };
    return [
      startCorner,
      { x: startCorner.x, y: endCorner.y },
      endCorner,
      { x: to.x, y: to.y },
    ];
  }

  function updatePoliceCar(dt, car) {
    const p = playerPos();
    const d = dist(car.x, car.y, p.x, p.y);
    const canSee = d < POLICE.sightRange && city.lineOfSight(car.x, car.y, p.x, p.y);
    car.seen = canSee;
    if (canSee) {
      car.lastKnown = { x: p.x, y: p.y };
      car.wp = null;
    }
    // With eyes on the player, hunt directly. Without them, work the road grid toward
    // the last known position — patrols that cut across blocks just meet buildings.
    let goal = p;
    if (!canSee && state.wanted > 0) {
      const hunt = car.lastKnown ?? p;
      if (dist(car.x, car.y, hunt.x, hunt.y) > 130) {
        if (!car.wp) {
          car.wp = gridWaypoints(car, hunt);
          car.wpAt = 0;
        }
        while (car.wpAt < car.wp.length - 1
          && dist(car.x, car.y, car.wp[car.wpAt].x, car.wp[car.wpAt].y) < 95) car.wpAt += 1;
        goal = car.wp[car.wpAt];
      }
    }

    if (state.wanted === 0) {
      // Stand down: roll away from the player and off the board.
      car.speed -= car.speed * 1.4 * dt;
      if (d > 900) car.mode = 'gone';
      return;
    }
    const desired = Math.atan2(goal.y - car.y, goal.x - car.x);
    const diff = wrapAngle(desired - car.angle);
    let throttle = 1;
    let steer = clamp(diff * 2.1, -1, 1);
    if (Math.cos(diff) < -0.4) { throttle = -1; steer = clamp(-diff * 2.1, -1, 1); }
    // Buildings in the way: bend around them rather than through them.
    const probeX = car.x + Math.cos(car.angle) * 58;
    const probeY = car.y + Math.sin(car.angle) * 58;
    if (city.collideCircle(probeX, probeY, 15).hit) {
      let bent = false;
      for (const bend of [0.75, -0.75]) {
        const bx = car.x + Math.cos(car.angle + bend) * 58;
        const by = car.y + Math.sin(car.angle + bend) * 58;
        if (!city.collideCircle(bx, by, 15).hit) { steer += bend > 0 ? 0.85 : -0.85; bent = true; break; }
      }
      if (!bent) throttle = -1;
    }
    // Stuck against the world: back out and try again.
    if (Math.abs(car.speed) < 22 && throttle !== 0) car.stuck += dt; else car.stuck = 0;
    if (car.stuck > 1.1) { car.reverse = 0.65; car.stuck = 0; }
    if (car.reverse > 0) {
      car.reverse -= dt;
      throttle = -1;
      steer = -steer;
    }
    let top = POLICE.maxSpeed;
    if (!state.player.car && d < 100) top = 130; // roll up on a runner, don't flatten them
    if (!state.player.car && d < 48) top = 0;
    if (throttle > 0) car.speed = Math.min(top, car.speed + POLICE.accel * dt);
    else car.speed = Math.max(-120, car.speed - POLICE.accel * 0.8 * dt);
    if (throttle === 0) car.speed -= car.speed * 2 * dt;
    car.angle += steer * 3.1 * (car.speed / (Math.abs(car.speed) + 110)) * dt;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const shed = collideCar(car);
    if (shed > 200) car.speed *= 0.4;
  }

  function updateCarPairs(dt) {
    let events = 0;
    const cars = state.cars;
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (a.mode === 'gone') continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (b.mode === 'gone') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = CAR.radius * 2 - 3;
        if (d >= min || d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        const push = (min - d) / 2;
        const aFree = a.mode !== 'parked';
        const bFree = b.mode !== 'parked';
        if (aFree) { a.x -= nx * push; a.y -= ny * push; }
        if (bFree) { b.x += nx * push; b.y += ny * push; }
        if (!aFree && !bFree) continue;
        // Impact along the line of centres, from whichever car is moving.
        const rel = Math.abs((a.speed * Math.cos(a.angle) - b.speed * Math.cos(b.angle)) * nx
          + (a.speed * Math.sin(a.angle) - b.speed * Math.sin(b.angle)) * ny);
        const playerCar = state.player.car;
        const involvesPlayer = a === playerCar || b === playerCar;
        if (rel > 60) {
          if (a.mode === 'traffic') { a.stunned = Math.max(a.stunned, 2.6); a.speed = 0; }
          if (b.mode === 'traffic') { b.stunned = Math.max(b.stunned, 2.6); b.speed = 0; }
          if (a.mode === 'police') a.speed *= 0.45;
          if (b.mode === 'police') b.speed *= 0.45;
          damageCar(a, rel / 16, events);
          damageCar(b, rel / 16, events);
        }
        if (involvesPlayer && rel > 165) {
          state.crashLevel = Math.max(state.crashLevel, Math.min(1, rel / 430));
          events |= EV.CRASH_HARD;
          const m = state.mission;
          if (m && m.type === 'fare' && m.phase === 'toDropoff' && m.tip > 0) {
            m.tip = Math.max(0, m.tip - 9);
            toast('Easy on the paintwork! The tip shrinks.');
          }
          const other = a === playerCar ? b : a;
          if (other.mode === 'police' && state.starCooldown <= 0) events |= addStar('police');
        } else if (involvesPlayer && rel > 70) {
          state.crashLevel = Math.max(state.crashLevel, 0.25);
          events |= EV.CRASH;
        }
      }
    }
    return events;
  }

  // ----- pedestrians --------------------------------------------------------

  function perimeterPoint(block, s) {
    const x0 = block.x + 13;
    const y0 = block.y + 13;
    const w = block.w - 26;
    const h = block.h - 26;
    const per = 2 * (w + h);
    let d = ((s % 1) + 1) % 1 * per;
    if (d < w) return { x: x0 + d, y: y0, angle: 0 };
    d -= w;
    if (d < h) return { x: x0 + w, y: y0 + d, angle: Math.PI / 2 };
    d -= h;
    if (d < w) return { x: x0 + w - d, y: y0 + h, angle: Math.PI };
    d -= w;
    return { x: x0, y: y0 + h - d, angle: -Math.PI / 2 };
  }

  function updatePeds(dt) {
    let events = 0;
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        if (ped.down <= 0) {
          // They got up somewhere quieter and walked away.
          const walkable = city.blocks.filter((b) => b.type !== 'safehouse');
          ped.block = walkable[Math.floor(random() * walkable.length)];
          ped.s = random();
          ped.mode = 'walk';
        }
        continue;
      }
      // Threats: the player's car moving fast, or any chaos (a hard crash) nearby.
      let threat = null;
      if (p.car && Math.abs(p.car.speed) > 105 && dist(ped.x, ped.y, p.car.x, p.car.y) < 130) threat = p.car;
      if (ped.mode !== 'flee' && threat) { ped.mode = 'flee'; ped.calm = 0; }
      if (ped.mode === 'flee') {
        const from = threat ?? { x: ped.fleeX, y: ped.fleeY };
        if (threat) { ped.fleeX = threat.x; ped.fleeY = threat.y; }
        const away = Math.atan2(ped.y - from.y, ped.x - from.x);
        ped.angle = away;
        ped.x += Math.cos(away) * PED.flee * dt;
        ped.y += Math.sin(away) * PED.flee * dt;
        const fixed = city.collideCircle(ped.x, ped.y, PED.radius);
        ped.x = fixed.x;
        ped.y = fixed.y;
        ped.calm += dt;
        if (ped.calm > 2.6 && !threat) ped.mode = 'return';
      } else if (ped.mode === 'return') {
        const home = perimeterPoint(ped.block, ped.s);
        const d = dist(ped.x, ped.y, home.x, home.y);
        if (d < 8) ped.mode = 'walk';
        else {
          ped.angle = Math.atan2(home.y - ped.y, home.x - ped.x);
          ped.x += Math.cos(ped.angle) * ped.speed * 1.5 * dt;
          ped.y += Math.sin(ped.angle) * ped.speed * 1.5 * dt;
          const fixed = city.collideCircle(ped.x, ped.y, PED.radius);
          ped.x = fixed.x;
          ped.y = fixed.y;
        }
      } else {
        const per = 2 * ((ped.block.w - 26) + (ped.block.h - 26));
        ped.s += (ped.speed * ped.dir * dt) / per;
        const point = perimeterPoint(ped.block, ped.s);
        ped.x = point.x;
        ped.y = point.y;
        ped.angle = point.angle + (ped.dir < 0 ? Math.PI : 0);
      }
      // Only the player's own driving can flatten anyone; the traffic brakes for them.
      if (p.car && Math.abs(p.car.speed) > 118) {
        for (const circle of carCircles(p.car)) {
          if (dist(ped.x, ped.y, circle.x, circle.y) < circle.r + PED.radius - 2) {
            ped.down = 3.6;
            ped.mode = 'walk';
            events |= EV.PED_HIT;
            if (state.starCooldown <= 0) events |= addStar('ped');
            break;
          }
        }
      }
    }
    return events;
  }

  // ----- entering and leaving cars ------------------------------------------

  function nearestEnterable() {
    const p = state.player;
    let best = null;
    let bestD = 60;
    for (const car of state.cars) {
      if (car.mode === 'gone' || car.mode === 'player') continue;
      if (Math.abs(car.speed) > 70) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar() {
    const car = nearestEnterable();
    if (!car) return 0;
    let events = 0;
    const wasMode = car.mode;
    car.prevMode = wasMode;
    car.mode = 'player';
    car.driver = 'player';
    state.player.car = car;
    if ((wasMode === 'parked' || wasMode === 'traffic') && !car.owned && !car.stolen) {
      car.stolen = true;
      events |= EV.THEFT;
      const seen = policeSeePlayer(WANTED.theftSight);
      if (seen && state.starCooldown <= 0) events |= addStar('theft');
      else if (seen) toast('A patrol saw that — move!');
    }
    if (wasMode === 'police') toast('You just stole a police car. Bold.');
    return events;
  }

  function exitCar() {
    const p = state.player;
    const car = p.car;
    if (!car) return;
    const side = car.angle - Math.PI / 2;
    p.x = car.x + Math.cos(side) * 32;
    p.y = car.y + Math.sin(side) * 32;
    const fixed = city.collideCircle(p.x, p.y, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
    p.car = null;
    car.speed = 0;
    car.driver = 'none';
    if (car.prevMode === 'police') {
      car.mode = 'police';
      car.driver = 'ai';
      car.lastKnown = { x: p.x, y: p.y };
    } else if (car.prevMode === 'traffic') {
      // Roll back into the traffic stream if it stopped near a lane; else it stays parked.
      let rejoined = false;
      for (let i = 0; i < AVENUES.length && !rejoined; i += 1) {
        if (Math.abs(car.x - AVENUES[i]) < ROAD_HALF + 8) {
          car.axis = 'v';
          car.road = i;
          car.dir = Math.sin(car.angle) >= 0 ? 1 : -1;
          car.mode = 'traffic';
          car.driver = 'ai';
          car.decidedFor = -1;
          car.pivot = null;
          rejoined = true;
        }
      }
      for (let j = 0; j < STREETS.length && !rejoined; j += 1) {
        if (Math.abs(car.y - STREETS[j]) < ROAD_HALF + 8) {
          car.axis = 'h';
          car.road = j;
          car.dir = Math.cos(car.angle) >= 0 ? 1 : -1;
          car.mode = 'traffic';
          car.driver = 'ai';
          car.decidedFor = -1;
          car.pivot = null;
          rejoined = true;
        }
      }
      if (!rejoined) car.mode = 'parked';
    } else {
      car.mode = 'parked';
    }
  }

  // ----- the step -------------------------------------------------------------

  function updateHint() {
    const p = state.player;
    if (state.busted) { state.hint = ''; return; }
    if (p.car) {
      state.hint = state.mission && state.mission.type === 'fare' && state.mission.phase === 'toPickup'
        ? 'Stop beside your fare to pick them up'
        : 'E — step out · Shift — handbrake';
      return;
    }
    const car = nearestEnterable();
    if (car) {
      state.hint = car.mode === 'police' ? 'E — steal the police car (risky)' : car.owned ? 'E — take your runabout' : 'E — get in the car';
      return;
    }
    const z = city.safehouse.zone;
    if (state.wanted > 0 && p.x > z.x - 30 && p.x < z.x + z.w + 30 && p.y > z.y - 30 && p.y < z.y + z.h + 30) {
      state.hint = "Uncle's Garage — the heat clears here";
      return;
    }
    if (state.mission && state.mission.type === 'fare' && state.mission.phase === 'toPickup') {
      const t = missionTarget();
      if (dist(p.x, p.y, t.x, t.y) < 90) { state.hint = 'Your fare is here — bring a car'; return; }
    }
    state.hint = '';
  }

  /**
   * One fixed step. `drive` is {x, y, boost}; `actions` carries ACTION_ENTER presses.
   * With `ambient` set (the title screen's living backdrop) traffic and pedestrians move
   * but there is no crime, no missions and no hunting.
   */
  function step(dt, drive, actions, ambient) {
    let events = 0;
    state.time += dt;
    state.crashLevel = 0;
    if (state.starCooldown > 0) state.starCooldown -= dt;
    for (const t of state.toasts) t.t += dt;
    state.toasts = state.toasts.filter((t) => t.t < 3.6);

    const p = state.player;
    if (!ambient && !state.busted) {
      if (actions && p.car) exitCar();
      else if (actions && !p.car) events |= enterCar();
    }

    if (p.car) {
      events |= updatePlayerCar(dt, drive);
    } else if (!state.busted) {
      const mag = Math.hypot(drive.x, drive.y);
      const speed = drive.boost ? PLAYER.sprint : PLAYER.walk;
      p.footSpeed = mag > 0 ? speed : 0;
      if (mag > 0) {
        p.angle = Math.atan2(drive.y, drive.x);
        p.x += (drive.x / (mag || 1)) * speed * dt;
        p.y += (drive.y / (mag || 1)) * speed * dt;
      }
      const fixed = city.collideCircle(p.x, p.y, PLAYER.radius);
      p.x = fixed.x;
      p.y = fixed.y;
      // Cars are solid to lean on: step out of any car's space.
      for (const car of state.cars) {
        if (car.mode === 'gone') continue;
        const d = dist(p.x, p.y, car.x, car.y);
        const min = CAR.radius + PLAYER.radius - 2;
        if (d < min && d > 0) {
          p.x = car.x + ((p.x - car.x) / d) * min;
          p.y = car.y + ((p.y - car.y) / d) * min;
        }
      }
    }

    for (const car of state.cars) {
      if (car.mode === 'traffic') events |= updateTrafficCar(dt, car);
      else if (car.mode === 'police') updatePoliceCar(dt, car);
    }
    state.cars = state.cars.filter((car) => car.mode !== 'gone');
    events |= updateCarPairs(dt);
    events |= updatePeds(dt);

    if (!ambient && !state.busted) {
      events |= updateMission(dt);
      state.missionTarget = missionTarget();

      // The safehouse washes the heat off anyone who reaches it.
      const z = city.safehouse.zone;
      const pp = playerPos();
      if (state.wanted > 0 && pp.x >= z.x - 4 && pp.x <= z.x + z.w + 4 && pp.y >= z.y - 4 && pp.y <= z.y + z.h + 4) {
        state.wanted = 0;
        state.bust = 0;
        toast("Uncle waves you in. The heat forgets your face.");
        events |= EV.DELIVER;
      }

      // Heat bookkeeping: spawns, sightings, cooling off.
      const copCount = state.cars.reduce((n, c) => n + (c.mode === 'police' ? 1 : 0), 0);
      state.policeTimer -= dt;
      if (state.wanted > copCount && state.policeTimer <= 0) {
        spawnPolice();
        state.policeTimer = 1.1;
      }
      if (policeSeePlayer()) state.seenTimer = 0;
      else {
        state.seenTimer += dt;
        if (state.wanted > 0 && state.seenTimer > WANTED.coolSeconds) {
          state.wanted -= 1;
          state.seenTimer = 0;
          if (state.wanted === 0) toast('You lost the law. For now.');
        }
      }

      // Busted: a close patrol and nowhere to run (only while there is heat to answer for).
      let busting = false;
      if (state.wanted > 0 && anyPoliceNear(POLICE.bustRadius + 8) && playerSpeed() < 72) busting = true;
      if (busting) {
        state.bust += dt / POLICE.bustSeconds;
        if (state.bust >= 1) {
          state.busted = true;
          events |= EV.BUSTED;
        }
      } else {
        state.bust = Math.max(0, state.bust - dt / 1.1);
      }
    }
    updateHint();
    return events;
  }

  reset();
  return { state, reset, step, missionTarget, playerPos };
}
