// Card rules model. The effect vocabulary mirrors Engine.effect in src/engine.lua exactly —
// anything outside it can't be played by the TTS engine yet, so the forge never invents kinds.
export const EFFECTS = {
  damage:       { label: 'Deal damage to a CHA',          targets: ['enemy', 'friendly', 'any'], amount: true },
  heal:         { label: 'Heal a CHA',                    targets: ['friendly', 'enemy', 'any'], amount: true },
  freeze:       { label: 'Freeze a CHA',                  targets: ['enemy', 'friendly', 'any'] },
  unfreeze:     { label: 'Unfreeze a CHA',                targets: ['friendly', 'enemy', 'any'] },
  bounce:       { label: "Return a CHA to owner's hand",  targets: ['friendly', 'enemy', 'any'] },
  draw:         { label: 'Draw cards',                    targets: ['selfPlayer', 'enemyPlayer'], amount: true },
  damagePlayer: { label: 'Damage a player',               targets: ['enemyPlayer', 'selfPlayer'], amount: true },
  healPlayer:   { label: 'Heal a player',                 targets: ['selfPlayer', 'enemyPlayer'], amount: true },
  riskyDraw:    { label: 'Lose 1 Player HP, then draw',   targets: ['selfPlayer'], amount: true },
};
export const TARGET_LABELS = { enemy: 'Opposing CHA', friendly: 'Friendly CHA', any: 'Any CHA', selfPlayer: 'You', enemyPlayer: 'Other player' };
export const PASSIVES = {
  '': 'No passive trait',
  effectWard: 'Effect Ward (shrug off effect damage)',
  noCounter: "Can't counterattack",
  needsBackup: 'Needs a Backup to attack',
};
export const TIMINGS = { none: 'No ability', entry: "🎉 On enter — HEY, I'M HERE!", activated: '❄️ Activated (freezes it) — NAP TIEM!', passive: '♾️ Passive (always on) — BIG STINK!' };
export const LIMITS = { cost: [0, 10], hp: [1, 20], amount: [1, 10], abilityCost: [0, 5], ward: [1, 5] };

const TGT = { enemy: 'an opposing CHA', friendly: 'a friendly CHA', any: 'any ring CHA' };
const cards = n => `${n} card${n === 1 ? '' : 's'}`;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

export function effectPhrase(e) {
  if (!e) return '';
  const n = e.amount ?? 1;
  switch (e.kind) {
    case 'damage': return `deal ${n} damage to ${TGT[e.target]}`;
    case 'heal': return `heal ${TGT[e.target]} by ${n}`;
    case 'freeze': return `freeze ${TGT[e.target]} until its next Ready step`;
    case 'unfreeze': return `unfreeze ${TGT[e.target]}`;
    case 'bounce': return `return ${TGT[e.target]} to its owner's hand. Discard its Backups`;
    case 'draw': return e.target === 'enemyPlayer' ? `the other player draws ${cards(n)}` : `draw ${cards(n)}`;
    case 'damagePlayer': return e.target === 'selfPlayer' ? `lose ${n} Player HP` : `deal ${n} damage to the other player`;
    case 'healPlayer': return e.target === 'selfPlayer' ? `heal your Player HP by ${n}` : `heal the other player by ${n}`;
    case 'riskyDraw': return `lose 1 Player HP, then if still alive draw ${cards(n)}`;
  }
  return '';
}
export function passivePhrase(c) {
  switch (c.passive) {
    case 'effectWard': return `While this is in your ring, reduce damage to it from card effects by ${c.ward ?? 1} (minimum 0).`;
    case 'noCounter': return 'While this is in your ring, it cannot counterattack.';
    case 'needsBackup': return 'While this is in your ring, it cannot attack unless it has at least one Backup.';
  }
  return '';
}
export function autoText(c) {
  if (c.type === 'ACT') return c.effect ? cap(effectPhrase(c.effect)) + '.' : 'No effect.';
  const parts = [];
  if (c.timing === 'entry' && c.effect) parts.push(`When this enters your ring, ${effectPhrase(c.effect)}.`);
  if (c.timing === 'activated' && c.effect) parts.push(`Freeze this character${c.abilityCost ? ` and pay ${c.abilityCost} SP` : ''}: ${effectPhrase(c.effect)}.`);
  if (c.passive) parts.push(passivePhrase(c));
  // Ring-space rules print on the card so nobody has to remember them.
  if (c.tier === 'leet') parts.push('1337: this must be your only character in the ring.');
  else if (c.edgelord) parts.push('EXE: takes up two ring slots.');
  return parts.join(' ') || 'No ability.';
}

