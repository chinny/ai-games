// ===================== LOOT =====================
const RARITY = [
  { n: 'Common', c: '#e6e6e6', hex: 0xe6e6e6, m: 1.0 },
  { n: 'Uncommon', c: '#3fe06b', hex: 0x3fe06b, m: 1.12 },
  { n: 'Rare', c: '#3fa7ff', hex: 0x3fa7ff, m: 1.26 },
  { n: 'Epic', c: '#b65cff', hex: 0xb65cff, m: 1.42 },
  { n: 'Legendary', c: '#ff9a1f', hex: 0xff9a1f, m: 1.65 },
];
const ELEMENTS = {
  kinetic: { n: 'Kinetic', c: '#d8d8d8', hex: 0xd8d8d8 },
  fire: { n: 'Incendiary', c: '#ff7a1f', hex: 0xff7a1f },
  shock: { n: 'Shock', c: '#4cc3ff', hex: 0x4cc3ff },
  acid: { n: 'Corrosive', c: '#9be22d', hex: 0x9be22d },
  nano: { n: 'Nano', c: '#c26bff', hex: 0xc26bff },
};
const ELEM_MULT = {
  kinetic: { flesh: 1, armor: 0.85, ether: 0.75, shield: 1 },
  fire: { flesh: 1.6, armor: 0.7, ether: 0.9, shield: 0.6 },
  shock: { flesh: 1, armor: 1, ether: 1, shield: 2.0 },
  acid: { flesh: 0.85, armor: 1.7, ether: 0.8, shield: 0.6 },
  nano: { flesh: 0.9, armor: 0.9, ether: 1.9, shield: 1.2 },
};
const KINDS = {
  pistol: { n: 'Pistol', dmg: 15, rof: 4.5, mag: 12, rl: 1.2, sp: 0.012, pel: 1, auto: false, kick: 0.012, rng: 150 },
  smg: { n: 'SMG', dmg: 7.5, rof: 12, mag: 32, rl: 1.5, sp: 0.028, pel: 1, auto: true, kick: 0.005, rng: 110 },
  rifle: { n: 'Combat Rifle', dmg: 11, rof: 8, mag: 28, rl: 1.8, sp: 0.015, pel: 1, auto: true, kick: 0.007, rng: 190 },
  shotgun: { n: 'Shotgun', dmg: 8.5, rof: 1.5, mag: 6, rl: 2.2, sp: 0.075, pel: 8, auto: false, kick: 0.04, rng: 60 },
  sniper: { n: 'Sniper Rifle', dmg: 64, rof: 1.1, mag: 5, rl: 2.4, sp: 0.003, pel: 1, auto: false, kick: 0.05, rng: 320, zoom: true },
  launcher: { n: 'Launcher', dmg: 90, rof: 0.8, mag: 3, rl: 2.8, sp: 0.006, pel: 1, auto: false, kick: 0.06, rng: 220, proj: true, splash: 6 },
};
const AMMO = { pistol: { n: 'Pistol', max: 300, pack: 36 }, smg: { n: 'SMG', max: 600, pack: 90 }, rifle: { n: 'Rifle', max: 480, pack: 70 }, shotgun: { n: 'Shotgun', max: 96, pack: 16 }, sniper: { n: 'Sniper', max: 60, pack: 10 }, launcher: { n: 'Rocket', max: 18, pack: 3 } };
const MFG_MODS = {
  cyrex: { dmg: 1.0, rof: 1.0, sp: 0.75, mag: 1.15, rl: 1.0, crit: 0.1, el: 0.15, tag: 'Accurate, bigger magazines' },
  clanforge: { dmg: 1.25, rof: 0.82, sp: 1.1, mag: 0.85, rl: 1.1, crit: 0, el: 0.1, tag: 'Hits hard, fires slow' },
  nanodyne: { dmg: 0.92, rof: 1.0, sp: 1.0, mag: 1.0, rl: 1.0, crit: 0, el: 1.0, tag: 'Always elemental' },
  vektor: { dmg: 0.9, rof: 1.3, sp: 1.25, mag: 1.2, rl: 1.0, crit: 0, el: 0.15, tag: 'Fast fire, loose spread' },
  dustline: { dmg: 0.95, rof: 1.0, sp: 1.05, mag: 1.5, rl: 0.75, crit: 0, el: 0.1, tag: 'Huge mags, fast reloads' },
  helix: { dmg: 1.1, rof: 0.95, sp: 0.7, mag: 0.9, rl: 1.05, crit: 0.6, el: 0.12, tag: 'Big critical hits' },
};
const MODEL_NAMES = {
  pistol: ['Courier', 'Needle', 'Rook', 'Wasp', 'Sparrow', 'Jackal', 'Vow', 'Dart'],
  smg: ['Swarm', 'Ratchet', 'Hornet', 'Gnasher', 'Chatter', 'Bleeder'],
  rifle: ['Arbiter', 'Lancer', 'Vanguard', 'Bulwark', 'Strider', 'Warden'],
  shotgun: ['Thresher', 'Mauler', 'Bastion', 'Gutter', 'Breacher', 'Hammer'],
  sniper: ['Longview', 'Verdict', 'Heron', 'Sightline', 'Oracle', 'Spire'],
  launcher: ['Thunderhead', 'Mortar', 'Rumble', 'Tantrum', 'Quake', 'Sermon'],
};
const PREFIX = { dmg: ['Vicious', 'Brutal', 'Heavy', 'Savage'], rof: ['Rapid', 'Frantic', 'Twitchy', 'Feverish'], acc: ['Steady', 'Precise', 'Calm', 'True'], mag: ['Hungry', 'Bottomless', 'Fat', 'Greedy'], crit: ['Lethal', 'Cruel', 'Surgical'], fire: ['Searing', 'Blazing', 'Smoldering'], shock: ['Crackling', 'Static', 'Charged'], acid: ['Caustic', 'Melting', 'Acrid'], nano: ['Haunting', 'Spectral', 'Veiled'] };
const LEGENDARY = [
  { id: 'twin', kinds: ['pistol', 'rifle', 'smg', 'sniper'], txt: 'Two bullets. One trigger. No regrets.', fx: 'Fires 2 bullets per shot' },
  { id: 'leech', kinds: 'all', txt: "It drinks so you don't have to.", fx: 'Heals 6% of damage dealt' },
  { id: 'boom', kinds: ['pistol', 'smg', 'rifle', 'shotgun', 'sniper'], txt: 'Every bullet is a small opinion about physics.', fx: 'Bullets explode on impact' },
  { id: 'regen', kinds: 'all', txt: 'Reloading is for people with appointments.', fx: 'Magazine refills itself' },
  { id: 'chain', kinds: 'all', txt: 'Ask the sky. The sky says yes.', fx: 'Hits arc lightning to nearby enemies', el: 'shock' },
  { id: 'ring', kinds: ['shotgun'], txt: 'Personal space, enforced.', fx: 'Pellets fire in a tight ring' },
];
const LEG_NAMES = { pistol: ["Marr's Promise", 'Last Call'], smg: ['Hive Mind', 'Bad Idea'], rifle: ['Clan Oath', 'Spire Breaker'], shotgun: ['Grandmother', 'The Argument'], sniper: ['Eye of Vesh', 'Final Notice'], launcher: ['Nuclear Option', 'The Apology'] };
const SHIELD_MFG = { cyrex: { cap: 1.15, del: 1.0, rate: 1.0 }, clanforge: { cap: 1.3, del: 1.15, rate: 0.8 }, nanodyne: { cap: 0.9, del: 0.8, rate: 1.3 }, dustline: { cap: 1.0, del: 0.9, rate: 1.1 } };
const SHIELD_FX = { spike: 'Melee attackers take heavy damage', nova: 'Releases a shock nova when broken', amp: 'Gun damage +20% while shield is full', absorb: '25% chance to turn enemy bullets into ammo' };
const SHIELD_NAMES = ['Bulwark', 'Aegis', 'Carapace', 'Ward', 'Halo', 'Bastion', 'Mantle'];

