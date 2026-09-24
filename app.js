import { W, H, FONTS, SHAPES, SHAPE_LABELS, TIMING_LABEL, esc, cardInner, cardSVG, backSVG, handlesMarkup, layerTransform, accentFor, shapeIcon, shapeMarkup, isHolo, MASKS, EDIT_REGIONS } from './render.js';
import { EFFECTS, TARGET_LABELS, PASSIVES, TIMINGS, LIMITS, autoText, normalize, newCard, uniqueCardId, slug, newId, defaultLayout, toEngine, fromEngine, validate, parseAbility, randomName, randomAbility, toCSV, parseCSV, rowsToCards, cardsToRows, CSV_COLUMNS, SHEET_HELP } from './model.js';
import * as store from './store.js';
import { VERSION, SAVE_FORMAT } from './version.js';
import { embed, extract } from './png-meta.js';

const JSZIP = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
const XLSX = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = o => JSON.parse(JSON.stringify(o));
const num = (v, d) => Number.isFinite(+v) && v !== '' && v != null ? +v : d;
const SAFE_ID = { test: v => typeof v === 'string' && /^[\w-]{1,32}$/.test(v) }; // a bare regex would accept undefined as "undefined"
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { } };

// Brand silhouettes from tools/build.mjs shapeSpecFor, used when the base set is loaded.
const BASE_SHAPES = { 'Unassigned': 'circle', 'The Extremely Official Ninja Forum': 'hexagon', 'Snackforce 2000': 'triangle', 'B.O.R.E.D. Energy Drink': 'star5', 'PawSpace': 'pentagon', 'MegaMall After Dark': 'square', "Baby's First Apocalypse": 'star8' };
const FOLDER_ICONS = ['📁', '⭐', '🔥', '⚔️', '🛡️', '🐒', '🍔', '🥤', '🐾', '🛒', '☢️', '🧪', '🎨', '💀', '✅', '🚧'];
const PRESETS = {
  Classic:   { paper: '#fff9eb', ink: '#171724', border: '#171724', sub: '#454554', accent: '', font: 'Arial' },
  Midnight:  { paper: '#1f1f33', ink: '#f4f4ff', border: '#0b0b14', sub: '#b8b8d8', accent: '', font: 'Arial' },
  'Forum Blue': { paper: '#eef3ff', ink: '#10204a', border: '#27407a', sub: '#3d4f80', accent: '#9fc2ff', font: 'Verdana' },
  Toxic:     { paper: '#eaffd6', ink: '#173300', border: '#0f1f00', sub: '#3c5a1c', accent: '#aff57e', font: 'Trebuchet MS' },
  Vaporwave: { paper: '#fff0fb', ink: '#3b1060', border: '#ff71ce', sub: '#7a3f9e', accent: '#01cdfe', font: 'Trebuchet MS' },
  Receipt:   { paper: '#ffffff', ink: '#222222', border: '#bbbbbb', sub: '#666666', accent: '#eeeeee', font: 'Courier New' },
  'Comic Sans Crimes': { paper: '#fffbe0', ink: '#2b1b00', border: '#ff5a1f', sub: '#6b4a10', accent: '#ffd23f', font: 'Comic Sans MS' },
};
const TEXT_STICKERS = [['LOL!', '#ffda52'], ['NEW!', '#ff9ba7'], ['EPIC', '#ceacff'], ['RARE', '#89e4d7'], ['OOF', '#ffffff'], ['GG', '#aff57e'], ['+1', '#89d6ff'], ['NERF THIS', '#ff5a5a']];

let P = null;                 // the project (set): { setName, brands, tags, folders, cards, assets, sheet }
const ui = { view: 'library', cur: null, sel: null, sec: 'stats', folder: 'all', selecting: false, picked: new Set(), f: { q: '', type: 'all', tier: 'all', brand: 'all', tag: 'all', sort: 'num', trig: 'all' } };
// Ability categories: a Character's trigger (the banner words), or an Action's family.
const TRIGGERS = {
  none:          { icon: '▫️', short: 'NONE',  label: 'No ability' },
  entry:         { icon: '👋', short: 'HEY!',  label: "HEY, I'M HERE! (on entry)" },
  activated:     { icon: '💤', short: 'NAP',   label: 'NAP TIEM! (activated)' },
  passive:       { icon: '💨', short: 'STINK', label: 'BIG STINK! (passive)' },
  'act-direct':  { icon: '▲',  short: 'DIRECT', label: 'Action: direct' },
  'act-control': { icon: '⬢',  short: 'CONTROL', label: 'Action: control' },
};
const triggerOf = c => c.type === 'ACT' ? 'act-' + (c.family || 'direct') : (c.timing || 'none');
const undoStack = [], redoStack = [];

// ---------------------------------------------------------------- utilities
let toastT;
function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('bad', bad); t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), bad ? 4500 : 2600);
}
function ask({ title, body = '', buttons = [{ label: 'OK', value: 'ok', primary: true }] }) {
  const m = $('#modal'), f = $('#modalForm');
  if (m.open) m.close();
  f.innerHTML = `<div class="panel-h">${title}</div><div class="body">${body}</div><div class="foot">${buttons.map(b => `<button class="btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger-btn' : ''}" value="${b.value}">${b.label}</button>`).join('')}</div>`;
  m.returnValue = '';
  m.showModal();
  f.querySelector('input[type=text]')?.focus();
  return new Promise(res => m.addEventListener('close', () => res(m.returnValue), { once: true }));
}
async function promptText(title, label, value = '') {
  const r = await ask({ title, body: `<label class="field" style="display:block"><span class="lbl">${label}</span><input type="text" id="modalInput" value="${esc(value)}" maxlength="48" autocomplete="off"></label>`, buttons: [{ label: 'Cancel', value: '' }, { label: 'OK', value: 'ok', primary: true }] });
  return r === 'ok' ? $('#modalInput').value.trim() : null;
}
const confirmAsk = (title, body, yes = 'Yes') => ask({ title, body: `<p>${body}</p>`, buttons: [{ label: 'Cancel', value: '' }, { label: yes, value: 'ok', primary: true }] }).then(v => v === 'ok');
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const dataURLtoBlob = d => { const [h, b] = d.split(','); const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: h.match(/:(.*?);/)[1] }); };
async function lib(url, what) {
  try { return await import(url); } catch { throw new Error(`${what} needs an internet connection the first time`); }
}

// Display uses blob URLs (cheap to repeat across thumbnails); export inlines the data URL.
const urlCache = new Map();
function href(id) {
  const d = P.assets[id]; if (!d) return '';
  let e = urlCache.get(id);
  if (!e || e.d !== d) { if (e) URL.revokeObjectURL(e.url); e = { d, url: URL.createObjectURL(dataURLtoBlob(d)) }; urlCache.set(id, e); }
  return e.url;
}

// ---------------------------------------------------------------- project load / save
// Everything that enters the app (saved state, save files, shared cards) passes through here,
// so numbers are numbers and ids are safe before any of it reaches innerHTML.
function cleanLayer(L) {
  if (!L || !['image', 'text', 'shape', 'logo'].includes(L.kind)) return null;
  const o = { id: SAFE_ID.test(L.id) ? L.id : newId(), kind: L.kind, x: num(L.x, 250), y: num(L.y, 301), scale: clamp(num(L.scale, 1), 0.01, 20), rot: num(L.rot, 0), opacity: clamp(num(L.opacity, 1), 0, 1), zone: L.zone === 'top' ? 'top' : 'art', flip: !!L.flip, hidden: !!L.hidden };
  if (L.kind === 'image') { if (typeof L.asset !== 'string') return null; Object.assign(o, { asset: L.asset, w: num(L.w, 100), h: num(L.h, 100), name: String(L.name || 'Image').slice(0, 40), mask: MASKS[L.mask] ? L.mask : 'none' }); }
  if (L.kind === 'text' || L.kind === 'shape') o.fill2 = /^#[0-9a-f]{6}$/i.test(L.fill2) ? L.fill2 : '';
  if (L.kind === 'text') Object.assign(o, { text: String(L.text ?? '').slice(0, 80), size: clamp(num(L.size, 40), 4, 200), color: String(L.color || '#171724'), stroke: String(L.stroke || ''), font: String(L.font || 'Impact'), bold: L.bold !== false });
  if (L.kind === 'shape') Object.assign(o, { shape: SHAPES[L.shape] ? L.shape : 'star5', fill: String(L.fill || '#ffda52'), stroke: String(L.stroke || '') });
  return o;
}
function upgrade(o) {
  const p = { format: 'lft-forge', setName: 'My Card Set', setCode: 'CUSTOM', credits: '', brands: [], tags: [], folders: [], cards: [], assets: {}, sheet: { url: '', auto: false }, ...o };
  p.version = SAVE_FORMAT; p.forgeVersion = VERSION;
  for (const k of ['setName', 'setCode', 'credits']) p[k] = String(p[k] ?? '');
  p.brands = (p.brands || []).filter(b => b && b.name).map(b => ({ name: String(b.name), shape: SHAPES[b.shape] ? b.shape : 'circle', color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '', ...(SAFE_ID.test(b.logo) ? { logo: b.logo } : {}) }));
  if (!p.brands.some(b => b.name === 'Unassigned')) p.brands.unshift({ name: 'Unassigned', shape: 'circle', color: '' });
  p.tags = [...new Set((p.tags || []).map(String))];
  p.folders = (p.folders || []).filter(f => f && SAFE_ID.test(f.id)).map(f => ({ id: f.id, name: String(f.name || 'Folder').slice(0, 40), icon: FOLDER_ICONS.includes(f.icon) ? f.icon : '📁' }));
  p.assets = Object.fromEntries(Object.entries(p.assets || {}).filter(([k, v]) => SAFE_ID.test(k) && /^data:image\/(png|jpeg|webp|gif);base64,/.test(v)));
  p.sheet = { url: String(p.sheet?.url || ''), auto: !!p.sheet?.auto, last: p.sheet?.last || '' };
  const folderIds = new Set(p.folders.map(f => f.id));
  p.cards = (p.cards || []).filter(Boolean).map(c => {
    c.uid = SAFE_ID.test(c.uid) ? c.uid : newId('c');
    c.layout = { ...defaultLayout(), ...(c.layout || {}) };
    c.layout.layers = (c.layout.layers || []).map(cleanLayer).filter(Boolean);
    c.folders = (c.folders || []).filter(id => folderIds.has(id));
    c.textMode = c.textMode === 'custom' ? 'custom' : 'auto';
    return normalize(c);
  });
  for (const c of p.cards) registerNames(c, p);
  return p;
}
function registerNames(c, p = P) {
  if (c.type === 'CHA' && c.origin && !p.brands.some(b => b.name === c.origin)) p.brands.push({ name: c.origin, shape: BASE_SHAPES[c.origin] || 'circle', color: '' });
  for (const t of [...(c.tags || []), ...(c.partners || [])]) if (!p.tags.includes(t) && !p.brands.some(b => b.name === t) && !p.cards.some(o => o.name === t)) p.tags.push(t);
}
// Clean slate: a new Forge starts empty. The base game is one click away as examples.
const emptyProject = () => upgrade({ setName: 'My Card Set' });
async function baseProject() {
  const cards = await (await fetch('data/cards.json', { cache: 'no-cache' })).json();
  return upgrade({ setName: 'LOL, FIGHT TIEM!', setCode: 'BETA', brands: Object.entries(BASE_SHAPES).map(([name, shape]) => ({ name, shape })), folders: [{ id: 'fbase', name: 'Base game', icon: '🐒' }], cards: cards.map(o => ({ ...fromEngine(o), folders: ['fbase'] })) });
}
let saveT;
function save() {
  $('#status').textContent = 'saving…';
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    try { await store.set('project', P); $('#status').textContent = '✓ saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    catch (e) { console.error(e); $('#status').textContent = '⚠ not saved'; toast('Could not save in this browser (private window or storage full?). Download a save file!', true); }
  }, 350);
}
function gcAssets() {
  const used = new Set([...P.cards.flatMap(c => c.layout.layers.filter(l => l.kind === 'image').map(l => l.asset)), ...P.brands.map(b => b.logo).filter(Boolean)]);
  for (const id of Object.keys(P.assets)) if (!used.has(id)) delete P.assets[id];
}
function resetTo(p) { P = p; ui.cur = null; ui.sel = null; ui.folder = 'all'; ui.picked.clear(); undoStack.length = redoStack.length = 0; save(); }

// ---------------------------------------------------------------- views
function setView(v) {
  ui.view = v;
  for (const s of $$('.view')) s.classList.toggle('active', s.id === 'view-' + v);
  for (const b of $$('[data-view]')) b.dataset.view === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  if (v === 'library') renderLibrary();
  if (v === 'editor') { if (!cur()) ui.cur = P.cards[0]?.uid; renderEditor(); }
  if (v === 'brands') renderBrands();
  if (v === 'share') renderShare();
  window.scrollTo({ top: 0 });
  if (!$('#help').hidden) openHelp(0);
}
const cur = () => P.cards.find(c => c.uid === ui.cur);
const selLayer = () => cur()?.layout.layers.find(l => l.id === ui.sel);
function openEditor(uid) { ui.cur = uid; ui.sel = null; setView('editor'); }

