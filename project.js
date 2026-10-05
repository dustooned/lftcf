// Pure project logic: loading/sanitising saves, deck legality, readability, and the data half
// of exports. No DOM here, so tools/test-forge.mjs can exercise all of it in Node.
import { SHAPES, MASKS, BLENDS, LAYER_FX, accentFor } from './render.js';
import { defaultLayout, normalize, newId, validate, toEngine, fromEngine } from './model.js';
import { VERSION, SAVE_FORMAT } from './version.js';

export const SAFE_ID = { test: v => typeof v === 'string' && /^[\w-]{1,32}$/.test(v) }; // a bare regex would accept undefined as "undefined"
export const DECK_SIZE = 20; // mirrors data/rules.json deckSize; src/rules.lua also needs distinct names
export const TRASH_DAYS = 30;
// Brand silhouettes from tools/build.mjs shapeSpecFor, used when the base set is loaded.
export const BASE_SHAPES = { 'Unassigned': 'circle', 'The Extremely Official Ninja Forum': 'hexagon', 'Snackforce 2000': 'triangle', 'B.O.R.E.D. Energy Drink': 'star5', 'PawSpace': 'pentagon', 'MegaMall After Dark': 'square', "Baby's First Apocalypse": 'star8' };
export const FOLDER_ICONS = ['🃏', '🧪', '📁', '⭐', '🔥', '⚔️', '🛡️', '🐒', '🍔', '🥤', '🐾', '🛒', '☢️', '🎨', '💀', '✅', '🚧'];
export const DEFAULT_BACK = { bg: '#171724', frame: '#aff57e', stripe: '#ff9ba7', ink: '#fff9eb', tagline: 'Harper House Games', layout: 'wordmark', pattern: 'stripes', watermark: 0, showSet: true };

const num = (v, d) => (v !== '' && v != null && Number.isFinite(+v)) ? +v : d;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hex = (v, d) => /^#[0-9a-f]{6}$/i.test(v) ? v : d;

