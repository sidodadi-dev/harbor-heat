// Drawing only: the world's state and the current screen in, pixels out. The camera follows
// Riko (or his car) over Port Meridian; everything is culled to the view. Flat shapes, soft
// shadows and canvas text — no images, no fonts to fetch.
import { VIEW, WORLD, ROAD_HALF, WATER_X, PALETTE, FONT, CAR, AVENUES, STREETS } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

function hash2(x, y) {
  let h = (Math.round(x) * 374761393 + Math.round(y) * 668265263) | 0;
  h = Math.imul(h ^ (h >> 13), 1274126177);
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', weight = 400) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }

  function drawWorld(state, cam) {
    const city = state.city;
    const x0 = cam.x - 40;
    const y0 = cam.y - 40;
    const x1 = cam.x + VIEW.width + 40;
    const y1 = cam.y + VIEW.height + 40;
    const seen = (rx, ry, rw, rh) => rx + rw > x0 && rx < x1 && ry + rh > y0 && ry < y1;

    // Grass everywhere, then the sea, then the sand that guards it.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(cam.x, cam.y, VIEW.width, VIEW.height);
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(WATER_X, 0, WORLD.width - WATER_X, WORLD.height);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(WATER_X + 26, 0, WORLD.width - WATER_X - 26, WORLD.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = 60 + (state.time * 14) % 90; y < WORLD.height; y += 90) {
      ctx.moveTo(WATER_X + 60, y);
      ctx.lineTo(WATER_X + 110, y);
    }
    ctx.stroke();
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(AVENUES[AVENUES.length - 1] + ROAD_HALF, 0, WATER_X - (AVENUES[AVENUES.length - 1] + ROAD_HALF), WORLD.height);

    // Parks and their paths.
    for (const park of city.parks) {
      if (!seen(park.x, park.y, park.w, park.h)) continue;
      ctx.fillStyle = PALETTE.parkGrass;
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.fillStyle = PALETTE.parkPath;
      ctx.fillRect(park.x, park.y + park.h / 2 - 7, park.w, 14);
      ctx.fillRect(park.x + park.w / 2 - 7, park.y, 14, park.h);
    }
    if (city.pond) {
      ctx.fillStyle = PALETTE.pond;
      ctx.beginPath();
      ctx.ellipse(city.pond.x, city.pond.y, city.pond.rx, city.pond.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Blocks: sidewalk slabs, parking asphalt, the safehouse yard.
    for (const block of city.blocks) {
      if (!seen(block.x, block.y, block.w, block.h)) continue;
      if (block.type === 'park') continue; // already painted green above
      ctx.fillStyle = block.type === 'parking' ? PALETTE.lot : PALETTE.sidewalk;
      ctx.fillRect(block.x, block.y, block.w, block.h);
      if (block.type === 'parking') {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let sx = block.x + 24; sx < block.x + block.w - 12; sx += 37) {
          ctx.moveTo(sx, block.y + 16);
          ctx.lineTo(sx, block.y + 62);
          ctx.moveTo(sx, block.y + block.h - 62);
          ctx.lineTo(sx, block.y + block.h - 16);
        }
        ctx.stroke();
      }
    }
    const zone = city.safehouse.zone;
    ctx.fillStyle = '#9a968c';
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    ctx.strokeStyle = PALETTE.accent;
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.strokeRect(zone.x + 3, zone.y + 3, zone.w - 6, zone.h - 6);
    ctx.setLineDash([]);

    // Roads, lane dashes and crosswalks.
    ctx.fillStyle = PALETTE.road;
    for (const ax of AVENUES) ctx.fillRect(ax - ROAD_HALF, 0, ROAD_HALF * 2, WORLD.height);
    for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_HALF, WORLD.width, ROAD_HALF * 2);
    ctx.strokeStyle = PALETTE.lane;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    ctx.beginPath();
    for (const ax of AVENUES) { ctx.moveTo(ax, 0); ctx.lineTo(ax, WORLD.height); }
    for (const sy of STREETS) { ctx.moveTo(0, sy); ctx.lineTo(WORLD.width, sy); }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = PALETTE.crosswalk;
    for (const ax of AVENUES) {
      for (const sy of STREETS) {
        if (!seen(ax - ROAD_HALF, sy - ROAD_HALF, ROAD_HALF * 2, ROAD_HALF * 2)) continue;
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(ax - ROAD_HALF - 12, sy + i * 22 - 5, 10, 12);
          ctx.fillRect(ax + ROAD_HALF + 2, sy + i * 22 - 5, 10, 12);
          ctx.fillRect(ax + i * 22 - 5, sy - ROAD_HALF - 12, 12, 10);
          ctx.fillRect(ax + i * 22 - 5, sy + ROAD_HALF + 2, 12, 10);
        }
      }
    }

    // The pier: planks over the water.
    const pier = city.pier;
    ctx.fillStyle = '#a9805a';
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = pier.x + 18; px < pier.x + pier.w; px += 24) { ctx.moveTo(px, pier.y); ctx.lineTo(px, pier.y + pier.h); }
    ctx.stroke();

    // Buildings: a shadow, walls, a roof, and whatever sits on the roof.
    for (const b of city.buildings) {
      if (!seen(b.x, b.y, b.w, b.h)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 7, b.y + 7, b.w - 14, b.h - 14);
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      const units = 1 + Math.floor(hash2(b.x, b.y) * 3);
      for (let i = 0; i < units; i += 1) {
        const ux = b.x + 14 + hash2(b.x + i * 31, b.y) * Math.max(1, b.w - 44);
        const uy = b.y + 14 + hash2(b.x, b.y + i * 47) * Math.max(1, b.h - 44);
        ctx.fillRect(ux, uy, 15, 11);
      }
      if (b.garage) {
        ctx.fillStyle = '#6e4a35';
        ctx.fillRect(b.x + 18, b.y + b.h - 34, b.w - 36, 26);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let gx = b.x + 34; gx < b.x + b.w - 24; gx += 22) { ctx.moveTo(gx, b.y + b.h - 34); ctx.lineTo(gx, b.y + b.h - 8); }
        ctx.stroke();
        ctx.textBaseline = 'middle';
        text("UNCLE'S GARAGE", b.x + b.w / 2, b.y + 26, 17, '#fff7e0', 'center', 700);
      }
    }

    // Trees.
    for (const t of city.trees) {
      if (!seen(t.x - t.r, t.y - t.r, t.r * 2, t.r * 2)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.arc(t.x + 3, t.y + 5, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.treeTop;
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCar(state, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    roundRect(ctx, -CAR.length / 2 + 3, -CAR.width / 2 + 5, CAR.length, CAR.width, 6);
    ctx.fill();
    const police = car.mode === 'police' || car.prevMode === 'police';
    ctx.fillStyle = police ? '#eef1f4' : car.color;
    roundRect(ctx, -CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 6);
    ctx.fill();
    if (police) {
      ctx.fillStyle = '#22252a';
      ctx.fillRect(-CAR.length / 2, -CAR.width / 2, 11, CAR.width);
      ctx.fillRect(CAR.length / 2 - 11, -CAR.width / 2, 11, CAR.width);
    }
    // Cabin, glass and lights.
    ctx.fillStyle = 'rgba(20,26,34,0.85)';
    roundRect(ctx, -9, -CAR.width / 2 + 3, 19, CAR.width - 6, 4);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(CAR.length / 2 - 3, -CAR.width / 2 + 3, 3, 5);
    ctx.fillRect(CAR.length / 2 - 3, CAR.width / 2 - 8, 3, 5);
    ctx.fillStyle = '#d64550';
    ctx.fillRect(-CAR.length / 2, -CAR.width / 2 + 3, 3, 5);
    ctx.fillRect(-CAR.length / 2, CAR.width / 2 - 8, 3, 5);
    if (police) {
      const phase = Math.floor(state.time * 2.4) % 2 === 0;
      ctx.fillStyle = phase ? '#ff3b5c' : '#5c8aff';
      ctx.fillRect(-6, -CAR.width / 2 + 4, 5, CAR.width - 8);
      ctx.fillStyle = phase ? '#5c8aff' : '#ff3b5c';
      ctx.fillRect(1, -CAR.width / 2 + 4, 5, CAR.width - 8);
    }
    ctx.restore();
    // A wreck smokes; a hurt car smokes a little.
    if (car.health < 45) {
      const puffs = car.health <= 0 ? 3 : 1;
      for (let i = 0; i < puffs; i += 1) {
        const rise = ((state.time * 22 + i * 17 + car.x) % 26);
        ctx.fillStyle = `rgba(40,40,44,${0.35 - rise * 0.011})`;
        ctx.beginPath();
        ctx.arc(car.x + 12 + i * 4, car.y - 6 - rise, 5 + rise * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (state.player.car === car) {
      const bob = Math.sin(state.time * 5) * 3;
      ctx.fillStyle = PALETTE.accent;
      ctx.beginPath();
      ctx.moveTo(car.x, car.y - 34 + bob);
      ctx.lineTo(car.x - 8, car.y - 46 + bob);
      ctx.lineTo(car.x + 8, car.y - 46 + bob);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPerson(x, y, angle, color, shirtless) {
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath();
    ctx.arc(x + 2, y + 4, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shirtless;
    ctx.beginPath();
    ctx.arc(x, y, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * 11, y + Math.sin(angle) * 11);
    ctx.stroke();
  }

  function drawBeacon(state, target, label, color) {
    const pulse = 1 + Math.sin(state.time * 4) * 0.12;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.16;
    ctx.fillRect(target.x - 15, target.y - 190, 30, 190);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(target.x, target.y - 52 + Math.sin(state.time * 3) * 5, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.textBaseline = 'middle';
    text(label, target.x, target.y - 51 + Math.sin(state.time * 3) * 5, 15, '#10151d', 'center', 800);
    ctx.textBaseline = 'alphabetic';
  }

  function drawMinimap(state, cam) {
    const w = 216;
    const h = 160;
    const x = 18;
    const y = VIEW.height - h - 16;
    const s = Math.min(w / WORLD.width, h / WORLD.height);
    ctx.fillStyle = PALETTE.minimapBg;
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = PALETTE.parkGrass;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x + WATER_X * s, y, (WORLD.width - WATER_X) * s, h);
    ctx.strokeStyle = 'rgba(244,241,232,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const ax of AVENUES) { ctx.moveTo(x + ax * s, y); ctx.lineTo(x + ax * s, y + h); }
    for (const sy of STREETS) { ctx.moveTo(x, y + sy * s); ctx.lineTo(x + w, y + sy * s); }
    ctx.stroke();
    const dot = (wx, wy, size, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x + wx * s - size / 2, y + wy * s - size / 2, size, size);
    };
    dot(state.city.safehouse.door.x, state.city.safehouse.door.y, 5, PALETTE.accent);
    const target = state.missionTarget;
    if (target) {
      const blink = Math.floor(state.time * 2.5) % 2 === 0;
      dot(target.x, target.y, blink ? 8 : 5, PALETTE.good);
    }
    for (const car of state.cars) {
      if (car.mode === 'police') dot(car.x, car.y, 4, Math.floor(state.time * 2.4) % 2 ? '#ff3b5c' : '#5c8aff');
    }
    const p = state.player.car ?? state.player;
    dot(p.x, p.y, 5, '#ffffff');
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + cam.x * s, y + cam.y * s, VIEW.width * s, VIEW.height * s);
    ctx.restore();
  }

  function drawHud(state, screen, best, opts) {
    ctx.textBaseline = 'alphabetic';
    // Cash, top-left.
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, 16, 14, 208, 52, 9);
    ctx.fill();
    text(`$ ${state.cash.toLocaleString('en-US')}`, 30, 52, 30, PALETTE.good, 'left', 800);
    // Wanted stars, top-right.
    const cooling = state.wanted > 0 && state.seenTimer > 1.6;
    const blinkOff = cooling && Math.floor(state.time * 3) % 2 === 0;
    for (let i = 0; i < 5; i += 1) {
      const sx = VIEW.width - 34 - i * 34;
      ctx.font = `26px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = i < state.wanted ? (blinkOff ? 'rgba(239,71,111,0.35)' : PALETTE.danger) : 'rgba(244,241,232,0.28)';
      ctx.fillText('★', sx, 44);
    }
    if (state.wanted > 0) {
      text(cooling ? 'LOSING THEM…' : 'WANTED', VIEW.width - 30, 66, 12, PALETTE.muted, 'right', 700);
    }
    // Mission banner, top-centre.
    const m = state.mission;
    if (m && screen === SCREEN_PLAY) {
      const target = state.missionTarget;
      const names = { courier: 'COURIER', fare: 'FARE', getaway: 'GETAWAY' };
      const doing = m.type === 'getaway' ? `Reach the hideout at ${target.name}`
        : m.phase === 'toPickup' ? (m.type === 'fare' ? `Pick up your fare at ${target.name}` : `Pick up the parcel at ${target.name}`)
        : `Deliver to ${target.name}`;
      ctx.fillStyle = PALETTE.panel;
      roundRect(ctx, VIEW.width / 2 - 262, 12, 524, 58, 9);
      ctx.fill();
      text(`${names[m.type]} · $${m.pay}${m.type === 'fare' && m.phase === 'toDropoff' ? ` + $${m.tip} tip` : ''}`, VIEW.width / 2, 36, 15, PALETTE.accent, 'center', 800);
      text(doing, VIEW.width / 2, 58, 15, PALETTE.text, 'center', 400);
      const frac = Math.max(0, m.timeLeft / m.timeTotal);
      ctx.fillStyle = 'rgba(244,241,232,0.18)';
      ctx.fillRect(VIEW.width / 2 - 262, 70, 524, 4);
      ctx.fillStyle = m.timeLeft < 10 ? PALETTE.danger : PALETTE.good;
      ctx.fillRect(VIEW.width / 2 - 262, 70, 524 * Math.min(1, frac), 4);
    }
    // Toasts under the banner.
    let ty = m ? 96 : 84;
    for (const toast of state.toasts) {
      const alpha = toast.t > 2.9 ? Math.max(0, 1 - (toast.t - 2.9) / 0.7) : 1;
      ctx.globalAlpha = alpha;
      ctx.font = `600 16px ${FONT}`;
      const w = ctx.measureText(toast.text).width + 30;
      ctx.fillStyle = PALETTE.panel;
      roundRect(ctx, VIEW.width / 2 - w / 2, ty - 19, w, 27, 13);
      ctx.fill();
      text(toast.text, VIEW.width / 2, ty, 16, PALETTE.text, 'center', 600);
      ctx.globalAlpha = 1;
      ty += 33;
    }
    // Bust pressure: a filling red bar when a patrol has you cornered.
    if (state.bust > 0.03 && screen === SCREEN_PLAY) {
      ctx.fillStyle = PALETTE.panel;
      roundRect(ctx, VIEW.width / 2 - 130, 118, 260, 30, 8);
      ctx.fill();
      text('BUSTED?', VIEW.width / 2, 139, 16, PALETTE.danger, 'center', 800);
      ctx.fillStyle = PALETTE.danger;
      ctx.fillRect(VIEW.width / 2 - 130, 148, 260 * Math.min(1, state.bust), 5);
    }
    // Context hint, bottom-centre.
    if (state.hint && screen === SCREEN_PLAY) {
      ctx.font = `600 16px ${FONT}`;
      const w = ctx.measureText(state.hint).width + 32;
      ctx.fillStyle = PALETTE.panel;
      roundRect(ctx, VIEW.width / 2 - w / 2, VIEW.height - 44, w, 30, 15);
      ctx.fill();
      text(state.hint, VIEW.width / 2, VIEW.height - 23, 16, PALETTE.text, 'center', 600);
    }
    // Car condition, bottom-right, and the off-screen mission arrow.
    if (state.player.car && screen === SCREEN_PLAY) {
      const health = Math.max(0, Math.round(state.player.car.health));
      ctx.fillStyle = PALETTE.panel;
      roundRect(ctx, VIEW.width - 190, VIEW.height - 44, 174, 30, 8);
      ctx.fill();
      text('CAR', VIEW.width - 178, VIEW.height - 23, 13, PALETTE.muted, 'left', 700);
      ctx.fillStyle = 'rgba(244,241,232,0.18)';
      ctx.fillRect(VIEW.width - 140, VIEW.height - 33, 108, 9);
      ctx.fillStyle = health > 40 ? PALETTE.good : PALETTE.danger;
      ctx.fillRect(VIEW.width - 140, VIEW.height - 33, 108 * (health / 100), 9);
    }
    const target = state.missionTarget;
    if (target && screen === SCREEN_PLAY) {
      const p = state.player.car ?? state.player;
      const dx = target.x - (p.x);
      const dy = target.y - (p.y);
      const camX = Math.max(0, Math.min(WORLD.width - VIEW.width, p.x - VIEW.width / 2));
      const camY = Math.max(0, Math.min(WORLD.height - VIEW.height, p.y - VIEW.height / 2));
      const sx = target.x - camX;
      const sy = target.y - camY;
      if (sx < -20 || sx > VIEW.width + 20 || sy < -20 || sy > VIEW.height + 20) {
        const ang = Math.atan2(dy, dx);
        const ex = VIEW.width / 2 + Math.cos(ang) * (VIEW.width / 2 - 46);
        const ey = VIEW.height / 2 + Math.sin(ang) * (VIEW.height / 2 - 46);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        ctx.fillStyle = PALETTE.good;
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(-10, -10);
        ctx.lineTo(-10, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        const metres = Math.round(Math.hypot(dx, dy) / 10);
        text(`${metres} m`, ex, ey - 18, 14, PALETTE.good, 'center', 700);
      }
    }
    if (opts && opts.muted) {
      text('MUTED (M)', VIEW.width - 18, VIEW.height - 18, 13, PALETTE.muted, 'right', 600);
    }
    if (screen === SCREEN_PLAY && best > 0) {
      text(`Best haul $ ${best.toLocaleString('en-US')}`, 30, 88, 14, PALETTE.muted, 'left', 600);
    }
  }

  function drawPanel(lines, title, titleColor, prompt, kicker = '') {
    ctx.fillStyle = 'rgba(8, 11, 16, 0.62)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const w = 700;
    const h = 118 + lines.length * 30 + 62 + (kicker ? 26 : 0);
    const x = (VIEW.width - w) / 2;
    const y = (VIEW.height - h) / 2;
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,183,3,0.5)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 14);
    ctx.stroke();
    let titleY = y + 66;
    let linesY = y + 116;
    if (kicker) {
      text(kicker, VIEW.width / 2, y + 34, 14, PALETTE.muted, 'center', 700);
      titleY += 26;
      linesY += 26;
    }
    text(title, VIEW.width / 2, titleY, 46, titleColor, 'center', 800);
    ctx.textBaseline = 'alphabetic';
    lines.forEach((line, i) => {
      text(line, VIEW.width / 2, linesY + i * 30, 17, i === 0 ? PALETTE.text : PALETTE.muted, 'center', i === 0 ? 600 : 400);
    });
    text(prompt, VIEW.width / 2, y + h - 24, 18, PALETTE.accent, 'center', 700);
  }

  function draw(state, screen, best, opts = {}) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    const focus = state.player.car ?? state.player;
    const cam = {
      x: Math.max(0, Math.min(WORLD.width - VIEW.width, focus.x - VIEW.width / 2)),
      y: Math.max(0, Math.min(WORLD.height - VIEW.height, focus.y - VIEW.height / 2)),
    };
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawWorld(state, cam);
    // The mission beacon and the waiting fare.
    const target = state.missionTarget;
    if (target && screen !== SCREEN_TITLE) {
      const m = state.mission;
      const label = m.type === 'getaway' ? 'H' : m.phase === 'toPickup' ? (m.type === 'fare' ? '!' : 'P') : '$';
      drawBeacon(state, target, label, m.phase === 'toPickup' ? PALETTE.accent : PALETTE.good);
      if (m.type === 'fare' && m.phase === 'toPickup') {
        drawPerson(target.x, target.y + 16, -Math.PI / 2, '#ffd166', '#f4f1e8');
      }
    }
    for (const ped of state.peds) {
      if (ped.x < cam.x - 30 || ped.x > cam.x + VIEW.width + 30 || ped.y < cam.y - 30 || ped.y > cam.y + VIEW.height + 30) continue;
      if (ped.down > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, ped.down / 1.2);
        ctx.translate(ped.x, ped.y);
        ctx.rotate(1.2);
        ctx.fillStyle = ped.color;
        ctx.fillRect(-11, -5, 22, 10);
        ctx.fillStyle = '#f4f1e8';
        ctx.beginPath();
        ctx.arc(13, 0, 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        drawPerson(ped.x, ped.y, ped.angle, ped.color, '#f2c9a0');
      }
    }
    for (const car of state.cars) {
      if (car.x < cam.x - 70 || car.x > cam.x + VIEW.width + 70 || car.y < cam.y - 70 || car.y > cam.y + VIEW.height + 70) continue;
      drawCar(state, car);
    }
    if (!state.player.car) {
      drawPerson(state.player.x, state.player.y, state.player.angle, '#ffb703', '#f2c9a0');
      ctx.strokeStyle = 'rgba(255,183,3,0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(state.player.x, state.player.y, 14 + Math.sin(state.time * 4) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    if (screen !== SCREEN_TITLE) {
      drawMinimap(state, cam);
      drawHud(state, screen, best, opts);
    }
    if (screen === SCREEN_TITLE) {
      drawPanel([
        'Riko runs parcels and people across Port Meridian —',
        'legal-ish by day, interesting by night. Uncle\'s garage',
        'washes the heat; the harbour pays in cash.',
        '',
        'WASD / arrows — walk & drive · Shift — sprint / handbrake',
        'E — get in or out of a car · P — pause · M — mute',
      ], 'HARBOR HEAT', PALETTE.accent, 'Press Enter or click to start', 'P O R T   M E R I D I A N');
    } else if (screen === SCREEN_PAUSED) {
      drawPanel(['The city holds its breath.'], 'PAUSED', PALETTE.text, 'Press P to keep rolling');
    } else if (screen === SCREEN_OVER) {
      drawPanel([
        `Cash earned: $ ${state.cash.toLocaleString('en-US')}`,
        `Jobs finished: ${state.missionsDone}`,
        `Best haul: $ ${Math.max(best, state.cash).toLocaleString('en-US')}`,
        'The harbour will forget this by morning.',
      ], 'BUSTED', PALETTE.danger, 'Press R to run it again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