// ---------------------------------------------------------------- library + folders
const inFolder = (c, f = ui.folder) => f === 'all' || (f === 'unfiled' ? !c.folders.length : c.folders.includes(f));
const folderName = id => id === 'all' ? 'All cards' : id === 'unfiled' ? 'Unfiled' : P.folders.find(f => f.id === id)?.name || '';
function renderFolders() {
  if (ui.folder !== 'all' && ui.folder !== 'unfiled' && !P.folders.some(f => f.id === ui.folder)) ui.folder = 'all';
  const row = (id, icon, name, n, edit) => `<div class="folder ${ui.folder === id ? 'on' : ''}" data-folder="${id}">
    <button class="fbtn" data-open-folder="${id}" title="${esc(name)}"><span class="ficon">${icon}</span><span class="fname">${esc(name)}</span><span class="fcount">${n}</span></button>
    ${edit ? `<button class="fmenu" data-edit-folder="${id}" title="Rename, change icon or delete" aria-label="Edit folder ${esc(name)}">⋯</button>` : ''}</div>`;
  $('#folders').innerHTML = `<div class="folders-h">Folders</div>
    ${row('all', '🗂️', 'All cards', P.cards.length)}${row('unfiled', '📥', 'Unfiled', P.cards.filter(c => !c.folders.length).length)}
    <div class="folder-sep"></div>
    ${P.folders.map(f => row(f.id, f.icon, f.name, P.cards.filter(c => c.folders.includes(f.id)).length, true)).join('')}
    <button class="btn small newfolder" id="newFolder">+ New folder</button>`;
}
const welcomeArt = `<svg viewBox="0 0 220 150" aria-hidden="true"><g transform="rotate(-8 70 80)"><rect x="30" y="20" width="80" height="112" rx="8" fill="#171724"/><rect x="34" y="24" width="72" height="104" rx="6" fill="#fff9eb"/><rect x="38" y="28" width="64" height="22" rx="4" fill="#ff9ba7"/><rect x="38" y="56" width="64" height="34" fill="#89e4d7"/></g><g transform="rotate(7 150 80)"><rect x="110" y="20" width="80" height="112" rx="8" fill="#171724"/><rect x="114" y="24" width="72" height="104" rx="6" fill="#fff9eb"/><rect x="118" y="28" width="64" height="22" rx="4" fill="#ffda52"/><rect x="118" y="56" width="64" height="34" fill="#ceacff"/><text x="150" y="80" text-anchor="middle" font: font-family="Arial" font-weight="900" font-size="22" fill="#171724">?</text></g><polygon points="110,6 115,18 128,18 118,26 122,38 110,31 98,38 102,26 92,18 105,18" fill="#ffda52" stroke="#171724" stroke-width="3"/></svg>`;
function renderLibrary() {
  renderFolders();
  const f = ui.f;
  $('#fBrand').innerHTML = `<option value="all">Any brand</option>` + P.brands.map(b => `<option ${f.brand === b.name ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  $('#fTag').innerHTML = `<option value="all">Any allegiance</option>` + P.tags.map(t => `<option ${f.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('');
  for (const b of $$('#fType button')) b.setAttribute('aria-pressed', b.dataset.v === f.type);
  const fo = P.folders.find(x => x.id === ui.folder);
  $('#libTitle').textContent = `${fo ? fo.icon : ui.folder === 'unfiled' ? '📥' : '🗂️'} ${folderName(ui.folder)}`;
  const q = f.q.toLowerCase();
  const list = P.cards.map((c, i) => ({ c, i })).filter(({ c }) => inFolder(c) &&
    (!q || [c.name, c.text, c.origin, c.flavor, ...(c.tags || [])].join(' ').toLowerCase().includes(q)) &&
    (f.type === 'all' || (f.type === 'EXE' ? c.type === 'CHA' && c.edgelord : c.type === f.type)) &&
    (f.tier === 'all' || c.tier === f.tier) && (f.brand === 'all' || c.origin === f.brand) &&
    (f.tag === 'all' || (c.tags || []).includes(f.tag) || (c.partners || []).includes(f.tag)) &&
    (f.trig === 'all' || triggerOf(c) === f.trig));
  const by = { cost: (a, b) => a.c.cost - b.c.cost || a.i - b.i, name: (a, b) => a.c.name.localeCompare(b.c.name), brand: (a, b) => String(a.c.origin || '~').localeCompare(String(b.c.origin || '~')) || a.i - b.i, trigger: (a, b) => Object.keys(TRIGGERS).indexOf(triggerOf(a.c)) - Object.keys(TRIGGERS).indexOf(triggerOf(b.c)) || a.i - b.i }[f.sort];
  if (by) list.sort(by);
  const inView = P.cards.filter(c => inFolder(c)).length;
  const pool = P.cards.filter(c => inFolder(c)), avg = pool.length ? (pool.reduce((s, c) => s + c.cost, 0) / pool.length).toFixed(1) : 0;
  $('#libCount').innerHTML = `${list.length === inView ? '' : list.length + ' of '}${inView} card${inView === 1 ? '' : 's'} · ${pool.filter(c => c.type === 'CHA').length} CHA · ${pool.filter(c => c.type === 'ACT').length} ACT · avg ${avg} SP · ${Object.entries(TRIGGERS).map(([k, t]) => [t, pool.filter(c => triggerOf(c) === k).length]).filter(([, n]) => n).map(([t, n]) => `<span title="${esc(t.label)}">${t.icon}${n}</span>`).join(' ')}`;
  $('#folderActs').innerHTML = fo ? `<button class="btn" data-fact="export">⬇ Export deck</button><button class="btn" data-fact="version">🗄 Save version</button><button class="btn" data-fact="edit">⋯ Folder</button>` : '';
  $('#selectBtn').setAttribute('aria-pressed', ui.selecting);
  $('#selectBtn').textContent = ui.selecting ? '✓ Done selecting' : '☑ Select';
  renderSelbar(list.map(x => x.c));
  const filtered = f.q || f.type !== 'all' || f.tier !== 'all' || f.brand !== 'all' || f.tag !== 'all' || f.trig !== 'all';
  let empty = '';
  if (!P.cards.length) empty = `<div class="welcome">${welcomeArt}<h2>Your card library is empty</h2><p>Make your first card, roll a random one, or load the 24 base-game cards to see how they're built.</p>
    <div class="btnrow"><button class="btn primary" data-new="CHA">+ New Character</button><button class="btn primary alt" data-new="ACT">+ New Action</button><button class="btn" data-new="random">🎲 Surprise me</button></div>
    <p class="small" style="margin-top:14px"><button class="link" data-act="loadBase">Load the base-game cards as examples</button> · <button class="link" data-act="openHelp">How does this work?</button></p></div>`;
  else if (!list.length && filtered) empty = `<div class="empty">No cards match. <button class="link" data-act="clearFilters">Clear filters</button></div>`;
  else if (!list.length) empty = `<div class="empty">This folder is empty.<br>Drag cards onto it, or use <b>☑ Select</b> → <b>Add to folder</b>. New cards made here land in it automatically.</div>`;
  const drag = matchMedia('(pointer: fine)').matches;
  const showStacks = ui.folder === 'all' && !filtered && P.folders.length && P.cards.length;
  $('#grid').innerHTML = (showStacks ? stacksMarkup() : '') + (empty || '') + (empty ? '' : list.map(({ c, i }) => {
    const errs = validate(c, P).filter(v => v[0] === 'error').length, picked = ui.picked.has(c.uid);
    const fIcons = c.folders.map(id => P.folders.find(x => x.id === id)?.icon).filter(Boolean).join('');
    return `<button class="tile ${picked ? 'picked' : ''} ${isHolo(c) ? 'holo' : ''}" data-uid="${c.uid}" ${drag ? 'draggable="true"' : ''} title="${ui.selecting ? 'Select' : 'Edit'} ${esc(c.name)}" ${ui.selecting ? `aria-pressed="${picked}"` : ''}>
      <div class="card-wrap">${cardSVG(c, { project: P, index: i, uid: 't' + i, href })}${errs ? `<span class="badge" title="${errs} problem(s)">!</span>` : ''}${ui.selecting ? `<span class="pick">${picked ? '✓' : ''}</span>` : ''}</div>
      <div class="cap"><b>${esc(c.name)}</b><span class="pill">${c.type === 'CHA' && c.edgelord ? 'EXE' : c.type}</span><span class="pill">${c.cost} SP</span><span class="pill trig" title="${esc(TRIGGERS[triggerOf(c)]?.label)}">${TRIGGERS[triggerOf(c)]?.icon} ${TRIGGERS[triggerOf(c)]?.short}</span>${c.type === 'CHA' ? `<span class="pill">${c.hp} HP</span>` : ''}${fIcons ? `<span title="In folders">${fIcons}</span>` : ''}</div></button>`;
  }).join(''));
}
// Procreate-style stacks: each folder is a little fanned pile of its first cards.
function stacksMarkup() {
  return `<div class="stacks-h">Folders &amp; decks</div>${P.folders.map(f => {
    const cs = P.cards.filter(c => c.folders.includes(f.id)), top = cs.slice(0, 3).reverse();
    return `<div class="stack" data-folder="${f.id}"><button class="stack-pile" data-open-folder="${f.id}" title="Open ${esc(f.name)}">${top.length ? top.map((c, k) => `<span class="sc sc${top.length - 1 - k}">${cardSVG(c, { project: P, index: P.cards.indexOf(c), uid: 's' + f.id + k, href })}</span>`).join('') : '<span class="sc sc0 empty-pile">empty</span>'}</button>
      <div class="cap"><b>${f.icon} ${esc(f.name)}</b><span class="pill">${cs.length}</span><button class="fmenu" data-edit-folder="${f.id}" title="Rename, duplicate, back up…" aria-label="Folder options">⋯</button></div></div>`;
  }).join('')}<div class="stacks-h">All cards</div>`;
}
function renderSelbar(visible) {
  const bar = $('#selbar');
  bar.hidden = !ui.selecting;
  if (!ui.selecting) return;
  for (const uid of [...ui.picked]) if (!P.cards.some(c => c.uid === uid)) ui.picked.delete(uid);
  const n = ui.picked.size, inReal = P.folders.some(f => f.id === ui.folder);
  bar.dataset.visible = visible.map(c => c.uid).join(',');
  bar.innerHTML = `<b>${n} selected</b>
    <button class="btn small" data-sel="all">Select all</button><button class="btn small" data-sel="none" ${n ? '' : 'disabled'}>Clear</button>
    <span class="spacer"></span>
    <button class="btn small primary" data-sel="addTo" ${n ? '' : 'disabled'}>📁 Add to folder</button>
    ${inReal ? `<button class="btn small" data-sel="removeFrom" ${n ? '' : 'disabled'}>Remove from this folder</button>` : ''}
    <button class="btn small" data-sel="dup" ${n ? '' : 'disabled'}>⧉ Duplicate</button>
    <button class="btn small" data-sel="export" ${n ? '' : 'disabled'}>⬇ Export ZIP</button>
    <button class="btn small danger-btn" data-sel="del" ${n ? '' : 'disabled'}>🗑 Delete</button>`;
}
async function pickFolder(title) {
  const v = await ask({ title, body: `<div class="pick-list">${P.folders.map(f => `<button class="btn" value="${f.id}">${f.icon} ${esc(f.name)}</button>`).join('')}<button class="btn primary" value="__new">＋ New folder…</button></div>`, buttons: [{ label: 'Cancel', value: '' }] });
  if (v === '__new') return (await createFolder())?.id || null;
  return v || null;
}
function iconGrid(current) {
  return `<div class="icon-grid" role="radiogroup" aria-label="Folder icon">${FOLDER_ICONS.map(ic => `<label><input type="radio" name="ficon" value="${ic}" ${ic === current ? 'checked' : ''}>${ic}</label>`).join('')}</div>`;
}
async function createFolder() {
  const v = await ask({ title: '📁 New folder', body: `<label class="field" style="display:block"><span class="lbl">Name</span><input type="text" id="modalInput" maxlength="40" placeholder="e.g. Deck ideas, Needs art, Snack squad" autocomplete="off"></label><div class="field"><span class="lbl">Icon</span>${iconGrid('📁')}</div>`, buttons: [{ label: 'Cancel', value: '' }, { label: 'Create', value: 'ok', primary: true }] });
  const name = $('#modalInput').value.trim();
  if (v !== 'ok' || !name) return null;
  const f = { id: newId('f'), name, icon: $('#modalForm input[name=ficon]:checked')?.value || '📁' };
  P.folders.push(f); save(); toast(`${f.icon} Folder “${name}” made`);
  return f;
}
async function editFolder(id) {
  const f = P.folders.find(x => x.id === id); if (!f) return;
  const n = P.cards.filter(c => c.folders.includes(id)).length;
  const v = await ask({ title: `${f.icon} Edit folder`, body: `<label class="field" style="display:block"><span class="lbl">Name</span><input type="text" id="modalInput" maxlength="40" value="${esc(f.name)}" autocomplete="off"></label><div class="field"><span class="lbl">Icon</span>${iconGrid(f.icon)}</div><p class="muted small">Deleting a folder never deletes its ${n} card${n === 1 ? '' : 's'}.</p>`, buttons: [{ label: 'Delete folder', value: 'del', danger: true }, { label: '⧉ Duplicate', value: 'dup' }, { label: '🗄 Save version', value: 'version' }, { label: '⬇ Export', value: 'export' }, { label: 'Save', value: 'ok', primary: true }] });
  if (v === 'dup') return duplicateFolder(f);
  if (v === 'version') return saveVersion(f.id);
  if (v === 'export') return exportZip(P.cards.filter(c => c.folders.includes(f.id)), f.name);
  if (v === 'ok') { f.name = $('#modalInput').value.trim() || f.name; f.icon = $('#modalForm input[name=ficon]:checked')?.value || f.icon; }
  if (v === 'del') { P.folders = P.folders.filter(x => x !== f); for (const c of P.cards) c.folders = c.folders.filter(x => x !== id); if (ui.folder === id) ui.folder = 'all'; toast('Folder deleted (cards kept)'); }
  if (v) { save(); renderLibrary(); }
}
async function duplicateFolder(f) {
  const cs = P.cards.filter(c => c.folders.includes(f.id));
  const v = await ask({ title: `⧉ Duplicate “${esc(f.name)}”`, body: `<p><b>Same cards</b>: a second folder pointing at the same ${cs.length} cards (edit once, both update). Handy for trying deck variants.</p><p><b>Copy the cards</b>: brand-new copies you can change without touching the originals.</p>`, buttons: [{ label: 'Cancel', value: '' }, { label: 'Same cards', value: 'ref' }, { label: 'Copy the cards', value: 'copy', primary: true }] });
  if (!v) return;
  const nf = { id: newId('f'), name: f.name + ' copy', icon: f.icon }; P.folders.push(nf);
  for (const c of cs) {
    if (v === 'ref') c.folders.push(nf.id);
    else { const d = clone(c); d.uid = newId('c'); d.name += ' (copy)'; d.id = uniqueCardId(d.name, P.cards); d.autoId = true; d.folders = [nf.id]; P.cards.push(d); }
  }
  save(); ui.folder = nf.id; renderLibrary(); toast(`⧉ Made “${nf.name}”`);
}
function addToFolder(uids, id) {
  let n = 0;
  for (const c of P.cards) if (uids.includes(c.uid)) { if (id === 'unfiled') { if (c.folders.length) n++; c.folders = []; } else if (!c.folders.includes(id)) { c.folders.push(id); n++; } }
  save(); renderLibrary();
  toast(id === 'unfiled' ? `Moved ${n} to Unfiled` : `${P.folders.find(f => f.id === id)?.icon} Added ${n} card${n === 1 ? '' : 's'} to “${folderName(id)}”`);
}
function addCard(c, open = true) {
  c.uid = newId('c');
  c.folders = P.folders.some(f => f.id === ui.folder) ? [ui.folder] : [];
  const i = P.cards.indexOf(cur());
  P.cards.splice(i >= 0 && ui.view === 'editor' ? i + 1 : P.cards.length, 0, c);
  registerNames(c); save();
  if (open) openEditor(c.uid); else renderLibrary();
}
function surprise() {
  const type = Math.random() < 0.7 ? 'CHA' : 'ACT', c = newCard(type, P, randomName(type));
  c.cost = Math.floor(Math.random() * 5) + (type === 'ACT' ? 1 : 0);
  if (type === 'CHA') {
    c.hp = Math.max(1, Math.round(1.55 * c.cost + 2 + (Math.random() * 2 - 1)));
    c.tier = c.cost >= 4 ? 'high' : c.cost >= 2 ? 'mid' : 'low';
    const brands = P.brands.filter(b => b.name !== 'Unassigned'); c.origin = (brands[Math.floor(Math.random() * brands.length)] || P.brands[0]).name;
    const peer = P.cards.find(o => o.origin === c.origin && o.tags?.length); c.tags = peer ? [...peer.tags] : []; c.partners = [...c.tags];
    c.edgelord = c.tier === 'high' && Math.random() < 0.5;
  }
  Object.assign(c, randomAbility(type));
  Object.assign(c.layout, Object.values(PRESETS)[Math.floor(Math.random() * Object.keys(PRESETS).length)]);
  c.id = uniqueCardId(c.name, P.cards);
  normalize(c); addCard(c);
  toast('🎲 Fresh card, hot off the forums!');
}
function newFromButton(kind) { if (kind === 'random') surprise(); else addCard(newCard(kind, P)); }

$('#folders').addEventListener('click', async e => {
  const open = e.target.closest('[data-open-folder]'), edit = e.target.closest('[data-edit-folder]');
  if (edit) return editFolder(edit.dataset.editFolder);
  if (open) { ui.folder = open.dataset.openFolder; ui.picked.clear(); renderLibrary(); return; }
  if (e.target.closest('#newFolder')) { const f = await createFolder(); if (f) { if (ui.picked.size) addToFolder([...ui.picked], f.id); ui.folder = f.id; renderLibrary(); } }
});
// Desktop drag-and-drop: drag a card (or the whole selection) onto a folder.
$('#grid').addEventListener('dragstart', e => {
  const t = e.target.closest('.tile'); if (!t) return;
  const uids = ui.picked.has(t.dataset.uid) ? [...ui.picked] : [t.dataset.uid];
  e.dataTransfer.setData('application/x-forge-cards', uids.join(','));
  e.dataTransfer.effectAllowed = 'copy';
});
for (const zone of ['#folders', '#grid']) {
$(zone).addEventListener('dragover', e => {
  const f = e.target.closest('[data-folder]');
  if (!f || f.dataset.folder === 'all' || !e.dataTransfer.types.includes('application/x-forge-cards')) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  $('.drop').forEach(x => x !== f && x.classList.remove('drop')); f.classList.add('drop');
});
$(zone).addEventListener('dragleave', e => { const f = e.target.closest('[data-folder]'); if (f && !f.contains(e.relatedTarget)) f.classList.remove('drop'); });
$(zone).addEventListener('drop', e => {
  const f = e.target.closest('[data-folder]'), data = e.dataTransfer.getData('application/x-forge-cards');
  $('.drop').forEach(x => x.classList.remove('drop'));
  if (!f || !data || f.dataset.folder === 'all') return;
  e.preventDefault(); e.stopPropagation(); addToFolder(data.split(','), f.dataset.folder);
});
}
$('#selbar').addEventListener('click', async e => {
  const b = e.target.closest('[data-sel]'); if (!b) return;
  const a = b.dataset.sel, uids = [...ui.picked], picked = P.cards.filter(c => ui.picked.has(c.uid));
  if (a === 'all') { for (const id of $('#selbar').dataset.visible.split(',').filter(Boolean)) ui.picked.add(id); }
  if (a === 'none') ui.picked.clear();
  if (a === 'addTo') { const id = await pickFolder(`Add ${uids.length} card${uids.length === 1 ? '' : 's'} to…`); if (id) return addToFolder(uids, id); }
  if (a === 'removeFrom') { for (const c of picked) c.folders = c.folders.filter(x => x !== ui.folder); ui.picked.clear(); save(); toast(`Removed ${picked.length} from “${folderName(ui.folder)}”`); }
  if (a === 'dup') { for (const c of picked) { const d = clone(c); d.uid = newId('c'); d.name += ' (copy)'; d.id = uniqueCardId(d.name, P.cards); d.autoId = true; P.cards.push(d); } save(); toast(`Duplicated ${picked.length}`); }
  if (a === 'export') return exportZip(picked, `${folderName(ui.folder)}-selection`);
  if (a === 'del' && await confirmAsk('Delete cards?', `Delete <b>${picked.length}</b> card${picked.length === 1 ? '' : 's'} for good? (A downloaded save file can bring them back.)`, 'Delete')) {
    P.cards = P.cards.filter(c => !ui.picked.has(c.uid)); ui.picked.clear(); save(); toast('Deleted');
  }
  renderLibrary();
});
$('#selectBtn').addEventListener('click', () => { ui.selecting = !ui.selecting; ui.picked.clear(); renderLibrary(); });
$('#folderActs').addEventListener('click', e => {
  const a = e.target.closest('[data-fact]')?.dataset.fact, f = P.folders.find(x => x.id === ui.folder); if (!a || !f) return;
  if (a === 'export') exportZip(P.cards.filter(c => c.folders.includes(f.id)), f.name);
  if (a === 'version') saveVersion(f.id);
  if (a === 'edit') editFolder(f.id);
});
// Zoom the card grid (slider, or Ctrl + scroll wheel over the cards).
function setZoom(px) { px = clamp(Math.round(px), 90, 320); document.documentElement.style.setProperty('--tile', px + 'px'); $('#zoom').value = px; lsSet('forge-zoom', px); }
$('#zoom').addEventListener('input', e => setZoom(+e.target.value));
$('#grid').addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(+$('#zoom').value * Math.exp(-e.deltaY * 0.002)); }, { passive: false });
setZoom(+(lsGet('forge-zoom') || (matchMedia('(max-width: 760px)').matches ? 104 : 150)));

