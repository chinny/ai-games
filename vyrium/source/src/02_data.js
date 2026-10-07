// ===================== WORLD DATA =====================
const FACTIONS = {
  corp: { id: 'corp', name: 'Cyrex Consolidated', short: 'Cyrex', color: '#4fb3ff', hex: 0x4fb3ff, alt: 0xe9eef3,
    blurb: 'The corporation that owns the planet, its Vyrium mines and most of its people. Clean streets, long contracts, guaranteed reclaim.' },
  clan: { id: 'clan', name: 'The Free Clans', short: 'Clan', color: '#ff7a3d', hex: 0xff7a3d, alt: 0x7a4a2c,
    blurb: 'Miners, smugglers and deserters who tore up their contracts. Rust, grit, home-brewed nanotech and no masters.' },
  neutral: { id: 'neutral', name: 'Unaligned', short: 'Neutral', color: '#9be37a', hex: 0x9be37a, alt: 0x6f7f74,
    blurb: 'Traders and drifters who answer to no flag. Welcome in every city, trusted in none.' }
};
const HOSTILE = (a, b) => (a === 'corp' && b === 'clan') || (a === 'clan' && b === 'corp');
const HOME_CITY = { corp: 'cyrex-arcade', clan: 'kesh', neutral: 'newhaven' };

const PROFESSIONS = {
  soldier: { id: 'soldier', name: 'Soldier', skill: 'Overdrive', color: '#ff5a4a', cost: 55, cd: 24,
    desc: 'For 8 seconds: +40% fire rate, +25% gun damage and no ammo use.', passive: '+15% max health, +10% shield capacity', hp: 1.15, sh: 1.1 },
  nanocaster: { id: 'nanocaster', name: 'Nanocaster', skill: 'Vyrium Lance', color: '#c26bff', cost: 50, cd: 13,
    desc: 'Hurl a lance of raw Vyrium that detonates for massive Nano damage in a wide blast.', passive: '+30% Nano pool and regen, +15% elemental chance', np: 1.3, el: 0.15 },
  engineer: { id: 'engineer', name: 'Engineer', skill: 'Sentry Drone', color: '#ffc23a', cost: 55, cd: 26,
    desc: 'Deploy a hovering drone that hunts enemies for 18 seconds.', passive: '+20% reload speed, +20% magazine size', rl: 0.2, mag: 0.2 },
  agent: { id: 'agent', name: 'Agent', skill: 'Phase Cloak', color: '#4fd6ff', cost: 45, cd: 20,
    desc: 'Vanish for 6 seconds. Enemies lose you, and your next hit is a triple-damage critical.', passive: '+50% critical damage, +10% move speed', crit: 0.5, spd: 0.1 },
  doctor: { id: 'doctor', name: 'Doctor', skill: 'Restoration Field', color: '#5cf0a0', cost: 50, cd: 22,
    desc: 'Restore 60% health and your full shield over 4 seconds and cleanse burns.', passive: 'Regenerate 1.5% health per second, +10% max health', hp: 1.1, regen: 0.015 },
};

const ATTRS = [
  ['str', 'Strength', '+2% max health, +6% melee damage'],
  ['agi', 'Agility', '+1% move speed, +2% reload speed'],
  ['sta', 'Stamina', '+3% max health, +2% shield capacity'],
  ['int', 'Intelligence', '+2% elemental damage and chance'],
  ['sen', 'Sense', '+3% crit damage, +1% accuracy'],
  ['psy', 'Psychic', '+3% Nano pool and regen, -1.5% skill cooldown'],
];

