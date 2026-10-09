// Mud & Iron — nations, units, weapons, buildings, abilities and command powers

const SIDE_OF = { gb: 'entente', fr: 'entente', de: 'central', ah: 'central' };
const NATIONS = {
  gb: {
    id: 'gb', name: 'Britain', adj: 'British', side: 'Entente', flag: ['#1f3a7a', '#f2efe6', '#b3202e'], ui: '#cdb578',
    uni: '#8a7c4f', uni2: '#6e6340', helm: '#5f5c40', helmet: 'brodie', veh: '#7d6e4a', veh2: '#5b4f33', tank: 'mark4', unique: 'lewis',
    blurb: 'Steady infantry and the rhomboid <b>Mark IV</b>. Unique: <b>Lewis Gunners</b>, a light machine gun that fires on the move.',
  },
  fr: {
    id: 'fr', name: 'France', adj: 'French', side: 'Entente', flag: ['#244a9a', '#f2efe6', '#c8343a'], ui: '#93b2dd',
    uni: '#7b90ad', uni2: '#5e7290', helm: '#66788f', helmet: 'adrian', veh: '#86825f', veh2: '#5d6a4e', tank: 'stchamond', unique: 'ft',
    blurb: 'The hard-hitting <b>Saint-Chamond</b>, poor at crossing trenches. Unique: the nimble <b>Renault FT</b>, the first turreted tank.',
  },
  de: {
    id: 'de', name: 'Germany', adj: 'German', side: 'Central Powers', flag: ['#151515', '#f2efe6', '#c8343a'], ui: '#b6bba0',
    uni: '#6c705f', uni2: '#55594a', helm: '#5a5f50', helmet: 'stahl', veh: '#76776a', veh2: '#55574c', tank: 'a7v', unique: 'flamer',
    blurb: 'The armored fortress <b>A7V</b>. Unique: <b>Flammenwerfer</b> teams that burn defenders out of their trenches.',
  },
  ah: {
    id: 'ah', name: 'Austria-Hungary', adj: 'Austro-Hungarian', side: 'Central Powers', flag: ['#c8343a', '#f2efe6', '#c8343a'], ui: '#c9d0d4',
    uni: '#8a959a', uni2: '#6b767b', helm: '#6e787c', helmet: 'stahl', veh: '#7f7b65', veh2: '#5c5a49', tank: 'beute', unique: 'skoda',
    blurb: 'Captured <b>Beutepanzer</b> tanks. Unique: the <b>Škoda 30.5 cm siege mortar</b>, which flattens anything within 150 m.',
  },
};
const NATION_IDS = ['gb', 'fr', 'de', 'ah'];
const enemiesOf = (n) => NATION_IDS.filter((k) => SIDE_OF[k] !== SIDE_OF[n]);
const TEAMCOL = ['#58b4ff', '#ff5b45'];