function rollRarity(luck = 0) { return wpick(rnd, [[0, Math.max(10, 60 - luck * 6)], [1, 25], [2, 9 + luck * 1.5], [3, 3.2 + luck * 0.9], [4, 0.75 + luck * 0.4]]); }
function makeGun(lvl, rar, kind, mfg) {
  lvl = clamp(Math.round(lvl), 1, 72); if (rar == null) rar = rollRarity();
  kind = kind || wpick(rnd, [['pistol', 22], ['smg', 18], ['rifle', 22], ['shotgun', 16], ['sniper', 12], ['launcher', 5]]);
  mfg = mfg || pick(rnd, Object.keys(MFG).filter(m => MFG[m].kinds.includes(kind)));
  const K = KINDS[kind], M = MFG_MODS[mfg], R = RARITY[rar]; const v = () => rr(rnd, 0.92, 1.08);
  const it = { uid: uid(), type: 'gun', kind, mfg, lvl, rar, dmg: K.dmg * M.dmg * R.m * S(lvl) * v(), rof: K.rof * M.rof * v() * (1 + rar * 0.03),
    mag: Math.max(1, Math.round(K.mag * M.mag * v() * (1 + rar * 0.06))), rl: K.rl * M.rl * v() * (1 - rar * 0.03), sp: K.sp * M.sp * v() * (1 - rar * 0.05),
    pel: K.pel, crit: M.crit, el: 'kinetic', elc: 0, leg: null };
  const focus = pick(rnd, ['dmg', 'rof', 'acc', 'mag', 'crit']);
  if (focus === 'dmg') it.dmg *= 1.12; else if (focus === 'rof') it.rof *= 1.15; else if (focus === 'acc') it.sp *= 0.75; else if (focus === 'mag') it.mag = Math.round(it.mag * 1.4); else it.crit += 0.4;
  if (rnd() < M.el + rar * 0.1 || mfg === 'nanodyne') { it.el = pick(rnd, ['fire', 'shock', 'acid', 'nano']); it.elc = clamp(0.12 + rar * 0.06 + rnd() * 0.1, 0.1, 0.6) * (kind === 'shotgun' ? 0.45 : kind === 'smg' ? 0.7 : kind === 'sniper' || kind === 'launcher' ? 1.6 : 1); it.dmg *= 0.9; }
  if (rar === 4) { const L = pick(rnd, LEGENDARY.filter(l => l.kinds === 'all' || l.kinds.includes(kind))); it.leg = L.id; if (L.el) { it.el = L.el; it.elc = Math.max(it.elc, 0.3); } it.name = pick(rnd, LEG_NAMES[kind]); it.flavor = L.txt; it.fx = L.fx; }
  else it.name = `${pick(rnd, PREFIX[it.el !== 'kinetic' && rnd() < 0.5 ? it.el : focus])} ${pick(rnd, MODEL_NAMES[kind])}`;
  it.value = Math.round((14 + lvl * 7) * (1 + rar * rar * 0.6) * (kind === 'launcher' ? 1.3 : 1));
  return it;
}
function makeShield(lvl, rar) {
  lvl = clamp(Math.round(lvl), 1, 72); if (rar == null) rar = rollRarity();
  const mfg = pick(rnd, Object.keys(SHIELD_MFG)), M = SHIELD_MFG[mfg], R = RARITY[rar], v = () => rr(rnd, 0.92, 1.08);
  const cap = 45 * S(lvl) * M.cap * R.m * v();
  const it = { uid: uid(), type: 'shield', mfg, lvl, rar, cap, del: 3.4 * M.del * (1 - rar * 0.06) * v(), rate: 0.3 * M.rate * (1 + rar * 0.06) * v(), fx: null };
  if (rar >= 3 || (rar === 2 && rnd() < 0.4)) it.fx = pick(rnd, Object.keys(SHIELD_FX));
  it.name = (it.fx ? { spike: 'Thorned', nova: 'Nova', amp: 'Amplified', absorb: 'Absorbing' }[it.fx] + ' ' : '') + pick(rnd, SHIELD_NAMES);
  it.value = Math.round((12 + lvl * 6) * (1 + rar * rar * 0.6)); return it;
}
function lootDrop(lvl, luck = 0) { return rnd() < 0.8 ? makeGun(lvl, rollRarity(luck)) : makeShield(lvl, rollRarity(luck)); }
const gunDPS = (it) => it.dmg * it.pel * (it.leg === 'twin' ? 2 : 1) * it.rof;
const gunAcc = (it) => clamp(Math.round(100 - it.sp * 1000), 5, 99);