// biome palettes: g=ground ramp, hi=high ground, cl=cliff, sh=shore, w=water, sky=[top,horizon,bottom]
const BIOMES = {
  island: { g: [0x7fa35a, 0x95b864, 0xb3c77a], hi: 0x9a9578, cl: 0x7a6f5e, sh: 0xe2d29a, w: 0x2f9cc0, wy: -0.6, amp: 6, sc: 0.016, sky: [0x3a86d6, 0xbfe3f2, 0xe8e2c8], fog: 0xc8e2ee, ff: 380, trees: ['palm', 'broad'], tn: 70, rn: 50, mood: 'wild', planet: 0xe7b37a, sun: 0xfff1d6 },
  forest: { g: [0x3f6b34, 0x4f7f3a, 0x6b9447], hi: 0x6f7a5a, cl: 0x5d5a4b, sh: 0x8f8a5a, w: 0x3a7f86, amp: 9, sc: 0.012, sky: [0x4f8fd0, 0xc9e2d8, 0x8fae84], fog: 0xa9c9b4, ff: 300, trees: ['broad', 'pine', 'mushroom', 'broad'], tn: 300, rn: 60, mood: 'wild', planet: 0xb8d0ff, sun: 0xfff4dc },
  darkforest: { g: [0x2b3d2e, 0x34482f, 0x46543a], hi: 0x4d4a44, cl: 0x3d3833, sh: 0x5b5240, w: 0x2a4a4a, amp: 10, sc: 0.013, sky: [0x2b3150, 0x6f6c8a, 0x3a4040], fog: 0x4f5566, ff: 220, trees: ['dead', 'mushroom', 'pine', 'mushroom'], tn: 320, rn: 60, mood: 'cold', planet: 0xd27a7a, sun: 0xd8c8ff },
  plains: { g: [0x88a957, 0x9fbc61, 0xbccb73], hi: 0x9b9473, cl: 0x847b63, sh: 0xcfc28d, w: 0x3c90b4, amp: 5, sc: 0.01, sky: [0x3f8bd8, 0xc8e4f2, 0xd8dcb5], fog: 0xcde3ea, ff: 420, trees: ['broad', 'broad', 'pine'], tn: 60, rn: 50, mood: 'wild', planet: 0xe7c39a, sun: 0xfff6dc },
  pastoral: { g: [0x8fae58, 0xa9c46a, 0xc9c977], hi: 0xa1956f, cl: 0x8b7b5e, sh: 0xd3c590, w: 0x3c90b4, amp: 4, sc: 0.009, sky: [0x5aa0e0, 0xdcecf0, 0xe8dcb5], fog: 0xdbe8e6, ff: 420, trees: ['broad'], tn: 45, rn: 25, mood: 'neutral', planet: 0xf2d0a0, sun: 0xfff2d0, farm: true },
  desert: { g: [0xd9a866, 0xe2b876, 0xebc98c], hi: 0xc98d55, cl: 0xb06f42, sh: 0xe9d3a0, w: 0x3c9cb0, amp: 7, sc: 0.011, sky: [0x3c78c8, 0xf3d9b0, 0xf0c890], fog: 0xf0d6ae, ff: 400, trees: ['cactus', 'spire'], tn: 60, rn: 80, mood: 'desert', planet: 0xffe0a0, sun: 0xfff0c8, mesas: true },
  canyon: { g: [0xb76a43, 0xc7804f, 0xd39a64], hi: 0xa65a38, cl: 0x8f4a2e, sh: 0xd9b07a, w: 0x3c8fa8, amp: 16, sc: 0.014, sky: [0x3b74c4, 0xf0c9a2, 0xd49b70], fog: 0xe8c3a0, ff: 360, trees: ['spire', 'cactus'], tn: 50, rn: 90, mood: 'desert', planet: 0xffc89a, sun: 0xfff0d0, mesas: true, ridge: true },
  crater: { g: [0x8a7e6a, 0x9a8c72, 0xab9c7d], hi: 0x7a6e5e, cl: 0x5f564b, sh: 0xb5a88a, w: 0x4c8a8a, amp: 4, sc: 0.012, sky: [0x5a7fb0, 0xd8cdb8, 0xb8a888], fog: 0xcfc4ae, ff: 380, trees: ['dead', 'spire'], tn: 40, rn: 90, mood: 'desert', planet: 0xe08a6a, sun: 0xfff0d8, craters: 6 },
  river: { g: [0x6f9a4e, 0x82ab58, 0x9fbd6a], hi: 0x8e8a70, cl: 0x76705e, sh: 0xc9b98a, w: 0x2f8ab8, wy: 0, amp: 7, sc: 0.012, sky: [0x3d86d4, 0xcfe6f0, 0xbcd0b0], fog: 0xc3dde4, ff: 380, trees: ['broad', 'pine', 'mushroom'], tn: 140, rn: 50, mood: 'wild', planet: 0xa8c8ff, sun: 0xfff6e0, river: true },
  mountain: { g: [0x7d8a7a, 0x8a9584, 0xa3aa98], hi: 0xc9cfd0, cl: 0x6a6b68, sh: 0x9a9a88, w: 0x4a7fa0, amp: 22, sc: 0.012, sky: [0x3c6fb8, 0xd6e2ee, 0xa8b4bc], fog: 0xc0ccd6, ff: 360, trees: ['pine', 'pine', 'dead'], tn: 110, rn: 120, mood: 'cold', planet: 0xc0d8ff, sun: 0xffffff, ridge: true, snowcap: true },
  polluted: { g: [0x6b7a3a, 0x7a8640, 0x8c9150], hi: 0x6a6450, cl: 0x55503e, sh: 0x7e7a45, w: 0x7ed43a, wy: -1.2, amp: 6, sc: 0.013, sky: [0x5c6a3a, 0xc9c890, 0x8a8a4a], fog: 0xb3b37a, ff: 260, trees: ['dead', 'dead', 'mushroom'], tn: 90, rn: 60, mood: 'dungeon', planet: 0xa0c060, sun: 0xf0ffb0, toxic: true, pipes: true },
  wasteland: { g: [0x6e655c, 0x7b7166, 0x8c8072], hi: 0x5a524b, cl: 0x4a433d, sh: 0x8f8476, w: 0x5a6a6a, amp: 7, sc: 0.012, sky: [0x7a6a6a, 0xd6b8a0, 0x8a7a70], fog: 0xb8a294, ff: 300, trees: ['dead', 'spire'], tn: 70, rn: 90, mood: 'desert', planet: 0xff7a4a, sun: 0xffd8b0, craters: 4 },
  snow: { g: [0xdfe8ee, 0xeef3f6, 0xffffff], hi: 0xc9d6e0, cl: 0x7d8a96, sh: 0xb8c8d4, w: 0x6aa8c8, amp: 12, sc: 0.012, sky: [0x5a7fb0, 0xdde8f0, 0xc8d4dc], fog: 0xdce6ee, ff: 240, trees: ['pine', 'pine', 'dead'], tn: 150, rn: 80, mood: 'cold', planet: 0xa8c0ff, sun: 0xffffff, ridge: true, snowy: true },
  coast: { g: [0x7ea25a, 0x92b562, 0xa9c070], hi: 0x9a9376, cl: 0x7d7262, sh: 0xe6d5a0, w: 0x1f8fc0, wy: 0, amp: 8, sc: 0.012, sky: [0x2f7fd8, 0xc8e8f6, 0xe0e8d8], fog: 0xc6e4f2, ff: 420, trees: ['palm', 'broad'], tn: 90, rn: 60, mood: 'wild', planet: 0xffd0a8, sun: 0xfff4dc, coast: true },
  pale: { g: [0xe6e0d2, 0xece7da, 0xf4f0e6], hi: 0xd2cabb, cl: 0xa89c88, sh: 0xc8d4d8, w: 0x8ac8d8, wy: -0.8, amp: 3, sc: 0.01, sky: [0x7a9ac8, 0xf0ece6, 0xe0dcd4], fog: 0xeeeae2, ff: 340, trees: ['spire', 'dead'], tn: 50, rn: 50, mood: 'cold', planet: 0xff9a7a, sun: 0xffffff, crystals: true },
  lush: { g: [0x3f9a54, 0x52b062, 0x6cc070], hi: 0x6fa070, cl: 0x5a7a62, sh: 0xa8d090, w: 0x3ac0c8, wy: -0.8, amp: 9, sc: 0.013, sky: [0x3a6ad0, 0xd0f0e8, 0x98d0a8], fog: 0xb8e4d0, ff: 320, trees: ['glowtree', 'mushroom', 'broad', 'glowtree'], tn: 200, rn: 40, mood: 'veil', planet: 0xf0b0ff, sun: 0xfff0ff, crystals: true },
  city_corp: { g: [0x7d8a96, 0x86929e, 0x909ba6], hi: 0x7d8a96, cl: 0x6e7a86, sh: 0x7d8a96, w: 0x3c90b4, amp: 1.2, sc: 0.01, sky: [0x2f6fd0, 0xcfe8f8, 0xd8e4ec], fog: 0xd0e4f0, ff: 520, trees: ['broad'], tn: 0, rn: 0, mood: 'corp', planet: 0xb8d8ff, sun: 0xffffff },
  city_clan: { g: [0x9a8466, 0xa58e6c, 0xb09878], hi: 0x9a8466, cl: 0x87735a, sh: 0x9a8466, w: 0x3c90b4, amp: 1.5, sc: 0.01, sky: [0x5a7ab8, 0xf0d0a8, 0xd8b890], fog: 0xe8cfb0, ff: 460, trees: ['dead'], tn: 0, rn: 0, mood: 'clan', planet: 0xffb070, sun: 0xffe8c8 },
  city_neutral: { g: [0x8f9a88, 0x9aa592, 0xa6b09c], hi: 0x8f9a88, cl: 0x7f8a78, sh: 0x8f9a88, w: 0x3c90b4, amp: 1.2, sc: 0.01, sky: [0x4a86d0, 0xe0eef0, 0xd0dcd0], fog: 0xd8e8e6, ff: 480, trees: ['broad'], tn: 0, rn: 0, mood: 'neutral', planet: 0xd8f0b0, sun: 0xfffaf0 },
  veil: { g: [0xd8a86a, 0xe6c080, 0xf0d6a0], hi: 0xc08860, cl: 0x8a6048, sh: 0xf0e0c0, w: 0x9af0ff, wy: -1.5, amp: 11, sc: 0.012, sky: [0x2a3a7a, 0xf0b090, 0x6a4a6a], fog: 0xe0a890, ff: 280, trees: ['glowtree', 'crystal', 'crystal'], tn: 110, rn: 40, mood: 'veil', planet: 0xffffff, sun: 0xfff0d0, crystals: true, floaters: true, ridge: true },
  dungeon: { g: [0x5a5a5a, 0x606060, 0x666666], hi: 0x5a5a5a, cl: 0x4a4a4a, sh: 0x5a5a5a, w: 0x3c90b4, amp: 0, sc: 0.01, sky: [0x101418, 0x101418, 0x101418], fog: 0x0e1216, ff: 90, trees: [], tn: 0, rn: 0, mood: 'dungeon', planet: 0, sun: 0xffffff },
};
const DUNGEON_STYLES = {
  concrete: { floor: 0x55585a, wall: 0x8a8d90, trim: 0xf2c230, light: 0xfff2c0, fog: 0x15181b },
  foundry: { floor: 0x4a3c32, wall: 0x7a5a42, trim: 0xff7a2a, light: 0xffa050, fog: 0x1c120c },
  temple: { floor: 0x8a7a5a, wall: 0xb8a078, trim: 0x4fd6c0, light: 0x9af0e0, fog: 0x1a1812 },
  crypt: { floor: 0x3a3a40, wall: 0x5a5a66, trim: 0x7aff8a, light: 0x9aff9a, fog: 0x0c0f0c },
  bunker: { floor: 0x4a4e3c, wall: 0x6a6e52, trim: 0xff3a2a, light: 0xff6a5a, fog: 0x12140e },
  hive: { floor: 0x3a2048, wall: 0x6a3a7a, trim: 0x3affd0, light: 0x8affe8, fog: 0x14081a },
};
const VEIL_TINTS = {
  dawnfold: { g: [0xd8a86a, 0xe6c080, 0xf0d6a0], sky: [0x2a3a7a, 0xf0b090, 0x6a4a6a], fog: 0xe0a890, w: 0x9af0ff, glow: 0xffd27a },
  eloria: { g: [0xa8d8d8, 0xc0e8e4, 0xe0f6f2], sky: [0x3a6ab0, 0xe8f8ff, 0xb0d8e0], fog: 0xd8f0f4, w: 0xffffff, glow: 0x9af8ff },
  sheolin: { g: [0x4a2a2a, 0x5a3030, 0x6a3a34], sky: [0x100810, 0x8a2a2a, 0x200a0a], fog: 0x5a1e1e, w: 0xff3a2a, glow: 0xff4a3a },
  adonai: { g: [0x3a8a4a, 0x5aa050, 0xc0b050], sky: [0x1a4a3a, 0xf0e090, 0x4a7a3a], fog: 0xc8d890, w: 0x7affc0, glow: 0xffe85a },
  umbral: { g: [0x3a2a5a, 0x4a3470, 0x5e4488], sky: [0x0a0820, 0x6a4ab0, 0x1a1030], fog: 0x3a2a6a, w: 0xb07aff, glow: 0xc89aff },
  cinderdeep: { g: [0x2a2422, 0x3a2e28, 0x4a342a], sky: [0x1a0a08, 0xff6a2a, 0x3a1008], fog: 0x6a2a14, w: 0xff7a1a, glow: 0xff8a2a },
  pandemoniac: { g: [0x1a1420, 0x2a1a30, 0x3a2040], sky: [0x000000, 0xd02a8a, 0x10000a], fog: 0x3a0a2a, w: 0xff2aa8, glow: 0xff3ac0 },
};

