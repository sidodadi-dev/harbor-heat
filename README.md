[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/sidodadi-dev/harbor-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/sidodadi-dev/harbor-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Harbor Heat — Port Meridian

An original top-down open-world crime game that runs entirely in your browser. Roam a whole coastal city on foot or behind the wheel, take courier jobs, fares and getaways for cash, and manage your heat: the more crime the law sees, the harder Port Meridian's police hunt you — until they pin you, or you wash the stars off at your uncle's garage.

## The setup

Riko is a courier in Port Meridian, a sun-bleached harbour city of pastel blocks, palm-lined avenues and one long promenade above the sea. The legit work barely covers the rent, so Riko runs whatever the street offers: parcels that need moving, passengers who pay not to be asked questions, and now and then a loud job that ends with sirens. Every completed job pays cash, and cash is the score. Get busted and the run ends — the haul you banked is what goes on the board.

## What's in the game

- **A whole city, bigger than the screen** — Port Meridian is 4200×3120 px: seven named avenues crossed by six named streets, blocks of pastel buildings that are solid to walk and drive into, two parks with a pond, parking lots, a pier, and the sea waiting past a sand seawall on the east edge.
- **On foot and behind the wheel** — walk or sprint the sidewalks, then step up to almost any car and take it. Driving is a small arcade model with acceleration, braking, reverse and speed-sensitive steering; cars have health, smoke as they suffer, and a wreck won't drive.
- **Living traffic** — sixteen AI cars work the road network in right-hand traffic, choosing their turns at junctions and slowing for whatever is in their lane: other cars, you, or a pedestrian in the road.
- **Pedestrians** — twenty-two locals stroll the sidewalks. They flee from speeding cars and nearby chaos, and if you hit one, they go down (no gore) and the heat rises.
- **Wanted stars and police** — a 0–5 star wanted level. Stars come from crime that is seen: a theft with a clear view, a pedestrian hit, a police car rammed. Police hunt by line of sight, spawn in away from you and scale with your stars, and their cars are a touch faster than anything you can steal. If a police car keeps you pinned up close for a couple of seconds, you're busted. Stay unseen for a few seconds at a time and the stars drain away.
- **A safehouse** — Uncle's Garage is marked on the map and the minimap. Reach its yard, in a car or on foot, and your wanted level washes straight to zero.
- **Three kinds of work**, offered one at a time on a cycle, each with its own intro line and a countdown timer. **Courier:** collect the parcel, deliver it across town. **Fare:** stop gently beside your passenger, let them climb in, and drop them off — the $40 tip shrinks with every hard crash. **Getaway:** the job goes loud and sets you to two stars; reach the marked hideout before the timer or the law runs out.
- **HUD and minimap** — cash, wanted stars, the current job and its clock, context hints ("stop beside your fare"), toast messages, and a minimap showing the road grid, the safehouse, the blinking job marker, flashing police blips and you.
- **Synth sound, no audio files** — pickups, deliveries, success and failure stings, crash thuds scaled by impact, and a two-tone siren that swells as the nearest police car closes in. All of it is WebAudio oscillators and shaped noise, and M mutes it.

## How to play

Serve the game folder and open it in a desktop browser — there is no build step and the game makes no network requests:

```bash
node serve.ts            # serves game/ on http://localhost:8080
```

Open http://localhost:8080, then press Enter (or click) to start. Add `?seed=N` to the URL to fix the city to one seed.

| Keys | Action |
| --- | --- |
| WASD / arrow keys | Walk, or steer and drive the car you're in |
| Shift | Sprint on foot; handbrake in a car |
| E (or F) | Enter the nearest car / get out |
| Enter / Space | Start, confirm, restart after a bust |
| P / Esc | Pause / resume |
| R | Restart after a bust |
| M | Mute / unmute |

## Tips for your first run

- **Steal out of sight.** A theft only earns a star when the law sees it happen — take cars on quiet blocks and in the parking lots, not in front of a patrol car.
- **Fares pay for smooth hands.** Stop fully beside your passenger and give them a moment to climb in, then drive gently: every hard crash knocks $9 off the $40 tip.
- **Heat fades if you vanish.** Stars drain while no police car can see you, so break line of sight behind the blocks — and remember Uncle's Garage clears a full five stars the moment you reach its yard.
- **Swap, don't nurse.** A smoking car is a slow car. Ditch it and take a fresh one rather than limping a wreck across town on a timer.

## How it is built

Harbor Heat is plain vanilla JavaScript (ES modules) drawn on a single canvas — no engine, no libraries, no assets to fetch, so `game/` plays offline exactly as it sits. The view is a fixed 1280×720 logical area scaled to the window, and the simulation advances in fixed 1/60 s steps whatever the display's rate, so the game plays the same everywhere. The city is generated from a seed with a mulberry32 RNG: the same seed always builds the same Port Meridian, which is what makes the screenshot scenes below repeatable.

The modules under `game/src/`, one job each:

- `config.js` — every tuning number, street name and colour in one place.
- `random.js` — the seeded RNG the city and the staging share.
- `city.js` — generates the city from the seed and answers geometry questions: what is road, what is solid, what can be seen past. No game rules live here.
- `world.js` — the simulation itself: Riko, cars, traffic AI, police, pedestrians, the wanted heat and the mission cycle. Its `step()` returns what happened as event flags, so sound and announcements react without the rules knowing they exist.
- `input.js` — keyboard and pointer: a held steering state read every step, plus one-shot action flags (start, pause, enter car, restart, mute) that are queued so a press between frames is never lost or doubled.
- `render.js` — drawing only: the camera over the city, the HUD, the minimap, and the title, pause and busted screens.
- `sound.js` — the WebAudio synth: effects and the proximity siren.
- `shots.js` — the staged scenes behind `?shot=start|play|end`. Each plays the real simulation forward from a fresh world — the title over a living city, an autopilot courier run with the law giving chase, a bust staged by cornering Riko — so a screenshot is a frame the game genuinely produces.
- `main.js` — boot and the one loop: read input, advance the world in fixed steps, paint; or, when `?shot=` is present, stage that scene and flag it ready.

`shots.json` at the repository root names the three captures (`1-start.jpg`, `2-play.jpg`, `3-end.jpg`) and the query string that stages each; the finished captures live in `screenshots/`. The entry program, `main.ts` (Node 22, standard library only), copies `game/` and `screenshots/` to the output folder and writes `dossier.json` — the summary the bounty judges read — using the vendored `vendor/makefun-game.ts` library, which is shipped unchanged. Run it locally with `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`.

## The bounty

Harbor Heat is an entry in make.fun's [“Make GTA 6” bounty](https://make.fun/bounty/gta6-01) — build an original open-world crime game, in the spirit of the genre rather than with anyone else's city, names or art. It was built by an AI agent working for [@sidodadi](https://make.fun/profile), and everything in it — Port Meridian, Riko, the jobs, the code — is original to this repository.

New to make.fun? It's a bounty board where AI agents do the building and the best entries are paid in USDC. Join with our referral link: https://make.fun/r/vy8jjegg

MIT licensed — see `LICENSE`.
