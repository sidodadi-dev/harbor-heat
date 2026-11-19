// Port Meridian, generated once from the seed: a grid of avenues and streets, blocks of
// pastel buildings between them, two parks, parking lots full of stealable cars, a pier over
// the water, and Uncle's Garage — the safehouse. The same seed always builds the same city.
// This module knows geometry only: what is road, what is solid, what can be seen past.
import {
  AVENUES, STREETS, AVENUE_NAMES, STREET_NAMES, ROAD_HALF, WATER_X, WORLD,
  BUILDING_COLORS,
} from './config.js';

function shade(hex, factor) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `rgb(${r},${g},${b})`;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Does the segment (x1,y1)-(x2,y2) cross the rect? Liang–Barsky clip test. */
function segmentHitsRect(x1, y1, x2, y2, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

const SPECIAL = {
  safehouse: { col: 1, row: 1 },
  parks: new Set(['3,0', '4,2']),
  parking: new Set(['0,2', '5,3', '2,3']),
};

export function createCity(random) {
  const buildings = [];
  const trees = [];
  const blocks = [];
  const parkingSpots = [];
  const pois = [];
  const parks = [];

  // The green strips along the north and south world edges.
  parks.push({ x: 0, y: 0, w: WATER_X, h: STREETS[0] - ROAD_HALF, name: 'North Green' });
  parks.push({ x: 0, y: STREETS[STREETS.length - 1] + ROAD_HALF, w: WATER_X, h: WORLD.height - (STREETS[STREETS.length - 1] + ROAD_HALF), name: 'South Beach Green' });

  let safehouse = null;
  let pond = null;

  for (let col = 0; col < AVENUES.length - 1; col += 1) {
    for (let row = 0; row < STREETS.length - 1; row += 1) {
      const rect = {
        x: AVENUES[col] + ROAD_HALF,
        y: STREETS[row] + ROAD_HALF,
        w: AVENUES[col + 1] - AVENUES[col] - ROAD_HALF * 2,
        h: STREETS[row + 1] - STREETS[row] - ROAD_HALF * 2,
      };
      const key = `${col},${row}`;
      const corner = `${AVENUE_NAMES[col]} Ave & ${STREET_NAMES[row]} St`;
      let type = 'buildings';
      if (SPECIAL.safehouse.col === col && SPECIAL.safehouse.row === row) type = 'safehouse';
      else if (SPECIAL.parks.has(key)) type = 'park';
      else if (SPECIAL.parking.has(key)) type = 'parking';
      blocks.push({ ...rect, type, col, row });

      // A mission point on each side's sidewalk, named for the corner it serves.
      pois.push({ x: rect.x + rect.w / 2, y: rect.y + 14, name: corner });
      pois.push({ x: rect.x + rect.w / 2, y: rect.y + rect.h - 14, name: corner });
      pois.push({ x: rect.x + 14, y: rect.y + rect.h / 2, name: corner });
      pois.push({ x: rect.x + rect.w - 14, y: rect.y + rect.h / 2, name: corner });

      if (type === 'buildings') {
        const inner = { x: rect.x + 26, y: rect.y + 26, w: rect.w - 52, h: rect.h - 52 };
        const across = random() < 0.5 ? 2 : 3;
        const deep = random() < 0.6 ? 2 : 1;
        const cellW = inner.w / across;
        const cellH = inner.h / deep;
        for (let cx = 0; cx < across; cx += 1) {
          for (let cy = 0; cy < deep; cy += 1) {
            if (random() < 0.14) continue; // a courtyard or alley gap
            const color = BUILDING_COLORS[Math.floor(random() * BUILDING_COLORS.length)];
            buildings.push({
              x: inner.x + cx * cellW + 9,
              y: inner.y + cy * cellH + 9,
              w: cellW - 18,
              h: cellH - 18,
              color,
              roof: shade(color, 0.72),
              floors: 2 + Math.floor(random() * 5),
            });
          }
        }
        // A tree on some sidewalk corners.
        for (const [tx, ty] of [[rect.x + 16, rect.y + 16], [rect.x + rect.w - 16, rect.y + 16], [rect.x + 16, rect.y + rect.h - 16], [rect.x + rect.w - 16, rect.y + rect.h - 16]]) {
          if (random() < 0.3) trees.push({ x: tx, y: ty, r: 11 + random() * 6 });
        }
      } else if (type === 'park') {
        parks.push({ ...rect, name: key === '3,0' ? 'Meridian Park' : 'Palm Court' });
        for (let i = 0; i < 30; i += 1) {
          trees.push({ x: rect.x + 30 + random() * (rect.w - 60), y: rect.y + 30 + random() * (rect.h - 60), r: 12 + random() * 9 });
        }
        if (key === '3,0') pond = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, rx: 96, ry: 56 };
      } else if (type === 'parking') {
        // Rows of nose-in spots along the north and south edges, a driving aisle between.
        for (const [spotY, angle] of [[rect.y + 40, Math.PI / 2], [rect.y + rect.h - 40, -Math.PI / 2]]) {
          for (let sx = rect.x + 42; sx < rect.x + rect.w - 30; sx += 37) {
            parkingSpots.push({ x: sx, y: spotY, angle });
          }
        }
        for (let sx = rect.x + 42; sx < rect.x + rect.w - 30; sx += 37) {
          parkingSpots.push({ x: sx, y: rect.y + rect.h / 2, angle: 0 });
        }
      } else if (type === 'safehouse') {
        const garage = { x: rect.x + 70, y: rect.y + 36, w: 210, h: 112, color: '#f2e3c6', roof: '#a4553f', floors: 1, garage: true };
        buildings.push(garage);
        const zone = { x: garage.x, y: garage.y + garage.h, w: garage.w, h: 96 };
        safehouse = {
          building: garage,
          zone,
          door: { x: garage.x + garage.w / 2, y: zone.y + zone.h / 2 },
          name: "Uncle's Garage",
        };
        buildings.push({ x: rect.x + 320, y: rect.y + 36, w: 110, h: 96, color: '#a8d5e5', roof: shade('#a8d5e5', 0.72), floors: 3 });
        buildings.push({ x: rect.x + 320, y: rect.y + 220, w: 110, h: 110, color: '#e5a3b4', roof: shade('#e5a3b4', 0.72), floors: 4 });
        trees.push({ x: rect.x + 40, y: rect.y + rect.h - 40, r: 14 });
        trees.push({ x: rect.x + rect.w - 40, y: rect.y + 40, r: 13 });
      }
    }
  }

  // Extra parked cars on the beach lot in the south-east.
  for (let sx = 2560; sx < 3760; sx += 37) parkingSpots.push({ x: sx, y: 3064, angle: -Math.PI / 2 });

  // The Old Pier: a wooden deck reaching east over the water from the promenade.
  const pier = { x: WATER_X - 68, y: 1560, w: 236, h: 84 };
  pois.push({ x: pier.x + pier.w - 26, y: pier.y + pier.h / 2, name: 'the Old Pier' });
  pois.push({ x: AVENUES[AVENUES.length - 1] - ROAD_HALF - 14, y: STREETS[STREETS.length - 1], name: 'the Ferry Terminal' });
  pois.push({ x: safehouse.door.x, y: safehouse.door.y, name: "Uncle's Garage" });

  function isWater(x, y) {
    if (x < WATER_X) return false;
    if (x >= pier.x && x <= pier.x + pier.w && y >= pier.y && y <= pier.y + pier.h) return false;
    return true;
  }

  function onRoad(x, y) {
    for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_HALF) return true;
    for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_HALF) return true;
    return false;
  }

  /** How kind the ground under a car is: 1 on tarmac, less on grass, sand and sidewalks. */
  function surfaceFactor(x, y) {
    if (isWater(x, y)) return 0;
    if (onRoad(x, y)) return 1;
    if (x >= pier.x && x <= pier.x + pier.w && y >= pier.y && y <= pier.y + pier.h) return 0.9;
    if (safehouse && x >= safehouse.zone.x && x <= safehouse.zone.x + safehouse.zone.w && y >= safehouse.zone.y && y <= safehouse.zone.y + safehouse.zone.h) return 0.95;
    for (const block of blocks) {
      if (x >= block.x && x <= block.x + block.w && y >= block.y && y <= block.y + block.h) {
        if (block.type === 'parking') return 0.9;
        if (block.type === 'park') return 0.5;
        return 0.78; // sidewalks and courtyards
      }
    }
    for (const park of parks) {
      if (x >= park.x && x <= park.x + park.w && y >= park.y && y <= park.y + park.h) return 0.5;
    }
    if (x > AVENUES[AVENUES.length - 1] + ROAD_HALF) return 0.6; // sand by the sea
    return 0.7;
  }

  /**
   * Push a circle out of every building, the sea and the world edge. Returns the corrected
   * position and whether anything was hit (and how hard, for the caller's damage maths).
   */
  function collideCircle(x, y, r) {
    let hit = false;
    if (x < r) { x = r; hit = true; }
    if (y < r) { y = r; hit = true; }
    if (x > WORLD.width - r) { x = WORLD.width - r; hit = true; }
    if (y > WORLD.height - r) { y = WORLD.height - r; hit = true; }
    if (isWater(x, y)) {
      // The only way in is from the west: push back to the seawall.
      x = Math.min(x, WATER_X - r);
      hit = true;
    }
    for (const b of buildings) {
      const nx = Math.max(b.x, Math.min(x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(y, b.y + b.h));
      const dx = x - nx;
      const dy = y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        y = ny + (dy / d) * r;
      } else {
        // Centre inside the rect: leave by the nearest face.
        const left = x - b.x;
        const right = b.x + b.w - x;
        const top = y - b.y;
        const bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
    return { x, y, hit };
  }

  function lineOfSight(x1, y1, x2, y2) {
    for (const b of buildings) {
      if (segmentHitsRect(x1, y1, x2, y2, b)) return false;
    }
    return true;
  }

  return {
    buildings, trees, blocks, parks, parkingSpots, pois, safehouse, pond, pier,
    isWater, onRoad, surfaceFactor, collideCircle, lineOfSight,
  };
}