const UNITS = {
  rifle: { name: 'Riflemen', short: 'Riflemen', kind: 'squad', cls: 'foot', men: 6, hp: 50, speed: 4.2, cost: 70, pop: 4, time: 14, at: 'hq', weapon: 'rifle', sight: 36, ab: ['overtop', 'grenade'],
    desc: 'The backbone of the line. Captures sectors, holds trenches and goes over the top.' },
  eng: { name: 'Engineers', short: 'Engineers', kind: 'squad', cls: 'foot', men: 4, hp: 45, speed: 4.2, cost: 60, pop: 2, time: 12, at: 'hq', weapon: 'carbine', sight: 32, ab: ['trench', 'wire', 'build'], eng: true,
    desc: 'Dig trenches, string barbed wire, raise buildings. Right-click wire to cut it, or a damaged vehicle or building to repair it.' },
  mg: { name: 'Machine Gun Team', short: 'MG Team', kind: 'squad', cls: 'foot', men: 3, hp: 50, speed: 3.5, cost: 100, pop: 3, time: 18, at: 'barracks', weapon: 'mg', crew: 'mg', sight: 42, ab: [],
    desc: 'A Vickers or MG 08 on a tripod. Must set up before firing. Pins infantry down and can shoot at aircraft.' },
  raid: { name: 'Trench Raiders', short: 'Raiders', kind: 'squad', cls: 'foot', men: 5, hp: 55, speed: 5, cost: 110, pop: 4, time: 18, at: 'barracks', weapon: 'trench', sight: 34, ab: ['bundle'],
    desc: 'Pistols, clubs and shotguns. Lethal up close and quick across open ground. Grenade bundles wreck tanks.' },
  mortar: { name: 'Mortar Team', short: 'Mortar', kind: 'squad', cls: 'foot', men: 3, hp: 45, speed: 3.4, cost: 120, pop: 3, time: 20, at: 'barracks', weapon: 'mortar', crew: 'mortar', sight: 34, ab: ['barrage'],
    desc: 'Lobs shells over cover and into trenches. Cannot hit targets closer than 14 m.' },
  lewis: { nation: 'gb', name: 'Lewis Gunners', short: 'Lewis Guns', kind: 'squad', cls: 'foot', men: 5, hp: 50, speed: 4, cost: 115, pop: 4, time: 18, at: 'barracks', weapon: 'lewis', sight: 36, ab: ['overtop'],
    desc: 'British unique. Light machine guns that fire on the move. Ideal for assaults.' },
  flamer: { nation: 'de', name: 'Flammenwerfer', short: 'Flamers', kind: 'squad', cls: 'foot', men: 3, hp: 60, speed: 4, cost: 130, pop: 4, time: 20, at: 'barracks', weapon: 'flame', sight: 32, ab: [],
    desc: 'German unique. Flamethrowers that ignore most cover and break any squad they touch. Short range.' },
  fgun: { name: 'Field Gun', short: 'Field Gun', kind: 'squad', cls: 'foot', men: 4, hp: 45, speed: 2.4, cost: 180, pop: 5, time: 26, at: 'artillery', weapon: 'fgun', crew: 'fgun', sight: 36, ab: ['barrage'],
    desc: 'An 18-pounder or 77 mm gun. Long-range shellfire, and direct fire that knocks out tanks.' },
  skoda: { nation: 'ah', name: 'Škoda Siege Mortar', short: 'Škoda 30.5', kind: 'squad', cls: 'foot', men: 5, hp: 45, speed: 1.6, cost: 340, pop: 7, time: 40, at: 'artillery', weapon: 'skoda', crew: 'skoda', sight: 32, ab: ['barrage'],
    desc: 'Austro-Hungarian unique. Huge, slow and devastating. 150 m range; levels buildings and trench lines.' },
  ac: { name: 'Armored Car', short: 'Armd. Car', kind: 'veh', cls: 'wheel', hp: 280, armor: 0.8, speed: 9, cost: 170, pop: 4, time: 22, at: 'workshop', weapons: ['acmg'], model: 'ac', turret: true, sight: 40, rad: 2.2,
    desc: 'Fast and armored against rifles, but cannot cross trenches or wire. Shoots at aircraft.' },
  mark4: { nation: 'gb', name: 'Mark IV Tank', short: 'Mark IV', kind: 'veh', cls: 'track', hp: 760, armor: 0.97, speed: 2.8, cost: 320, pop: 8, time: 40, at: 'workshop', weapons: ['gun57', 'vmg'], model: 'mark4', sight: 36, rad: 3.6, trench: 1.6,
    desc: 'Slow, loud and nearly immune to rifles. Crosses trenches and crushes wire. Prone to breakdowns.' },
  stchamond: { nation: 'fr', name: 'Saint-Chamond', short: 'St-Chamond', kind: 'veh', cls: 'track', hp: 680, armor: 0.96, speed: 3.2, cost: 320, pop: 8, time: 40, at: 'workshop', weapons: ['gun75', 'vmg'], model: 'stchamond', sight: 36, rad: 3.8, trench: 4,
    desc: 'A 75 mm gun on a long hull. Hits hard, but struggles to cross trenches.' },
  a7v: { nation: 'de', name: 'A7V Sturmpanzer', short: 'A7V', kind: 'veh', cls: 'track', hp: 860, armor: 0.97, speed: 2.5, cost: 330, pop: 8, time: 42, at: 'workshop', weapons: ['gun57', 'vmg', 'vmg'], model: 'a7v', sight: 36, rad: 3.6, trench: 3.2,
    desc: 'A rolling fortress with six machine guns. Very tough, very slow, poor in broken ground.' },
  beute: { nation: 'ah', name: 'Beutepanzer IV', short: 'Beute IV', kind: 'veh', cls: 'track', hp: 740, armor: 0.97, speed: 2.8, cost: 320, pop: 8, time: 40, at: 'workshop', weapons: ['gun57', 'vmg'], model: 'mark4', sight: 36, rad: 3.6, trench: 1.6,
    desc: 'A captured Mark IV with new paint. Crosses trenches and crushes wire.' },
  ft: { nation: 'fr', name: 'Renault FT', short: 'Renault FT', kind: 'veh', cls: 'track', hp: 380, armor: 0.95, speed: 4.6, cost: 230, pop: 5, time: 28, at: 'workshop', weapons: ['gun37'], model: 'ft', turret: true, sight: 38, rad: 2.2, trench: 2.2,
    desc: 'French unique. A light tank with a fully rotating turret. Quick, cheap and reliable.' },
};
for (const k in UNITS) UNITS[k].id = k;