// Everything that enters the app (saved state, save files, shared cards) passes through here,
// so numbers are numbers and ids are safe before any of it reaches innerHTML.
export function cleanLayer(L) {
  if (!L || !['image', 'text', 'shape', 'logo'].includes(L.kind)) return null;
  const o = { id: SAFE_ID.test(L.id) ? L.id : newId(), kind: L.kind, x: num(L.x, 250), y: num(L.y, 301), scale: clamp(num(L.scale, 1), 0.01, 20), rot: num(L.rot, 0), opacity: clamp(num(L.opacity, 1), 0, 1), zone: L.zone === 'top' ? 'top' : 'art', flip: !!L.flip, hidden: !!L.hidden };
  if (L.locked) o.locked = true;
  for (const k of ['sx', 'sy']) if (L[k] != null && num(L[k], 1) !== 1) o[k] = clamp(num(L[k], 1), 0.02, 50);
  if (L.label) o.label = String(L.label).slice(0, 40);
  if (L.draw && L.kind === 'image') o.draw = true;
  if (L.kind === 'logo' && L.src === 'lft') o.src = 'lft';
  if (BLENDS[L.blend] && L.blend !== 'normal') o.blend = L.blend;
  if (LAYER_FX[L.fx] && L.fx !== 'none') Object.assign(o, { fx: L.fx, fxColor: hex(L.fxColor, ''), fxSize: clamp(num(L.fxSize, 1), 0.2, 3) });
  if (L.kind === 'image') {
    if (typeof L.asset !== 'string') return null;
    Object.assign(o, { asset: L.asset, w: num(L.w, 100), h: num(L.h, 100), name: String(L.name || 'Image').slice(0, 40), mask: MASKS[L.mask] ? L.mask : 'none',
      bright: clamp(num(L.bright, 1), 0.2, 2), contrast: clamp(num(L.contrast, 1), 0.2, 2), sat: clamp(num(L.sat, 1), 0, 2), hue: clamp(num(L.hue, 0), -180, 180) });
    if (SAFE_ID.test(L.orig)) Object.assign(o, { orig: L.orig, cutTol: clamp(num(L.cutTol, 40), 5, 120) });
  }
  if (L.kind === 'text' || L.kind === 'shape') o.fill2 = hex(L.fill2, '');
  if (L.kind === 'text') Object.assign(o, { text: String(L.text ?? '').slice(0, 80), size: clamp(num(L.size, 40), 4, 200), color: String(L.color || '#171724'), stroke: String(L.stroke || ''), font: String(L.font || 'Impact'), bold: L.bold !== false });
  if (L.kind === 'shape') Object.assign(o, { shape: SHAPES[L.shape] ? L.shape : 'star5', fill: String(L.fill || '#ffda52'), stroke: String(L.stroke || '') });
  return o;
}
function cleanCard(c, folderIds) {
  c.uid = SAFE_ID.test(c.uid) ? c.uid : newId('c');
  c.layout = { ...defaultLayout(), ...(c.layout || {}) };
  c.layout.layers = (c.layout.layers || []).map(cleanLayer).filter(Boolean);
  c.folders = (c.folders || []).filter(id => folderIds.has(id));
  c.textMode = c.textMode === 'custom' ? 'custom' : 'auto';
  if (c.fileName != null) c.fileName = String(c.fileName).slice(0, 40);
  return normalize(c);
}
export function upgrade(o) {
  const p = { format: 'lft-forge', setName: 'My Card Set', setCode: 'CUSTOM', credits: '', brands: [], tags: [], folders: [], cards: [], trash: [], assets: {}, sheet: { url: '', auto: false }, ...o };
  p.version = SAVE_FORMAT; p.forgeVersion = VERSION;
  for (const k of ['setName', 'setCode', 'credits']) p[k] = String(p[k] ?? '');
  p.brands = (p.brands || []).filter(b => b && b.name).map(b => ({ name: String(b.name), shape: SHAPES[b.shape] ? b.shape : 'circle', color: hex(b.color, ''), ...(SAFE_ID.test(b.logo) ? { logo: b.logo } : {}), ...(b.lore ? { lore: String(b.lore).slice(0, 240) } : {}) }));
  if (!p.brands.some(b => b.name === 'Unassigned')) p.brands.unshift({ name: 'Unassigned', shape: 'circle', color: '' });
  p.tags = [...new Set((p.tags || []).map(String))];
  p.folders = (p.folders || []).filter(f => f && SAFE_ID.test(f.id)).map(f => ({ id: f.id, name: String(f.name || 'Deck').slice(0, 40), icon: FOLDER_ICONS.includes(f.icon) ? f.icon : '📁', ...(f.sandbox ? { sandbox: true } : {}) }));
  p.assets = Object.fromEntries(Object.entries(p.assets || {}).filter(([k, v]) => SAFE_ID.test(k) && /^data:image\/(png|jpeg|webp|gif);base64,/.test(v)));
  p.sheet = { url: String(p.sheet?.url || ''), auto: !!p.sheet?.auto, last: String(p.sheet?.last || '') };
  const b = p.back || {};
  p.back = { bg: hex(b.bg, DEFAULT_BACK.bg), frame: hex(b.frame, DEFAULT_BACK.frame), stripe: hex(b.stripe, DEFAULT_BACK.stripe), ink: hex(b.ink, DEFAULT_BACK.ink), tagline: String(b.tagline == null || b.tagline === 'Hmm, Hmm! Games' ? DEFAULT_BACK.tagline : b.tagline).slice(0, 40),
    layout: ['wordmark', 'badge', 'logo', 'lore'].includes(b.layout) ? b.layout : 'wordmark', story: String(b.story ?? '').slice(0, 260), pattern: ['stripes', 'dots', 'none'].includes(b.pattern) ? b.pattern : 'stripes',
    watermark: clamp(num(b.watermark, 0), 0, 0.6), showSet: b.showSet !== false, ...(SAFE_ID.test(b.logo) ? { logo: b.logo } : {}) };
  const folderIds = new Set(p.folders.map(f => f.id));
  const gd = p.gameDecks || {};
  p.gameDecks = { Red: folderIds.has(gd.Red) ? gd.Red : '', Blue: folderIds.has(gd.Blue) ? gd.Blue : '' };
  p.cards = (p.cards || []).filter(Boolean).map(c => cleanCard(c, folderIds));
  // Trash keeps deleted cards for TRASH_DAYS so a mis-click is never permanent.
  const cutoff = Date.now() - TRASH_DAYS * 864e5;
  p.trash = (Array.isArray(p.trash) ? p.trash : []).filter(t => t?.card && num(t.at, 0) > cutoff)
    .map(t => ({ at: num(t.at, Date.now()), card: cleanCard(t.card, folderIds) }));
  for (const c of p.cards) registerNames(c, p);
  return p;
}
export function registerNames(c, p) {
  if (c.type === 'CHA' && c.origin && !p.brands.some(b => b.name === c.origin)) p.brands.push({ name: c.origin, shape: BASE_SHAPES[c.origin] || 'circle', color: '' });
  for (const t of [...(c.tags || []), ...(c.partners || [])]) if (!p.tags.includes(t) && !p.brands.some(b => b.name === t) && !p.cards.some(o => o.name === t)) p.tags.push(t);
}
/** Asset ids still referenced by cards, the trash, brand logos or the card back. */
export function usedAssets(p) {
  const fromCard = c => c.layout.layers.filter(l => l.kind === 'image').flatMap(l => [l.asset, l.orig]);
  return new Set([...p.cards.flatMap(fromCard), ...p.trash.flatMap(t => fromCard(t.card)), ...p.brands.map(b => b.logo), p.back?.logo].filter(Boolean));
}