// ---------------------------------------------------------------- editor: window layout
const ED = { swap: false, focus: false, bg: 0, w: 400 };
try { Object.assign(ED, JSON.parse(lsGet('forge-editor') || '{}')); } catch { }
const BACKDROPS = ['checker', 'dark', 'light', 'felt'];
function applyEditorLayout() {
  const e = $('#view-editor');
  e.classList.toggle('swap', !!ED.swap); e.classList.toggle('focus', !!ED.focus);
  $('#stage').dataset.bg = BACKDROPS[ED.bg % BACKDROPS.length];
  document.documentElement.style.setProperty('--insp-w', clamp(ED.w, 300, 720) + 'px');
  $('#focusBtn').setAttribute('aria-pressed', !!ED.focus); $('#focusBtn').title = ED.focus ? 'Show the side panel again' : 'Focus: hide the side panel';
  lsSet('forge-editor', JSON.stringify(ED));
}
$('#swapBtn').addEventListener('click', () => { ED.swap = !ED.swap; applyEditorLayout(); });
$('#bgBtn').addEventListener('click', () => { ED.bg = (ED.bg + 1) % BACKDROPS.length; applyEditorLayout(); toast('Backdrop: ' + BACKDROPS[ED.bg]); });
$('#focusBtn').addEventListener('click', () => { ED.focus = !ED.focus; applyEditorLayout(); });
$('#splitter').addEventListener('pointerdown', e => {
  e.preventDefault(); const sp = e.currentTarget; sp.setPointerCapture(e.pointerId);
  const box = $('#view-editor').getBoundingClientRect();
  const move = ev => { ED.w = ED.swap ? ev.clientX - box.left : box.right - ev.clientX; applyEditorLayout(); };
  sp.addEventListener('pointermove', move);
  sp.addEventListener('pointerup', () => sp.removeEventListener('pointermove', move), { once: true });
});
applyEditorLayout();

// ---------------------------------------------------------------- editor: history
let burst = false, burstT;
function snap() {
  const c = cur(); if (!c) return;
  if (!burst) { undoStack.push({ uid: c.uid, s: JSON.stringify(c) }); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; burst = true; }
  clearTimeout(burstT); burstT = setTimeout(() => burst = false, 650);
  updateUndoButtons();
}
function undoRedo(from, to) {
  const e = from.pop(); if (!e) return updateUndoButtons();
  const i = P.cards.findIndex(c => c.uid === e.uid); if (i < 0) return undoRedo(from, to);
  to.push({ uid: e.uid, s: JSON.stringify(P.cards[i]) });
  P.cards[i] = JSON.parse(e.s); burst = false;
  ui.cur = e.uid; if (!selLayer()) ui.sel = null;
  save(); if (ui.view === 'editor') renderEditor(); else setView('editor');
}
function updateUndoButtons() { $('#undoBtn').disabled = !undoStack.length; $('#redoBtn').disabled = !redoStack.length; }

// ---------------------------------------------------------------- editor: stage
const svg = $('#cardSvg');
function renderEditor() {
  const c = cur();
  for (const id of ['#prevCard', '#nextCard']) $(id).disabled = P.cards.length < 2;
  for (const b of $$('#toolstrip .btn')) b.disabled = !c;
  if (!c) {
    svg.innerHTML = ''; $('#edTitle').textContent = 'No card open'; $('#layerBar').innerHTML = ''; $('#checks').innerHTML = '';
    $('#inspector').innerHTML = `<div class="ed-empty"><p><b>No card to edit yet.</b></p><div class="btnrow" style="justify-content:center"><button class="btn primary" data-new="CHA">+ New Character</button><button class="btn primary alt" data-new="ACT">+ New Action</button><button class="btn" data-new="random">🎲 Surprise me</button></div></div>`;
    updateUndoButtons(); return;
  }
  renderStage(); renderInspector(); renderLayerBar(); renderChecks(); updateTitle(); updateUndoButtons();
}
function updateTitle() { const c = cur(); if (c) $('#edTitle').textContent = `#${P.cards.indexOf(c) + 1} ${c.name}`; }
function renderStage() {
  const c = cur(); if (!c) return;
  svg.innerHTML = cardInner(c, { project: P, index: P.cards.indexOf(c), uid: 'ed', href, sel: ui.sel, editing: true });
}
function updateLayerDOM(L) {
  const t = layerTransform(L);
  for (const g of svg.querySelectorAll(`[data-layer="${L.id}"],[data-ghost="${L.id}"]`)) g.setAttribute('transform', t);
  svg.querySelector(`[data-layer="${L.id}"]`)?.setAttribute('opacity', L.opacity ?? 1);
  const h = svg.querySelector('#handles'); if (h) h.innerHTML = handlesMarkup(L);
}
function select(id) { ui.sel = id; renderStage(); renderLayerBar(); if (ui.sec === 'layers') renderInspector(); }
function stepCard(d) { if (P.cards.length < 2) return; const i = P.cards.indexOf(cur()); ui.cur = P.cards[(i + d + P.cards.length) % P.cards.length].uid; ui.sel = null; renderEditor(); }

const pts = new Map(); let gest = null;
const toCard = e => { const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse()); return { x: p.x, y: p.y }; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
const normDeg = d => ((d + 540) % 360) - 180;
let editTap = null;
svg.addEventListener('pointerdown', e => {
  if (!cur() || e.button > 0) return;
  const hit = e.target.closest('[data-edit]');
  if (hit && !pts.size) { editTap = { key: hit.dataset.edit, x: e.clientX, y: e.clientY }; gest = null; return; }
  pts.set(e.pointerId, toCard(e)); try { svg.setPointerCapture(e.pointerId); } catch { }
  let L = selLayer();
  if (pts.size === 2 && L) {
    const [a, b] = [...pts.values()]; snap();
    gest = { mode: 'pinch', d0: Math.max(1, dist(a, b)), a0: ang(a, b), s0: L.scale, r0: L.rot || 0, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, x0: L.x, y0: L.y };
    return;
  }
  const h = e.target.closest('[data-handle]');
  if (h && L) {
    snap(); const p = pts.get(e.pointerId);
    gest = h.dataset.handle === 'rotate' ? { mode: 'rotate' } : { mode: 'scale', d0: Math.max(1, dist(L, p)), s0: L.scale };
    return;
  }
  const g = e.target.closest('[data-layer]');
  if (g) {
    if (ui.sel !== g.dataset.layer) select(g.dataset.layer);
    L = selLayer(); gest = { mode: 'move', p0: pts.get(e.pointerId), x0: L.x, y0: L.y, moved: false };
    return;
  }
  gest = null;
  if (ui.sel) select(null);
});
svg.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, toCard(e));
  const L = selLayer(); if (!gest || !L) return;
  const p = pts.get(e.pointerId);
  if (gest.mode === 'pinch') {
    if (pts.size < 2) return;
    const [a, b] = [...pts.values()], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    L.scale = clamp(gest.s0 * dist(a, b) / gest.d0, 0.05, 8);
    L.rot = normDeg(gest.r0 + ang(a, b) - gest.a0);
    L.x = gest.x0 + m.x - gest.m0.x; L.y = gest.y0 + m.y - gest.m0.y;
  } else if (gest.mode === 'move') {
    if (!gest.moved) { if (dist(p, gest.p0) < 3) return; snap(); gest.moved = true; }
    L.x = gest.x0 + p.x - gest.p0.x; L.y = gest.y0 + p.y - gest.p0.y;
    if (!e.altKey) { if (Math.abs(L.x - 250) < 6) L.x = 250; if (L.zone !== 'top' && Math.abs(L.y - 301) < 6) L.y = 301; } // soft snap to center
  } else if (gest.mode === 'scale') {
    L.scale = clamp(gest.s0 * dist(L, p) / gest.d0, 0.05, 8);
  } else if (gest.mode === 'rotate') {
    let r = ang(L, p) + 90;
    if (e.shiftKey) r = Math.round(r / 15) * 15; else if (Math.abs(normDeg(r)) < 4) r = 0;
    L.rot = normDeg(r);
  }
  updateLayerDOM(L); syncLayerBar(L);
});
const pointerEnd = e => {
  if (editTap) {
    const t = editTap; editTap = null;
    if (e.type === 'pointerup' && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10) { if (ui.sel) select(null); openInline(t.key); }
    return;
  }
  pts.delete(e.pointerId);
  if (gest?.mode === 'pinch' && pts.size < 2) { save(); gest = null; }
  if (!pts.size) { if (gest && (gest.mode !== 'move' || gest.moved)) save(); gest = null; }
};
svg.addEventListener('pointerup', pointerEnd);
svg.addEventListener('pointercancel', pointerEnd);
svg.addEventListener('wheel', e => {
  const L = selLayer(); if (!L) return;
  e.preventDefault(); snap();
  if (e.altKey || e.shiftKey) L.rot = normDeg((L.rot || 0) + (e.deltaY > 0 ? 3 : -3));
  else L.scale = clamp(L.scale * Math.exp(-e.deltaY * 0.0015), 0.05, 8);
  updateLayerDOM(L); syncLayerBar(L); save();
}, { passive: false });
svg.addEventListener('dblclick', e => { if (e.target.closest('[data-layer]') && selLayer()?.kind === 'text') $('#layerBar [data-lf="text"]')?.select(); });

// Type straight onto the card: an input is laid over the tapped region, sized to match.
function closeInline() { $('#stage .inline-edit')?.remove(); }
function openInline(key) {
  const c = cur(); if (!c || !EDIT_REGIONS[key]) return;
  closeInline();
  const [x, y, w, h] = EDIT_REGIONS[key], m = svg.getScreenCTM(), sr = $('#stage').getBoundingClientRect();
  const p1 = new DOMPoint(x, y).matrixTransform(m), p2 = new DOMPoint(x + w, y + h).matrixTransform(m), k = m.a;
  let el;
  if (key === 'origin') {
    el = document.createElement('select');
    el.innerHTML = c.type === 'CHA'
      ? P.brands.map(b => `<option ${b.name === c.origin ? 'selected' : ''}>${esc(b.name)}</option>`).join('') + '<option value="__new">＋ New brand…</option>'
      : ['direct', 'control'].map(f => `<option value="${f}" ${c.family === f ? 'selected' : ''}>${f.toUpperCase()} EFFECT</option>`).join('');
  } else if (key === 'text') {
    el = document.createElement('textarea');
    el.value = c.text; el.placeholder = 'Say what it does, e.g. “when this enters, deal 2 damage to an enemy”';
  } else {
    el = document.createElement('input');
    if (key === 'cost' || key === 'hp') { el.type = 'number'; el.inputMode = 'numeric'; el.min = LIMITS[key][0]; el.max = LIMITS[key][1]; }
    else { el.type = 'text'; el.maxLength = key === 'name' ? 40 : 28; }
    el.value = { name: c.name, cost: c.cost, hp: c.hp, banner: c.layout.banner || '' }[key] ?? '';
    if (key === 'banner') el.placeholder = c.type === 'CHA' ? TIMING_LABEL[c.timing] : 'ACT / RESOLVE & DISCARD';
  }
  const fontUnits = { name: 26, cost: 26, hp: 26, banner: 19, origin: 15, text: 18 }[key];
  const fs = Math.max(16, Math.round(fontUnits * k)), boxH = key === 'text' ? Math.max(p2.y - p1.y, 110) : Math.min(p2.y - p1.y, Math.max(44, fs * 1.9));
  el.className = 'inline-edit'; el.setAttribute('aria-label', 'Edit ' + key);
  Object.assign(el.style, { left: Math.max(4, p1.x - sr.left) + 'px', top: (p1.y - sr.top) + 'px', width: Math.max(p2.x - p1.x, key === 'cost' ? 90 : 140) + 'px', height: boxH + 'px', fontSize: fs + 'px' });
  let done = false;
  const finish = ok => { if (done) return; done = true; const v = el.value; el.remove(); if (ok) commitInline(key, v); };
  el.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    else if (ev.key === 'Enter' && (key !== 'text' || ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); finish(true); }
  });
  el.addEventListener('blur', () => finish(true));
  if (el.tagName === 'SELECT') el.addEventListener('change', () => finish(true));
  $('#stage').append(el); el.focus(); el.select?.();
}
async function commitInline(key, v) {
  const c = cur(); if (!c) return;
  if (key === 'name') return v.trim() && v.trim() !== c.name && apply('name', v.trim(), true);
  if (key === 'cost' || key === 'hp') { const n = clamp(Math.round(+v || 0), ...LIMITS[key]); return n !== c[key] && apply(key, n, true); }
  if (key === 'banner') return apply('layout.banner', v.trim(), true);
  if (key === 'origin') {
    if (c.type === 'ACT') return apply('family', v, true);
    if (v === '__new') { const n = await promptText('New brand', 'Brand name'); if (n && addBrand(n)) apply('origin', n, true); return; }
    return apply('origin', v, true);
  }
  if (key === 'text') {
    const t = v.trim(); if (t === c.text) return;
    snap();
    if (!t) { c.textMode = 'auto'; normalize(c); }
    else {
      // Keep their wording, and if it reads as a known effect, make the game do that too.
      const r = parseAbility(t, c.type);
      if (r) {
        if (c.type === 'CHA') { c.timing = r.timing; if (r.passive) c.passive = r.passive; else if (r.timing !== 'passive') delete c.passive; }
        if (r.effect) c.effect = r.effect; else if (c.type === 'CHA') delete c.effect;
        if (r.abilityCost != null) c.abilityCost = r.abilityCost;
      }
      c.textMode = 'custom'; c.text = t; normalize(c);
      if (c.text === autoText(c)) c.textMode = 'auto';
      toast(r ? '✨ Saved. The game reads it as: ' + autoText(c) : "Saved your wording. The game effect didn't change — check the Ability tab.", !r);
    }
    renderStage(); renderInspector(); renderChecks(); save();
  }
}