const WEAPONS = {
  rifle: { name: 'Rifles', range: 32, cd: 2.6, dmg: 14, acc: [0.55, 0.2], supp: 0.022, move: 0.5, snd: 'rifle' },
  carbine: { name: 'Carbines', range: 28, cd: 2.8, dmg: 12, acc: [0.45, 0.15], supp: 0.018, move: 0.5, snd: 'rifle' },
  lewis: { name: 'Lewis guns', range: 30, cd: 1.1, shots: 3, dmg: 8, acc: [0.42, 0.14], supp: 0.045, move: 0.85, snd: 'lmg' },
  mg: { name: 'Heavy MG', range: 45, cd: 0.5, shots: 3, dmg: 8, acc: [0.4, 0.12], supp: 0.055, setup: 2.5, air: true, snd: 'mg', team: true },
  trench: { name: 'Trench weapons', range: 16, cd: 1.3, dmg: 17, acc: [0.72, 0.3], supp: 0.03, move: 0.7, snd: 'pistol' },
  flame: { name: 'Flamethrower', range: 13, cd: 0.35, dmg: 6, supp: 0.1, flame: true, move: 0.6, snd: 'flame' },
  mortar: { name: 'Trench mortar', shell: true, range: 62, min: 14, cd: 7, dmg: 55, radius: 4.5, supp: 0.55, scatter: [2, 7], arc: 1, at: 0.4, crater: 0.8, team: true, snd: 'mortar', setup: 1.5 },
  fgun: { name: '18-pdr / 77 mm', shell: true, range: 95, min: 10, cd: 7.5, dmg: 75, radius: 5, supp: 0.6, scatter: [1.5, 8], arc: 0.32, at: 1.4, crater: 1, team: true, direct: 50, snd: 'gun', setup: 3 },
  skoda: { name: '30.5 cm mortar', shell: true, range: 150, min: 30, cd: 20, dmg: 230, radius: 9, supp: 1, scatter: [4, 12], arc: 1.2, at: 1.5, crater: 1.8, bld: 2.5, team: true, snd: 'big', setup: 6 },
  gun57: { name: '57 mm guns', shell: true, direct: 99, range: 40, cd: 4.5, dmg: 55, radius: 3, supp: 0.4, scatter: [0.5, 3], arc: 0.05, at: 1.2, crater: 0.5, snd: 'tgun' },
  gun75: { name: '75 mm gun', shell: true, direct: 99, range: 46, cd: 5.5, dmg: 72, radius: 3.5, supp: 0.5, scatter: [0.6, 3.5], arc: 0.05, at: 1.3, crater: 0.6, snd: 'tgun' },
  gun37: { name: '37 mm gun', shell: true, direct: 99, range: 36, cd: 3.2, dmg: 40, radius: 2.2, supp: 0.3, scatter: [0.4, 2.2], arc: 0.05, at: 1.0, crater: 0.3, snd: 'tgun' },
  vmg: { name: 'Hull MGs', range: 34, cd: 0.5, shots: 3, dmg: 7, acc: [0.36, 0.12], supp: 0.05, move: 0.7, air: true, snd: 'mg' },
  acmg: { name: 'Turret MG', range: 34, cd: 0.45, shots: 3, dmg: 7, acc: [0.38, 0.12], supp: 0.05, move: 0.8, air: true, snd: 'mg' },
};