const POOLS = {
  island: ['skitter', 'rollrat', 'skitter'], forest: ['mantid', 'rollrat', 'hornback', 'skitter'], darkforest: ['mantid', 'rollrat', 'hound', 'bandit'],
  plains: ['skitter', 'rollrat', 'hornback', 'bandit'], pastoral: ['hornback', 'rollrat', 'bandit', 'skitter'], desert: ['hornback', 'bandit', 'drone', 'mantid'],
  canyon: ['bandit', 'borg', 'drone', 'hornback'], crater: ['brute', 'bandit', 'drone', 'borg'], river: ['mantid', 'rollrat', 'bandit', 'drone'],
  mountain: ['borg', 'bandit', 'drone', 'hornback'], polluted: ['brute', 'rollrat', 'mantid', 'drone'], wasteland: ['borg', 'brute', 'bandit', 'drone'],
  snow: ['hornback', 'brute', 'borg', 'hound'], coast: ['mantid', 'bandit', 'drone', 'rollrat'], pale: ['mantid', 'borg', 'drone', 'hound'],
  lush: ['hound', 'mantid', 'hornback', 'drone'], veil: ['wraith', 'hound', 'wraith', 'brute'], dungeon: ['bandit', 'borg', 'brute', 'turret', 'drone', 'bandit'],
  hive: ['xyrr', 'xyrr', 'drone', 'turret'],
};