// ---------------------------------------------------------------- editor: layers
const layerName = L => L.kind === 'logo' ? 'Brand logo' : L.kind === 'image' ? (L.name || 'Image') : L.kind === 'text' ? `“${L.text}”` : SHAPE_LABELS[L.shape] || 'Shape';
const layerIcon = L => L.kind === 'logo' ? '<span class="thumb">🏷</span>' : L.kind === 'image' ? `<img class="thumb" src="${href(L.asset)}" alt="">` : L.kind === 'text' ? '<span class="thumb">T</span>' : `<span class="thumb">${shapeIcon(L.shape, L.fill, 22)}</span>`;
function renderLayerBar() {
  const L = selLayer(), bar = $('#layerBar');
  if (!cur()) { bar.innerHTML = ''; return; }
  if (!L) { bar.innerHTML = `<span class="hint">✎ <b>Tap any text on the card</b> (name, cost, HP, banner, rules) to type into it. 👆 Tap art or a sticker to grab it: drag to move · white corners resize · yellow dot spins · pinch or scroll-wheel works too.</span>`; return; }
  const fontOpts = FONTS.map(f => `<option ${L.font === f ? 'selected' : ''}>${f}</option>`).join('');
  bar.innerHTML = `
  <div class="row"><b>${esc(layerName(L).slice(0, 26))}</b><span class="spacer"></span>
    <button class="btn small" data-la="zone" title="Clip inside the art window, or float over the whole card">${L.zone === 'top' ? '⬆ Over card' : '🖼 In art window'}</button>
    <button class="btn small" data-la="flip" title="Mirror">⇋</button>
    <button class="btn small" data-la="back" title="Send backward">▼</button><button class="btn small" data-la="front" title="Bring forward">▲</button>
    <button class="btn small" data-la="dup" title="Duplicate">⧉</button><button class="btn small danger-btn" data-la="del" title="Delete">🗑</button>
    <button class="btn small primary" data-la="done">Done</button></div>
  ${L.kind === 'text' ? `<div class="row"><input type="text" data-lf="text" value="${esc(L.text)}" maxlength="40" aria-label="Sticker text">
    <label>Color <input type="color" data-lf="color" value="${esc(L.color)}"></label>
    <label><input type="checkbox" data-lf="hasStroke" ${L.stroke ? 'checked' : ''}> Outline</label><input type="color" data-lf="stroke" value="${esc(L.stroke || '#171724')}" aria-label="Outline color">
    <select data-lf="font" aria-label="Font" style="width:auto">${fontOpts}</select>
    <label><input type="checkbox" data-lf="hasFill2" ${L.fill2 ? 'checked' : ''}> Gradient</label><input type="color" data-lf="fill2" value="${esc(L.fill2 || '#ceacff')}" aria-label="Gradient end color"></div>` : ''}
  ${L.kind === 'image' ? `<div class="row"><label>Mask <select data-lf="mask" style="width:auto">${Object.entries(MASKS).map(([k, v]) => `<option value="${k}" ${(L.mask || 'none') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><span class="hint">Crops the picture into a shape. It always stays inside the card.</span></div>` : ''}
  ${L.kind === 'logo' ? `<div class="row"><span class="hint">Shows this card's brand logo. Upload logos in the Brands tab. Use <b>Fade</b> to make it a watermark.</span></div>` : ''}
  ${L.kind === 'shape' ? `<div class="row"><select data-lf="shape" aria-label="Shape" style="width:auto">${Object.keys(SHAPES).map(s => `<option value="${s}" ${L.shape === s ? 'selected' : ''}>${SHAPE_LABELS[s]}</option>`).join('')}</select>
    <label>Fill <input type="color" data-lf="fill" value="${esc(L.fill)}"></label>
    <label><input type="checkbox" data-lf="hasStroke" ${L.stroke ? 'checked' : ''}> Outline</label><input type="color" data-lf="stroke" value="${esc(L.stroke || '#171724')}" aria-label="Outline color">
    <label><input type="checkbox" data-lf="hasFill2" ${L.fill2 ? 'checked' : ''}> Gradient</label><input type="color" data-lf="fill2" value="${esc(L.fill2 || '#ceacff')}" aria-label="Gradient end color"></div>` : ''}
  <label class="slider">Size <input type="range" data-lf="scale" min="0.05" max="4" step="0.01" value="${L.scale}"></label>
  <label class="slider">Spin <input type="range" data-lf="rot" min="-180" max="180" step="1" value="${L.rot || 0}"></label>
  <label class="slider">Fade <input type="range" data-lf="opacity" min="0.05" max="1" step="0.01" value="${L.opacity ?? 1}"></label>`;
}
function syncLayerBar(L) {
  const s = $('#layerBar [data-lf="scale"]'), r = $('#layerBar [data-lf="rot"]');
  if (s) s.value = L.scale; if (r) r.value = L.rot || 0;
}
$('#layerBar').addEventListener('input', e => {
  const L = selLayer(), el = e.target, k = el.dataset.lf; if (!L || !k) return;
  snap();
  if (k === 'hasStroke') L.stroke = el.checked ? ($('#layerBar [data-lf="stroke"]').value || '#171724') : '';
  else if (k === 'stroke') { L.stroke = el.value; const cb = $('#layerBar [data-lf="hasStroke"]'); if (cb) cb.checked = true; }
  else if (k === 'hasFill2') L.fill2 = el.checked ? ($('#layerBar [data-lf="fill2"]').value || '#ceacff') : '';
  else if (k === 'fill2') { L.fill2 = el.value; const cb = $('#layerBar [data-lf="hasFill2"]'); if (cb) cb.checked = true; }
  else if (['scale', 'rot', 'opacity'].includes(k)) { L[k] = +el.value; updateLayerDOM(L); save(); return; }
  else L[k] = el.value;
  renderStage(); save();
  if (k === 'text' && ui.sec === 'layers') renderInspector();
});
$('#layerBar').addEventListener('click', e => { const b = e.target.closest('[data-la]'); if (b) layerAction(b.dataset.la); });
function layerAction(a, id = ui.sel) {
  const c = cur(); if (!c) return;
  const layers = c.layout.layers, i = layers.findIndex(l => l.id === id), L = layers[i]; if (!L) return;
  if (a === 'done') return select(null);
  snap();
  if (a === 'zone') L.zone = L.zone === 'top' ? 'art' : 'top';
  if (a === 'flip') L.flip = !L.flip;
  if (a === 'hide') L.hidden = !L.hidden;
  if (a === 'front' && i < layers.length - 1) layers.splice(i + 1, 0, layers.splice(i, 1)[0]);
  if (a === 'back' && i > 0) layers.splice(i - 1, 0, layers.splice(i, 1)[0]);
  if (a === 'dup') { const d = { ...clone(L), id: newId(), x: L.x + 20, y: L.y + 20 }; layers.splice(i + 1, 0, d); ui.sel = d.id; }
  if (a === 'del') { layers.splice(i, 1); if (ui.sel === id) ui.sel = null; toast('Layer deleted — Ctrl+Z / ↶ brings it back'); }
  renderStage(); renderLayerBar(); if (ui.sec === 'layers' || ui.sec === 'design') renderInspector(); save();
}
function addLayer(L) {
  const c = cur(); if (!c) return toast('Make or open a card first.', true);
  snap(); c.layout.layers.push({ id: newId(), scale: 1, rot: 0, opacity: 1, ...L });
  select(c.layout.layers.at(-1).id); if (ui.sec === 'layers') renderInspector(); save();
}
async function fileToAsset(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const nw = img.naturalWidth || 512, nh = img.naturalHeight || 512, k = Math.min(1, 1400 / Math.max(nw, nh));
    const cv = document.createElement('canvas'); cv.width = Math.round(nw * k); cv.height = Math.round(nh * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const id = newId('a'); P.assets[id] = cv.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9);
    return { id, w: cv.width, h: cv.height };
  } finally { URL.revokeObjectURL(url); }
}
async function addImageLayer(file) {
  if (!cur()) return toast('Make or open a card first, then add art to it.', true);
  try {
    const a = await fileToAsset(file), ar = a.w / a.h;
    // Start by covering the art window; the player can shrink it or float it over the card.
    const [w, h] = ar > 450 / 188 ? [188 * ar, 188] : [450, 450 / ar];
    addLayer({ kind: 'image', asset: a.id, w, h, x: 250, y: 301, zone: 'art', name: file.name?.replace(/\.[^.]+$/, '').slice(0, 24) || 'Image' });
    toast('🖼 Image added — drag it around!');
  } catch (e) { console.error(e); toast("That image couldn't be read.", true); }
}
async function stickerPicker() {
  if (!cur()) return toast('Make or open a card first.', true);
  const shapeBtns = ['burst', 'star5', 'star8', 'heart', 'circle', 'diamond', 'hexagon', 'triangle'].map((s, i) => {
    const fill = ['#ffda52', '#ff9ba7', '#ceacff', '#ff5a5a', '#89e4d7', '#aff57e', '#89d6ff', '#ffcc33'][i];
    return `<button value="shape:${s}:${fill}"><svg viewBox="0 0 120 120">${shapeMarkup(s, 60, 60, 50, fill, 1, '#171724', 5)}</svg>${SHAPE_LABELS[s]}</button>`;
  }).join('');
  const textBtns = TEXT_STICKERS.map(([t, col]) => `<button value="text:${t}:${col}"><svg viewBox="0 0 120 120"><text x="60" y="72" text-anchor="middle" font-family="Impact, Arial" font-weight="800" font-size="${t.length > 4 ? 20 : 34}" fill="${col}" stroke="#171724" stroke-width="5" paint-order="stroke">${t}</text></svg>${t}</button>`).join('');
  const v = await ask({ title: '⭐ Add a sticker', body: `<div class="sticker-grid">${shapeBtns}${textBtns}</div>`, buttons: [{ label: 'Cancel', value: '' }] });
  if (!v) return;
  const [kind, a, b] = v.split(':');
  if (kind === 'shape') addLayer({ kind: 'shape', shape: a, fill: b, stroke: '#171724', x: 395, y: 250, zone: 'top', scale: 0.8 });
  else addLayer({ kind: 'text', text: a, color: b, stroke: '#171724', font: 'Impact', size: 44, x: 360, y: 250, zone: 'top', rot: -10 });
}
function addLogo() {
  const c = cur(); if (!c) return toast('Make or open a card first.', true);
  if (c.type === 'CHA' && !P.brands.find(b => b.name === c.origin)?.logo) toast('Tip: upload a logo for this brand in the Brands tab. Until then it shows the brand shape.');
  addLayer({ kind: 'logo', x: 250, y: 301, zone: 'top', scale: 1.2, opacity: 0.35 });
}
function addText() { addLayer({ kind: 'text', text: 'Your text', color: '#ffffff', stroke: '#171724', font: 'Impact', size: 40, x: 250, y: 301, zone: 'top' }); }

// ---------------------------------------------------------------- editor: inspector
const segBtn = (f, v, label, curV) => `<button type="button" data-f="${f}" data-v="${esc(v)}" aria-pressed="${String(curV) === String(v)}">${label}</button>`;
const stepper = (f, v, label) => `<div class="stepper" role="group" aria-label="${label}"><button type="button" data-f="${f}" data-step="-1" aria-label="less">−</button><output>${v ?? 0}</output><button type="button" data-f="${f}" data-step="1" aria-label="more">+</button></div>`;
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
function setPath(o, p, v) { const ks = p.split('.'), last = ks.pop(); const t = ks.reduce((a, k) => a[k] ||= {}, o); t[last] = v; }
const compatible = (host, b) => b.type === 'CHA' && host.type === 'CHA' && host !== b && ((host.origin !== 'Unassigned' && host.origin === b.origin) || (host.partners || []).some(p => p === b.name || p === b.origin || (b.tags || []).includes(p)));

function renderInspector() {
  const c = cur(); if (!c) return;
  for (const b of $$('#sectabs button')) b.setAttribute('aria-selected', b.dataset.sec === ui.sec);
  const body = $('#inspector'), top = body.scrollTop;
  body.innerHTML = ({ stats: secStats, brand: secBrand, ability: secAbility, design: secDesign, layers: secLayers })[ui.sec](c);
  body.scrollTop = top;
}
function secStats(c) {
  return `
  <div class="field"><label for="fName">Card name</label><div class="inline"><input type="text" id="fName" data-f="name" value="${esc(c.name)}" maxlength="40"><button class="btn" data-act="randName" title="Random name">🎲</button></div></div>
  <div class="field"><span class="lbl">Card type</span><div class="seg wide">${segBtn('type', 'CHA', 'Character', c.type)}${segBtn('type', 'ACT', 'Action', c.type)}</div></div>
  ${c.type === 'CHA' ? `
    <div class="field"><span class="lbl">Tier</span><div class="seg wide">${['low', 'mid', 'high'].map(t => segBtn('tier', t, cap(t), c.tier)).join('')}</div></div>
    <div class="field"><label style="text-transform:none;font-size:13px;color:inherit"><input type="checkbox" data-f="edgelord" ${c.edgelord ? 'checked' : ''}> <b>EXE</b> — Edgelord summon</label></div>`
    : `<div class="field"><span class="lbl">Action family</span><div class="seg wide">${segBtn('family', 'direct', '▲ Direct', c.family)}${segBtn('family', 'control', '⬢ Control', c.family)}</div></div>`}
  <div class="two"><div class="field"><span class="lbl">Cost (SP)</span>${stepper('cost', c.cost, 'Cost')}</div>
  ${c.type === 'CHA' ? `<div class="field"><span class="lbl">HP</span>${stepper('hp', c.hp, 'HP')}</div>` : ''}</div>
  <div class="field"><span class="lbl">Folders</span><div class="chips">${P.folders.map(f => `<button type="button" class="chip" data-folder-toggle="${f.id}" aria-pressed="${c.folders.includes(f.id)}">${f.icon} ${esc(f.name)}</button>`).join('')}<button type="button" class="chip" data-act="newFolder">＋ New folder</button></div></div>
  <div class="field"><label for="fFlavor">Flavor text</label><textarea id="fFlavor" data-f="flavor" rows="2" maxlength="140" placeholder="A funny one-liner (optional)">${esc(c.flavor || '')}</textarea></div>
  <div class="field"><label for="fArtist">Art credit</label><input type="text" id="fArtist" data-f="artist" value="${esc(c.artist || '')}" maxlength="40" placeholder="Who made the art?"></div>
  <div class="field"><label for="fNote">Designer notes</label><textarea id="fNote" data-f="note" rows="2" placeholder="For collaborators — exported with the data, never printed">${esc(c.note || '')}</textarea></div>
  <div class="field"><label for="fFile">Export file name</label><input type="text" id="fFile" data-f="fileName" value="${esc(c.fileName || '')}" maxlength="40" placeholder="${esc(c.id)}"><div class="help">Used for this card's PNG files. Blank = the card ID.</div></div>
  <div class="field"><label for="fId">Card ID</label><input type="text" id="fId" data-f="id" value="${esc(c.id)}" maxlength="28"><div class="help">The game's internal key. Follows the name until you edit it.</div></div>
  <div class="btnrow"><button class="btn" data-act="dup">⧉ Duplicate</button><button class="btn" data-act="moveUp">◀ Earlier</button><button class="btn" data-act="moveDown">Later ▶</button><button class="btn danger-btn" data-act="del">🗑 Delete</button></div>`;
}
function secBrand(c) {
  if (c.type === 'ACT') return `<p class="muted">Actions don't belong to a brand — their family sets the icon (▲ direct, ⬢ control). Switch to <b>Character</b> in Stats to pick a brand.</p>`;
  const chips = (field, list) => list.length ? `<div class="chips">${list.map(t => `<button type="button" class="chip" data-list="${field}" data-item="${esc(t)}" aria-pressed="${(c[field] || []).includes(t)}">${esc(t)}</button>`).join('')}</div>` : '<p class="help">None yet — add one below.</p>';
  const partnerPool = [...new Set([...P.tags, ...(c.partners || [])])];
  const backers = P.cards.filter(o => compatible(c, o)), hosts = P.cards.filter(o => compatible(o, c));
  const names = l => l.length ? l.slice(0, 6).map(o => esc(o.name)).join(', ') + (l.length > 6 ? ` +${l.length - 6} more` : '') : 'none yet';
  return `
  <div class="field"><span class="lbl">Brand (Origin)</span>
    <div class="brand-tiles">${P.brands.map(b => `<button type="button" class="brand-tile" data-brand="${esc(b.name)}" aria-pressed="${c.origin === b.name}">${shapeIcon(b.shape, b.color || 'currentColor', 30)}<span>${esc(b.name)}</span></button>`).join('')}
    <button type="button" class="brand-tile" data-act="newBrand"><span style="font-size:22px">＋</span><span>New brand</span></button></div></div>
  <div class="field"><span class="lbl">Allegiances — what this card <i>is</i></span>${chips('tags', P.tags)}</div>
  <div class="field"><span class="lbl">Partners — who can Backup this card</span>${chips('partners', partnerPool)}
    <div class="help">Same-brand characters can always Backup each other (except Unassigned).</div></div>
  <div class="field"><div class="inline"><input type="text" id="newTagIn" placeholder="New allegiance, e.g. Gamers" maxlength="24"><button class="btn" data-act="newTag">＋ Add</button></div></div>
  <div class="idea"><b>🤝 Backup matchmaking</b><div class="small" style="margin-top:4px">Can be backed up by (${backers.length}): ${names(backers)}<br>Can back up (${hosts.length}): ${names(hosts)}</div></div>`;
}
function secAbility(c) {
  const e = c.effect, spec = e && EFFECTS[e.kind];
  const needsEffect = c.type === 'ACT' || c.timing === 'entry' || c.timing === 'activated';
  return `
  <div class="idea field"><span class="lbl">✨ Say it in plain English</span>
    <div class="inline"><input type="text" id="ideaIn" placeholder="e.g. when this enters, deal 2 damage to an enemy" maxlength="160"><button class="btn primary" data-act="interpret">Interpret</button></div>
    <div class="help">Maps your words onto the game's effects. If it can't, it saves the idea to Designer notes so the team can add it.</div></div>
  ${c.type === 'CHA' ? `<div class="field"><span class="lbl">Trigger</span><div class="seg wide" style="flex-direction:column">${Object.entries(TIMINGS).map(([k, v]) => segBtn('timing', k, v, c.timing)).join('')}</div></div>` : ''}
  ${needsEffect && e ? `
    <div class="field"><label for="fKind">Effect</label><select id="fKind" data-f="effect.kind">${Object.entries(EFFECTS).map(([k, v]) => `<option value="${k}" ${e.kind === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
    <div class="field"><span class="lbl">Target</span><div class="seg wide">${spec.targets.map(t => segBtn('effect.target', t, TARGET_LABELS[t], e.target)).join('')}</div></div>
    <div class="two">${spec.amount ? `<div class="field"><span class="lbl">Amount</span>${stepper('effect.amount', e.amount, 'Amount')}</div>` : ''}
    ${c.timing === 'activated' ? `<div class="field"><span class="lbl">Ability cost (SP)</span>${stepper('abilityCost', c.abilityCost, 'Ability cost')}</div>` : ''}</div>` : ''}
  ${c.type === 'CHA' ? `<div class="field"><label for="fPassive">Passive trait</label><select id="fPassive" data-f="passive">${Object.entries(PASSIVES).map(([k, v]) => `<option value="${k}" ${(c.passive || '') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    ${c.passive === 'effectWard' ? `<div class="field"><span class="lbl">Ward amount</span>${stepper('ward', c.ward, 'Ward')}</div>` : ''}` : ''}
  <div class="field"><span class="lbl">Rules text</span><div class="seg wide" style="margin-bottom:6px">${segBtn('textMode', 'auto', '⚙ Auto from effect', c.textMode)}${segBtn('textMode', 'custom', '✍ Write my own', c.textMode)}</div>
    <textarea data-f="text" rows="3" ${c.textMode === 'auto' ? 'readonly' : ''}>${esc(c.text)}</textarea>
    <div class="help">${c.textMode === 'auto' ? 'Written for you from the effect, so text and gameplay always agree.' : 'Your wording is printed; the game still runs the effect above.'}</div></div>
  <div class="field"><label for="fBanner">Banner words <span class="muted">(looks only — the category stays ${esc(TRIGGERS[triggerOf(c)].label)})</span></label><input type="text" id="fBanner" data-f="layout.banner" value="${esc(c.layout.banner || '')}" maxlength="28" placeholder="${esc(c.type === 'CHA' ? TIMING_LABEL[c.timing] : 'ACT / RESOLVE & DISCARD')}"></div>`;
}
const GRAD_DEFAULT = { accent: '#ceacff', paper: '#ffe7c2', border: '#3b1060' };
const gradToggle = (f, v2) => `<label class="inline small"><input type="checkbox" data-grad="${f}" ${v2 ? 'checked' : ''}> fade to</label>${v2 ? `<input type="color" data-f="layout.${f}2" value="${esc(v2)}" aria-label="${f} gradient end">` : ''}`;
function secDesign(c) {
  const L = c.layout, color = (f, label, v) => `<label class="inline" style="gap:6px"><input type="color" data-f="layout.${f}" value="${esc(v)}"> ${label}</label>`;
  return `
  <div class="field"><span class="lbl">Style presets</span><div class="chips">${Object.keys(PRESETS).map(p => `<button type="button" class="chip" data-preset="${p}">${p}</button>`).join('')}</div></div>
  <div class="field"><span class="lbl">Colors &amp; gradients</span>
    <div class="grad-row"><span class="gl">Header</span><input type="color" data-f="layout.accent" value="${esc(accentFor(c))}" aria-label="Header color">
      <label class="inline small"><input type="checkbox" data-act="autoAccent" ${!L.accent ? 'checked' : ''}> auto by tier</label>${gradToggle('accent', L.accent2)}</div>
    <div class="grad-row"><span class="gl">Paper</span><input type="color" data-f="layout.paper" value="${esc(L.paper)}" aria-label="Paper color">${gradToggle('paper', L.paper2)}</div>
    <div class="grad-row"><span class="gl">Border</span><input type="color" data-f="layout.border" value="${esc(L.border)}" aria-label="Border color">${gradToggle('border', L.border2)}</div>
    ${L.accent2 || L.paper2 || L.border2 ? `<label class="slider inline small" style="margin-top:6px">Gradient angle <input type="range" data-f="layout.gradAngle" min="0" max="360" step="5" value="${L.gradAngle ?? 90}"></label>` : ''}
    <div class="two" style="margin-top:8px">${color('ink', 'Ink', L.ink)}${color('sub', 'Small print', L.sub)}</div></div>
  <div class="field"><span class="lbl">✨ Holographic finish</span><div class="seg wide">${segBtn('layout.holo', 'auto', 'Auto (EXE cards)', L.holo || 'auto')}${segBtn('layout.holo', 'on', 'Always', L.holo)}${segBtn('layout.holo', 'off', 'Off', L.holo)}</div>
    <div class="help">Rainbow foil + shine. Edgelord (EXE) cards get it automatically.</div></div>
  <div class="field"><label for="fFont">Font</label><select id="fFont" data-f="layout.font">${FONTS.map(f => `<option ${L.font === f ? 'selected' : ''} style="font-family:'${f}'">${f}</option>`).join('')}</select></div>
  <div class="field"><label class="inline" style="text-transform:none;font-size:13px;color:inherit"><input type="checkbox" data-f="layout.grid" ${L.grid !== false ? 'checked' : ''}> Grid lines in the art window</label>
  <label class="inline" style="text-transform:none;font-size:13px;color:inherit;margin-top:6px"><input type="checkbox" data-f="layout.placeholder" ${L.placeholder !== false ? 'checked' : ''}> Brand placeholder when there's no art</label>
  <label class="inline" style="text-transform:none;font-size:13px;color:inherit;margin-top:6px"><input type="checkbox" data-f="layout.badge" ${L.badge !== false ? 'checked' : ''}> Brand logo badge (when the brand has a logo)</label>
  ${L.badge !== false ? `<label class="slider inline small" style="margin-top:6px">Badge see-through <input type="range" data-f="layout.badgeOpacity" min="0.1" max="1" step="0.05" value="${L.badgeOpacity ?? 1}"></label>` : ''}</div>
  <div class="field"><span class="lbl">Art &amp; stickers</span><div class="btnrow"><button class="btn" data-act="addImg">🖼 Add image</button><button class="btn" data-act="addText">T Add text</button><button class="btn" data-act="addSticker">⭐ Sticker</button><button class="btn" data-act="addLogo">🏷 Brand logo</button></div></div>
  <div class="btnrow"><button class="btn" data-act="copyStyle">Apply this style to all cards of this brand</button><button class="btn danger-btn" data-act="resetDesign">Reset design</button></div>`;
}
function secLayers(c) {
  const ls = c.layout.layers;
  return `<div class="btnrow field"><button class="btn" data-act="addImg">🖼 Image</button><button class="btn" data-act="addText">T Text</button><button class="btn" data-act="addSticker">⭐ Sticker</button><button class="btn" data-act="addLogo">🏷 Logo</button></div>
  ${ls.length ? `<div class="layer-rows">${[...ls].reverse().map(L => `<div class="layer-row ${ui.sel === L.id ? 'on' : ''}">${layerIcon(L)}
    <button class="nm" data-pick="${L.id}">${esc(layerName(L))}</button><span class="zone">${L.zone === 'top' ? 'OVER' : 'ART'}</span>
    <button class="btn small" data-lact="hide" data-id="${L.id}" title="${L.hidden ? 'Show' : 'Hide'}">${L.hidden ? '🙈' : '👁'}</button>
    <button class="btn small" data-lact="front" data-id="${L.id}" title="Up">▲</button><button class="btn small" data-lact="back" data-id="${L.id}" title="Down">▼</button>
    <button class="btn small danger-btn" data-lact="del" data-id="${L.id}" title="Delete">🗑</button></div>`).join('')}</div>
    <p class="help">Top of the list draws on top. <b>ART</b> layers are clipped to the art window; <b>OVER</b> layers float over the whole card.</p>`
    : `<p class="muted">No layers yet. Add your art, then drag it into place. Tip: you can also drop or paste an image straight onto the card.</p>`}`;
}
function renderChecks() {
  const c = cur(); if (!c) return;
  const v = validate(c, P), ic = { error: '❌', warn: '⚠️', tip: '💡' };
  $('#checks').innerHTML = v.length ? `<ul>${v.map(([lvl, m]) => `<li class="${lvl}">${ic[lvl]} ${esc(m)}</li>`).join('')}</ul>` : `<div class="ok">✅ All good. Ready to FIGHT.</div>`;
}

const STRUCTURAL = new Set(['type', 'timing', 'effect.kind', 'passive', 'textMode', 'tier', 'family', 'edgelord', 'layout.accent', 'layout.font']);
function apply(path, value, rerender) {
  const c = cur(); if (!c) return;
  snap();
  if (path === 'id') { c.id = uniqueCardId(value || c.name, P.cards, c); c.autoId = false; }
  else setPath(c, path, value);
  if (path === 'name' && c.autoId) c.id = uniqueCardId(c.name, P.cards, c);
  if (path === 'textMode' && value === 'custom' && !c.text) c.text = autoText(c);
  normalize(c);
  renderStage(); renderChecks(); updateTitle(); save();
  if (rerender || STRUCTURAL.has(path)) renderInspector();
  else if (c.textMode === 'auto') { const t = $('#inspector textarea[data-f="text"]'); if (t) t.value = c.text; }
}
const inspector = $('#inspector');
inspector.addEventListener('click', async e => {
  const nb = e.target.closest('[data-new]'); if (nb) return newFromButton(nb.dataset.new);
  const b = e.target.closest('button,[data-act]'); if (!b) return;
  const c = cur(); if (!c) return;
  if (b.dataset.step) {
    const f = b.dataset.f, lim = LIMITS[f.split('.').pop()] || [0, 99];
    return apply(f, clamp((getPath(c, f) ?? 0) + +b.dataset.step, ...lim), true);
  }
  if (b.dataset.f && b.dataset.v !== undefined) return apply(b.dataset.f, b.dataset.v, true);
  if (b.dataset.list) {
    const list = [...(c[b.dataset.list] || [])], i = list.indexOf(b.dataset.item);
    i >= 0 ? list.splice(i, 1) : list.push(b.dataset.item);
    return apply(b.dataset.list, list, true);
  }
  if (b.dataset.folderToggle) {
    const id = b.dataset.folderToggle, list = c.folders.includes(id) ? c.folders.filter(x => x !== id) : [...c.folders, id];
    return apply('folders', list, true);
  }
  if (b.dataset.brand) return apply('origin', b.dataset.brand, true);
  if (b.dataset.preset) { snap(); Object.assign(c.layout, PRESETS[b.dataset.preset]); renderStage(); renderInspector(); save(); return toast(`Style: ${b.dataset.preset}`); }
  if (b.dataset.pick) return select(b.dataset.pick);
  if (b.dataset.lact) return layerAction(b.dataset.lact, b.dataset.id);
  const act = b.dataset.act; if (!act || b.type === 'checkbox') return;
  if (act === 'randName') apply('name', randomName(c.type), true);
  if (act === 'dup') { const d = clone(c); d.name = c.name + ' (copy)'; d.id = uniqueCardId(d.name, P.cards); d.autoId = true; addCard(d); d.folders = [...c.folders]; toast('Duplicated'); }
  if (act === 'moveUp' || act === 'moveDown') {
    const i = P.cards.indexOf(c), j = act === 'moveUp' ? i - 1 : i + 1;
    if (j >= 0 && j < P.cards.length) { [P.cards[i], P.cards[j]] = [P.cards[j], P.cards[i]]; renderStage(); updateTitle(); save(); }
  }
  if (act === 'del' && await confirmAsk('Delete card?', `Delete <b>${esc(c.name)}</b> for good? (A downloaded save file can bring it back.)`, 'Delete')) {
    const i = P.cards.indexOf(c); P.cards.splice(i, 1); ui.cur = P.cards[Math.max(0, i - 1)]?.uid; ui.sel = null; save();
    renderEditor(); toast('Card deleted');
  }
  if (act === 'newFolder') { const f = await createFolder(); if (f) apply('folders', [...c.folders, f.id], true); }
  if (act === 'newBrand') { const n = await promptText('New brand', 'Brand name (e.g. "Snackforce 2000")'); if (n && addBrand(n)) apply('origin', n, true); }
  if (act === 'newTag') { const n = $('#newTagIn').value.trim(); if (n) { if (!P.tags.includes(n)) P.tags.push(n); apply('tags', [...new Set([...(c.tags || []), n])], true); } }
  if (act === 'interpret') interpret();
  if (act === 'addImg') $('#imgPick').click();
  if (act === 'addText') addText();
  if (act === 'addLogo') addLogo();
  if (act === 'addSticker') stickerPicker();
  if (act === 'resetDesign' && await confirmAsk('Reset design?', 'Colors, font and banner go back to default. Your layers are kept.')) { snap(); c.layout = { ...defaultLayout(), layers: c.layout.layers }; renderStage(); renderInspector(); save(); }
  if (act === 'copyStyle') {
    const same = P.cards.filter(o => o !== c && (c.type === 'ACT' ? o.type === 'ACT' : o.origin === c.origin));
    if (!same.length) return toast('No other cards share this brand yet.');
    if (await confirmAsk('Share this style?', `Copy colors and font to ${same.length} other ${c.type === 'ACT' ? 'Action' : esc(c.origin)} card(s)? Art layers stay put.`, 'Apply')) {
      for (const o of same) Object.assign(o.layout, { accent: c.layout.accent, paper: c.layout.paper, ink: c.layout.ink, sub: c.layout.sub, border: c.layout.border, font: c.layout.font, grid: c.layout.grid });
      save(); toast(`Styled ${same.length} cards`);
    }
  }
});
inspector.addEventListener('input', e => {
  const el = e.target; if (!el.dataset.f || el.type === 'checkbox' || el.tagName === 'SELECT' || el.dataset.f === 'id') return;
  if (el.dataset.f === 'text' && cur().textMode === 'auto') return;
  apply(el.dataset.f, el.type === 'range' ? +el.value : el.value, false);
});
inspector.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.grad) { snap(); const k = el.dataset.grad + '2'; cur().layout[k] = el.checked ? GRAD_DEFAULT[el.dataset.grad] : ''; renderStage(); renderInspector(); save(); return; }
  if (el.dataset.act === 'autoAccent') { snap(); cur().layout.accent = el.checked ? '' : accentFor(cur()); renderStage(); renderInspector(); save(); return; }
  if (!el.dataset.f) return;
  if (el.type === 'checkbox') apply(el.dataset.f, el.checked, true);
  else if (el.tagName === 'SELECT') apply(el.dataset.f, el.value, true);
  else if (el.dataset.f === 'id') apply('id', el.value, true);
});
inspector.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'ideaIn') interpret();
  if (e.target.id === 'newTagIn') inspector.querySelector('[data-act="newTag"]').click();
});
function interpret() {
  const c = cur(), text = $('#ideaIn').value.trim(); if (!c || !text) return;
  const r = parseAbility(text, c.type);
  snap();
  if (!r) {
    c.note = [c.note, 'IDEA (needs a new effect type): ' + text].filter(Boolean).join('\n');
    renderInspector(); save();
    return toast("🤔 That doesn't match a game effect yet — saved to Designer notes as an idea.", true);
  }
  if (c.type === 'CHA') { c.timing = r.timing; if (r.passive) c.passive = r.passive; else if (r.timing !== 'passive') delete c.passive; }
  if (r.effect) c.effect = r.effect; else if (c.type === 'CHA') delete c.effect;
  if (r.abilityCost != null) c.abilityCost = r.abilityCost;
  c.textMode = 'auto'; normalize(c);
  renderStage(); renderInspector(); renderChecks(); save();
  toast('✨ Got it: ' + c.text);
}
$('#sectabs').addEventListener('click', e => { const b = e.target.closest('[data-sec]'); if (b && cur()) { ui.sec = b.dataset.sec; renderInspector(); } });

