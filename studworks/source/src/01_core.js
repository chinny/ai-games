// Studworks — shared constants, helpers, the colour palette and the brick catalog

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const DEBUG = location.hash === '#debug';
const isTouch = matchMedia('(pointer: coarse)').matches;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const V3 = THREE.Vector3;

// Units: one world unit is one stud pitch (8 mm). Heights are counted in plates
// (3.2 mm = 0.4 units); a brick is three plates tall.
const PLATE = 0.4;
const STUD_R = 0.3, STUD_H = 0.2;
const GAP = 0.012;          // clearance on each side of a brick, so neighbours show a seam
const MAX_Y = 240;          // build-height limit, in plates (80 bricks)
const SIZES = [16, 32, 48]; // baseplate sizes, in studs

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (e) { /* storage blocked: the game still works, it just won't remember */ }
  return null;
}

// ---------------------------------------------------------------------------
// Palette: classic brick colours. `id` is what save files store, so never rename one.
const COLORS = [
  { id: 'white', name: 'White', hex: '#f4f4f1' },
  { id: 'lbg', name: 'Light Bluish Gray', hex: '#a0a5a9' },
  { id: 'dbg', name: 'Dark Bluish Gray', hex: '#6c6e68' },
  { id: 'black', name: 'Black', hex: '#1d1f22' },
  { id: 'red', name: 'Red', hex: '#c91a09' },
  { id: 'dkred', name: 'Dark Red', hex: '#720e0f' },
  { id: 'coral', name: 'Coral', hex: '#ff698f' },
  { id: 'pink', name: 'Dark Pink', hex: '#c870a0' },
  { id: 'lavender', name: 'Medium Lavender', hex: '#ac78ba' },
  { id: 'orange', name: 'Orange', hex: '#fe8a18' },
  { id: 'yellow', name: 'Yellow', hex: '#f2cd37' },
  { id: 'tan', name: 'Tan', hex: '#e4cd9e' },
  { id: 'dktan', name: 'Dark Tan', hex: '#958a73' },
  { id: 'brown', name: 'Reddish Brown', hex: '#582a12' },
  { id: 'lime', name: 'Lime', hex: '#bbe90b' },
  { id: 'bgreen', name: 'Bright Green', hex: '#4b9f4a' },
  { id: 'green', name: 'Green', hex: '#237841' },
  { id: 'sand', name: 'Sand Green', hex: '#a0bcac' },
  { id: 'azure', name: 'Medium Azure', hex: '#36aebf' },
  { id: 'blue', name: 'Blue', hex: '#0055bf' },
  { id: 'dkblue', name: 'Dark Blue', hex: '#0a3463' },
  { id: 'tclear', name: 'Trans-Clear', hex: '#f4f8fa', trans: true },
  { id: 'tred', name: 'Trans-Red', hex: '#d41e10', trans: true },
  { id: 'tyellow', name: 'Trans-Yellow', hex: '#f5cd2f', trans: true },
  { id: 'tgreen', name: 'Trans-Green', hex: '#5fb06f', trans: true },
  { id: 'tblue', name: 'Trans-Light Blue', hex: '#8fd3f2', trans: true },
];
const COLOR = {};
COLORS.forEach((c, i) => {
  c.idx = i;
  c.linear = new THREE.Color(c.hex).convertSRGBToLinear();
  COLOR[c.id] = c;
});
const BASE_COLORS = ['green', 'bgreen', 'lbg', 'tan', 'blue', 'white'];

// ---------------------------------------------------------------------------
// Brick catalog. Footprint is w (along x) by d (along z) studs, height h in plates.
// shape: 'box' (brick, plate or tile), 'slope', 'inv' (inverted slope), 'ridge' (double slope).
// Slopes face +z: the low edge is at the front. `id` is stored in save files, so never rename one.
const FAMILIES = [
  { id: 'brick', name: 'Bricks' },
  { id: 'plate', name: 'Plates' },
  { id: 'tile', name: 'Tiles' },
  { id: 'slope', name: 'Slopes' },
];
const TYPES = [];
const TYPE = {};
function defType(t) {
  t.idx = TYPES.length;
  t.studs = t.studs || [];
  TYPES.push(t);
  TYPE[t.id] = t;
}
function allStuds(w, d) {
  const s = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) s.push([i + 0.5, j + 0.5]);
  return s;
}
// Rectangular parts are named short side first ("Brick 2 x 4") and lie long along x.
function rectParts(fam, label, h, sizes, studded) {
  for (const [a, b] of sizes) {
    defType({
      id: `${fam}-${a}x${b}`, fam, name: `${label} ${a} × ${b}`, short: `${a} × ${b}`,
      w: b, d: a, h, shape: 'box', tile: !studded, studs: studded ? allStuds(b, a) : [],
    });
  }
}
rectParts('brick', 'Brick', 3,
  [[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [2, 2], [2, 3], [2, 4], [2, 6], [2, 8]], true);
rectParts('plate', 'Plate', 1,
  [[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [2, 2], [2, 3], [2, 4], [2, 6], [2, 8],
    [4, 4], [4, 6], [4, 8], [6, 6], [6, 8], [8, 8]], true);
rectParts('tile', 'Tile', 1,
  [[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [2, 2], [2, 3], [2, 4]], false);

// Slopes are named depth first, as the real parts are ("Slope 45° 2 × 4" is 2 deep, 4 wide).
function slopePart(id, name, short, w, d, shape) {
  let studs = [];
  if (shape === 'slope') for (let i = 0; i < w; i++) studs.push([i + 0.5, 0.5]);
  if (shape === 'inv') studs = allStuds(w, d);
  defType({ id, fam: 'slope', name, short, w, d, h: 3, shape, studs });
}
for (const w of [1, 2, 3, 4]) slopePart(`slope45-2x${w}`, `Slope 45° 2 × ${w}`, `45° 2 × ${w}`, w, 2, 'slope');
for (const w of [2, 4]) slopePart(`slope33-3x${w}`, `Slope 33° 3 × ${w}`, `33° 3 × ${w}`, w, 3, 'slope');
for (const w of [1, 2]) slopePart(`inv45-2x${w}`, `Inverted Slope 45° 2 × ${w}`, `Inv. 2 × ${w}`, w, 2, 'inv');
for (const w of [2, 4]) slopePart(`ridge45-2x${w}`, `Ridge Slope 45° 2 × ${w}`, `Ridge 2 × ${w}`, w, 2, 'ridge');

// Footprint after rotating by rot quarter-turns.
const dimsOf = (type, rot) => (rot & 1 ? [type.d, type.w] : [type.w, type.d]);
