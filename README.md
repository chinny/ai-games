# ai-games

Collection of experimental browser games made with Claude. **Play them at https://chinny.github.io/ai-games/** Each game is a self-contained folder — open its `index.html` in a browser (WebGL 2 required for the 3D ones).

| Game | What it is | Source |
| :--- | :--- | :--- |
| [Be Kind, Rewind](be-kind-rewind/) | New Year's Eve 1999, home alone — explore the house and find every hidden memory before the ball drops. | single file |
| [Blockhaven](blockhaven/) | An endless voxel world of grass, stone and timber. Dig anywhere, build anything. | single file |
| [Rimward](rimward/) | Fly past the last charted stars: scan worlds, ride gravity wells, skim stars for fuel, bank survey data at a relay. | single file + soundtrack |
| [Gravity at the Edge](gravity-at-the-edge/) | Bigger take on Rimward: an explorer ship, galaxy map, honking systems, neutron jets, selling data for credits. | [`source/`](gravity-at-the-edge/source/) (esbuild + three.js) |
| [Midnight in the Sprawl](midnight-in-the-sprawl/) | Walk the rain-soaked neon streets of a cyberpunk city with an original soundtrack. | [`src/`](midnight-in-the-sprawl/src/) |
| [Port Calder](port-calder/) | Open-world city by the bay: walk the streets, jack any car you can get into, drift through the cul-de-sacs. | single file |

## Rebuilding

- **Gravity at the Edge:** `cd gravity-at-the-edge/source && npm install && python3 build.py` → `dist/standalone.html` (copy over `../index.html`).
- **Midnight in the Sprawl:** `cd midnight-in-the-sprawl && python3 build.py` → regenerates `index.html` from `src/`.

## Running locally

Some games load their soundtrack via a relative path, so serve the folder rather than opening via `file://` if audio doesn't play:

```sh
python3 -m http.server 8000   # then open http://localhost:8000/<game>/
```
