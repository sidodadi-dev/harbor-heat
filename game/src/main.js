// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. Screens: title (over the living city), play, paused, and busted.
//
// ?seed=N fixes the city. ?shot=start|play|end (with &seed=N) stages that scene instead
// of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createWorld, EV } from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createSound } from './sound.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const sound = createSound();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best haul then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, {});
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  window.addEventListener('keydown', () => sound.unlock(), { once: false });
  canvas.addEventListener('pointerdown', () => sound.unlock());

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Riko is on the street in Port Meridian.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    sound.setSiren(false, 0);
    if (world.state.cash > best) {
      best = world.state.cash;
      saveBest(best);
    }
    announce(`Busted. Cash earned ${world.state.cash}. Best haul ${best}.`);
  }

  function react(events) {
    if (events & EV.BUSTED) {
      sound.busted();
      endGame();
      return;
    }
    if (events & EV.PICKUP) sound.pickup();
    if (events & EV.BOARD) sound.pickup();
    if (events & EV.DELIVER) sound.deliver();
    if (events & EV.SUCCESS) {
      sound.success();
      announce(`Job done. Cash ${world.state.cash}.`);
    }
    if (events & EV.FAIL) sound.fail();
    if (events & EV.THEFT) sound.theft();
    if (events & EV.PED_HIT) {
      sound.crash(0.7);
      announce('You hit a pedestrian.');
    } else if (events & EV.CRASH_HARD) sound.crash(0.9);
    else if (events & EV.CRASH) sound.crash(0.3);
    if (events & EV.MISSION_NEW) announce(world.state.mission ? world.state.mission.intro : 'A new job.');
    if (events & EV.WANTED_UP) announce(`Wanted level ${world.state.wanted}.`);
  }

  function updateSiren() {
    if (screen !== SCREEN_PLAY || world.state.wanted === 0) {
      sound.setSiren(false, 0);
      return;
    }
    const p = world.playerPos();
    let nearest = Infinity;
    for (const car of world.state.cars) {
      if (car.mode !== 'police') continue;
      nearest = Math.min(nearest, Math.hypot(car.x - p.x, car.y - p.y));
    }
    if (nearest === Infinity) sound.setSiren(false, 0);
    else sound.setSiren(nearest < 620, Math.max(0, 1 - nearest / 620));
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) sound.toggleMute();
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) startGame();
    else if (actions & (ACTION_CONFIRM | ACTION_RESTART) && screen === SCREEN_OVER) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      sound.setSiren(false, 0);
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    return actions;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        world.step(STEP, { x: 0, y: 0, boost: false }, 0, true);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      const enter = actions & ACTION_ENTER ? ACTION_ENTER : 0;
      let first = true;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        const events = world.step(STEP, input.drive(), first ? enter : 0, false);
        first = false;
        react(events);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    updateSiren();
    renderer.draw(world.state, screen, best, { muted: sound.muted });
  }

  // Leaving the tab pauses a running game rather than letting the law win unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Harbor Heat. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

// A tiny handle for poking the game from devtools (and for automated smoke tests).
window.__harborHeat = { world };