// Enemy archetypes. hb: body hit sphere [y, r], hh: head hit sphere [y, r, forward]
const ENEMIES = {
  skitter: { n: 'Skitter', hp: 26, dmg: 5, spd: 5.5, atk: 'melee', rng: 1.9, cd: 1.0, body: 'flesh', xp: 0.7, r: 0.5, hb: [0.45, 0.48], hh: [0.8, 0.26, 0.15], blood: 0xffd04a },
  rollrat: { n: 'Rollrat', hp: 36, dmg: 7, spd: 7.8, atk: 'melee', rng: 2.0, cd: 0.9, body: 'flesh', xp: 0.85, r: 0.55, hb: [0.45, 0.5], hh: [0.55, 0.28, 0.75], blood: 0x9be22d },
  hornback: { n: 'Hornback', hp: 120, dmg: 15, spd: 4.6, atk: 'charge', rng: 2.6, cd: 1.6, body: 'flesh', xp: 1.4, r: 1.0, hb: [1.0, 1.0], hh: [1.15, 0.45, 1.25], blood: 0xff5a3a },
  mantid: { n: 'Mantid', hp: 78, dmg: 12, spd: 6.4, atk: 'melee', rng: 2.6, cd: 1.1, body: 'flesh', xp: 1.15, r: 0.7, hb: [1.3, 0.62], hh: [2.15, 0.3, 0.35], blood: 0x6aff6a },
  drone: { n: 'Survey Drone', hp: 52, dmg: 7, spd: 6.2, atk: 'ranged', proj: 'laser', rng: 34, cd: 1.5, body: 'armor', fly: 3.2, xp: 1.0, r: 0.6, hb: [0, 0.6], hh: [0, 0.3, 0.45], blood: 0xffd27a },
  bandit: { n: 'Dustcoat Raider', hp: 62, dmg: 6, spd: 5.6, atk: 'ranged', proj: 'bullet', rng: 38, cd: 1.15, burst: 3, body: 'flesh', xp: 1.0, r: 0.45, hb: [1.1, 0.5], hh: [1.72, 0.22, 0.04], blood: 0xff4a3a, human: true },
  borg: { n: 'Gutterborg', hp: 92, dmg: 8, spd: 4.6, atk: 'ranged', proj: 'laser', rng: 40, cd: 1.4, burst: 2, body: 'armor', shield: 0.45, xp: 1.3, r: 0.5, hb: [1.15, 0.55], hh: [1.8, 0.24, 0.04], blood: 0xffd27a, human: true },
  brute: { n: 'Mutant Brute', hp: 230, dmg: 21, spd: 4.9, atk: 'slam', rng: 3.4, cd: 2.0, body: 'flesh', xp: 2.0, r: 0.9, hb: [1.4, 0.9], hh: [2.45, 0.32, 0.35], blood: 0x9be22d },
  wraith: { n: 'Veil Wraith', hp: 86, dmg: 9, spd: 5.2, atk: 'ranged', proj: 'orb', rng: 36, cd: 1.6, burst: 2, body: 'ether', fly: 1.6, xp: 1.3, r: 0.6, hb: [0.9, 0.6], hh: [1.7, 0.3, 0.1], blood: 0xc89aff },
  hound: { n: 'Veil Hound', hp: 72, dmg: 11, spd: 8.4, atk: 'melee', rng: 2.2, cd: 0.9, body: 'ether', xp: 1.2, r: 0.7, hb: [0.75, 0.62], hh: [1.0, 0.3, 0.95], blood: 0xc89aff },
  xyrr: { n: 'Xyrr Infiltrator', hp: 120, dmg: 9, spd: 5.6, atk: 'ranged', proj: 'plasma', rng: 40, cd: 1.3, burst: 3, body: 'armor', shield: 0.5, xp: 1.6, r: 0.5, hb: [1.35, 0.55], hh: [2.25, 0.3, 0.12], blood: 0x3affd0, human: true },
  turret: { n: 'Sentry Turret', hp: 150, dmg: 6, spd: 0, atk: 'ranged', proj: 'bullet', rng: 44, cd: 1.0, burst: 4, body: 'armor', static: true, xp: 1.2, r: 0.9, hb: [1.2, 0.95], hh: [2.0, 0.4, 0.2], blood: 0xffd27a },
  guard: { n: 'City Guard', hp: 520, dmg: 15, spd: 5.2, atk: 'ranged', proj: 'laser', rng: 46, cd: 1.0, burst: 3, body: 'armor', shield: 0.6, xp: 2.5, r: 0.5, hb: [1.15, 0.55], hh: [1.8, 0.24, 0.04], blood: 0xff4a3a, human: true },
};
const ENEMY_NAMES = {
  bandit: { canyon: 'Breach Bandit', desert: 'Dune Raider', coast: 'Wrecker', river: 'River Pirate', dungeon: 'Contraband Thug', pastoral: 'Rustler', darkforest: 'Hollow Cultist', plains: 'Dustcoat Raider' },
  borg: { dungeon: 'Rogue Overseer', mountain: 'Mine Borg', wasteland: 'Ash Borg' },
  drone: { hive: 'Xyrr Seeker', polluted: 'Smog Drone', dungeon: 'Security Drone' },
  brute: { veil: 'Unmade Colossus', snow: 'Rime Brute', polluted: 'Sludge Brute' },
  hornback: { snow: 'Frost Hornback', lush: 'Gilded Hornback', desert: 'Dune Hornback' },
  mantid: { veil: 'Veil Mantid', lush: 'Jade Mantid', pale: 'Salt Mantid' },
};