export const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'card';
export const newId = (p = 'l') => p + Math.random().toString(36).slice(2, 9);
export function uniqueCardId(base, cards, self) {
  let id = slug(base), n = 2;
  while (cards.some(c => c !== self && c.id === id)) id = slug(base) + '-' + n++;
  return id;
}

export const defaultLayout = () => ({ accent: '', paper: '#fff9eb', ink: '#171724', border: '#171724', sub: '#454554', font: 'Arial', banner: '', grid: true, placeholder: true, layers: [] });

export function newCard(type, project, name) {
  const base = { name: name || (type === 'ACT' ? 'New Action' : 'New Character'), type, cost: 1, text: '', textMode: 'auto', provenance: 'player-made', layout: defaultLayout(), autoId: true };
  const c = type === 'ACT'
    ? { ...base, family: 'direct', effect: { kind: 'damage', amount: 1, target: 'enemy' } }
    : { ...base, tier: 'low', hp: 3, origin: project.brands[0]?.name || 'Unassigned', tags: [], partners: [], timing: 'none' };
  c.id = uniqueCardId(c.name, project.cards);
  c.text = autoText(c);
  return c;
}

// Keep a card internally consistent after its type/timing/effect changes.
const num = (v, d) => (v !== '' && v != null && Number.isFinite(+v)) ? +v : d;
export function normalize(c) {
  // Coerce everything that came from a file, so a hand-edited sheet or shared card can't
  // smuggle strings into numeric SVG attributes.
  c.type = c.type === 'ACT' ? 'ACT' : 'CHA';
  c.name = String(c.name ?? '').slice(0, 60); c.id = String(c.id || slug(c.name));
  c.cost = Math.round(num(c.cost, 0));
  if (c.type === 'CHA') c.hp = Math.round(num(c.hp, 3));
  if (c.abilityCost != null) c.abilityCost = Math.round(num(c.abilityCost, 1));
  if (c.ward != null) c.ward = Math.round(num(c.ward, 1));
  if (c.effect?.amount != null) c.effect.amount = Math.round(num(c.effect.amount, 1));
  if (!['low', 'mid', 'high', 'leet'].includes(c.tier)) c.tier = c.type === 'CHA' ? 'low' : c.tier;
  if (c.type === 'ACT' && !['direct', 'control'].includes(c.family)) c.family = 'direct';
  for (const k of ['tags', 'partners']) if (c[k] != null) c[k] = [].concat(c[k]).map(String).filter(Boolean);
  if (c.type === 'ACT') {
    c.family ||= 'direct';
    c.effect ||= { kind: 'damage', amount: 1, target: 'enemy' };
    delete c.edgelord;
  } else {
    c.tier ||= 'low'; c.hp ??= 3; c.timing ||= 'none'; c.tags ||= []; c.partners ||= []; c.origin ||= 'Unassigned';
    if (c.timing === 'entry' || c.timing === 'activated') c.effect ||= { kind: 'heal', amount: 1, target: 'friendly' };
    else delete c.effect;
    if (c.timing === 'activated') c.abilityCost ??= 1; else delete c.abilityCost;
    if (c.timing === 'passive' && !c.passive) c.passive = 'noCounter';
    if (c.passive === 'effectWard') c.ward ??= 1; else delete c.ward;
    if (!c.passive) delete c.passive;
  }
  if (c.effect) {
    const spec = EFFECTS[c.effect.kind] || EFFECTS.damage;
    if (!EFFECTS[c.effect.kind]) c.effect.kind = 'damage';
    if (!spec.targets.includes(c.effect.target)) c.effect.target = spec.targets[0];
    if (spec.amount) c.effect.amount ??= 1; else delete c.effect.amount;
  }
  if (c.textMode !== 'custom') c.text = autoText(c);
  return c;
}