// ---- decks
export function deckReport(p, id) {
  const f = p.folders.find(x => x.id === id), cs = p.cards.filter(c => c.folders.includes(id)), n = cs.length;
  if (f?.sandbox) return { n, legal: false, sandbox: true, note: 'experiments', label: String(n), cards: cs };
  const dupes = n - new Set(cs.map(c => c.name.trim().toLowerCase())).size;
  const bad = cs.filter(c => validate(c, p).some(v => v[0] === 'error')).length;
  const legal = n === DECK_SIZE && !dupes && !bad;
  const note = legal ? '✓ tournament-legal' : n < DECK_SIZE ? `needs ${DECK_SIZE - n} more` : n > DECK_SIZE ? `${n - DECK_SIZE} too many` : dupes ? `${dupes} duplicate name${dupes === 1 ? '' : 's'}` : `${bad} card${bad === 1 ? '' : 's'} with errors`;
  return { n, legal, note, label: `${n}/${DECK_SIZE}`, cards: cs };
}
/** Cost curve 0..7+ and brand mix, for the deck header chart. */
export function deckStats(cards) {
  const curve = Array(8).fill(0);
  for (const c of cards) curve[Math.min(7, Math.max(0, c.cost | 0))]++;
  const brands = {};
  for (const c of cards) { const k = c.type === 'ACT' ? 'Actions' : (c.origin || 'Unassigned'); brands[k] = (brands[k] || 0) + 1; }
  return { curve, brands: Object.entries(brands).sort((a, b) => b[1] - a[1]) };
}
/** data/decks.json for the scripted TTS game: { Red: [ids], Blue: [ids] } from the assigned decks. */
export function gameDecksJson(p) {
  const out = {};
  for (const side of ['Red', 'Blue']) { const id = p.gameDecks?.[side]; if (id) out[side] = p.cards.filter(c => c.folders.includes(id)).map(c => c.id); }
  return out;
}

// ---- readability (WCAG contrast ratio)
const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return 21; const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
/** Tips when a card's text colours are hard to read on its own backgrounds. */
export function readability(c) {
  const L = c.layout || {}, ink = L.ink || '#171724', out = [];
  const check = (bg, where) => { const r = contrast(ink, bg); if (r < 3) out.push(`Text is hard to read on the ${where} (contrast ${r.toFixed(1)}:1, aim for 4.5+).`); };
  check(L.paper || '#fff9eb', 'paper'); if (L.paper2) check(L.paper2, 'paper gradient');
  check(accentFor(c), 'header'); if (L.accent2) check(L.accent2, 'header gradient');
  if (contrast(L.sub || '#454554', L.paper || '#fff9eb') < 2.5) out.push('Small print blends into the paper. Pick a darker or lighter “Small print” colour.');
  return out;
}

// ---- playtest table export (.lftdeck.json). Art is added by the app (it needs a canvas).
/** decks: [{id,name,icon}] ; returns the JSON body minus images. */
export function playtestDeckData(p, decks) {
  const ids = new Set(decks.flatMap(d => p.cards.filter(c => c.folders.includes(d.id)).map(c => c.uid)));
  const cards = p.cards.filter(c => ids.has(c.uid));
  return {
    format: 'lft-deck', version: 1, forgeVersion: VERSION, setName: p.setName,
    decks: decks.map(d => ({ id: d.id, name: `${d.icon || ''} ${d.name}`.trim(), cards: p.cards.filter(c => c.folders.includes(d.id)).map(c => c.id) })),
    cards: cards.map(toEngine),
  };
}