// ---------------------------------------------------------------- brands view
function addBrand(name) {
  if (P.brands.some(b => b.name.toLowerCase() === name.toLowerCase())) { toast('That brand already exists.', true); return false; }
  const used = new Set(P.brands.map(b => b.shape)), shape = Object.keys(SHAPES).find(s => !used.has(s)) || 'circle';
  P.brands.push({ name, shape, color: '' }); save(); return true;
}
// Brand logos: transparent PNG or SVG only. SVGs are rasterised once to a PNG so cards,
// thumbnails and exports never have to parse (or trust) SVG markup again.
let logoTarget = -1;
async function logoFromFile(file) {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name), isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
  if (!isSvg && !isPng) throw new Error('Brand logos need to be a PNG with a transparent background, or an SVG.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const nw = img.naturalWidth || 512, nh = img.naturalHeight || 512, k = 512 / Math.max(nw, nh);
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(nw * k)); cv.height = Math.max(1, Math.round(nh * k));
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, cv.width, cv.height);
    if (isPng) {
      const d = g.getImageData(0, 0, cv.width, cv.height).data; let clear = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 250) clear++;
      if (clear < d.length / 4 * 0.02) throw new Error('That PNG has no transparent background. Export it with transparency (or use an SVG).');
    }
    return cv.toDataURL('image/png');
  } catch (e) { throw e.message?.includes('PNG') || e.message?.includes('SVG') ? e : new Error("That file couldn't be read as an image."); }
  finally { URL.revokeObjectURL(url); }
}
$('#logoPick').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  const b = P.brands[logoTarget]; if (!file || !b) return;
  try { const id = newId('a'); P.assets[id] = await logoFromFile(file); b.logo = id; save(); renderBrands(); toast(`🏷 Logo set for ${b.name}`); }
  catch (err) { toast(err.message, true); }
});
function renderBrands() {
  $('#setInfo').innerHTML = `
    <div class="field"><label for="sName">Set name <span class="muted">(printed on every card)</span></label><input type="text" id="sName" data-set="setName" value="${esc(P.setName)}" maxlength="32"></div>
    <div class="two"><div class="field"><label for="sCode">Set code</label><input type="text" id="sCode" data-set="setCode" value="${esc(P.setCode || '')}" maxlength="12"></div>
    <div class="field"><label for="sCred">Made by</label><input type="text" id="sCred" data-set="credits" value="${esc(P.credits || '')}" maxlength="60"></div></div>
    <p class="muted small">${P.cards.length} cards · ${P.cards.filter(c => c.type === 'CHA').length} CHA · ${P.cards.filter(c => c.type === 'ACT').length} ACT · ${P.brands.length} brands · ${P.tags.length} allegiances · ${P.folders.length} folders</p>`;
  $('#brandList').innerHTML = P.brands.map((b, i) => {
    const n = P.cards.filter(c => c.origin === b.name).length;
    return `<div class="brow"><span class="ico">${shapeIcon(b.shape, b.color || 'currentColor', 28)}</span>
      <input type="text" data-bname="${i}" value="${esc(b.name)}" maxlength="40" aria-label="Brand name" ${b.name === 'Unassigned' ? 'disabled' : ''}>
      <select data-bshape="${i}" aria-label="Shape">${Object.keys(SHAPES).map(s => `<option value="${s}" ${b.shape === s ? 'selected' : ''}>${SHAPE_LABELS[s]}</option>`).join('')}</select>
      <button class="logo-slot" data-blogo="${i}" title="Upload a logo: PNG with a transparent background, or SVG">${b.logo && P.assets[b.logo] ? `<img src="${href(b.logo)}" alt="${esc(b.name)} logo">` : '<span>+ logo</span>'}</button>
      ${b.logo ? `<button class="btn small" data-blogo-del="${i}" title="Remove logo">✕</button>` : ''}
      <input type="color" data-bcolor="${i}" value="${b.color || '#171724'}" title="Brand color (tints placeholder art)">
      ${b.color ? `<button class="btn small" data-bclear="${i}" title="Remove color">⌀</button>` : ''}
      <span class="count">${n} card${n === 1 ? '' : 's'}</span>
      ${b.name === 'Unassigned' ? '' : `<button class="btn small danger-btn" data-bdel="${i}" title="Delete brand">🗑</button>`}</div>`;
  }).join('');
  $('#tagList').innerHTML = P.tags.length ? P.tags.map((t, i) => {
    const is = P.cards.filter(c => (c.tags || []).includes(t)).length, pa = P.cards.filter(c => (c.partners || []).includes(t)).length;
    return `<div class="brow"><input type="text" data-tname="${i}" value="${esc(t)}" maxlength="24" aria-label="Allegiance name"><span class="count">${is} are · ${pa} partner</span><button class="btn small danger-btn" data-tdel="${i}" title="Delete">🗑</button></div>`;
  }).join('') : '<p class="pad muted">No allegiances yet.</p>';
}
const renameEverywhere = (from, to) => { for (const c of P.cards) for (const k of ['tags', 'partners']) if (c[k]) c[k] = c[k].map(x => x === from ? to : x); };
$('#view-brands').addEventListener('change', e => {
  const el = e.target, d = el.dataset;
  if (d.set) { P[d.set] = el.value.trim(); save(); return; }
  if (d.bname) {
    const b = P.brands[+d.bname], nn = el.value.trim();
    if (!nn || P.brands.some(o => o !== b && o.name.toLowerCase() === nn.toLowerCase())) { el.value = b.name; return toast('Brand names must be unique and not empty.', true); }
    for (const c of P.cards) if (c.origin === b.name) c.origin = nn;
    if (ui.f.brand === b.name) ui.f.brand = nn;
    renameEverywhere(b.name, nn); b.name = nn; save(); toast('Brand renamed on every card');
  }
  if (d.bshape) { P.brands[+d.bshape].shape = el.value; save(); renderBrands(); }
  if (d.tname) {
    const old = P.tags[+d.tname], nn = el.value.trim();
    if (!nn || (P.tags.includes(nn) && nn !== old)) { el.value = old; return toast('Allegiance names must be unique and not empty.', true); }
    P.tags[+d.tname] = nn; if (ui.f.tag === old) ui.f.tag = nn;
    renameEverywhere(old, nn); save(); renderBrands(); toast('Renamed on every card');
  }
});
$('#view-brands').addEventListener('input', e => {
  const i = e.target.dataset.bcolor; if (i == null) return;
  P.brands[+i].color = e.target.value; save();
  e.target.closest('.brow').querySelector('.ico').innerHTML = shapeIcon(P.brands[+i].shape, e.target.value, 28);
});
$('#view-brands').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
  if (b.id === 'addBrand') { const n = await promptText('New brand', 'Brand name'); if (n && addBrand(n)) renderBrands(); }
  if (b.id === 'addTag') { const n = await promptText('New allegiance', 'Allegiance name (e.g. "Gamers")'); if (n) { if (P.tags.includes(n)) toast('Already exists.', true); else { P.tags.push(n); save(); renderBrands(); } } }
  if (d.bclear) { P.brands[+d.bclear].color = ''; save(); renderBrands(); }
  if (d.blogo) { logoTarget = +d.blogo; $('#logoPick').click(); }
  if (d.blogoDel) { delete P.brands[+d.blogoDel].logo; save(); renderBrands(); toast('Logo removed'); }
  if (d.bdel) {
    const br = P.brands[+d.bdel], n = P.cards.filter(c => c.origin === br.name).length;
    if (await confirmAsk('Delete brand?', `Delete <b>${esc(br.name)}</b>?${n ? ` Its ${n} card(s) become Unassigned.` : ''}`, 'Delete')) {
      for (const c of P.cards) if (c.origin === br.name) c.origin = 'Unassigned';
      P.brands.splice(+d.bdel, 1); if (ui.f.brand === br.name) ui.f.brand = 'all'; save(); renderBrands();
    }
  }
  if (d.tdel) {
    const t = P.tags[+d.tdel];
    if (await confirmAsk('Delete allegiance?', `Remove <b>${esc(t)}</b> from every card's tags and partners?`, 'Delete')) {
      for (const c of P.cards) for (const k of ['tags', 'partners']) if (c[k]) c[k] = c[k].filter(x => x !== t);
      P.tags.splice(+d.tdel, 1); if (ui.f.tag === t) ui.f.tag = 'all'; save(); renderBrands();
    }
  }
});