const ABIL = {
  overtop: { name: 'Over the Top!', cost: 20, cd: 60, self: true, dur: 10, desc: 'Whistles blow. For 10 seconds the squad ignores suppression and moves 35% faster.' },
  grenade: { name: 'Grenades', cost: 15, cd: 30, range: 20, target: 'ground', radius: 4, desc: 'Lob grenades at a position up to 20 m away. Good against squads in trenches.' },
  bundle: { name: 'Grenade Bundle', cost: 25, cd: 35, range: 13, target: 'ground', radius: 3, desc: 'Stick grenades wired together. Wrecks tanks and clears a trench bay.' },
  barrage: { name: 'Barrage', cost: 30, cd: 45, target: 'ground', rounds: 5, desc: 'Fire five rounds as fast as the crew can load at a target area.' },
  trench: { name: 'Dig Trench', costPer: 4, target: 'line', desc: 'Drag out a trench line. 4 supply per 4 m section. Infantry in trenches are very hard to hit.' },
  wire: { name: 'Barbed Wire', costPer: 6, target: 'line', desc: 'Drag out a wire line. 6 supply per section. Slows infantry to a crawl and stops armored cars.' },
  build: { name: 'Build…', menu: true, desc: 'Construct a building near your HQ or a sector you hold.' },
};

const BLDS = {
  hq: { name: 'Headquarters', hp: 2600, w: 14, d: 10, makes: ['rifle', 'eng'], research: ['gasmask'], sight: 34, income: 2.0, pop: 30, heal: true,
    desc: 'Lose it and the sector is lost. Trains riflemen and engineers, and heals squads that retreat here.' },
  barracks: { name: 'Infantry Barracks', cost: 150, hp: 1100, w: 14, d: 8, time: 30, makes: ['mg', 'raid', 'mortar', '$unique'], sight: 24,
    desc: 'Trains machine gun teams, raiders and mortar teams.' },
  depot: { name: 'Supply Depot', cost: 120, hp: 800, w: 10, d: 10, time: 24, pop: 12, income: 0.5, heal: true, sight: 24,
    desc: '+12 population cap and +30 supply a minute. Squads nearby can reinforce and heal.' },
  artillery: { name: 'Artillery Park', cost: 200, hp: 900, w: 12, d: 12, time: 32, makes: ['fgun', '$unique'], sight: 24,
    desc: 'Builds field guns. Unlocks the Gas Attack and Creeping Barrage powers.' },
  workshop: { name: 'Tank Workshop', cost: 240, hp: 1300, w: 16, d: 10, time: 40, makes: ['ac', '$tank', '$unique'], repair: true, sight: 24,
    desc: 'Builds armored cars and tanks, and repairs vehicles parked nearby.' },
  airfield: { name: 'Airfield', cost: 200, hp: 900, w: 18, d: 14, time: 34, sight: 28,
    desc: 'Unlocks the Recon Flight and Strafing Run powers.' },
};
for (const k in BLDS) BLDS[k].id = k;
const BUILD_ORDER = ['barracks', 'depot', 'artillery', 'workshop', 'airfield'];

const RESEARCH = {
  gasmask: { name: 'Gas Masks', cost: 150, time: 40, desc: 'Small box respirators for every man. Gas does 80% less harm to your infantry.' },
};

const POWERS = {
  recon: { name: 'Recon Flight', key: 'Y', cost: 60, cd: 60, req: 'airfield', desc: 'A two-seater photographs the ground along its path, revealing it for 25 seconds.' },
  strafe: { name: 'Strafing Run', key: 'U', cost: 140, cd: 110, req: 'airfield', desc: 'A fighter dives along a line and rakes it with machine gun fire. Machine guns can shoot it down.' },
  gas: { name: 'Gas Attack', key: 'I', cost: 160, cd: 140, req: 'artillery', radius: 16, desc: 'Gas shells blanket an area. The cloud drifts with the wind and poisons unmasked infantry.' },
  creep: { name: 'Creeping Barrage', key: 'O', cost: 260, cd: 180, req: 'artillery', desc: 'A curtain of shellfire 40 m wide that walks forward from the target, away from your HQ. Advance behind it.' },
};
const POWER_IDS = ['recon', 'strafe', 'gas', 'creep'];

// Which unit a building slot means for a nation ($tank, $unique), or null if it doesn't apply.
function resolveMake(slot, nation, bld) {
  if (slot === '$tank') return NATIONS[nation].tank;
  if (slot === '$unique') { const u = NATIONS[nation].unique; return UNITS[u].at === bld ? u : null; }
  return slot;
}
function makesFor(bld, nation) { return (BLDS[bld].makes || []).map((s) => resolveMake(s, nation, bld)).filter(Boolean); }