// Export shape = data/cards.json. Layout, art and editor-only fields are stripped.
export function toEngine(c) {
  const o = { id: c.id, name: c.name, type: c.type };
  if (c.type === 'CHA') Object.assign(o, { tier: c.tier, cost: c.cost, hp: c.hp, origin: c.origin, tags: [...(c.tags || [])], partners: [...(c.partners || [])], timing: c.timing });
  else Object.assign(o, { family: c.family, cost: c.cost });
  if (c.type === 'CHA' && c.timing === 'activated') o.abilityCost = c.abilityCost ?? 0;
  if (c.type === 'CHA' && c.edgelord) o.edgelord = true;
  o.text = c.text;
  if (c.effect) { o.effect = { kind: c.effect.kind }; if (c.effect.amount != null) o.effect.amount = c.effect.amount; o.effect.target = c.effect.target; }
  if (c.passive) o.passive = c.passive;
  if (c.passive === 'effectWard') o.ward = c.ward ?? 1;
  for (const k of ['flavor', 'artist', 'provenance', 'note']) if (c[k]) o[k] = c[k];
  return o;
}
export function fromEngine(o) {
  const c = { ...o, layout: defaultLayout() };
  c.textMode = 'auto';
  const auto = autoText(normalize({ ...c, textMode: 'custom' }));
  c.textMode = (o.text && o.text !== auto) ? 'custom' : 'auto';
  return normalize(c);
}

export function validate(c, project) {
  const out = [], err = m => out.push(['error', m]), warn = m => out.push(['warn', m]), tip = m => out.push(['tip', m]);
  if (!String(c.name || '').trim()) err('Give the card a name.');
  if (project.cards.some(o => o !== c && o.name?.trim().toLowerCase() === c.name?.trim().toLowerCase())) err('Another card already has this name — decks need distinct names.');
  if (project.cards.some(o => o !== c && o.id === c.id)) err(`Card ID "${c.id}" is used twice.`);
  if (c.cost < LIMITS.cost[0] || c.cost > LIMITS.cost[1]) err('Cost must be 0–10 SP (the SP cap).');
  if (c.type === 'CHA') {
    if (!(c.hp >= 1)) err('Characters need at least 1 HP.');
    if ((c.timing === 'entry' || c.timing === 'activated') && !c.effect) err('This trigger needs an effect.');
    if (c.timing === 'passive' && !c.passive) err('Pick a passive trait.');
    if (c.origin === 'Unassigned' && !(c.partners || []).length) warn('Unassigned with no partners — nothing can attach to it as a Backup.');
    const known = new Set(project.cards.flatMap(o => [...(o.tags || []), o.origin, o.name]));
    for (const p of c.partners || []) if (!known.has(p)) tip(`No card is "${p}" yet, so that partner never matches.`);
    const lo = Math.floor(1.5 * c.cost + 1), hi = Math.ceil(1.6 * c.cost + 3);
    if (c.hp > hi) tip(`HP ${c.hp} is beefy for ${c.cost} SP (the base set runs ${lo}–${hi}).`);
    if (c.hp < lo) tip(`HP ${c.hp} is fragile for ${c.cost} SP (the base set runs ${lo}–${hi}).`);
  } else {
    if (!c.effect) err('Actions need an effect.');
  }
  if (c.textMode === 'custom' && c.text !== autoText(c)) tip('Custom rules text: make sure it still matches what the effect actually does.');
  if ((c.text || '').length > 190) warn('Long rules text — it will shrink to fit.');
  return out;
}