// ---- IRL printing: paper and card sizes in millimetres, and how many cards fit a sheet.
export const PAPERS = {
  letter: { w: 215.9, h: 279.4, label: 'US Letter 8.5×11 in' },
  a4: { w: 210, h: 297, label: 'A4 210×297 mm' },
  legal: { w: 215.9, h: 355.6, label: 'US Legal 8.5×14 in' },
  tabloid: { w: 279.4, h: 431.8, label: 'Tabloid 11×17 in' },
  a3: { w: 297, h: 420, label: 'A3 297×420 mm' },
  superb: { w: 330.2, h: 482.6, label: 'Super B / A3+ 13×19 in' },
};
export const CARD_SIZES = {
  poker: { w: 63, h: 88, label: 'Poker 63×88 mm (standard)' },
  bridge: { w: 57, h: 89, label: 'Bridge 57×89 mm' },
  mini: { w: 44, h: 63, label: 'Mini Euro 44×63 mm' },
  tarot: { w: 70, h: 120, label: 'Tarot 70×120 mm' },
  jumbo: { w: 89, h: 127, label: 'Jumbo 3.5×5 in' },
};
export const PRINT_DEFAULTS = { paper: 'letter', card: 'poker', cw: 63, ch: 88, bleed: 0, gap: 0, margin: 6, marks: 'crop', outline: true, backs: 'long' };
/** Grid for one sheet. Tries portrait and landscape and keeps whichever fits more cards. All sizes in mm. */
export function printLayout(o) {
  const paper = PAPERS[o.paper] || PAPERS.letter, card = o.card === 'custom' ? { w: +o.cw || 63, h: +o.ch || 88 } : CARD_SIZES[o.card] || CARD_SIZES.poker;
  const bleed = Math.max(0, +o.bleed || 0), gap = Math.max(0, +o.gap || 0), margin = Math.max(3, +o.margin || 6);
  const cellW = card.w + bleed * 2, cellH = card.h + bleed * 2;
  const fit = (pw, ph) => {
    const cols = Math.max(0, Math.floor((pw - margin * 2 + gap) / (cellW + gap))), rows = Math.max(0, Math.floor((ph - margin * 2 + gap) / (cellH + gap)));
    const gw = cols * cellW + Math.max(0, cols - 1) * gap, gh = rows * cellH + Math.max(0, rows - 1) * gap;
    return { pageW: pw, pageH: ph, cols, rows, perPage: cols * rows, x0: (pw - gw) / 2, y0: (ph - gh) / 2 };
  };
  const port = fit(paper.w, paper.h), land = fit(paper.h, paper.w);
  const best = land.perPage > port.perPage ? { ...land, landscape: true } : { ...port, landscape: false };
  return { ...best, cardW: card.w, cardH: card.h, cellW, cellH, bleed, gap, margin };
}
/** Where each card sits on a sheet (cell top-left, mm). Backs mirror the columns (long-edge flip) or the rows (short-edge flip). */
export function printCells(L, side = 'front', flip = 'long') {
  const out = [];
  for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
    const cc = side === 'back' && flip === 'long' ? L.cols - 1 - c : c, rr = side === 'back' && flip === 'short' ? L.rows - 1 - r : r;
    out.push({ x: L.x0 + cc * (L.cellW + L.gap), y: L.y0 + rr * (L.cellH + L.gap) });
  }
  return out;
}

// ---- reading a .lftdeck.json back in
/** A playtest deck file ("Send to playtest") as a project: decks, cards, stats, text, flavor and
 *  notes. The art inside is each card's finished face (layers can't be pulled back out of it), so
 *  it is not imported; brand colours, accents and banner words aren't in the file either. */
export function lftDeckToProject(o) {
  if (o?.format !== 'lft-deck') throw new Error('not a playtest deck file');
  const decks = (Array.isArray(o.decks) ? o.decks : []).filter(d => d && typeof d === 'object');
  const folders = decks.map((d, i) => {
    const m = String(d.name ?? '').match(/^(\p{Extended_Pictographic}\uFE0F?)\s*(.*)$/u);
    const icon = m && FOLDER_ICONS.includes(m[1]) ? m[1] : '📁';
    return { id: SAFE_ID.test(d.id) ? d.id : 'deck' + i, name: (m ? m[2] : String(d.name ?? '')).trim() || 'Deck', icon };
  });
  const cards = (Array.isArray(o.cards) ? o.cards : []).filter(c => c && typeof c === 'object' && c.name).map(raw => {
    const c = fromEngine(raw);
    c.folders = folders.filter((_, i) => Array.isArray(decks[i].cards) && decks[i].cards.includes(c.id)).map(f => f.id);
    return c;
  });
  if (!cards.length) throw new Error('that deck file has no cards in it');
  return upgrade({ setName: String(o.setName || 'Imported deck'), folders, cards });
}