// ---------------------------------------------------------------- rendering to PNG
async function svgImage(svgStr) {
  const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml' }));
  const img = new Image(); img.src = url;
  try { await img.decode(); } catch { await new Promise((res, rej) => { img.onload = res; img.onerror = rej; }); }
  return { img, done: () => URL.revokeObjectURL(url) };
}
const exportSVG = (c, index, scale) => cardSVG(c, { project: P, index, uid: 'x' + index, href: id => P.assets[id] || '' }, scale);
async function toPNG(svgStr, w, h) {
  const { img, done } = await svgImage(svgStr), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); g.drawImage(img, 0, 0, w, h);
  await sleep(20); g.clearRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h); // Safari sometimes paints embedded images late
  done(); return new Promise(r => cv.toBlob(r, 'image/png'));
}
const fileBase = c => String(c.fileName || '').replace(/[^\w\- .]/g, '').trim() || c.id;
const cardPNG = (c, scale = 1) => toPNG(exportSVG(c, P.cards.indexOf(c), scale), W * scale, H * scale);
function cardBundle(c) {
  const assets = {}; for (const l of c.layout.layers) if (l.kind === 'image' && P.assets[l.asset]) assets[l.asset] = P.assets[l.asset];
  const card = { ...clone(c), folders: [] };
  const brand = P.brands.find(b => b.name === c.origin) || null;
  if (brand?.logo && P.assets[brand.logo]) assets[brand.logo] = P.assets[brand.logo];
  return { format: 'lft-card', version: SAVE_FORMAT, forgeVersion: VERSION, card, assets, brand };
}
async function shareCard() {
  const c = cur(); if (!c) return;
  toast('Rendering…');
  const blob = await embed(await cardPNG(c, 1), 'lft-card', JSON.stringify(cardBundle(c))), name = `${fileBase(c)}.lftcard.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: c.name, text: 'Made in LFT Card Forge — drop this image into the Forge to edit it.' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  download(blob, name);
  toast('Card PNG saved — it carries its own data. Drop it into any Forge to edit it.');
}

// ---------------------------------------------------------------- spreadsheets
async function xlsxBlob(cards, template = false) {
  const X = await lib(XLSX, 'Excel export');
  const rows = template ? [
    { name: 'Example Character', type: 'CHA', tier: 'low', cost: 1, hp: 3, origin: 'Unassigned', timing: 'entry', effectKind: 'draw', effectTarget: 'selfPlayer', effectAmount: 1, flavor: 'Delete this row and add your own!' },
    { name: 'Example Action', type: 'ACT', family: 'direct', cost: 2, effectKind: 'damage', effectTarget: 'enemy', effectAmount: 3 },
  ] : cardsToRows(cards);
  const ws = X.utils.json_to_sheet(rows, { header: CSV_COLUMNS });
  ws['!cols'] = CSV_COLUMNS.map(k => ({ wch: ['text', 'note', 'flavor', 'origin', 'name'].includes(k) ? 34 : 13 }));
  ws['!autofilter'] = { ref: `A1:${X.utils.encode_col(CSV_COLUMNS.length - 1)}1` };
  const help = X.utils.aoa_to_sheet(SHEET_HELP); help['!cols'] = [{ wch: 14 }, { wch: 55 }, { wch: 70 }];
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Cards'); X.utils.book_append_sheet(wb, help, 'How to fill');
  return new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
async function readSheetFile(f) {
  const X = await lib(XLSX, 'Excel import');
  const wb = X.read(await f.arrayBuffer());
  const name = wb.SheetNames.find(n => /cards/i.test(n)) || wb.SheetNames[0];
  return rowsToCards(X.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false }));
}
// Any Google Sheets link works: a normal share link, or a "Publish to web" link.
function sheetCsvUrl(u) {
  const pub = u.match(/docs\.google\.com\/spreadsheets\/d\/e\/([\w-]+)/), gid = (u.match(/[#&?]gid=(\d+)/) || [])[1];
  if (pub) return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? '&gid=' + gid : ''}`;
  const id = u.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  if (id) return `https://docs.google.com/spreadsheets/d/${id[1]}/gviz/tq?tqx=out:csv&gid=${gid || 0}`;
  return u;
}
async function pullSheet(silent = false) {
  const url = P.sheet.url.trim();
  if (!url) return silent || toast('Paste a Google Sheet link first.', true);
  if (!/^https:\/\//.test(url)) return toast('The link should start with https://', true);
  $('#sheetStatus').textContent = 'Pulling…';
  try {
    const r = await fetch(sheetCsvUrl(url), { cache: 'no-store' });
    const text = await r.text();
    if (!r.ok || /^\s*</.test(text)) throw new Error("couldn't read it. Is it shared as “Anyone with the link can view”?");
    const cards = parseCSV(text);
    if (!cards.length) throw new Error('no cards found. The sheet needs a “name” column (grab the template for the layout).');
    const { add, upd } = applyRules(cards);
    P.sheet.last = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    save(); renderShare(); if (ui.view === 'library') renderLibrary();
    $('#sheetStatus').textContent = `✓ Pulled ${P.sheet.last}: ${upd} updated, ${add} new.`;
    toast(`📊 Sheet synced: ${upd} updated, ${add} new`);
  } catch (e) {
    const msg = e instanceof TypeError ? "couldn't reach it (offline, or not a public Google Sheet)." : e.message;
    $('#sheetStatus').textContent = '⚠ Sheet ' + msg;
    if (!silent) toast('Sheet ' + msg, true);
  }
}

// ---------------------------------------------------------------- export
async function withProgress(title, fn) {
  const m = $('#modal');
  if (m.open) m.close();
  $('#modalForm').innerHTML = `<div class="panel-h">${title}</div><div class="body"><div id="progLabel">Starting…</div><div class="progress"><div id="progBar"></div></div></div>`;
  m.showModal();
  const step = (i, n, label) => { $('#progBar').style.width = Math.round(i / n * 100) + '%'; $('#progLabel').textContent = label; };
  try { return await fn(step); } finally { m.close(); }
}
async function exportZip(cards = P.cards, label = P.setName) {
  if (!cards.length) return toast('No cards to export yet.', true);
  const opt = { png: $('#xPng').checked, hi: $('#xHi').checked, tts: $('#xTts').checked, data: $('#xData').checked, save: $('#xSave').checked };
  if (!Object.values(opt).some(Boolean)) return toast('Tick at least one thing to export (Save & Share tab).', true);
  let JSZip;
  try { JSZip = (await lib(JSZIP, 'ZIP export')).default; } catch (e) { return toast(e.message, true); }
  gcAssets();
  const base = slug(label || 'cards'), zip = new JSZip(), n = cards.length, idx = c => P.cards.indexOf(c);
  try {
    await withProgress('📦 Packing your cards', async step => {
      if (opt.save) {
        const part = cards === P.cards ? P : { ...P, cards, folders: P.folders.filter(f => cards.some(c => c.folders.includes(f.id))), assets: Object.fromEntries(Object.entries(P.assets).filter(([k]) => cards.some(c => c.layout.layers.some(l => l.asset === k)))) };
        zip.file(`${base}.lftset.json`, JSON.stringify(part));
      }
      if (opt.data) {
        zip.file('data/cards.json', JSON.stringify(cards.map(toEngine), null, 2) + '\n');
        zip.file('data/cards.csv', toCSV(cards));
        try { zip.file('data/cards.xlsx', await xlsxBlob(cards)); } catch { /* offline: CSV still there */ }
      }
      if (opt.png) for (let i = 0; i < n; i++) {
        step(i, n, `Card ${i + 1}/${n}: ${cards[i].name}`);
        zip.file(`png/${String(idx(cards[i]) + 1).padStart(2, '0')}-${fileBase(cards[i])}.png`, await cardPNG(cards[i], opt.hi ? 2 : 1));
      }
      let ttsNote = '';
      if (opt.tts) {
        // TTS custom decks: up to 10x7 per sheet, last slot holds the hidden-card image.
        const cw = 400, ch = 560, per = 69;
        zip.file('tts/back.png', await toPNG(backSVG(P.setName, 1), W, H));
        for (let s = 0; s * per < n; s++) {
          const chunk = cards.slice(s * per, s * per + per), cols = Math.min(10, chunk.length + 1), rows = Math.ceil((chunk.length + 1) / cols);
          const cv = document.createElement('canvas'); cv.width = cols * cw; cv.height = rows * ch; const g = cv.getContext('2d');
          g.fillStyle = '#171724'; g.fillRect(0, 0, cv.width, cv.height);
          for (let i = 0; i < chunk.length; i++) {
            step(i, chunk.length, `Deck sheet ${s + 1}: ${chunk[i].name}`);
            const { img, done } = await svgImage(exportSVG(chunk[i], idx(chunk[i]), 1));
            g.drawImage(img, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch); done();
          }
          const { img, done } = await svgImage(backSVG(P.setName)); g.drawImage(img, (cols - 1) * cw, (rows - 1) * ch, cw, ch); done();
          zip.file(`tts/sheet-${s + 1}.png`, await new Promise(r => cv.toBlob(r, 'image/png')));
          ttsNote += `  sheet-${s + 1}.png: Width ${cols}, Height ${rows}, Number ${chunk.length}\n`;
        }
      }
      step(1, 1, 'Zipping…');
      zip.file('README.txt', readme(n, ttsNote));
      download(await zip.generateAsync({ type: 'blob' }), `${base}-cards.zip`);
    });
    toast('📦 ZIP downloaded!');
  } catch (e) { console.error(e); toast('Export failed: ' + e.message, true); }
}
const readme = (n, tts) => `${P.setName} — exported from LFT Card Forge v${VERSION} on ${new Date().toISOString().slice(0, 10)}
${P.credits ? 'Made by: ' + P.credits + '\n' : ''}${n} cards.

WHAT'S INSIDE
  *.lftset.json   Full save. Drop it (or this whole ZIP) into the Forge to keep editing.
  data/cards.json Game data in the same format as the TTS mod's data/cards.json.
  data/cards.xlsx Same data for Excel / Google Sheets (see the "How to fill" tab).
  data/cards.csv  Same again as plain CSV. Edit either, drop it back into the Forge:
                  stats and text update, art stays.
  png/            One image per card.
  tts/            Deck sheet(s) + card back for Tabletop Simulator.

TABLETOP SIMULATOR (quick custom deck)
  Objects > Components > Custom > Deck. Face = tts/sheet-N.png, Back = tts/back.png,
  and use these grid numbers:
${tts || '  (not exported)\n'}  For online play the images must be uploaded somewhere public (e.g. Steam Cloud).

INTO THE SCRIPTED TTS MOD
  Merge data/cards.json into the repo's data/cards.json and run npm run build.
  The scripted engine only runs the effect types this Forge offers.
`;

// ---------------------------------------------------------------- import
async function importFiles(files) {
  for (const f of files) {
    const n = f.name.toLowerCase();
    try {
      if (n.endsWith('.zip')) await importZip(f);
      else if (n.endsWith('.csv')) await importRules(parseCSV(await f.text()), f.name);
      else if (/\.(xlsx|xls|ods)$/.test(n)) await importRules(await readSheetFile(f), f.name);
      else if (n.endsWith('.json')) {
        const o = JSON.parse(await f.text());
        if (o.format === 'lft-forge') await importProject(o, f.name);
        else if (o.format === 'lft-card') await importBundle(o);
        else if (Array.isArray(o)) await importRules(o.map(x => ({ ...x })), f.name);
        else throw new Error('not a Forge file');
      } else if (f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(n)) {
        const meta = (f.type === 'image/png' || n.endsWith('.png')) ? await extract(f, 'lft-card') : null;
        if (meta) await importBundle(JSON.parse(meta));
        else if (ui.view === 'editor' && cur()) await addImageLayer(f);
        else toast('To add art: open a card in the Editor, then drop the image onto it.', true);
      } else toast(`Not sure what to do with ${f.name}.`, true);
    } catch (e) { console.error(e); toast(`Couldn't open ${f.name}: ${e.message}`, true); }
  }
}
async function importZip(f) {
  const JSZip = (await lib(JSZIP, 'ZIP import')).default;
  const zip = await JSZip.loadAsync(f), names = Object.keys(zip.files);
  const saveF = names.find(x => x.endsWith('.lftset.json')), json = names.find(x => x.endsWith('cards.json')), csv = names.find(x => x.endsWith('.csv'));
  if (saveF) return importProject(JSON.parse(await zip.file(saveF).async('string')), f.name);
  if (json) return importRules(JSON.parse(await zip.file(json).async('string')), f.name);
  if (csv) return importRules(parseCSV(await zip.file(csv).async('string')), f.name);
  throw new Error('no save file or cards.json inside');
}
function mergeProject(inc) {
  let add = 0, upd = 0;
  for (const b of inc.brands) if (!P.brands.some(x => x.name === b.name)) P.brands.push(b);
  for (const t of inc.tags) if (!P.tags.includes(t)) P.tags.push(t);
  // Folders merge by name, so two collaborators' "Deck ideas" folders become one.
  const map = {};
  for (const f of inc.folders) { const same = P.folders.find(x => x.name === f.name); if (same) map[f.id] = same.id; else { const nf = { ...f, id: newId('f') }; P.folders.push(nf); map[f.id] = nf.id; } }
  Object.assign(P.assets, inc.assets);
  for (const c of inc.cards) {
    c.folders = c.folders.map(id => map[id]).filter(Boolean);
    const i = P.cards.findIndex(x => x.id === c.id);
    if (i >= 0) { c.uid = P.cards[i].uid; c.folders = [...new Set([...P.cards[i].folders, ...c.folders])]; P.cards[i] = c; upd++; } else { P.cards.push(c); add++; }
  }
  return { add, upd };
}
// Files from a newer Forge may carry things this version can't show; say so instead of silently dropping them.
function warnIfNewer(o, what) {
  if ((+o?.version || 1) > SAVE_FORMAT) toast(`⚠ ${what} was made with a newer Card Forge (${o.forgeVersion || 'unknown'}). Reload to update before editing, or some details may be lost.`, true);
}
async function importProject(o, name) {
  warnIfNewer(o, name);
  const inc = upgrade(clone(o));
  if (!P.cards.length) { resetTo(inc); setView('library'); return toast(`📂 Opened “${inc.setName}” (${inc.cards.length} cards)`); }
  const v = await ask({ title: '📂 Open save', body: `<p><b>${esc(name)}</b> — “${esc(inc.setName)}”, ${inc.cards.length} cards.</p><p><b>Merge</b> adds its cards to yours (same card ID = theirs wins, folders with the same name combine). <b>Replace</b> swaps your whole set for theirs.</p>`, buttons: [{ label: 'Cancel', value: '' }, { label: 'Replace my set', value: 'replace' }, { label: 'Merge', value: 'merge', primary: true }] });
  if (!v) return;
  if (v === 'replace') resetTo(inc);
  else { const { add, upd } = mergeProject(inc); save(); toast(`Merged: ${add} new, ${upd} updated`); }
  setView('library');
}
// Stats/text from a sheet or cards.json; art, style and folders stay from the Forge.
function applyRules(list) {
  let add = 0, upd = 0;
  for (const raw of list) {
    const c = fromEngine(raw), i = P.cards.findIndex(x => x.id === c.id);
    if (i >= 0) { const old = P.cards[i]; P.cards[i] = normalize({ ...c, uid: old.uid, layout: old.layout, folders: old.folders, autoId: false, artist: c.artist ?? old.artist, flavor: c.flavor ?? old.flavor, note: c.note ?? old.note }); upd++; }
    else { c.uid = newId('c'); c.folders = P.folders.some(f => f.id === ui.folder) ? [ui.folder] : []; P.cards.push(c); add++; }
    registerNames(c);
  }
  save();
  return { add, upd };
}
async function importRules(list, name) {
  if (!list.length) throw new Error('no cards found (each row needs a name)');
  const known = list.filter(o => P.cards.some(x => x.id === (o.id || slug(o.name)))).length;
  const ok = await confirmAsk('📊 Update from spreadsheet', `<b>${esc(name)}</b> has ${list.length} cards: ${known} match cards you have (their stats &amp; text update, <b>art is kept</b>) and ${list.length - known} are new.`, 'Update');
  if (!ok) return;
  const { add, upd } = applyRules(list);
  setView('library'); toast(`Updated ${upd}, added ${add}`);
}
async function importBundle(b) {
  warnIfNewer(b, 'That card');
  const c = upgrade({ cards: [b.card], assets: b.assets }).cards[0];
  if (!c) throw new Error('empty card');
  if (b.brand?.name && !P.brands.some(x => x.name === b.brand.name)) P.brands.push(upgrade({ brands: [b.brand] }).brands.find(x => x.name === b.brand.name));
  Object.assign(P.assets, upgrade({ assets: b.assets }).assets);
  const dupe = P.cards.find(x => x.id === c.id);
  if (dupe) {
    const v = await ask({ title: '📨 Shared card', body: `<p>You already have a card with ID <b>${esc(c.id)}</b> (“${esc(dupe.name)}”).</p>`, buttons: [{ label: 'Cancel', value: '' }, { label: 'Replace mine', value: 'replace' }, { label: 'Add as a copy', value: 'copy', primary: true }] });
    if (!v) return;
    if (v === 'replace') { c.uid = dupe.uid; c.folders = dupe.folders; P.cards[P.cards.indexOf(dupe)] = c; registerNames(c); save(); return openEditor(c.uid); }
    c.name += ' (shared)'; c.id = uniqueCardId(c.name, P.cards);
  }
  c.uid = newId('c'); c.folders = P.folders.some(f => f.id === ui.folder) ? [ui.folder] : [];
  P.cards.push(c); registerNames(c); save(); openEditor(c.uid);
  toast(`📨 Imported “${c.name}”`);
}

// ---------------------------------------------------------------- share view
async function renderShare() {
  $('#sheetUrl').value = P.sheet.url; $('#sheetAuto').checked = P.sheet.auto;
  if (!/Pulling|✓|⚠/.test($('#sheetStatus').textContent)) $('#sheetStatus').textContent = P.sheet.url ? (P.sheet.last ? `Linked. Last pulled ${P.sheet.last}.` : 'Linked — press Pull now.') : 'Not linked yet.';
  renderVersions();
  try { const e = await navigator.storage?.estimate?.(); $('#storageInfo').textContent = e ? `${(e.usage / 1048576).toFixed(1)} MB used` : 'browser storage'; }
  catch { $('#storageInfo').textContent = 'browser storage'; }
}
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#installBtn').hidden = false; });
$('#installBtn').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#installBtn').hidden = true; });
$('#dlSave').addEventListener('click', () => { gcAssets(); download(new Blob([JSON.stringify(P)], { type: 'application/json' }), `${slug(P.setName)}-${new Date().toISOString().slice(0, 10)}.lftset.json`); toast('💾 Save file downloaded'); });
$('#openFile').addEventListener('click', () => $('#filePick').click());
$('#dlZip').addEventListener('click', () => exportZip());
$('#dlCsv').addEventListener('click', () => { if (!P.cards.length) return toast('No cards yet.', true); download(new Blob(['﻿' + toCSV(P.cards)], { type: 'text/csv' }), `${slug(P.setName)}-cards.csv`); toast('📊 CSV downloaded'); });
$('#dlXlsx').addEventListener('click', async () => { if (!P.cards.length) return toast('No cards yet — try the blank template.', true); try { download(await xlsxBlob(P.cards), `${slug(P.setName)}-cards.xlsx`); toast('📊 Excel file downloaded'); } catch (e) { toast(e.message, true); } });
$('#dlTemplate').addEventListener('click', async () => { try { download(await xlsxBlob([], true), 'card-forge-template.xlsx'); toast('📊 Template downloaded — see the “How to fill” tab'); } catch (e) { toast(e.message, true); } });
$('#sheetUrl').addEventListener('change', e => { P.sheet.url = e.target.value.trim(); P.sheet.last = ''; $('#sheetStatus').textContent = P.sheet.url ? 'Linked — press Pull now.' : 'Not linked yet.'; save(); });
$('#sheetAuto').addEventListener('change', e => { P.sheet.auto = e.target.checked; save(); });
$('#sheetPull').addEventListener('click', () => { P.sheet.url = $('#sheetUrl').value.trim(); pullSheet(); });
$('#copyJson').addEventListener('click', async () => {
  const json = JSON.stringify(P.cards.map(toEngine), null, 2);
  try { await navigator.clipboard.writeText(json); toast('📋 cards.json copied'); }
  catch { download(new Blob([json], { type: 'application/json' }), 'cards.json'); }
});
async function loadBase() {
  try { const base = await baseProject(); await importProject(base, 'Base game'); }
  catch (e) { console.error(e); toast("Couldn't load the base set here (it ships with the hosted Forge).", true); }
}
$('#loadBase').addEventListener('click', loadBase);
$('#emptySet').addEventListener('click', async () => {
  if (!await confirmAsk('Wipe everything?', 'Delete every card, folder and brand in this browser and start blank? Download a save file first if you want to keep your work.', 'Wipe it')) return;
  resetTo(emptyProject()); setView('library'); toast('Fresh start!');
});

// ---------------------------------------------------------------- versions & backups
// Snapshots of the whole set or of one folder (deck), kept in this browser. Each one can be
// restored, downloaded as a save file, or all bundled into one archive ZIP.
function partialProject(cards) {
  if (cards === P.cards) { gcAssets(); return clone(P); }
  const keep = new Set([...cards.flatMap(c => c.layout.layers.map(l => l.asset)), ...P.brands.map(b => b.logo)].filter(Boolean));
  return clone({ ...P, cards, folders: P.folders.filter(f => cards.some(c => c.folders.includes(f.id))), assets: Object.fromEntries(Object.entries(P.assets).filter(([k]) => keep.has(k))) });
}
const versionList = async () => (await store.get('snaps')) || [];
async function saveVersion(scope = 'set', auto = false) {
  const f = P.folders.find(x => x.id === scope);
  const cards = scope === 'set' ? P.cards : P.cards.filter(c => c.folders.includes(scope));
  if (!cards.length) return auto || toast('Nothing to back up yet.', true);
  const list = await versionList(), n = list.filter(s => s.scope === scope && !s.auto).length + 1;
  let label = auto ? 'Auto backup' : `v${n}`;
  if (!auto) { const named = await promptText(`🗄 Save a version of ${f ? '“' + esc(f.name) + '”' : 'the whole set'}`, 'Name this version (optional)', label); if (named === null) return; label = named || label; }
  const meta = { id: newId('v'), scope, scopeName: f ? f.name : P.setName, icon: f ? f.icon : '📦', label: label.slice(0, 40), date: Date.now(), count: cards.length, auto };
  try {
    await store.set('snap:' + meta.id, partialProject(cards));
    list.unshift(meta);
    const autos = list.filter(s => s.auto);
    for (const old of autos.slice(8)) { list.splice(list.indexOf(old), 1); store.del('snap:' + old.id); }
    await store.set('snaps', list);
    if (!auto) toast(`🗄 Saved ${meta.label} of “${meta.scopeName}”`);
    if (ui.view === 'share') renderVersions();
  } catch (e) { console.error(e); if (!auto) toast('Could not store the version (browser storage full?). Download a save file instead.', true); }
}
const vDate = t => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const vFileName = s => `${slug(s.scopeName)}-${slug(s.label)}-${new Date(s.date).toISOString().slice(0, 10)}.lftset.json`;
async function renderVersions() {
  const list = await versionList(), el = $('#versionList');
  el.innerHTML = list.length ? list.map(s => `<div class="vrow"><span class="vicon">${s.icon}</span><span class="vtxt"><b>${esc(s.scopeName)}</b> · ${esc(s.label)}<small>${vDate(s.date)} · ${s.count} card${s.count === 1 ? '' : 's'}${s.auto ? ' · automatic' : ''}</small></span>
    <button class="btn small" data-v="restore" data-id="${s.id}">↺ Restore</button><button class="btn small" data-v="dl" data-id="${s.id}" title="Download">⬇</button><button class="btn small danger-btn" data-v="del" data-id="${s.id}" title="Delete">🗑</button></div>`).join('')
    : '<p class="muted small">No versions yet. Save one before big changes. The Forge also keeps a few automatic backups.</p>';
}
$('#pVersions').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'saveSetVersion') return saveVersion('set');
  if (b.id === 'archiveVersions') {
    const list = await versionList(); if (!list.length) return toast('No versions to archive yet.', true);
    let JSZip; try { JSZip = (await lib(JSZIP, 'Archive')).default; } catch (err) { return toast(err.message, true); }
    const zip = new JSZip();
    for (const s of list) { const d = await store.get('snap:' + s.id); if (d) zip.file(`${s.auto ? 'auto/' : ''}${vFileName(s)}`, JSON.stringify(d)); }
    zip.file('current.lftset.json', JSON.stringify(partialProject(P.cards)));
    download(await zip.generateAsync({ type: 'blob' }), `${slug(P.setName)}-archive-${new Date().toISOString().slice(0, 10)}.zip`);
    return toast('🗄 Archive downloaded — every version in one ZIP');
  }
  const id = b.dataset.id, list = await versionList(), s = list.find(x => x.id === id); if (!s) return;
  if (b.dataset.v === 'dl') { const d = await store.get('snap:' + id); if (d) download(new Blob([JSON.stringify(d)], { type: 'application/json' }), vFileName(s)); }
  if (b.dataset.v === 'restore') { const d = await store.get('snap:' + id); if (d) { await saveVersion('set', true); await importProject(d, `${s.scopeName} · ${s.label}`); } }
  if (b.dataset.v === 'del' && await confirmAsk('Delete version?', `Delete ${esc(s.label)} of “${esc(s.scopeName)}”?`, 'Delete')) { list.splice(list.indexOf(s), 1); await store.set('snaps', list); await store.del('snap:' + id); renderVersions(); }
});