function itemCard(it, cmp) {
  if (!it) return '';
  const R = RARITY[it.rar]; const rows = [];
  const arrow = (a, b, hi = true) => { if (b == null || cmp == null) return ''; const d = a - b; if (Math.abs(d) / Math.max(Math.abs(b), 0.0001) < 0.01) return ''; return (d > 0) === hi ? '<b class="up">▲</b>' : '<b class="dw">▼</b>'; };
  const c = cmp && cmp.type === it.type ? cmp : null;
  if (it.type === 'gun') {
    const K = KINDS[it.kind];
    rows.push(['Damage', fmt(it.dmg) + (it.pel > 1 ? ' ×' + it.pel : '') + (it.leg === 'twin' ? ' ×2' : ''), arrow(it.dmg * it.pel, c && c.dmg * c.pel)]);
    rows.push(['Accuracy', gunAcc(it) + '%', arrow(gunAcc(it), c && gunAcc(c))]);
    rows.push(['Fire rate', it.rof.toFixed(1) + '/s', arrow(it.rof, c && c.rof)]);
    rows.push(['Reload', it.rl.toFixed(1) + 's', arrow(it.rl, c && c.rl, false)]);
    rows.push(['Magazine', it.mag, arrow(it.mag, c && c.mag)]);
    rows.push(['DPS', fmt(gunDPS(it)), arrow(gunDPS(it), c && gunDPS(c))]);
    let extra = '';
    if (it.el !== 'kinetic') extra += `<div class="ic-el" style="color:${ELEMENTS[it.el].c}">${ELEMENTS[it.el].n} · ${Math.round(it.elc * 100)}% chance</div>`;
    if (it.crit > 0.05) extra += `<div class="ic-fx">+${Math.round(it.crit * 100)}% critical damage</div>`;
    if (it.fx) extra += `<div class="ic-fx">${it.fx}</div>`;
    if (it.flavor) extra += `<div class="ic-flavor">${esc(it.flavor)}</div>`;
    return `<div class="icard" style="--rc:${R.c}"><div class="ic-top"><span class="ic-name">${esc(it.name)}</span><span class="ic-lvl">LV ${it.lvl}</span></div>
      <div class="ic-sub">${R.n} ${K.n} · ${MFG[it.mfg].n}</div><div class="ic-rows">${rows.map(r => `<div><span>${r[0]}</span><b>${r[1]} ${r[2]}</b></div>`).join('')}</div>${extra}
      <div class="ic-val">${fmtInt(it.value)} cr</div></div>`;
  }
  rows.push(['Capacity', fmt(it.cap), arrow(it.cap, c && c.cap)]);
  rows.push(['Recharge delay', it.del.toFixed(1) + 's', arrow(it.del, c && c.del, false)]);
  rows.push(['Recharge rate', Math.round(it.rate * 100) + '%/s', arrow(it.rate, c && c.rate)]);
  return `<div class="icard" style="--rc:${R.c}"><div class="ic-top"><span class="ic-name">${esc(it.name)} Shield</span><span class="ic-lvl">LV ${it.lvl}</span></div>
    <div class="ic-sub">${R.n} Shield · ${MFG[it.mfg].n}</div><div class="ic-rows">${rows.map(r => `<div><span>${r[0]}</span><b>${r[1]} ${r[2]}</b></div>`).join('')}</div>
    ${it.fx ? `<div class="ic-fx">${SHIELD_FX[it.fx]}</div>` : ''}<div class="ic-val">${fmtInt(it.value)} cr</div></div>`;
}