// Plain-English ability parser: "when this enters, deal 2 damage to an enemy".
// Deliberately small and honest — returns null instead of guessing when nothing matches.
export function parseAbility(input, type) {
  const s = ' ' + String(input || '').toLowerCase().replace(/[’']/g, "'") + ' ';
  let timing = null;
  if (type === 'CHA') {
    if (/enter|arriv|summon|play(ed)? this|comes? in|hey,? i'?m here/.test(s)) timing = 'entry';
    else if (/freeze this|pay \d|activat|\btap\b|nap tiem|once per turn/.test(s)) timing = 'activated';
    else if (/while|always|can'?t|cannot|passive/.test(s)) timing = 'passive';
  }
  const abilityCost = timing === 'activated' ? +((s.match(/pay (\d+)/) || [])[1] || 1) : undefined;
  // Strip trigger wording so "freeze this character and pay 1 SP: heal…" isn't read as a freeze of 1.
  const r = s.replace(/freeze this( character)?( and pay \d+ sp)?:?/g, ' ').replace(/pay \d+ sp:?/g, ' ')
    .replace(/nap tiem!?|hey,? i'?m here!?/g, ' ').replace(/when this (enters|arrives)( in)?( your ring)?,?/g, ' ');
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const nums = [...r.matchAll(/\b(\d+|one|two|three|four|five|six)\b/g)].map(m => WORDS[m[1]] ?? +m[1]);
  const amount = nums[0] ?? 1;
  const enemy = /(enemy|opposing|opponent|their|foe|rival|other)/.test(r), friendly = /(friendly|ally|allied|your own|\bown\b|\bmy\b)/.test(r), anyT = /\bany\b/.test(r);
  const player = /(player|\bopponent\b|opponent'?s? hp|\bface\b|directly|\blife\b)/.test(r) || /\b(you|your) (hp|life)/.test(r);
  const chaTarget = anyT ? 'any' : enemy ? 'enemy' : friendly ? 'friendly' : null;
  let effect = null, passive = null;
  if (/cannot counter|can'?t counter|no counter/.test(r)) passive = 'noCounter';
  else if (/needs? (a )?backup|unless it has/.test(r)) passive = 'needsBackup';
  else if (/reduce damage|\bward|shield|armou?r/.test(r)) passive = 'effectWard';
  if (/lose \S* ?(player )?hp.*draw|risk/.test(r)) effect = { kind: 'riskyDraw', amount: nums.at(-1) ?? 1, target: 'selfPlayer' };
  else if (/unfreeze|\bwake|thaw|ready up/.test(r)) effect = { kind: 'unfreeze', target: chaTarget || 'friendly' };
  else if (/freeze|stun/.test(r)) effect = { kind: 'freeze', target: chaTarget || 'enemy' };
  else if (/\bdraws?\b/.test(r)) effect = { kind: 'draw', amount, target: /(other player|opponent) draws?/.test(r) ? 'enemyPlayer' : 'selfPlayer' };
  else if (/return|bounce|back to (its|their) (owner'?s )?hand/.test(r)) effect = { kind: 'bounce', target: chaTarget || 'friendly' };
  else if (/lose \S* ?(player )?hp|hurt yourself|self.?damage/.test(r)) effect = { kind: 'damagePlayer', amount, target: 'selfPlayer' };
  else if (/heal|restore|recover|gain \S* ?hp/.test(r)) effect = player ? { kind: 'healPlayer', amount, target: enemy ? 'enemyPlayer' : 'selfPlayer' } : { kind: 'heal', amount, target: chaTarget || 'friendly' };
  else if (passive !== 'effectWard' && /damage|deal|\bhit|zap|burn|blast|smack/.test(r)) effect = player && !/\bcha\b|character/.test(r) ? { kind: 'damagePlayer', amount, target: enemy || !friendly ? 'enemyPlayer' : 'selfPlayer' } : { kind: 'damage', amount, target: chaTarget || 'enemy' };
  if (!effect && !passive) return null;
  if (effect && !EFFECTS[effect.kind].amount) delete effect.amount;
  if (type === 'CHA' && !timing) timing = effect ? 'entry' : 'passive';
  if (type === 'CHA' && effect && timing === 'passive') timing = 'entry';
  return { timing, effect, passive, abilityCost };
}

const ADJ = ['Unassuming', 'Anonymous', 'Reply-All', 'Caffeine', 'Doomscroll', 'Coupon', 'Thread', 'Brand-Safe', 'Emergency', 'Unskippable', 'Tiny', 'Loud', 'Suspicious', 'Premium', 'Legacy', 'Sponsored', 'Cursed', 'Verified', 'Lowkey', 'Buffering', 'Clickbait', 'Moderately', 'Seasonal', 'Deprecated'];
const NOUN = ['Monkey', 'Lurker', 'Ninja', 'Oracle', 'Goblin', 'Kitten', 'Moderator', 'Intern', 'Beast', 'Medic', 'Admin', 'CEO', 'Gremlin', 'Influencer', 'Bot', 'Mascot', 'Poster', 'Wizard', 'Raccoon', 'Popup', 'Streamer', 'Barista', 'Cryptid', 'Janitor'];
const ACT_NOUN = ['Cannon', 'Patch', 'Spike', 'Reboot', 'Ad', 'Tabs', 'Ratio', 'Refresh', 'Hotfix', 'Pop-up', 'Unsubscribe', 'Captcha'];
const pick = a => a[Math.floor(Math.random() * a.length)];
export const randomName = type => `${pick(ADJ)} ${pick(type === 'ACT' ? ACT_NOUN : NOUN)}`;
export function randomAbility(type) {
  const kinds = Object.keys(EFFECTS), kind = pick(kinds), spec = EFFECTS[kind];
  const effect = { kind, target: pick(spec.targets) }; if (spec.amount) effect.amount = 1 + Math.floor(Math.random() * 3);
  return { effect, timing: type === 'CHA' ? pick(['none', 'entry', 'activated', 'entry']) : undefined };
}

// ---- Spreadsheets (CSV, Excel, Google Sheets) ----
// One row per card. Headers are matched loosely ("Effect Kind", "effect_kind", "effectKind"
// all work) and values forgivingly ("Character" = CHA), so hand-made sheets just work.
export const CSV_COLUMNS = ['id', 'name', 'type', 'tier', 'family', 'cost', 'hp', 'origin', 'tags', 'partners', 'timing', 'abilityCost', 'effectKind', 'effectTarget', 'effectAmount', 'passive', 'ward', 'edgelord', 'text', 'flavor', 'artist', 'provenance', 'note'];
const ALIASES = {
  id: ['id', 'cardid', 'key'], name: ['name', 'cardname', 'title'], type: ['type', 'cardtype', 'kind'], tier: ['tier', 'rarity', 'level'],
  family: ['family', 'actionfamily', 'actfamily'], cost: ['cost', 'sp', 'spcost'], hp: ['hp', 'health'], origin: ['origin', 'brand'],
  tags: ['tags', 'allegiance', 'allegiances', 'tag'], partners: ['partners', 'partner', 'backups'], timing: ['timing', 'trigger'],
  abilityCost: ['abilitycost', 'activationcost'], effectKind: ['effectkind', 'effect', 'effecttype'], effectTarget: ['effecttarget', 'target'],
  effectAmount: ['effectamount', 'amount', 'value'], passive: ['passive', 'passivetrait', 'trait'], ward: ['ward', 'wardamount'],
  edgelord: ['edgelord', 'exe', 'edgelordsummon'], text: ['text', 'rulestext', 'rules', 'ability'], flavor: ['flavor', 'flavortext', 'flavour'],
  artist: ['artist', 'art', 'artcredit'], provenance: ['provenance', 'source'], note: ['note', 'notes', 'designernotes'],
};
const keyOf = h => { const k = String(h).toLowerCase().replace(/[^a-z0-9]/g, ''); return Object.keys(ALIASES).find(c => ALIASES[c].includes(k)); };
const splitList = s => String(s || '').split(/[|;,]/).map(x => x.trim()).filter(Boolean);
const lower = s => String(s ?? '').trim().toLowerCase();
const TIMING_WORDS = { none: 'none', entry: 'entry', onentry: 'entry', enter: 'entry', heyimhere: 'entry', activated: 'activated', activate: 'activated', naptiem: 'activated', passive: 'passive', bigstink: 'passive' };

export function cardsToRows(list) {
  return list.map(c => {
    const e = toEngine(c);
    return { ...e, tags: (e.tags || []).join('|'), partners: (e.partners || []).join('|'), effectKind: e.effect?.kind ?? '', effectTarget: e.effect?.target ?? '', effectAmount: e.effect?.amount ?? '', edgelord: e.edgelord ? 'yes' : '' };
  }).map(r => Object.fromEntries(CSV_COLUMNS.map(k => [k, r[k] ?? ''])));
}
export function rowsToCards(rows) {
  const targetBy = Object.fromEntries(Object.entries(TARGET_LABELS).flatMap(([k, v]) => [[lower(k), k], [lower(v), k]]));
  return rows.map(raw => {
    const o = {};
    for (const [h, v] of Object.entries(raw)) { const k = keyOf(h); if (k && o[k] == null) o[k] = String(v ?? '').trim().replace(/^'(?=[=+@])/, ''); }
    if (!o.name) return null;
    const type = /^(act|action)/i.test(o.type || '') ? 'ACT' : 'CHA';
    const c = { id: o.id || slug(o.name), name: o.name, type, cost: o.cost, text: o.text };
    if (type === 'CHA') {
      c.tier = lower(o.tier) || 'low'; c.hp = o.hp; c.origin = o.origin || 'Unassigned';
      c.tags = splitList(o.tags); c.partners = splitList(o.partners);
      c.timing = TIMING_WORDS[lower(o.timing).replace(/[^a-z]/g, '')] || 'none';
    } else c.family = lower(o.family) || 'direct';
    if (o.abilityCost) c.abilityCost = o.abilityCost;
    const kind = Object.keys(EFFECTS).find(k => lower(k) === lower(o.effectKind).replace(/\s/g, ''));
    if (kind) { c.effect = { kind, target: targetBy[lower(o.effectTarget)] || o.effectTarget }; if (o.effectAmount) c.effect.amount = o.effectAmount; }
    if (o.passive) { const p = Object.keys(PASSIVES).find(k => k && lower(k) === lower(o.passive)); if (p) c.passive = p; }
    if (o.ward) c.ward = o.ward;
    if (/^(yes|true|1|y|x)$/i.test(o.edgelord || '')) c.edgelord = true;
    for (const k of ['flavor', 'artist', 'provenance', 'note']) if (o[k]) c[k] = o[k];
    return c;
  }).filter(Boolean);
}
export function toCSV(list) {
  // A leading ' stops Excel from running text like =HYPERLINK(...) that came in on a shared card.
  const cell = v => { let s = v == null ? '' : String(v); if (/^[=+@]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s; };
  return [CSV_COLUMNS.join(','), ...cardsToRows(list).map(r => CSV_COLUMNS.map(k => cell(r[k])).join(','))].join('\r\n') + '\r\n';
}
export function csvToRows(textIn) {
  const rows = []; let row = [], cur = '', q = false;
  const t = textIn.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(v => v.trim()));
  if (!head) return [];
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim() || '_' + i, r[i] ?? ''])));
}
export const parseCSV = text => rowsToCards(csvToRows(text));

export const SHEET_HELP = [
  ['Column', 'What it means', 'What to type'],
  ['id', 'Internal key the game uses. Leave blank for new cards.', 'lowercase-with-dashes, or blank'],
  ['name', 'Card name (must be unique). Rows without a name are skipped.', 'Anything'],
  ['type', 'Character or Action', 'CHA / ACT (or Character / Action)'],
  ['tier', 'Characters only', 'low / mid / high'],
  ['family', 'Actions only', 'direct / control'],
  ['cost', 'SP to play', '0 to 10'],
  ['hp', 'Characters only', '1 to 20'],
  ['origin', 'Brand the character comes from', 'Any brand name (new ones get created)'],
  ['tags', 'Allegiances this card IS', 'Separate with | like Pets|Snacks'],
  ['partners', 'Allegiances that can Backup this card', 'Separate with |'],
  ['timing', "When a Character's ability happens", 'none / entry / activated / passive'],
  ['abilityCost', 'Extra SP for an activated ability', '0 to 5'],
  ['effectKind', 'What the ability does', Object.keys(EFFECTS).join(' / ')],
  ['effectTarget', 'Who it hits', Object.keys(TARGET_LABELS).join(' / ')],
  ['effectAmount', 'How much', '1 to 10'],
  ['passive', 'Always-on trait', Object.keys(PASSIVES).filter(Boolean).join(' / ')],
  ['ward', 'Only for effectWard', '1 to 5'],
  ['edgelord', 'EXE / Edgelord summon', 'yes or blank'],
  ['text', 'Rules text. Leave blank and the Forge writes it from the effect.', 'Anything'],
  ['flavor', 'Funny one-liner printed in italics', 'Anything'],
  ['artist', 'Art credit', 'Anything'],
  ['note', 'Notes for the team (never printed)', 'Anything'],
];
