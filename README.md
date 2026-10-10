# Chinny's Arcade

Collection of experimental browser games made with Claude. **Play them at https://chinny.github.io/arcade/** Each game is a self-contained folder — open its `index.html` in a browser (WebGL 2 required for the 3D ones).

| Game | What it is | Source |
| :--- | :--- | :--- |
| [Be Kind, Rewind](be-kind-rewind/) | New Year's Eve 1999, home alone — explore the house and find every hidden memory before the ball drops. | single file |
| [Blockhaven](blockhaven/) | An endless voxel world of grass, stone and timber. Dig anywhere, build anything. | single file |
| [Rimward](rimward/) | Fly past the last charted stars: scan worlds, ride gravity wells, skim stars for fuel, bank survey data at a relay. | single file + soundtrack |
| [Gravity at the Edge](gravity-at-the-edge/) | Bigger take on Rimward: an explorer ship, galaxy map, honking systems, neutron jets, selling data for credits. | [`source/`](gravity-at-the-edge/source/) (esbuild + three.js) |
| [Midnight in the Sprawl](midnight-in-the-sprawl/) | Walk the rain-soaked neon streets of a cyberpunk city with an original soundtrack. | [`src/`](midnight-in-the-sprawl/src/) |
| [Port Calder](port-calder/) | Open-world city by the bay: walk the streets, jack any car you can get into, drift through the cul-de-sacs. | single file |
| [Vyrium](vyrium/) | Looter shooter: 58 zones, 5 professions, procedurally generated guns. | [`source/`](vyrium/source/) (three.js, vendored) |
| [Hollowmere](hollowmere/) | PS1-style horror: a deserted 1888 village in a thunderstorm. Find eight pages while something tall hunts you. | [`source/`](hollowmere/source/) (three.js, vendored) |
| [Calamity Bay](calamity-bay/) | Kaiju rampage: play a sea or mountain monster and topple a city of breakable towers while police, tanks, helicopters and jets fight back. | [`source/`](calamity-bay/source/) (three.js, vendored) |
| [Mud & Iron](mud-and-iron/) | WWI real-time strategy: four nations, trenches, wire, gas, barrages and early tanks across procedural sectors. Skirmish, Frontline, Survival and a five-mission campaign vs. the AI. Plays with mouse and keyboard or touch. | [`source/`](mud-and-iron/source/) (three.js, vendored) |
| [Studworks](studworks/) | Brick-building sandbox: snap bricks, plates, tiles and slopes onto a baseplate in 26 classic colors. Move, copy, paint, undo, save to file. | [`source/`](studworks/source/) (three.js, vendored) |

## Rebuilding

- **Gravity at the Edge:** `cd gravity-at-the-edge/source && npm install && python3 build.py` → `dist/standalone.html` (copy over `../index.html`).
- **Midnight in the Sprawl:** `cd midnight-in-the-sprawl && python3 build.py` → regenerates `index.html` from `src/`.
- **Vyrium:** `cd vyrium/source && mkdir -p dist && python3 build.py` → copy `dist/vyrium.html` over `../index.html`.
- **Calamity Bay:** `cd calamity-bay/source && python3 build.py` → writes `../index.html` directly. Open with `#debug` for a `window.CB` test hook (`CB.sim(seconds)` fast-forwards the simulation).
- **Hollowmere:** `cd hollowmere/source && python3 build.py` → writes `../index.html` directly. Open with `#debug` to get a `window.HM` test hook.
- **Mud & Iron:** `cd mud-and-iron/source && python3 build.py` → writes `../index.html` directly. Open with `#debug` for a `window.MI` test hook (`MI.sim(seconds)` fast-forwards, `MI.start({...})` launches a match).
- **Studworks:** `cd studworks/source && python3 build.py` → writes `../index.html` directly. Open with `#debug` for a `window.SW` test hook. New parts go in the catalog at the bottom of `src/01_core.js`.

## Running locally

Some games load their soundtrack via a relative path, so serve the folder rather than opening via `file://` if audio doesn't play:

```sh
python3 -m http.server 8000   # then open http://localhost:8000/<game>/
```