// ---- ZONES (every Anarchy Online playfield archetype has an original analog; `ao` = reference) ----
// k: kind, b: biome, l: level range, f: faction, p: atlas position, ex: exits, r: relay, dg: dungeon entrances,
// boss: [name, type, flavor], st: dungeon style, par: parent zone
const ZONES = [
  { id: 'landfall', n: 'Landfall Shelf', k: 'island', b: 'island', l: [1, 4], p: [40, 73], ex: ['nh-out'], r: 1, reg: 'Arrival', boss: ['Brood-Mother Pip', 'skitter', 'Ate three survey teams. Still hungry.'], d: 'A wind-scoured shelf where new contractors are dropped from orbit with a pistol and a promise.', ao: 'Arete Landing / ICC Shuttleport / The Backyard' },

  { id: 'cyrex-spire', n: 'Cyrex Prime: Spire', k: 'city', b: 'city_corp', f: 'corp', p: [12, 17], ex: ['cyrex-exchange', 'clondra'], r: 1, reg: 'Cyrex Territory', d: 'Headquarters of Cyrex Consolidated. Every window is watching.', ao: 'Omni-1 HQ' },
  { id: 'cyrex-exchange', n: 'Cyrex Prime: Exchange', k: 'city', b: 'city_corp', f: 'corp', p: [5, 27], ex: ['cyrex-spire', 'cyrex-arcade', 'gr-greenbelt'], r: 1, reg: 'Cyrex Territory', d: 'The trading floor of the planet. Vyrium futures scroll across every wall.', ao: 'Omni-1 Trade' },
  { id: 'cyrex-arcade', n: 'Cyrex Prime: Arcade', k: 'city', b: 'city_corp', f: 'corp', p: [17, 27], ex: ['cyrex-exchange', 'greenbelt'], r: 1, reg: 'Cyrex Territory', d: 'Neon bars, holo-theatres and the best-paid guards on the planet.', ao: 'Omni-1 Entertainment' },
  { id: 'greenbelt', n: 'Cyrex Greenbelt', k: 'wild', b: 'forest', l: [3, 9], p: [25, 37], ex: ['cyrex-arcade', 'gr-greenbelt', 'verdance', 'breachwall'], reg: 'Cyrex Territory', boss: ['Foreman Gristle', 'hornback', 'Escaped the cattle domes. Took the foreman with him.'], d: 'Managed corporate forest, now gone feral at the edges.', ao: 'Omni Forest' },
  { id: 'gr-greenbelt', n: 'Greater Greenbelt', k: 'wild', b: 'forest', l: [6, 13], p: [7, 40], ex: ['cyrex-exchange', 'greenbelt', 'ostia'], reg: 'Cyrex Territory', boss: ['The Pruner', 'mantid', 'Keeps the forest tidy. Very tidy.'], d: 'Old-growth canopy the surveyors never finished mapping.', ao: 'Greater Omni Forest' },
  { id: 'ostia', n: 'Ostia Tri-Ward', k: 'city', b: 'city_corp', f: 'corp', p: [6, 55], ex: ['gr-greenbelt', 'verdance'], r: 1, reg: 'Cyrex Territory', d: 'Three walled wards of company housing. Red, Blue and Green shifts never meet.', ao: 'Rome (Red / Blue / Green)' },
  { id: 'verdance', n: 'Verdance Fields', k: 'wild', b: 'plains', l: [5, 11], p: [18, 48], ex: ['greenbelt', 'ostia', 'vermin'], reg: 'Cyrex Territory', boss: ['Sergeant Bale', 'bandit', 'Deserted his post. Kept the rank, the rifle and the attitude.'], d: 'Rolling grassland seeded by terraforming drones a century ago.', ao: 'Lush Fields' },
  { id: 'vermin', n: 'Vermin Thicket', k: 'wild', b: 'darkforest', l: [12, 20], p: [29, 53], ex: ['verdance', 'nh-dunes', 'nh-out'], reg: 'Cyrex Territory', boss: ['King Gnawbone', 'rollrat', 'Wears a crown of chewed cable.'], d: 'A tangled wood that eats survey markers and the people who place them.', ao: 'Varmint Woods' },
  { id: 'clondra', n: 'Clondra Mines', k: 'wild', b: 'mountain', l: [25, 35], p: [19, 8], ex: ['cyrex-spire', 'mutagen', 'quad'], dg: ['foundry'], towers: 1, reg: 'Cyrex Territory', boss: ['Drillmaster Oskar', 'borg', 'Replaced his arms with drills. Then his patience.'], d: 'Vyrium strip-mines carved into the high ridges.', ao: 'Clondyke' },
  { id: 'mutagen', n: 'Mutagen Reach', k: 'wild', b: 'polluted', l: [32, 42], p: [5, 6], ex: ['clondra'], reg: 'Cyrex Territory', boss: ['Mother Sludge', 'brute', 'The runoff gave her a family.'], d: 'Where the mine tailings go, and what crawls out of them.', ao: 'Mutant Domain' },

  { id: 'nh-out', n: 'Newhaven Outskirts', k: 'wild', b: 'plains', l: [3, 8], p: [41, 52], ex: ['landfall', 'newhaven', 'nh-dunes', 'vermin', 'causeway'], reg: 'Neutral Heartland', boss: ['Old Crankshaft', 'drone', 'A survey drone that stopped taking orders in 2914.'], d: 'Farmsteads and scrapyards on the road into Newhaven.', ao: 'Newland' },
  { id: 'newhaven', n: 'Newhaven', k: 'city', b: 'city_neutral', f: 'neutral', p: [42, 41], ex: ['nh-out', 'strand-w', 'meridian', 'breachwall'], r: 1, dg: ['transit'], reg: 'Neutral Heartland', d: 'Free city of traders, fixers and the occasional honest mechanic.', ao: 'Newland City' },
  { id: 'nh-dunes', n: 'Newhaven Dunes', k: 'wild', b: 'desert', l: [8, 16], p: [30, 64], ex: ['nh-out', 'vermin', 'causeway'], reg: 'Neutral Heartland', boss: ['Sandjaw', 'hornback', 'You will hear the horns before you see the sand move.'], d: 'Orange dunes and wind-carved mesas south of the city.', ao: 'Newland Desert' },
  { id: 'breachwall', n: 'Breachwall', k: 'wild', b: 'canyon', l: [10, 18], p: [34, 28], ex: ['greenbelt', 'newhaven', 'quad', 'strand-w'], reg: 'Neutral Heartland', boss: ['Warden Kessler', 'bandit', 'Charges a toll to leave. And to stay.'], d: 'A canyon wall blasted through by the first mining charges.', ao: 'Holes in the Wall' },
  { id: 'quad', n: 'Quad Craters', k: 'wild', b: 'crater', l: [16, 24], p: [30, 16], ex: ['clondra', 'breachwall', 'aurora', 'pale'], towers: 1, reg: 'Neutral Heartland', boss: ['Crater Tyrant', 'brute', 'Lives in the deepest hole. Considers all four his.'], d: 'Four impact craters from the orbital war, still humming with Vyrium.', ao: '4 Holes' },
  { id: 'strand-w', n: 'Strand West Bank', k: 'wild', b: 'river', l: [14, 22], p: [44, 29], ex: ['newhaven', 'breachwall', 'strand-e', 'aurora'], reg: 'Neutral Heartland', boss: ['Ferryman Vosk', 'bandit', 'Takes you across. Keeps whatever you dropped.'], d: 'The western bank of the great Strand river.', ao: 'Stret West Bank' },
  { id: 'strand-e', n: 'Strand East Bank', k: 'wild', b: 'river', l: [16, 24], p: [54, 27], ex: ['strand-w', 'aurora', 'upper-strand', 'gallen'], reg: 'Neutral Heartland', boss: ['Lady Undertow', 'mantid', 'Hunts from the reeds. Never misses twice.'], d: 'Reed beds, ferry wrecks and smugglers on the eastern bank.', ao: 'Stret East Bank' },
  { id: 'upper-strand', n: 'Upper Strand', k: 'wild', b: 'river', l: [20, 28], p: [64, 18], ex: ['strand-e', 'aurora', 'heredon-shire', 'kesh-county'], reg: 'Neutral Heartland', boss: ['The Dam Keeper', 'borg', 'Holds back the river. Holds a grudge.'], d: 'Highland headwaters and the old hydro-dam.', ao: 'Upper Stret East Bank' },
  { id: 'aurora', n: 'Aurora Reach', k: 'city', b: 'city_neutral', f: 'neutral', p: [48, 16], ex: ['quad', 'strand-w', 'strand-e', 'upper-strand', 'pale', 'andros'], r: 1, reg: 'Neutral Heartland', d: 'The neutral hub where every faction comes to trade, brag and recruit.', ao: 'Borealis' },
  { id: 'pale', n: 'Pale Basin', k: 'wild', b: 'pale', l: [28, 38], p: [42, 6], ex: ['quad', 'aurora', 'andros'], reg: 'Neutral Heartland', boss: ['The White Widower', 'mantid', 'Married the salt. Buries everyone else in it.'], d: 'A blinding salt pan crusted with pale Vyrium crystal.', ao: 'Milky Way' },
  { id: 'andros', n: 'Andros Plateau', k: 'wild', b: 'mountain', l: [35, 45], p: [58, 6], ex: ['pale', 'aurora', 'avelaine', 'howling'], towers: 1, reg: 'Northern Reaches', boss: ['Prospector Null', 'borg', 'Found the motherlode. Lost everything else.'], d: 'High mesa plateau scarred by claim wars.', ao: 'Andromeda' },
  { id: 'avelaine', n: 'Avelaine Vale', k: 'wild', b: 'lush', l: [40, 50], p: [71, 4], ex: ['andros', 'howling', 'dawnfold'], reg: 'Northern Reaches', boss: ['Thornheart', 'hornback', 'The vale grew a guardian. It grew it angry.'], d: 'An impossible garden where the Veil bleeds through. A rift glows at its heart.', ao: 'Avalon' },
  { id: 'meridian', n: 'Meridian Rest', k: 'town', b: 'city_neutral', f: 'neutral', p: [52, 41], ex: ['newhaven', 'gallen', 'causeway'], r: 1, reg: 'Neutral Heartland', d: 'A roadside town of motels, mechanics and one very good noodle bar.', ao: 'Bliss / Hope / Meetmedere' },
  { id: 'gallen', n: 'Gallen Shire', k: 'wild', b: 'pastoral', l: [6, 12], p: [61, 34], ex: ['meridian', 'strand-e', 'gallen-co', 'kesh-county'], reg: 'Neutral Heartland', boss: ["Dunmore's Bull", 'hornback', 'Won every county fair. Ate the judges.'], d: 'Farm terraces and grain silos feeding three cities.', ao: 'Galway Shire' },
  { id: 'gallen-co', n: 'Gallen County', k: 'wild', b: 'plains', l: [10, 16], p: [62, 47], ex: ['gallen', 'placid', 'arterial', 'causeway'], dg: ['gales'], reg: 'Neutral Heartland', boss: ['Reeve Hallam', 'bandit', 'Collects taxes for a county that never asked.'], d: 'Open county roads and a shrine nobody visits after dark.', ao: 'Galway County' },
  { id: 'placid', n: 'Placid Meadows', k: 'wild', b: 'pastoral', l: [8, 15], p: [73, 42], ex: ['gallen-co', 'kesh', 'fouled-p'], reg: 'Clan Frontier', boss: ['Big Mellow', 'skitter', 'Very large. Very calm. Until it is not.'], d: 'Quiet meadows on the edge of clan land. Too quiet.', ao: 'Pleasant Meadows' },
  { id: 'causeway', n: 'The Long Causeway', k: 'wild', b: 'desert', l: [20, 30], p: [50, 60], ex: ['nh-out', 'nh-dunes', 'meridian', 'gallen-co', 'arterial', 'aegis'], towers: 1, reg: 'Southern Wastes', boss: ['Convoy Queen Rasha', 'bandit', 'Owns the road. Rents you the dust.'], d: 'A raised highway across the badlands, lined with wrecked convoys.', ao: 'The Longest Road' },
  { id: 'arterial', n: 'Arterial Gorge', k: 'wild', b: 'canyon', l: [25, 35], p: [62, 58], ex: ['causeway', 'gallen-co', 'mortis'], dg: ['crypt'], reg: 'Southern Wastes', boss: ['Gorge Warden', 'brute', 'Stands where the gorge narrows. Does not move for anyone.'], d: 'A deep red valley cut by an ancient river system.', ao: 'Central / Deep / Southern Artery Valley' },
  { id: 'mortis', n: 'Mortis Flats', k: 'wild', b: 'wasteland', l: [35, 45], p: [73, 62], ex: ['arterial', 'endless', 'fouled-h'], towers: 1, reg: 'Southern Wastes', boss: ['Ashwalker Teague', 'borg', 'Walked out of the firestorm. Kept walking.'], d: 'Ash plains around a dead city. The towers still broadcast.', ao: 'Mort' },
  { id: 'endless', n: 'Endless Ash', k: 'wild', b: 'wasteland', l: [42, 52], p: [83, 70], ex: ['mortis', 'shattered'], dg: ['dustcoat'], reg: 'Southern Wastes', boss: ['Cinder Saint', 'brute', 'They pray to him. He does not pray back.'], d: 'A wasteland that never stopped burning.', ao: 'Perpetual Wastelands' },
  { id: 'aegis', n: 'Aegis Coast', k: 'wild', b: 'coast', l: [25, 35], p: [55, 72], ex: ['causeway', 'shattered'], reg: 'Southern Wastes', boss: ['Tidecaller Mirelle', 'mantid', 'Comes in with the tide. Takes someone back out.'], d: 'Turquoise shallows and resort ruins.', ao: 'Aegean' },
  { id: 'shattered', n: 'Shattered Coast', k: 'wild', b: 'coast', l: [32, 42], p: [69, 76], ex: ['aegis', 'endless'], reg: 'Southern Wastes', boss: ['Captain Saltbones', 'bandit', 'Sank his own fleet for the insurance.'], d: 'Cliffs broken by orbital fire, crawling with wreckers.', ao: 'Broken Shores' },
  { id: 'jovan', n: 'Jovan Platform', k: 'platform', b: 'city_neutral', f: 'neutral', p: [22, 75], ex: [], r: 1, dg: ['hive'], reg: 'Skyward', d: 'A city on a floating platform, built by people who wanted to be left alone.', ao: 'Jobe' },

  { id: 'kesh', n: 'Kesh', k: 'city', b: 'city_clan', f: 'clan', p: [84, 36], ex: ['kesh-county', 'placid', 'old-heredon'], r: 1, reg: 'Clan Frontier', d: 'The beating heart of the Free Clans. Loud, rusty and proud of it.', ao: 'Tir' },
  { id: 'kesh-county', n: 'Kesh County', k: 'wild', b: 'plains', l: [5, 10], p: [74, 29], ex: ['kesh', 'gallen', 'upper-strand', 'fouled-p', 'heredon-shire'], reg: 'Clan Frontier', boss: ['Rustback', 'hornback', 'Shrugs off rounds like rain.'], d: 'Clan farmland ringed by watchtowers.', ao: 'Greater Tir County' },
  { id: 'old-heredon', n: 'Old Heredon', k: 'city', b: 'city_clan', f: 'clan', p: [93, 26], ex: ['kesh', 'west-heredon', 'heredon-shire'], r: 1, reg: 'Clan Frontier', d: 'The first clan settlement, built from the hulls of the colony ships.', ao: 'Old Athen' },
  { id: 'west-heredon', n: 'West Heredon', k: 'city', b: 'city_clan', f: 'clan', p: [95, 41], ex: ['old-heredon', 'fouled-p'], r: 1, reg: 'Clan Frontier', d: 'Market quarter and militia barracks of Heredon.', ao: 'West Athen' },
  { id: 'heredon-shire', n: 'Heredon Shire', k: 'wild', b: 'pastoral', l: [2, 8], p: [83, 16], ex: ['old-heredon', 'kesh-county', 'upper-strand', 'belhallow'], reg: 'Clan Frontier', boss: ['Gamekeeper Wyn', 'rollrat', 'Raised them from pups. Loves them more than people.'], d: 'Clan homesteads, orchards and hunting grounds.', ao: 'Athen Shire' },
  { id: 'fouled-p', n: 'Fouled Plains', k: 'wild', b: 'polluted', l: [15, 25], p: [85, 51], ex: ['kesh-county', 'placid', 'west-heredon', 'fouled-h'], towers: 1, reg: 'Clan Frontier', boss: ['Effluent Baron', 'brute', 'Swims in it. Drinks it. Rules it.'], d: 'Toxic runoff plains below the old refinery.', ao: 'Eastern Fouls Plain' },
  { id: 'fouled-h', n: 'Fouled Hills', k: 'wild', b: 'polluted', l: [18, 28], p: [93, 59], ex: ['fouled-p', 'mortis'], dg: ['contraband'], reg: 'Clan Frontier', boss: ['Smogmother', 'drone', 'The refinery AI. It thinks it is still on shift.'], d: 'Smog-choked hills hiding smuggler tunnels.', ao: 'Southern Fouls Hills' },
  { id: 'belhallow', n: 'Belhallow Forest', k: 'wild', b: 'darkforest', l: [20, 30], p: [94, 10], ex: ['heredon-shire', 'howling'], dg: ['delirium'], reg: 'Northern Reaches', boss: ['The Hollow Stag', 'hornback', 'Something wears it.'], d: 'A violet-dark forest where the trees lean in to listen.', ao: 'Belial Forest' },
  { id: 'howling', n: 'Howling Barrens', k: 'wild', b: 'snow', l: [30, 45], p: [84, 4], ex: ['belhallow', 'andros', 'avelaine'], towers: 1, reg: 'Northern Reaches', boss: ['Rimefang', 'brute', 'The wind howls because it is afraid of him.'], d: 'Frozen badlands where the wind never stops screaming.', ao: 'Wailing Wastes' },

  { id: 'transit', n: 'Sunken Transit', k: 'dungeon', b: 'dungeon', st: 'concrete', l: [10, 15], par: 'newhaven', p: [45, 44], ex: ['newhaven'], reg: 'Underworks', boss: ['Conductor Vey', 'borg', 'The trains stopped. He did not.'], d: 'Flooded maglev tunnels under Newhaven.', ao: 'The Subway' },
  { id: 'foundry', n: "Overseer's Foundry", k: 'dungeon', b: 'dungeon', st: 'foundry', l: [26, 34], par: 'clondra', p: [22, 11], ex: ['clondra'], reg: 'Underworks', boss: ['The Overseer', 'borg', 'Quota is quota.'], d: 'The smelting halls beneath Clondra.', ao: "Foreman's Office" },
  { id: 'gales', n: 'Shrine of the Four Gales', k: 'dungeon', b: 'dungeon', st: 'temple', l: [12, 20], par: 'gallen-co', p: [65, 50], ex: ['gallen-co'], reg: 'Underworks', boss: ['Gale Prophet Ansel', 'wraith', 'Heard the Veil whisper. Answered.'], d: 'A sandstone temple built by a cult that worshipped the wind.', ao: 'Temple of the Three Winds' },
  { id: 'delirium', n: 'Stairs of Delirium', k: 'dungeon', b: 'dungeon', st: 'crypt', l: [22, 32], par: 'belhallow', p: [97, 13], ex: ['belhallow'], reg: 'Underworks', boss: ['The Laughing Abbot', 'brute', 'Something down here is very funny.'], d: 'A spiral of crypts beneath Belhallow.', ao: 'Steps of Madness' },
  { id: 'crypt', n: 'Crypt of Hearth', k: 'dungeon', b: 'dungeon', st: 'crypt', l: [28, 38], par: 'arterial', p: [65, 61], ex: ['arterial'], reg: 'Underworks', boss: ['Lord Ossuary', 'brute', 'Collects bones. Prefers them fresh.'], d: 'Colony-era tombs carved into the gorge.', ao: 'Crypt of Home' },
  { id: 'contraband', n: 'Contraband Den', k: 'dungeon', b: 'dungeon', st: 'bunker', l: [26, 36], par: 'fouled-h', p: [96, 62], ex: ['fouled-h'], reg: 'Underworks', boss: ['Fence-Boss Marlo', 'bandit', 'Everything is for sale. Including you.'], d: 'A smuggler warren under the Fouled Hills.', ao: "Smuggler's Den" },
  { id: 'dustcoat', n: 'Dustcoat Bunker', k: 'dungeon', b: 'dungeon', st: 'bunker', l: [44, 52], par: 'endless', p: [86, 73], ex: ['endless'], reg: 'Underworks', boss: ['General Dustcoat', 'borg', 'Leads the raiders. Answers to no one.'], d: 'Command bunker of the Dustcoat raider army.', ao: 'Dust Brigade' },
  { id: 'hive', n: "Xyrr'kath Hive Ship", k: 'dungeon', b: 'dungeon', st: 'hive', l: [52, 62], par: 'jovan', p: [25, 78], ex: ['jovan'], reg: 'Alien Incursion', boss: ['Hive-General Ixarath', 'xyrr', 'Came for the Vyrium. Stayed for the war.'], d: 'A crashed alien hive ship, still dreaming of conquest.', ao: "Kyr'Ozch Alien Ships / The Xan" },

  { id: 'dawnfold', n: 'Dawnfold', k: 'veil', b: 'veil', l: [45, 50], p: [112, 6], ex: ['avelaine', 'eloria'], r: 1, reg: 'The Veil', boss: ['The First Unborn', 'wraith', 'It remembers being nothing. It liked it.'], d: 'The Veil\'s threshold: golden sky, quiet ruins, watching spirits.', ao: 'Nascence' },
  { id: 'eloria', n: 'Eloria', k: 'veil', b: 'veil', l: [48, 54], p: [116, 16], ex: ['dawnfold', 'sheolin'], reg: 'The Veil', boss: ['Choir-Warden Selah', 'wraith', 'Sings the dead to sleep. Sings the living, too.'], d: 'Pale cyan fields under a sky like frosted glass.', ao: 'Elysium' },
  { id: 'sheolin', n: 'Sheolin', k: 'veil', b: 'veil', l: [52, 58], p: [112, 26], ex: ['eloria', 'adonai'], reg: 'The Veil', boss: ['Gravelord Vashti', 'hound', 'Keeps the pack. Feeds the pack.'], d: 'Blood-red dusk over black ground. Nothing here is resting.', ao: 'Scheol' },
  { id: 'adonai', n: 'Adonai Gardens', k: 'veil', b: 'veil', l: [55, 60], p: [116, 36], ex: ['sheolin', 'umbral'], reg: 'The Veil', boss: ['The Gardener', 'mantid', 'Prunes what grows wrong.'], d: 'Gilded gardens tended by things that were once gardeners.', ao: 'Adonis' },
  { id: 'umbral', n: 'Umbral Reach', k: 'veil', b: 'veil', l: [58, 64], p: [112, 46], ex: ['adonai', 'cinderdeep'], reg: 'The Veil', boss: ['Penumbral Twin', 'wraith', 'There were two. Now there is one, and it is twice as hungry.'], d: 'Violet twilight forever. Shadows cast by nothing.', ao: 'Penumbra' },
  { id: 'cinderdeep', n: 'Cinderdeep', k: 'veil', b: 'veil', l: [62, 68], p: [116, 56], ex: ['umbral', 'pandemoniac'], reg: 'The Veil', boss: ['Ember Tyrant', 'brute', 'The fire obeys him. Mostly.'], d: 'Rivers of molten Vyrium under a burning sky.', ao: 'Inferno' },
  { id: 'pandemoniac', n: 'Pandemoniac Core', k: 'veil', b: 'veil', l: [68, 70], p: [112, 67], ex: ['cinderdeep'], reg: 'The Veil', boss: ['The Unmade Sovereign', 'wraith', 'The thing the Veil was built to hold.'], d: 'The center of the Veil. Every rift on the planet leads here eventually.', ao: 'Pandemonium' },
];
const ZMAP = {}; ZONES.forEach(z => ZMAP[z.id] = z);