// ---------------------------------------------------------------- help overlay
const HELP = {
  library: { title: 'Your card library', flow: 0, steps: [
    ['.newrow', 'Make a card', 'Start a Character or an Action, or 🎲 roll a random one for ideas.'],
    ['#folders', 'Folders', 'Sort cards however you like: decks, “needs art”, a brand. On PC, drag cards onto a folder. On a phone, use ☑ Select.'],
    ['#grid', 'Tap a card to edit it', 'A red ! means something needs fixing.'],
    ['#zoom', 'Zoom', 'Make cards bigger or smaller (Ctrl + scroll works on PC). Folders show up as stacks you can open.'],
    ['#selectBtn', 'Select several', 'Move many cards into a folder, duplicate, export or delete them at once.'],
    ['.filters', 'Find stuff', 'Search, or filter by type, tier, brand or allegiance.'],
  ] },
  editor: { title: 'Designing a card', flow: 1, steps: [
    ['#stage', 'Edit right on the card', 'Tap the name, cost, HP, banner or rules text to type into it. Drag art to move it; white corners resize, the yellow dot spins.'],
    ['#toolstrip', 'Add things', 'Your own image (with shape masks), text, stickers or your brand logo. You can also drop or paste a picture onto the card.'],
    ['#sectabs', 'Card details', 'Stats, brand, ability, colors, gradients, holo foil and layers.'],
    ['#checks', 'Rules check', 'Warns you if the card breaks a rule or looks unbalanced.'],
    ['#edLayout', 'Your workspace', 'Swap sides, change the backdrop, or go full focus. On PC, drag the edge of the side panel to resize it.'],
    ['#shareCardBtn', 'Share one card', 'Makes a picture with the card data hidden inside. Anyone can drop it into their Forge to keep editing.'],
  ] },
  brands: { title: 'Brands & allegiances', flow: 0, steps: [
    ['#setInfo', 'Your set', 'The set name is printed at the bottom of every card.'],
    ['#brandList', 'Brands', 'Where characters come from. Same-brand characters can Backup each other.'],
    ['#tagList', 'Allegiances', 'Groups like Pets or Snacks. A card’s Partners decide who can Backup it.'],
  ] },
  share: { title: 'Saving & sharing', flow: 2, steps: [
    ['#pSave', 'Your save', 'Autosaves in this browser. Download a save file to switch devices or hand work to a teammate.'],
    ['#pSheet', 'Spreadsheets', 'Type cards in Excel or Google Sheets and drop the file here, or link a Google Sheet for live updates.'],
    ['#pZip', 'Export everything', 'One ZIP with card images, a Tabletop Simulator deck and the game data.'],
    ['#pVersions', 'Versions & backups', 'Save named versions of your set or a deck, restore them, or download every version as one archive.'],
  ] },
};
const flowArt = active => `<svg class="help-flow" viewBox="0 0 330 74" aria-hidden="true">${['MAKE', 'STYLE', 'SHARE'].map((t, i) => `
  <g transform="translate(${6 + i * 110} 6)"><rect width="96" height="62" rx="10" fill="${i === active ? '#ffda52' : '#eef0fb'}" stroke="#171724" stroke-width="3"/>
  <text x="48" y="27" text-anchor="middle" font-family="Arial" font-weight="900" font-size="20" fill="#171724">${i + 1}</text>
  <text x="48" y="50" text-anchor="middle" font-family="Arial" font-weight="800" font-size="14" fill="#171724">${t}</text></g>
  ${i < 2 ? `<path d="M${104 + i * 110} 37h10" stroke="#171724" stroke-width="4" marker-end="url(#ha)"/>` : ''}`).join('')}
  <defs><marker id="ha" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" fill="#171724"/></marker></defs></svg>`;
const compactHelp = () => matchMedia('(max-width: 760px), (max-height: 520px)').matches;
let helpStep = 0;
function openHelp(step = 0) {
  const h = HELP[ui.view];
  $('#help').hidden = false; $('#helpFab').setAttribute('aria-expanded', 'true');
  lsSet('forge-help-seen', '1');
  if (compactHelp()) {
    helpStep = clamp(step, 0, h.steps.length - 1);
    const [sel, t, d] = h.steps[helpStep], last = helpStep === h.steps.length - 1;
    $('#help').classList.add('compact');
    $('#helpCard').innerHTML = `<div class="panel-h">❓ ${h.title}<span class="muted-h">${helpStep + 1} / ${h.steps.length}</span></div>
      <div class="body"><div class="hstep"><span class="n">${helpStep + 1}</span><span><b>${t}</b><small>${d}</small></span></div></div>
      <div class="help-foot"><button class="btn small" data-help-step="-1" ${helpStep ? '' : 'disabled'}>‹ Back</button><button class="link small" id="helpClose">close</button>
      ${last ? '<button class="btn small primary" id="helpDone">Got it!</button>' : '<button class="btn small primary" data-help-step="1">Next ›</button>'}</div>`;
    const el = $(sel), r = el?.getBoundingClientRect();
    if (r && (r.top < 70 || r.top > innerHeight * 0.45)) window.scrollBy({ top: r.top - 90, behavior: 'smooth' });
    setTimeout(layoutHelp, 380);
    return layoutHelp();
  }
  $('#help').classList.remove('compact');
  $('#helpCard').innerHTML = `<div class="panel-h">❓ ${h.title}</div><div class="body">${flowArt(h.flow)}
    <p>Numbers match the glowing boxes. Tap one to jump to it.</p>
    <ol>${h.steps.map(([sel, t, d], i) => `<li><button data-help-go="${i}"><span class="n">${i + 1}</span><span><b>${t}</b><small>${d}</small><span class="off" data-help-off="${i}" hidden>↕ scroll to see it</span></span></button></li>`).join('')}</ol></div>
    <div class="help-foot"><span>This <b>?</b> button is always here.</span><button class="btn small primary" id="helpClose">Got it!</button></div>`;
  layoutHelp();
  lsSet('forge-help-seen', '1');
}
function closeHelp() { $('#help').hidden = true; $('#helpFab').setAttribute('aria-expanded', 'false'); }
function layoutHelp() {
  if ($('#help').hidden) return;
  const steps = HELP[ui.view].steps, vw = innerWidth, vh = innerHeight, only = $('#help').classList.contains('compact') ? helpStep : -1;
  const floor = only >= 0 ? $('#helpCard').getBoundingClientRect().top - 6 : vh - 4;
  $('#helpMarks').innerHTML = steps.map(([sel], i) => {
    if (only >= 0 && i !== only) return '';
    const el = $(sel), r = el?.getBoundingClientRect(), off = !r || !r.width || r.bottom < 8 || r.top > vh - 8;
    const flag = $(`[data-help-off="${i}"]`); if (flag) flag.hidden = !off || !r?.width;
    if (off) return '';
    const t = Math.max(r.top, 18), l = Math.max(r.left, 18), b = Math.max(t + 24, Math.min(r.bottom, floor)), rr = Math.min(r.right, vw - 4);
    return `<div class="hmark" data-hm="${i}" style="top:${t}px;left:${l}px;width:${Math.max(24, rr - l)}px;height:${Math.max(24, b - t)}px"><span class="hnum">${i + 1}</span></div>`;
  }).join('');
}
let helpRaf = 0;
const helpRelayout = () => { if ($('#help').hidden || helpRaf) return; helpRaf = requestAnimationFrame(() => { helpRaf = 0; layoutHelp(); }); };
addEventListener('scroll', helpRelayout, { passive: true });
addEventListener('resize', helpRelayout);
$('#helpFab').addEventListener('click', () => $('#help').hidden ? openHelp(0) : closeHelp());
$('#help').addEventListener('click', e => {
  if (e.target.closest('#helpClose') || e.target.closest('#helpDone')) return closeHelp();
  const st = e.target.closest('[data-help-step]'); if (st) return openHelp(helpStep + +st.dataset.helpStep);
  const go = e.target.closest('[data-help-go]');
  if (go) {
    const el = $(HELP[ui.view].steps[+go.dataset.helpGo][0]); if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => { layoutHelp(); $(`[data-hm="${go.dataset.helpGo}"]`)?.classList.add('flash'); }, 450);
    return;
  }
  if (!e.target.closest('#helpCard')) closeHelp();
});

// ---------------------------------------------------------------- global wiring
for (const b of $$('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
$('#q').addEventListener('input', e => { ui.f.q = e.target.value; renderLibrary(); });
$('#fType').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { ui.f.type = b.dataset.v; renderLibrary(); } });
for (const [id, k] of [['#fTier', 'tier'], ['#fBrand', 'brand'], ['#fTag', 'tag'], ['#fSort', 'sort'], ['#fTrig', 'trig']]) $(id).addEventListener('change', e => { ui.f[k] = e.target.value; renderLibrary(); });
$('#grid').addEventListener('click', e => {
  const nb = e.target.closest('[data-new]'); if (nb) return newFromButton(nb.dataset.new);
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'clearFilters') { Object.assign(ui.f, { q: '', type: 'all', tier: 'all', brand: 'all', tag: 'all', trig: 'all' }); $('#q').value = ''; $('#fTrig').value = 'all'; $('#fTier').value = 'all'; return renderLibrary(); }
  if (act === 'loadBase') return loadBase();
  if (act === 'openHelp') return openHelp();
  const ef = e.target.closest('[data-edit-folder]'); if (ef) return editFolder(ef.dataset.editFolder);
  const of = e.target.closest('[data-open-folder]'); if (of) { ui.folder = of.dataset.openFolder; ui.picked.clear(); renderLibrary(); window.scrollTo({ top: 0 }); return; }
  const t = e.target.closest('.tile'); if (!t) return;
  if (ui.selecting) { ui.picked.has(t.dataset.uid) ? ui.picked.delete(t.dataset.uid) : ui.picked.add(t.dataset.uid); renderLibrary(); }
  else openEditor(t.dataset.uid);
});
$('#filterToggle').addEventListener('click', e => { const open = $('#filters').classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', open); if (open) $('#q').focus(); });
$('#newCha').addEventListener('click', () => newFromButton('CHA'));
$('#newAct').addEventListener('click', () => newFromButton('ACT'));
$('#surprise').addEventListener('click', surprise);
$('#prevCard').addEventListener('click', () => stepCard(-1));
$('#nextCard').addEventListener('click', () => stepCard(1));
$('#undoBtn').addEventListener('click', () => undoRedo(undoStack, redoStack));
$('#redoBtn').addEventListener('click', () => undoRedo(redoStack, undoStack));
$('#addImg').addEventListener('click', () => $('#imgPick').click());
$('#addText').addEventListener('click', addText);
$('#addLogo').addEventListener('click', addLogo);
$('#addSticker').addEventListener('click', stickerPicker);
$('#pngBtn').addEventListener('click', async () => { const c = cur(); if (c) { download(await cardPNG(c, 2), `${fileBase(c)}.png`); toast('⬇ PNG downloaded (1000×1400)'); } });
$('#shareCardBtn').addEventListener('click', shareCard);
$('#imgPick').addEventListener('change', e => { const f = e.target.files[0]; if (f) addImageLayer(f); e.target.value = ''; });
$('#filePick').addEventListener('change', e => { importFiles([...e.target.files]); e.target.value = ''; });

let dragDepth = 0;
const hasFiles = e => e.dataTransfer?.types?.includes('Files');
addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; document.body.classList.add('dragging'); } });
addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('drop', e => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging'); importFiles([...e.dataTransfer.files]); });
addEventListener('paste', e => {
  const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'));
  if (f && ui.view === 'editor' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); importFiles([f]); }
});
addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#help').hidden) return closeHelp();
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || $('#modal').open;
  const mod = e.ctrlKey || e.metaKey;
  if (ui.view !== 'editor' || typing) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? undoRedo(redoStack, undoStack) : undoRedo(undoStack, redoStack); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); undoRedo(redoStack, undoStack); return; }
  const L = selLayer(); if (!L) return;
  const step = e.shiftKey ? 10 : 1, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv) { e.preventDefault(); snap(); L.x += mv[0]; L.y += mv[1]; updateLayerDOM(L); save(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); layerAction('del'); }
  else if (e.key === 'Escape') select(null);
  else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); layerAction('dup'); }
});

$('#themeBtn').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  lsSet('forge-theme', document.documentElement.dataset.theme);
});
if (matchMedia('(max-width: 760px)').matches && !lsGet('forge-phone-hint')) $('#phoneHint').hidden = false;
$('#phoneHintClose').addEventListener('click', () => { $('#phoneHint').hidden = true; lsSet('forge-phone-hint', '1'); });

// ---------------------------------------------------------------- version footer
// build.json is written by the GitHub Pages workflow; locally it doesn't exist.
async function renderFooter() {
  let build = 'local dev build';
  try {
    const b = await (await fetch('build.json', { cache: 'no-store' })).json();
    const sha = String(b.sha || '').slice(0, 7), url = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(b.repo) ? `${b.repo}/commit/${b.sha}` : '';
    build = `build ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(sha)}</a>` : esc(sha)} · ${esc(String(b.date || '').slice(0, 10))}`;
  } catch { }
  $('#appFoot').innerHTML = `LFT Card Forge <b>v${VERSION}</b> · save format ${SAVE_FORMAT} · ${build} · <a href="https://github.com/dustooned/lftcf" target="_blank" rel="noopener">source</a>`;
}

// ---------------------------------------------------------------- boot
(async () => {
  const saved = await store.get('project');
  P = saved ? upgrade(saved) : emptyProject();
  $('#status').textContent = saved ? '✓ loaded your save' : '✓ ready';
  if (!saved) save();
  store.persist();
  renderFooter();
  if (saved) warnIfNewer(saved, 'Your saved set');
  setView('library');
  if (!lsGet('forge-help-seen')) openHelp();
  if (saved && P.cards.length) { const last = (await versionList()).find(s => s.auto); if (!last || Date.now() - last.date > 6 * 3600e3) saveVersion('set', true); }
  if (P.sheet.auto && P.sheet.url && navigator.onLine) pullSheet(true);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