const MAIN_QUEST = [
  { z: 'landfall', t: 'Defeat Brood-Mother Pip on Landfall Shelf', say: 'Contractor, this is Ilsa Marr, Relay Ops. You landed on the wrong rock. Something big is nesting by the cliffs. Clear it and I will open the Relay for you.' },
  { z: 'nh-out', t: 'Defeat Old Crankshaft in Newhaven Outskirts', say: 'Relay is yours. Walk the gate north into the Outskirts. A rogue survey drone is shooting at farmers. Earn some goodwill.' },
  { z: 'breachwall', t: 'Defeat Warden Kessler in Breachwall', say: 'Nice work. Someone is taxing the Breachwall pass and pocketing Vyrium shipments. That someone needs to stop.' },
  { z: 'strand-e', t: 'Defeat Lady Undertow on Strand East Bank', say: 'The shipments were headed east, over the Strand. Ferries keep vanishing. Find out what is in the reeds.' },
  { z: 'fouled-p', t: 'Defeat the Effluent Baron in the Fouled Plains', say: 'Those shipments were feeding a refinery in clan land. Whatever runs it is poisoning the whole plain.' },
  { z: 'clondra', t: 'Defeat Drillmaster Oskar in Clondra Mines', say: 'The refinery logs point back west, to the Cyrex mines. Both sides are digging for the same thing. Find out why.' },
  { z: 'arterial', t: 'Defeat the Gorge Warden in Arterial Gorge', say: 'Oskar was digging toward a rift. There is another one under the gorge. Something is standing guard.' },
  { z: 'endless', t: 'Defeat the Cinder Saint in Endless Ash', say: 'The rifts are spreading. The Ash cults are feeding them. Cut off the source.' },
  { z: 'avelaine', t: 'Defeat Thornheart in Avelaine Vale', say: 'The biggest rift is in Avelaine. Its guardian will not let you near. Make it let you.' },
  { z: 'dawnfold', t: 'Defeat the First Unborn in Dawnfold', say: 'You are in the Veil now. My signal is thin. Follow the gates inward. Every rift on Vesh leads to the same place.' },
  { z: 'sheolin', t: 'Defeat Gravelord Vashti in Sheolin', say: 'Keep going. The readings get stronger past Eloria.' },
  { z: 'cinderdeep', t: 'Defeat the Ember Tyrant in Cinderdeep', say: 'Almost there. I can hear something on the channel that is not me.' },
  { z: 'pandemoniac', t: 'Defeat the Unmade Sovereign in the Pandemoniac Core', say: 'This is it. End it, and the rifts close. Come home, contractor.' },
];

const SIGNS = {
  corp: ['CYREX', 'TOMORROW, OWNED', 'VYRIUM POWERS YOU', 'RECLAIM WITH CONFIDENCE', 'NANO-SURE', 'ENLIST: CORPORATE GUARD', 'CONTRACT = FREEDOM', 'HOLO-THEATRE'],
  clan: ['NO MASTERS', 'CLAN BREW', 'FREE VESH', 'SCRAP & SALVAGE', 'MILITIA WANTED', 'RUST NEVER SLEEPS'],
  neutral: ['AURORA MARKET', 'HOTEL ZENITH', 'NOODLES 24H', 'FIXER FOR HIRE', 'TRADE FREELY', 'RELAY OPS'],
};
