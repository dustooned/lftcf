import { W, H, ART, FONTS, SHAPES, SHAPE_LABELS, TIMING_LABEL, esc, cardInner, cardSVG, backSVG, handlesMarkup, layerTransform, layerBox, accentFor, shapeIcon, shapeMarkup, isHolo, MASKS, BLENDS, LAYER_FX, FX_COLOR, EDIT_REGIONS } from './render.js';
import { I } from './icons.js';
import { EFFECTS, TARGET_LABELS, PASSIVES, TIMINGS, LIMITS, autoText, normalize, newCard, uniqueCardId, slug, newId, defaultLayout, toEngine, fromEngine, validate, parseAbility, randomName, randomAbility, toCSV, parseCSV, rowsToCards, cardsToRows, CSV_COLUMNS, SHEET_HELP } from './model.js';
import * as store from './store.js';
import { VERSION, SAVE_FORMAT, CODENAME, RELEASED, CHANGELOG } from './version.js';
import { embed, extract } from './png-meta.js';
import { SAFE_ID, DECK_SIZE, BASE_SHAPES, FOLDER_ICONS, TRASH_DAYS, DEFAULT_BACK, upgrade, registerNames as regNames, usedAssets, deckReport, deckStats, gameDecksJson, readability, playtestDeckData , lftDeckToProject } from './project.js';

const JSZIP = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
const XLSX = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = o => JSON.parse(JSON.stringify(o));
const num = (v, d) => Number.isFinite(+v) && v !== '' && v != null ? +v : d;
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { } };

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
const ui = { lastPick: null, view: 'library', cur: null, sel: null, field: null, drawId: null, sec: 'stats', dockTab: 'style', folder: 'all', selecting: false, picked: new Set(), f: { q: '', type: 'all', tier: 'all', brand: 'all', tag: 'all', sort: 'num', trig: 'all' } };
// Ability categories: a Character's trigger (the banner words), or an Action's family.
const TRIGGERS = {
  none:          { icon: '▫️', short: 'NONE',  label: 'No ability' },
  entry:         { icon: '👋', short: 'HEY!',  label: "HEY, I'M HERE! (on entry)" },
  activated:     { icon: '❄️', short: 'NAP',   label: 'NAP TIEM! (activated)' },
  passive:       { icon: '💨', short: 'STINK', label: 'BIG STINK! (passive)' },
  'act-direct':  { icon: '▲',  short: 'DIRECT', label: 'Action: direct' },
  'act-control': { icon: '⬢',  short: 'CONTROL', label: 'Action: control' },
};
// Backups as the designers play them now (co-dev notes after the first playtest).
const BACKUP_RULE = 'A Backup comes from your hand: same brand, or on the host’s Partner list. Once per turn, never on a character that just came into play, and it gives the host +2 HP.';
const triggerOf = c => c.type === 'ACT' ? 'act-' + (c.family || 'direct') : (c.timing || 'none');
const undoStack = [], redoStack = [];

// ---------------------------------------------------------------- utilities
let toastT;
function toast(msg, bad = false, action = null) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('bad', bad); t.classList.add('show');
  t.classList.toggle('has-action', !!action);
  if (action) { const b = document.createElement('button'); b.className = 'toast-btn'; b.textContent = action.label; b.onclick = () => { t.classList.remove('show'); action.fn(); }; t.append(' ', b); }
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), action ? 7000 : bad ? 4500 : 2600);
}
// Library-level undo: snapshot the parts of the set that deck/trash actions change, offer Undo.
const libState = () => JSON.stringify({ cards: P.cards, folders: P.folders, trash: P.trash, gameDecks: P.gameDecks });
function undoable(msg, before) {
  toast(msg, false, { label: '↶ Undo', fn: () => { Object.assign(P, JSON.parse(before)); save(); ui.picked.clear(); if (ui.view === 'editor') renderEditor(); else renderLibrary(); toast('Undone.'); } });
}
// Trash: deleted cards wait here for TRASH_DAYS before they're gone for good.
function trashCards(cards) {
  const at = Date.now();
  P.trash.unshift(...cards.map(card => ({ at, card })));
  P.cards = P.cards.filter(c => !cards.includes(c));
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
// Loading, sanitising and deck logic live in project.js (pure, unit-tested).
const registerNames = (c, p = P) => regNames(c, p);
// Clean slate: a new Forge starts empty. The base game is one click away as examples.
const emptyProject = () => upgrade({ setName: 'My Card Set' });
async function baseProject() {
  const cards = await (await fetch('data/cards.json', { cache: 'no-cache' })).json();
  return upgrade({ setName: 'LOL, FIGHT TIEM!', setCode: 'BETA', brands: Object.entries(BASE_SHAPES).map(([name, shape]) => ({ name, shape })), folders: [{ id: 'fbase', name: 'Base game', icon: '🐒' }], cards: cards.map(o => ({ ...fromEngine(o), folders: ['fbase'] })) });
}
let saveT, staleTab = false;
const TAB = newId('t'), bc = 'BroadcastChannel' in self ? new BroadcastChannel('lft-forge') : null;
function save() {
  if (staleTab) { $('#status').textContent = '⚠ not saved (changed in another tab)'; return; }
  $('#status').textContent = 'saving…';
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    try { await store.set('project', P); bc?.postMessage({ type: 'saved', tab: TAB }); $('#status').textContent = '✓ saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    catch (e) { console.error(e); $('#status').textContent = '⚠ not saved'; toast('Could not save in this browser (private window or storage full?). Download a save file!', true); }
  }, 350);
}
function gcAssets() {
  const used = usedAssets(P);
  for (const id of Object.keys(P.assets)) if (!used.has(id)) delete P.assets[id];
}
function resetTo(p) { P = p; ui.cur = null; ui.sel = null; ui.folder = 'all'; ui.picked.clear(); undoStack.length = redoStack.length = 0; save(); }

// ---------------------------------------------------------------- views
function setView(v) {
  ui.view = v;
  document.body.classList.toggle('zen', !!ED.zen && v === 'editor');
  for (const s of $$('.view')) s.classList.toggle('active', s.id === 'view-' + v);
  for (const b of $$('[data-view]')) b.dataset.view === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  if (v === 'library') renderLibrary();
  if (v === 'editor') { if (!cur()) ui.cur = P.cards[0]?.uid; renderEditor(); }
  if (v === 'brands') renderBrands();
  if (v === 'share') renderShare();
  if (v === 'manual') renderManual();
  window.scrollTo({ top: 0 });
  if (!$('#help').hidden) openHelp(0);
}
const cur = () => P.cards.find(c => c.uid === ui.cur);
const selLayer = () => cur()?.layout.layers.find(l => l.id === ui.sel);
function openEditor(uid) { ui.cur = uid; ui.sel = null; ui.field = null; ui.drawId = null; setView('editor'); }

// ---------------------------------------------------------------- library + decks
// "Decks" in the UI are `folders` in the data (a card can sit in several). A deck is
// tournament-legal at exactly DECK_SIZE cards with distinct names (see src/rules.lua).
const inFolder = (c, f = ui.folder) => f === 'all' || (f === 'unfiled' ? !c.folders.length : c.folders.includes(f));
const folderName = id => id === 'all' ? 'All cards' : id === 'unfiled' ? 'Not in a deck' : id === 'trash' ? 'Trash' : P.folders.find(f => f.id === id)?.name || '';
const deckStatus = id => deckReport(P, id);
function renderFolders() {
  if (!['all', 'unfiled', 'trash'].includes(ui.folder) && !P.folders.some(f => f.id === ui.folder)) ui.folder = 'all';
  const row = (id, icon, name, count, edit) => `<div class="folder ${ui.folder === id ? 'on' : ''}" data-folder="${id}">
    <button class="fbtn" data-open-folder="${id}" title="${esc(name)}"><span class="ficon">${icon}</span><span class="fname">${esc(name)}</span><span class="fcount">${count}</span></button>
    ${edit ? `<button class="fmenu" data-edit-folder="${id}" title="Rename, duplicate, back up or delete" aria-label="Deck options for ${esc(name)}">⋯</button>` : ''}</div>`;
  $('#folders').innerHTML = `<div class="folders-h">Decks</div>
    ${row('all', '🗂️', 'All cards', P.cards.length)}${row('unfiled', '📥', 'Not in a deck', P.cards.filter(c => !c.folders.length).length)}
    <div class="folder-sep"></div>
    ${P.folders.map(f => { const s = deckStatus(f.id); return row(f.id, f.icon, f.name, `${s.n}${s.legal ? ' ✓' : ''}`, true); }).join('')}
    <button class="btn small newfolder" id="newFolder">+ New deck</button>
    <div class="folder-sep"></div>${row('trash', '🗑️', 'Trash', P.trash.length)}`;
}
const welcomeArt = `<svg viewBox="0 0 220 150" aria-hidden="true"><g transform="rotate(-8 70 80)"><rect x="30" y="20" width="80" height="112" rx="8" fill="#171724"/><rect x="34" y="24" width="72" height="104" rx="6" fill="#fff9eb"/><rect x="38" y="28" width="64" height="22" rx="4" fill="#ff9ba7"/><rect x="38" y="56" width="64" height="34" fill="#89e4d7"/></g><g transform="rotate(7 150 80)"><rect x="110" y="20" width="80" height="112" rx="8" fill="#171724"/><rect x="114" y="24" width="72" height="104" rx="6" fill="#fff9eb"/><rect x="118" y="28" width="64" height="22" rx="4" fill="#ffda52"/><rect x="118" y="56" width="64" height="34" fill="#ceacff"/><text x="150" y="80" text-anchor="middle" font-family="Arial" font-weight="900" font-size="22" fill="#171724">?</text></g><polygon points="110,6 115,18 128,18 118,26 122,38 110,31 98,38 102,26 92,18 105,18" fill="#ffda52" stroke="#171724" stroke-width="3"/></svg>`;
function renderLibrary() {
  renderFolders();
  if (ui.folder === 'trash') return renderTrash();
  const f = ui.f;
  $('#fBrand').innerHTML = `<option value="all">Any brand</option>` + P.brands.map(b => `<option ${f.brand === b.name ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  $('#fTag').innerHTML = `<option value="all">Any allegiance</option>` + P.tags.map(t => `<option ${f.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('');
  for (const b of $$('#fType button')) b.setAttribute('aria-pressed', b.dataset.v === f.type);
  const fo = P.folders.find(x => x.id === ui.folder);
  $('#libTitle').textContent = `${fo ? fo.icon : ui.folder === 'unfiled' ? '📥' : '🗂️'} ${folderName(ui.folder)}`;
  $('#libTools').hidden = false;
  const q = f.q.toLowerCase();
  const list = P.cards.map((c, i) => ({ c, i })).filter(({ c }) => inFolder(c) &&
    (!q || [c.name, c.text, c.origin, c.flavor, ...(c.tags || [])].join(' ').toLowerCase().includes(q)) &&
    (f.type === 'all' || c.type === f.type) &&
    (f.tier === 'all' || c.tier === f.tier) && (f.brand === 'all' || c.origin === f.brand) &&
    (f.tag === 'all' || (c.tags || []).includes(f.tag) || (c.partners || []).includes(f.tag)) &&
    (f.trig === 'all' || triggerOf(c) === f.trig));
  const by = { cost: (a, b) => a.c.cost - b.c.cost || a.i - b.i, name: (a, b) => a.c.name.localeCompare(b.c.name), brand: (a, b) => String(a.c.origin || '~').localeCompare(String(b.c.origin || '~')) || a.i - b.i, trigger: (a, b) => Object.keys(TRIGGERS).indexOf(triggerOf(a.c)) - Object.keys(TRIGGERS).indexOf(triggerOf(b.c)) || a.i - b.i }[f.sort];
  if (by) list.sort(by);
  const pool = P.cards.filter(c => inFolder(c)), inView = pool.length, avg = inView ? (pool.reduce((s, c) => s + c.cost, 0) / inView).toFixed(1) : 0;
  const meter = fo && !fo.sandbox ? (s => `<b class="deckmeter ${s.legal ? 'ok' : ''}" title="${esc(s.note)}">${s.n}/${DECK_SIZE}</b> ${esc(s.note)} · `)(deckStatus(fo.id)) : '';
  $('#libCount').innerHTML = `${meter}${list.length === inView ? '' : list.length + ' of '}${inView} card${inView === 1 ? '' : 's'} · ${pool.filter(c => c.type === 'CHA').length} CHA · ${pool.filter(c => c.type === 'ACT').length} ACT · avg ${avg} SP · ${Object.entries(TRIGGERS).map(([k, t]) => [t, pool.filter(c => triggerOf(c) === k).length]).filter(([, n]) => n).map(([t, n]) => `<span title="${esc(t.label)}">${t.icon}${n}</span>`).join(' ')}`;
  $('#folderActs').innerHTML = fo ? (fo.sandbox ? `<button class="btn primary" data-fact="roll">🎲 Roll 5 more</button><button class="btn" data-fact="clear">🧹 Clear sandbox</button>` : `<button class="btn primary" data-fact="playtest" title="One file with this deck and its card art, for the playtest table or SAGA">🕹 Send to playtest</button>`) + `<button class="btn" data-fact="print" title="Real-size print sheet, 9 cards per page">🖨 Print</button><button class="btn" data-fact="edit" title="Rename, export, snapshot, duplicate or delete this deck">⋯ Deck</button>` : '';
  $('#selectBtn').setAttribute('aria-pressed', ui.selecting);
  $('#selectBtn').textContent = ui.selecting ? '✓ Done selecting' : '☑ Select';
  renderSelbar(list.map(x => x.c));
  const filtered = f.q || f.type !== 'all' || f.tier !== 'all' || f.brand !== 'all' || f.tag !== 'all' || f.trig !== 'all';
  const nf = ['tier', 'brand', 'tag', 'trig'].filter(k => f[k] !== 'all').length + (f.sort !== 'num' ? 1 : 0);
  $('#fCount').hidden = !nf; $('#fCount').textContent = nf;
  let empty = '';
  if (!P.cards.length) empty = `<div class="welcome">${welcomeArt}<h2>Your card library is empty</h2><p>Make your first card, start from a picture (drop one anywhere on this page), or load the 24 base-game cards to see how they're built.</p>
    <div class="btnrow"><button class="btn primary" data-new="CHA">+ Character</button><button class="btn primary alt" data-new="ACT">+ Action</button><button class="btn" data-new="pic">🖼 From picture</button><button class="btn" data-new="random">🎲 Random</button></div>
    <p style="margin-top:14px"><button class="btn" data-act="roll5">🧪 Start in the Sandbox (5 random cards)</button></p>
    <p class="small" style="margin-top:6px"><button class="link" data-act="loadBase">Load the base-game cards as examples</button> · <button class="link" data-act="openHelp">How does this work?</button></p></div>`;
  else if (!list.length && filtered) empty = `<div class="empty">No cards match. <button class="link" data-act="clearFilters">Clear filters</button></div>`;
  else if (!list.length) empty = `<div class="empty">This deck is empty.<br>Go to <b>All cards</b>, then drag cards onto it (on a phone, hold a card first). New cards made here land in it automatically.</div>`;
  const showStacks = ui.folder === 'all' && !filtered && P.folders.length && P.cards.length;
  const sb = sandbox();
  const tip = fo?.sandbox ? `<div class="tipcard slim">🧪 <b>Sandbox:</b> experiments live here and never count toward a deck. Tweak the fun ones, drag keepers onto a deck, then <b>🧹 Clear sandbox</b>.</div>` : '';
  const summary = fo && !fo.sandbox && pool.length ? deckSummary(fo) : '';
  $('#grid').innerHTML = tip + summary + (showStacks ? stacksMarkup() : '') + (empty || '') + (empty ? '' : list.map(({ c, i }) => {
    const errs = validate(c, P).filter(v => v[0] === 'error').length, picked = ui.picked.has(c.uid);
    const fIcons = c.folders.map(id => P.folders.find(x => x.id === id)?.icon).filter(Boolean).join('');
    return `<button class="tile ${picked ? 'picked' : ''} ${isHolo(c) ? 'holo' : ''}" data-uid="${c.uid}" title="${ui.selecting ? 'Select' : 'Edit'} ${esc(c.name)} (hold to drag)" ${ui.selecting ? `aria-pressed="${picked}"` : ''}>
      <div class="card-wrap">${thumbImg(c, i)}${errs ? `<span class="badge" title="${errs} problem(s)">!</span>` : ''}${ui.selecting ? `<span class="pick">${picked ? '✓' : ''}</span>` : ''}</div>
      <div class="cap"><b>${esc(c.name)}</b><span class="pill">${c.type}</span><span class="pill">${c.cost} SP</span><span class="pill trig" title="${esc(TRIGGERS[triggerOf(c)]?.label)}">${TRIGGERS[triggerOf(c)]?.icon} ${TRIGGERS[triggerOf(c)]?.short}</span>${c.type === 'CHA' ? `<span class="pill">${c.hp} HP</span>` : ''}${fIcons ? `<span title="In decks">${fIcons}</span>` : ''}</div></button>`;
  }).join(''));
  queueThumbs();
}
// Deck header: cost curve, brand mix, and whether it's the Red or Blue deck in the TTS game.
function deckSummary(fo) {
  const s = deckStatus(fo.id), st = deckStats(s.cards), max = Math.max(1, ...st.curve);
  const bars = st.curve.map((n, i) => { const h = Math.round(n / max * 44); return `<g><rect x="${8 + i * 29}" y="${62 - h}" width="22" height="${h}" rx="3" class="bar"/><text x="${19 + i * 29}" y="${56 - h}" class="bv">${n || ''}</text><text x="${19 + i * 29}" y="78" class="bl">${i === 7 ? '7+' : i}</text></g>`; }).join('');
  const side = ['Red', 'Blue'].find(k => P.gameDecks[k] === fo.id) || '';
  return `<div class="decksum">
    <div class="ds-box"><b>Cost curve</b> <small>(SP)</small><svg viewBox="0 0 240 84" role="img" aria-label="Cards by cost: ${st.curve.map((n, i) => `${n} at ${i}`).join(', ')}">${bars}</svg></div>
    <div class="ds-box"><b>Brand mix</b><div class="chips">${st.brands.map(([k, n]) => `<span class="chip static">${esc(k)} <b>${n}</b></span>`).join('')}</div></div>
    <div class="ds-box"><b>Deck check</b><p class="ds-legal ${s.legal ? 'ok' : 'warnc'}">${s.legal ? '✓ Ready: 20 cards, all different.' : `Not tournament-legal yet: ${esc(s.note)}.`}</p>${side ? `<small>${side === 'Red' ? '🔴' : '🔵'} ${side} deck in the Tabletop Simulator game</small>` : ''}</div>
  </div>`;
}
// ---- Trash view: deleted cards wait here for TRASH_DAYS days.
function renderTrash() {
  $('#libTitle').textContent = '🗑️ Trash';
  $('#libTools').hidden = true; $('#selbar').hidden = true;
  $('#libCount').textContent = `${P.trash.length} card${P.trash.length === 1 ? '' : 's'} · kept for ${TRASH_DAYS} days`;
  $('#folderActs').innerHTML = P.trash.length ? `<button class="btn primary" data-fact="restoreAll">↩ Restore all</button><button class="btn danger-btn" data-fact="emptyTrash">🔥 Empty trash</button>` : '';
  $('#grid').innerHTML = P.trash.length ? P.trash.map((t, i) => {
    const days = Math.max(0, TRASH_DAYS - Math.floor((Date.now() - t.at) / 864e5));
    return `<div class="ttile"><div class="card-wrap">${thumbImg(t.card, -1)}</div><div class="cap"><b>${esc(t.card.name)}</b><span class="pill">${days}d left</span></div>
      <div class="btnrow"><button class="btn small primary" data-trash-restore="${i}">↩ Restore</button><button class="btn small danger-btn" data-trash-del="${i}">Delete forever</button></div></div>`;
  }).join('') : '<div class="empty">The Trash is empty. Deleted cards wait here for ' + TRASH_DAYS + ' days, so a mis-click is never permanent.</div>';
  queueThumbs();
}
function restoreFromTrash(indexes) {
  const before = libState(), items = indexes.map(i => P.trash[i]).filter(Boolean), ids = new Set(P.folders.map(f => f.id));
  for (const t of items) {
    const c = t.card;
    if (P.cards.some(x => x.id === c.id)) c.id = uniqueCardId(c.name, P.cards);
    if (P.cards.some(x => x.uid === c.uid)) c.uid = newId('c');
    c.folders = c.folders.filter(id => ids.has(id));
    P.cards.push(c);
  }
  P.trash = P.trash.filter(t => !items.includes(t));
  save(); renderLibrary(); undoable(`↩ Restored ${items.length} card${items.length === 1 ? '' : 's'}.`, before);
}
// ---- Thumbnails. Every tile used to be a full live SVG; past ~100 cards that gets sluggish.
// Now each card is rasterised once (JPEG, half size), cached in memory and in IndexedDB, and
// only re-rendered when something that shows on the card actually changes.
const thumbURL = new Map(), thumbPending = new Map();
let thumbStore = {}, thumbBusy = false, thumbSaveT;
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
function thumbKey(c, index) {
  const { uid, folders, autoId, ...shown } = c;
  const brand = P.brands.find(b => b.name === c.origin);
  return hashStr(JSON.stringify([shown, index, P.setName, brand])) + c.layout.layers.length;
}
function thumbImg(c, index) {
  const key = thumbKey(c, index);
  if (!thumbURL.has(key) && thumbStore[key]) thumbURL.set(key, URL.createObjectURL(dataURLtoBlob(thumbStore[key])));
  if (thumbURL.has(key)) return `<img class="thumb" src="${thumbURL.get(key)}" alt="" draggable="false">`;
  thumbPending.set(key, { c, index });
  return `<img class="thumb pending" data-thumb="${key}" alt="" draggable="false">`;
}
async function queueThumbs() {
  if (thumbBusy) return; thumbBusy = true;
  try {
    for (const [key, { c, index }] of thumbPending) {
      thumbPending.delete(key);
      if (thumbURL.has(key) || !document.querySelector(`img[data-thumb="${key}"]`)) continue;
      const blob = await toImage(exportSVG(c, index, 0.5), W / 2, H / 2, 'image/jpeg', 0.82);
      thumbURL.set(key, URL.createObjectURL(blob));
      for (const img of $$(`img[data-thumb="${key}"]`)) { img.src = thumbURL.get(key); img.classList.remove('pending'); img.removeAttribute('data-thumb'); }
      thumbStore[key] = await blobToDataURL(blob);
    }
  } finally { thumbBusy = false; }
  if (thumbPending.size) return queueThumbs();
  clearTimeout(thumbSaveT);
  thumbSaveT = setTimeout(() => { const keys = Object.keys(thumbStore); for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete thumbStore[k]; store.set('thumbs', thumbStore).catch(() => { }); }, 1500);
}

// Procreate-style stacks: each deck is a little fanned pile of its first cards.
function stacksMarkup() {
  return `<div class="stacks-h">Decks</div>${P.folders.map(f => {
    const cs = P.cards.filter(c => c.folders.includes(f.id)), top = cs.slice(0, 3).reverse(), s = deckStatus(f.id);
    return `<div class="stack" data-folder="${f.id}"><button class="stack-pile" data-open-folder="${f.id}" title="Open ${esc(f.name)}">${top.length ? top.map((c, k) => `<span class="sc sc${top.length - 1 - k}">${thumbImg(c, P.cards.indexOf(c))}</span>`).join('') : '<span class="sc sc0 empty-pile">empty</span>'}</button>
      <div class="cap"><b>${f.icon} ${esc(f.name)}</b><span class="pill deckpill ${s.legal ? 'ok' : ''}" title="${esc(s.note)}">${s.label}</span><button class="fmenu" data-edit-folder="${f.id}" title="Rename, duplicate, back up…" aria-label="Deck options">⋯</button></div></div>`;
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
    <span class="selhint">Hold &amp; drag any selected card onto a deck</span>
    <span class="spacer"></span>
    <button class="btn small primary" data-sel="addTo" ${n ? '' : 'disabled'}>🃏 Add to deck</button>
    ${inReal ? `<button class="btn small" data-sel="removeFrom" ${n ? '' : 'disabled'}>Remove from this deck</button>` : ''}
    <button class="btn small" data-sel="dup" ${n ? '' : 'disabled'}>⧉ Duplicate</button>
    <button class="btn small" data-sel="export" ${n ? '' : 'disabled'}>⬇ Export ZIP</button>
    <button class="btn small" data-sel="print" ${n ? '' : 'disabled'}>🖨 Print</button>
    <button class="btn small danger-btn" data-sel="del" ${n ? '' : 'disabled'}>🗑 Delete</button>`;
}
async function pickFolder(title) {
  const v = await ask({ title, body: `<div class="pick-list">${P.folders.map(f => { const s = deckStatus(f.id); return `<button class="btn" value="${f.id}">${f.icon} ${esc(f.name)} <span class="muted">${s.label}</span></button>`; }).join('')}<button class="btn primary" value="__new">＋ New deck…</button></div>`, buttons: [{ label: 'Cancel', value: '' }] });
  if (v === '__new') return (await createFolder())?.id || null;
  return v || null;
}
function iconGrid(current) {
  return `<div class="icon-grid" role="radiogroup" aria-label="Deck icon">${FOLDER_ICONS.map(ic => `<label><input type="radio" name="ficon" value="${ic}" ${ic === current ? 'checked' : ''}>${ic}</label>`).join('')}</div>`;
}
async function createFolder() {
  const v = await ask({ title: '🃏 New deck', body: `<label class="field" style="display:block"><span class="lbl">Name</span><input type="text" id="modalInput" maxlength="40" placeholder="e.g. Red starter, Snack squad, Needs art" autocomplete="off"></label><div class="field"><span class="lbl">Icon</span>${iconGrid('🃏')}</div><p class="muted small">A deck is tournament-legal at ${DECK_SIZE} cards with different names, but it can also just be a collection.</p>`, buttons: [{ label: 'Cancel', value: '' }, { label: 'Create', value: 'ok', primary: true }] });
  const name = $('#modalInput').value.trim();
  if (v !== 'ok' || !name) return null;
  const f = { id: newId('f'), name, icon: $('#modalForm input[name=ficon]:checked')?.value || '🃏' };
  P.folders.push(f); save(); toast(`${f.icon} Deck “${name}” made`);
  return f;
}
async function editFolder(id) {
  const f = P.folders.find(x => x.id === id); if (!f) return;
  const s = deckStatus(id);
  const side = ['Red', 'Blue'].find(k => P.gameDecks[k] === id) || '';
  const v = await ask({ title: `${f.icon} Edit deck`, body: `<label class="field" style="display:block"><span class="lbl">Name</span><input type="text" id="modalInput" maxlength="40" value="${esc(f.name)}" autocomplete="off"></label><div class="field"><span class="lbl">Icon</span>${iconGrid(f.icon)}</div>
    <div class="field"><span class="lbl">Tabletop Simulator game <span class="muted">(legacy)</span></span><div class="radio-row">${[['', 'Not used'], ['Red', '🔴 Red deck'], ['Blue', '🔵 Blue deck']].map(([k, l]) => `<label><input type="radio" name="fside" value="${k}" ${side === k ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
    <p class="muted small">${s.n}/${DECK_SIZE} · ${esc(s.note)}. Deleting a deck never deletes its cards.</p>`, buttons: [{ label: 'Delete deck', value: 'del', danger: true }, { label: '⧉ Duplicate', value: 'dup' }, { label: '📸 Snapshot', value: 'version' }, { label: '⬇ Export ZIP', value: 'export' }, { label: 'Save', value: 'ok', primary: true }] });
  if (v === 'dup') return duplicateFolder(f);
  if (v === 'version') return saveVersion(f.id);
  if (v === 'export') return exportZip(P.cards.filter(c => c.folders.includes(f.id)), f.name);
  if (v === 'ok') {
    f.name = $('#modalInput').value.trim() || f.name; f.icon = $('#modalForm input[name=ficon]:checked')?.value || f.icon;
    const ns = $('#modalForm input[name=fside]:checked')?.value ?? side;
    for (const k of ['Red', 'Blue']) if (P.gameDecks[k] === id) P.gameDecks[k] = '';
    if (ns) P.gameDecks[ns] = id;
  }
  if (v === 'del') { const before = libState(); P.folders = P.folders.filter(x => x !== f); for (const c of P.cards) c.folders = c.folders.filter(x => x !== id); for (const s of ['Red', 'Blue']) if (P.gameDecks[s] === id) P.gameDecks[s] = ''; if (ui.folder === id) ui.folder = 'all'; undoable('Deck deleted (cards kept).', before); }
  if (v) { save(); renderLibrary(); }
}
function duplicateCards(cards, folders) {
  for (const c of cards) { const d = clone(c); d.uid = newId('c'); d.name += ' (copy)'; d.id = uniqueCardId(d.name, P.cards); d.autoId = true; d.folders = [...folders]; P.cards.push(d); }
}
async function duplicateFolder(f) {
  const cs = P.cards.filter(c => c.folders.includes(f.id));
  const v = await ask({ title: `⧉ Duplicate “${esc(f.name)}”`, body: `<p><b>Same cards</b>: a second deck with the same ${cs.length} cards (edit a card once, both decks update). Handy for trying deck variants.</p><p><b>Copy the cards</b>: brand-new copies you can change without touching the originals.</p>`, buttons: [{ label: 'Cancel', value: '' }, { label: 'Same cards', value: 'ref' }, { label: 'Copy the cards', value: 'copy', primary: true }] });
  if (!v) return;
  const before = libState();
  const nf = { id: newId('f'), name: f.name + ' copy', icon: f.icon }; P.folders.push(nf);
  if (v === 'ref') for (const c of cs) c.folders.push(nf.id); else duplicateCards(cs, [nf.id]);
  save(); ui.folder = nf.id; renderLibrary(); undoable(`⧉ Made “${nf.name}”`, before);
}
function addToFolder(uids, id) {
  const before = libState();
  let n = 0;
  for (const c of P.cards) if (uids.includes(c.uid)) { if (id === 'unfiled') { if (c.folders.length) n++; c.folders = []; } else if (!c.folders.includes(id)) { c.folders.push(id); n++; } }
  save(); renderLibrary();
  undoable(id === 'unfiled' ? `Took ${n} out of all decks` : `${P.folders.find(f => f.id === id)?.icon} Added ${n} card${n === 1 ? '' : 's'} to “${folderName(id)}”`, before);
}
function addCard(c, open = true) {
  c.uid = newId('c');
  c.folders = P.folders.some(f => f.id === ui.folder) ? [ui.folder] : [];
  const i = P.cards.indexOf(cur());
  P.cards.splice(i >= 0 && ui.view === 'editor' ? i + 1 : P.cards.length, 0, c);
  registerNames(c); save();
  if (open) openEditor(c.uid); else renderLibrary();
}
// ---- Sandbox: a scratch deck for random experiments. Keepers get dragged into real decks.
const sandbox = () => P.folders.find(f => f.sandbox);
function ensureSandbox() {
  let s = sandbox();
  if (!s) { s = { id: newId('f'), name: 'Sandbox', icon: '🧪', sandbox: true }; P.folders.unshift(s); }
  return s;
}
function randomCard() {
  const type = Math.random() < 0.7 ? 'CHA' : 'ACT', c = newCard(type, P, randomName(type));
  c.cost = Math.floor(Math.random() * 5) + (type === 'ACT' ? 1 : 0);
  if (type === 'CHA') {
    c.hp = Math.max(1, Math.round(1.55 * c.cost + 2 + (Math.random() * 2 - 1)));
    c.tier = c.cost >= 4 ? 'high' : c.cost >= 2 ? 'mid' : 'low';
    const brands = P.brands.filter(b => b.name !== 'Unassigned'); c.origin = (brands[Math.floor(Math.random() * brands.length)] || P.brands[0]).name;
    const peer = P.cards.find(o => o.origin === c.origin && o.tags?.length); c.tags = peer ? [...peer.tags] : []; c.partners = [...c.tags];
  }
  Object.assign(c, randomAbility(type));
  Object.assign(c.layout, Object.values(PRESETS)[Math.floor(Math.random() * Object.keys(PRESETS).length)]);
  c.id = uniqueCardId(c.name, P.cards);
  return normalize(c);
}
function surprise() {
  const c = randomCard(), deck = P.folders.find(f => f.id === ui.folder);
  if (deck) { addCard(c); return toast('🎲 Fresh card, hot off the forums!'); }
  const sb = ensureSandbox(); c.uid = newId('c'); c.folders = [sb.id];
  P.cards.push(c); registerNames(c); save(); openEditor(c.uid);
  toast('🎲 Fresh card! It lives in the 🧪 Sandbox until you drag it into a deck.');
}
function rollSandbox(n = 5) {
  const sb = ensureSandbox();
  for (let i = 0; i < n; i++) { const c = randomCard(); c.uid = newId('c'); c.folders = [sb.id]; P.cards.push(c); registerNames(c); }
  save(); ui.folder = sb.id; ui.picked.clear(); renderLibrary(); window.scrollTo({ top: 0 });
  toast(`🎲 Rolled ${n} into the Sandbox. Tweak the fun ones, drag keepers into a deck.`);
}
async function clearSandbox() {
  const sb = sandbox(); if (!sb) return;
  const cs = P.cards.filter(c => c.folders.includes(sb.id)), only = cs.filter(c => c.folders.length === 1), kept = cs.length - only.length;
  if (!cs.length) return toast('The Sandbox is already empty.');
  if (!await confirmAsk('🧹 Clear the Sandbox?', `Move the <b>${only.length}</b> card${only.length === 1 ? '' : 's'} that only live in the Sandbox to the 🗑 Trash${kept ? `, and take ${kept} card${kept === 1 ? '' : 's'} that are also in real decks out of it (they stay in those decks)` : ''}? The Trash keeps them for ${TRASH_DAYS} days.`, 'Clear')) return;
  const before = libState();
  trashCards(only);
  for (const c of P.cards) c.folders = c.folders.filter(x => x !== sb.id);
  ui.picked.clear(); save(); renderLibrary(); undoable('🧹 Sandbox cleared.', before);
}
function newFromButton(kind) { if (kind === 'random') surprise(); else if (kind === 'pic') $('#cardPicPick').click(); else addCard(newCard(kind, P)); }

$('#folders').addEventListener('click', async e => {
  const open = e.target.closest('[data-open-folder]'), edit = e.target.closest('[data-edit-folder]');
  if (edit) return editFolder(edit.dataset.editFolder);
  if (open) { ui.folder = open.dataset.openFolder; ui.picked.clear(); renderLibrary(); return; }
  if (e.target.closest('#newFolder')) { const f = await createFolder(); if (f) { if (ui.picked.size) addToFolder([...ui.picked], f.id); ui.folder = f.id; renderLibrary(); } }
});

// ---------------------------------------------------------------- drag cards into decks (mouse + touch)
// Mouse: press and drag. Touch: hold a moment, then drag (a quick swipe still scrolls the page).
// Holding without moving on touch selects the card instead: that's how phones batch-select.
let drag = null, justDragged = false;
const LONG_PRESS = 380;
function renderTray() {
  const here = P.folders.find(f => f.id === ui.folder), n = drag.uids.length;
  const item = (id, icon, name, extra = '', cls = '') => `<div class="dt-item ${cls}" data-drop="${id}"><span class="dt-ic">${icon}</span><span class="dt-nm">${esc(name)}</span>${extra}</div>`;
  $('#dropTray').innerHTML = `<div class="dt-h">Drop <b>${n} card${n === 1 ? '' : 's'}</b> on a deck</div><div class="dt-grid">
    ${P.folders.filter(f => f.id !== ui.folder).map(f => { const s = deckStatus(f.id); return item(f.id, f.icon, f.name, `<small class="${s.legal ? 'ok' : ''}">${s.label}</small>`); }).join('')}
    ${item('new', '＋', 'New deck', '', 'new')}${item('dup', '⧉', here ? `Duplicate in ${here.name}` : 'Duplicate')}
    ${here ? item('remove', '➖', `Remove from ${here.name}`, '', 'out') : item('unfiled', '📥', 'Take out of all decks', '', 'out')}${item('trash', '🗑️', 'Trash', '', 'out')}</div>`;
}
function startDrag() {
  if (!drag || drag.active) return;
  clearTimeout(drag.timer);
  drag.active = true;
  drag.uids = ui.picked.has(drag.uid) ? [...ui.picked] : [drag.uid];
  navigator.vibrate?.(12);
  const g = document.createElement('div'); g.className = 'drag-ghost';
  g.innerHTML = (drag.tile.querySelector('.card-wrap img, .card-wrap svg')?.outerHTML || '') + (drag.uids.length > 1 ? `<span class="dg-n">${drag.uids.length}</span>` : '');
  document.body.append(g); drag.ghost = g;
  drag.tile.classList.add('lifted');
  renderTray(); $('#dropTray').hidden = false; document.body.classList.add('card-dragging');
  moveDrag(drag.x, drag.y);
}
function dropTargetAt(x, y) {
  const el = document.elementFromPoint(x, y)?.closest('[data-drop],[data-folder]');
  if (!el) return null;
  const id = el.dataset.drop ?? el.dataset.folder;
  return id === 'all' || id === ui.folder ? null : { el, id };
}
function moveDrag(x, y) {
  drag.x = x; drag.y = y;
  if (Math.hypot(x - drag.x0, y - drag.y0) > 12) drag.moved = true;
  drag.ghost.style.transform = `translate(${x - 42}px, ${y - 60}px) rotate(-6deg)`;
  const t = drag.moved ? dropTargetAt(x, y) : null;
  $$('.drop').forEach(e => e !== t?.el && e.classList.remove('drop'));
  t?.el.classList.add('drop');
}
function stopDrag() {
  if (!drag) return;
  clearTimeout(drag.timer);
  drag.ghost?.remove(); drag.tile?.classList.remove('lifted');
  $('#dropTray').hidden = true; document.body.classList.remove('card-dragging');
  $$('.drop').forEach(e => e.classList.remove('drop'));
  drag = null;
}
function endDrag() {
  const d = drag; if (!d?.active) return stopDrag();
  const t = dropTargetAt(d.x, d.y), heldStill = d.touch && !d.moved;
  stopDrag();
  justDragged = true; setTimeout(() => justDragged = false, 400); // swallow the click some browsers send after a drag
  // Only a real drag drops. Holding still and letting go selects, even if the tray slid up under the finger.
  if (t && d.moved) return dropCards(d.uids, t.id);
  if (heldStill) {
    if (!ui.selecting) { ui.selecting = true; ui.picked.clear(); }
    ui.picked.has(d.uid) ? ui.picked.delete(d.uid) : ui.picked.add(d.uid);
    renderLibrary();
    toast('Selected. Tap more cards, then hold and drag any of them onto a deck.');
  }
}
async function dropCards(uids, target) {
  const cards = P.cards.filter(c => uids.includes(c.uid)), here = P.folders.find(f => f.id === ui.folder), before = libState();
  if (!cards.length) return;
  if (target === 'dup') { duplicateCards(cards, here ? [here.id] : []); save(); renderLibrary(); return undoable(`⧉ Duplicated ${cards.length}`, before); }
  if (target === 'unfiled') return addToFolder(uids, 'unfiled');
  if (target === 'trash') { trashCards(cards); ui.picked.clear(); save(); renderLibrary(); return undoable(`🗑 Moved ${cards.length} to the Trash.`, before); }
  if (target === 'remove' && here) { for (const c of cards) c.folders = c.folders.filter(x => x !== here.id); ui.picked.clear(); save(); renderLibrary(); return undoable(`Removed ${cards.length} from “${here.name}”`, before); }
  if (target === 'new') { const nf = await createFolder(); if (!nf) return; target = nf.id; }
  const f = P.folders.find(x => x.id === target); if (!f) return;
  const fresh = cards.filter(c => !c.folders.includes(f.id));
  if (!fresh.length) return toast(`Already in “${f.name}”.`);
  const what = fresh.length === 1 ? `<b>${esc(fresh[0].name)}</b>` : `these <b>${fresh.length}</b> cards`;
  const v = await ask({ title: `${f.icon} Into “${esc(f.name)}”`, body: `<p>What should happen to ${what}?</p><ul class="choice-help">
    <li><b>＋ Add</b>: the same card, now in both places. Edit it once and it changes everywhere.</li>
    ${here ? `<li><b>➡ Move</b>: add it here and take it out of “${esc(here.name)}”.</li>` : ''}
    <li><b>⧉ Duplicate</b>: a separate copy you can change on its own.</li></ul>`,
    buttons: [{ label: 'Cancel', value: '' }, { label: '⧉ Duplicate', value: 'dup' }, ...(here ? [{ label: '➡ Move', value: 'move' }] : []), { label: '＋ Add', value: 'add', primary: true }] });
  if (!v) return;
  if (v === 'dup') duplicateCards(fresh, [f.id]);
  else for (const c of fresh) { c.folders.push(f.id); if (v === 'move') c.folders = c.folders.filter(x => x !== here.id); }
  ui.picked.clear(); save(); renderLibrary();
  const s = deckStatus(f.id);
  undoable(`${f.icon} ${v === 'dup' ? 'Duplicated' : v === 'move' ? 'Moved' : 'Added'} ${fresh.length} → “${f.name}” (${s.label}${s.legal ? ' ✓' : ''})`, before);
}
let marq = null;
function startMarquee(e) {
  marq = { x0: e.clientX, y0: e.clientY, add: e.ctrlKey || e.metaKey || e.shiftKey, base: new Set(ui.picked), hit: new Set(), moved: false, el: null };
}
addEventListener('pointermove', e => {
  if (!marq) return;
  const x = Math.min(e.clientX, marq.x0), y = Math.min(e.clientY, marq.y0), w = Math.abs(e.clientX - marq.x0), h = Math.abs(e.clientY - marq.y0);
  if (!marq.moved && w + h < 8) return;
  if (!marq.el) { marq.el = document.createElement('div'); marq.el.className = 'marquee'; document.body.append(marq.el); document.body.classList.add('card-dragging'); }
  marq.moved = true; Object.assign(marq.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  marq.hit.clear();
  for (const t of $$('#grid .tile')) {
    const r = t.getBoundingClientRect(), on = r.left < x + w && r.right > x && r.top < y + h && r.bottom > y;
    if (on) marq.hit.add(t.dataset.uid);
    t.classList.toggle('picked', on || (marq.add && marq.base.has(t.dataset.uid)));
  }
});
addEventListener('pointerup', () => {
  if (!marq) return;
  const m = marq; marq = null; m.el?.remove(); document.body.classList.remove('card-dragging');
  if (!m.moved) return;
  ui.picked = m.add ? new Set([...m.base, ...m.hit]) : new Set(m.hit);
  ui.selecting = ui.picked.size > 0 || ui.selecting;
  justDragged = true; setTimeout(() => justDragged = false, 400);
  renderLibrary();
  if (m.hit.size) toast(`Selected ${ui.picked.size}. Drag any of them onto a deck.`);
});
function gather(t) {
  if (!t || drag.uids.includes(t.dataset.uid)) return;
  drag.uids.push(t.dataset.uid); t.classList.add('lifted', 'gathered'); navigator.vibrate?.(8);
  drag.ghost.querySelector('.dg-n')?.remove();
  drag.ghost.insertAdjacentHTML('beforeend', `<span class="dg-n">${drag.uids.length}</span>`);
  renderTray();
}
$('#grid').addEventListener('pointerdown', e => {
  const t = e.target.closest('.tile');
  if (drag) { if (t && drag.active && drag.touch && e.pointerType !== 'mouse' && e.pointerId !== drag.id) gather(t); return; }
  if (!t && e.pointerType === 'mouse' && e.button === 0 && !e.target.closest('button,a,input,select,.stack,.tipcard')) return startMarquee(e);
  if (!t || e.button > 0) return;
  drag = { uid: t.dataset.uid, tile: t, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse', active: false, moved: false };
  if (drag.touch) drag.timer = setTimeout(startDrag, LONG_PRESS);
});
addEventListener('pointermove', e => {
  if (!drag || drag.touch || e.pointerId !== drag.id) return;
  if (!drag.active) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return; drag.x = e.clientX; drag.y = e.clientY; startDrag(); }
  moveDrag(e.clientX, e.clientY);
});
addEventListener('pointerup', e => { if (drag && !drag.touch && e.pointerId === drag.id) endDrag(); });
addEventListener('pointercancel', e => { if (drag && !drag.touch && e.pointerId === drag.id) stopDrag(); });
// Touch is tracked with touch events so the page can be held still (no scrolling) mid-drag.
addEventListener('touchstart', e => {
  if (!drag?.touch) return;
  if (drag.touchId == null) drag.touchId = e.changedTouches[0].identifier;
  else if (!drag.active && e.touches.length > 1) stopDrag(); // two fingers before the hold = a pinch, not a drag
}, { passive: true });
addEventListener('touchmove', e => {
  if (!drag?.touch) return;
  const p = [...e.touches].find(x => x.identifier === drag.touchId) || e.touches[0]; if (!p) return;
  if (!drag.active) { if (Math.hypot(p.clientX - drag.x0, p.clientY - drag.y0) > 10) stopDrag(); return; }
  e.preventDefault(); moveDrag(p.clientX, p.clientY);
}, { passive: false });
addEventListener('touchend', e => {
  if (!drag?.touch) return;
  if (drag.touchId != null && ![...e.changedTouches].some(x => x.identifier === drag.touchId)) return; // a gathering finger lifted
  drag.active ? endDrag() : stopDrag();
});
addEventListener('touchcancel', () => { if (drag?.touch) stopDrag(); });
$('#grid').addEventListener('contextmenu', e => { if (e.target.closest('.tile')) e.preventDefault(); });
$('#selbar').addEventListener('click', async e => {
  const b = e.target.closest('[data-sel]'); if (!b) return;
  const a = b.dataset.sel, uids = [...ui.picked], picked = P.cards.filter(c => ui.picked.has(c.uid)), before = libState();
  if (a === 'all') { for (const id of $('#selbar').dataset.visible.split(',').filter(Boolean)) ui.picked.add(id); }
  if (a === 'none') ui.picked.clear();
  if (a === 'addTo') { const id = await pickFolder(`Add ${uids.length} card${uids.length === 1 ? '' : 's'} to…`); if (id) return dropCards(uids, id); }
  if (a === 'removeFrom') { for (const c of picked) c.folders = c.folders.filter(x => x !== ui.folder); ui.picked.clear(); save(); undoable(`Removed ${picked.length} from “${folderName(ui.folder)}”`, before); }
  if (a === 'dup') { duplicateCards(picked, P.folders.some(f => f.id === ui.folder) ? [ui.folder] : []); save(); undoable(`Duplicated ${picked.length}`, before); }
  if (a === 'export') return exportZip(picked, `${folderName(ui.folder)}-selection`);
  if (a === 'print') return printSheet(picked, `${folderName(ui.folder)} selection`);
  if (a === 'del') { trashCards(picked); ui.picked.clear(); save(); undoable(`🗑 Moved ${picked.length} to the Trash.`, before); }
  renderLibrary();
});
$('#selectBtn').addEventListener('click', () => { ui.selecting = !ui.selecting; ui.picked.clear(); renderLibrary(); });
$('#folderActs').addEventListener('click', async e => {
  const a = e.target.closest('[data-fact]')?.dataset.fact;
  if (a === 'restoreAll') return restoreFromTrash(P.trash.map((_, i) => i));
  if (a === 'emptyTrash') { if (await confirmAsk('🔥 Empty the Trash?', `Permanently delete ${P.trash.length} card${P.trash.length === 1 ? '' : 's'}? This can't be undone.`, 'Delete forever')) { P.trash = []; gcAssets(); save(); renderLibrary(); toast('Trash emptied.'); } return; }
  const f = P.folders.find(x => x.id === ui.folder); if (!a || !f) return;
  if (a === 'export') exportZip(P.cards.filter(c => c.folders.includes(f.id)), f.name);
  if (a === 'version') saveVersion(f.id);
  if (a === 'edit') editFolder(f.id);
  if (a === 'roll') rollSandbox(5);
  if (a === 'clear') clearSandbox();
  if (a === 'playtest') playtestFile([f], f.name);
  if (a === 'print') printSheet(P.cards.filter(c => c.folders.includes(f.id)), f.name);
});
// Zoom the card grid (slider, or Ctrl + scroll wheel over the cards).
function setZoom(px) { px = clamp(Math.round(px), 90, 320); document.documentElement.style.setProperty('--tile', px + 'px'); $('#zoom').value = px; lsSet('forge-zoom', px); }
$('#zoom').addEventListener('input', e => setZoom(+e.target.value));
$('#zoomOut').addEventListener('click', () => setZoom(+$('#zoom').value * 0.8));
$('#zoomIn').addEventListener('click', () => setZoom(+$('#zoom').value * 1.25));
$('#grid').addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(+$('#zoom').value * Math.exp(-e.deltaY * 0.002)); }, { passive: false });
setZoom(+(lsGet('forge-zoom') || (matchMedia('(max-width: 760px)').matches ? 104 : 150)));

// ---------------------------------------------------------------- editor: window layout
const ED = { swap: false, focus: false, bg: 0, w: 400 };
try { Object.assign(ED, JSON.parse(lsGet('forge-editor') || '{}')); } catch { }
Object.assign(ED, { swap: false, focus: false, bg: 0 });
const BACKDROPS = ['studio', 'checker', 'dark', 'light', 'felt'];
function applyEditorLayout() {
  const e = $('#view-editor');
  e.classList.toggle('swap', !!ED.swap); e.classList.toggle('focus', !!ED.focus);
  $('#stage').dataset.bg = BACKDROPS[ED.bg % BACKDROPS.length];
  document.documentElement.style.setProperty('--insp-w', clamp(ED.w, 300, 720) + 'px');
  // Workspace windows: each can be minimised, and Full canvas hides everything but the card.
  document.body.classList.toggle('zen', !!ED.zen && ui.view === 'editor');
  $('#zenBtn').setAttribute('aria-pressed', !!ED.zen); $('#zenBtn').title = ED.zen ? 'Exit full canvas (F or Esc)' : 'Full canvas: hide everything but the card (F)';
  $('#toolRail').classList.toggle('min', !!ED.railMin);
  $('#layerBar').classList.toggle('min', !!ED.dockMin);
  $('#panelTab').hidden = !(ED.focus || ED.zen);
  lsSet('forge-editor', JSON.stringify(ED));
}
$('#zenBtn').addEventListener('click', () => toggleZen());
$('#panelTab').addEventListener('click', () => { ED.focus = false; ED.zen = false; applyEditorLayout(); });
function toggleZen(on = !ED.zen) { ED.zen = on; applyEditorLayout(); requestAnimationFrame(() => applyView()); toast(on ? 'Full canvas — press F or Esc to bring the panels back' : 'Panels are back'); }
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
// Canvas zoom: z plus the card point shown at the centre of the stage. The SVG keeps its CSS
// size and only its viewBox changes, so all the pointer maths (getScreenCTM) keeps working.
const view = { z: 1, cx: 250, cy: 350 };
const tool = { name: 'move', space: false };
function renderEditor() {
  const c = cur();
  for (const id of ['#prevCard', '#nextCard']) $(id).disabled = P.cards.length < 2;
  for (const b of $$('#toolRail button, #pngBtn, #shareCardBtn, #layersBtn, #zoomPill button')) b.disabled = !c;
  if (!c) {
    svg.innerHTML = ''; $('#edTitle').textContent = 'No card open'; $('#layerBar').innerHTML = ''; $('#checks').innerHTML = ''; $('#layersPop').hidden = true;
    $('#inspector').innerHTML = `<div class="ed-empty"><p><b>No card to edit yet.</b></p><div class="btnrow" style="justify-content:center"><button class="btn primary" data-new="CHA">+ New Character</button><button class="btn primary alt" data-new="ACT">+ New Action</button><button class="btn" data-new="random">🎲 Surprise me</button></div></div>`;
    updateUndoButtons(); return;
  }
  applyLayersOpen();
  renderStage(); renderInspector(); renderLayerBar(); renderLayersPop(); renderChecks(); updateTitle(); updateUndoButtons();
}
function updateTitle() { const c = cur(); if (c) $('#edTitle').textContent = `#${P.cards.indexOf(c) + 1} ${c.name}`; }
function renderStage() {
  const c = cur(); if (!c) return;
  svg.innerHTML = cardInner(c, { project: P, index: P.cards.indexOf(c), uid: 'ed', href, sel: tool.name === 'draw' ? null : ui.sel, field: ui.field, editing: true, handleK: 1 / view.z });
}
function updateLayerDOM(L) {
  const t = layerTransform(L);
  for (const g of svg.querySelectorAll(`[data-layer="${L.id}"],[data-ghost="${L.id}"]`)) g.setAttribute('transform', t);
  svg.querySelector(`[data-layer="${L.id}"]`)?.setAttribute('opacity', L.opacity ?? 1);
  const h = svg.querySelector('#handles'); if (h) h.innerHTML = handlesMarkup(L, 1 / view.z);
}
function refreshLayers() { renderLayerBar(); renderLayersPop(); }
function select(id) { ui.sel = id; if (id) ui.field = null; renderStage(); refreshLayers(); }
// Card text (name, cost, HP, banner, rules, brand, partners) is edited in the dock, not as layers.
function selectField(key) {
  ui.field = key; ui.sel = null; closeInline();
  if (tool.name === 'draw') setTool('move');
  renderStage(); refreshLayers();
  const f = $('#layerBar [data-focus]'); if (f) { f.focus(); f.select?.(); }
}
function clearField() { if (!ui.field) return; ui.field = null; renderStage(); renderLayerBar(); }
function stepCard(d) { if (P.cards.length < 2) return; const i = P.cards.indexOf(cur()); ui.cur = P.cards[(i + d + P.cards.length) % P.cards.length].uid; ui.sel = null; ui.field = null; ui.drawId = null; renderEditor(); }

// ---- canvas zoom & pan
function metrics() { const r = svg.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, k: r.width * view.z / 640 }; }
const clientToCard = (px, py, m = metrics()) => ({ x: view.cx + (px - m.x) / m.k, y: view.cy + (py - m.y) / m.k });
function applyView() {
  if (!(view.z > 1.001) || !Number.isFinite(view.cx + view.cy)) Object.assign(view, { z: 1, cx: 250, cy: 350 });
  view.cx = clamp(view.cx, 0, 500); view.cy = clamp(view.cy, 0, 700);
  const w = 640 / view.z, h = 840 / view.z;
  svg.setAttribute('viewBox', `${(view.cx - w / 2).toFixed(2)} ${(view.cy - h / 2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
  $('#zoomPct').textContent = Math.round(view.z * 100) + '%';
  $('#stage').classList.toggle('zoomed', view.z > 1);
  const hd = svg.querySelector('#handles'); if (hd) hd.innerHTML = handlesMarkup(selLayer(), 1 / view.z);
  closeInline();
}
// Zoom so the card point under (px, py) stays under the finger / cursor.
function zoomAt(z, px, py) {
  const m = metrics(); if (!m.k) return; px ??= m.x; py ??= m.y;
  const anchor = clientToCard(px, py, m);
  view.z = clamp(z, 1, 8);
  const m2 = metrics();
  view.cx = anchor.x - (px - m2.x) / m2.k; view.cy = anchor.y - (py - m2.y) / m2.k;
  applyView();
}
function setTool(name) {
  const was = tool.name; tool.name = name;
  for (const b of $$('#toolRail [data-tool]')) b.setAttribute('aria-pressed', b.dataset.tool === name);
  $('#stage').classList.toggle('hand', name === 'hand' || tool.space);
  $('#stage').classList.toggle('drawing', name === 'draw' && !tool.space);
  if (name === 'draw') ui.field = null;
  if ((was === 'draw') !== (name === 'draw') && cur()) { renderStage(); renderLayerBar(); }
}

// ---- tool rail, layers button, zoom pill
const RAIL = [
  ['move', I.move, 'Move', 'Move & select (V)'], ['hand', I.hand, 'Pan', 'Pan the canvas (H, or hold Space)'], ['draw', I.brush, 'Draw', 'Draw & sketch (B) · eraser (E)'], null,
  ['addImg', I.image, 'Image', 'Add an image (I)'], ['addText', I.text, 'Text', 'Add text (T)'], ['addSticker', I.shapes, 'Shapes', 'Shapes & stickers (S)'], ['addLogo', I.logo, 'Logo', 'Brand logo'],
];
$('#toolRail').innerHTML = `<button type="button" class="rail-min" data-railmin title="Minimise / expand the tools" aria-label="Minimise or expand the tools">${I.minus}</button>` + RAIL.map(r => !r ? '<span class="rail-sep" aria-hidden="true"></span>'
  : `<button type="button" class="tool" ${['move', 'hand', 'draw'].includes(r[0]) ? `data-tool="${r[0]}" aria-pressed="${r[0] === 'move'}"` : `id="${r[0]}"`} title="${r[3]}" aria-label="${r[3]}">${r[1]}<small>${r[2]}</small></button>`).join('');
$('#toolRail').addEventListener('click', e => {
  if (e.target.closest('[data-railmin]')) { ED.railMin = !ED.railMin; return applyEditorLayout(); }
  const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool);
});
$('#addImg').addEventListener('click', () => $('#imgPick').click());
$('#addText').addEventListener('click', () => addText());
$('#addLogo').addEventListener('click', () => addLogo());
$('#addSticker').addEventListener('click', () => stickerPicker());
$('#zoomPill').innerHTML = `<button type="button" data-z="out" title="Zoom out (Ctrl −)" aria-label="Zoom out">${I.minus}</button><button type="button" id="zoomPct" data-z="fit" title="Fit the card (Ctrl 0)">100%</button><button type="button" data-z="in" title="Zoom in (Ctrl +)" aria-label="Zoom in">${I.plus}</button>`;
$('#zoomPill').addEventListener('click', e => { const z = e.target.closest('[data-z]')?.dataset.z; if (z) zoomAt(z === 'fit' ? 1 : view.z * (z === 'in' ? 1.25 : 0.8)); });
$('#layersBtn').addEventListener('click', () => toggleLayers());
ED.layersOpen ??= innerWidth >= 1200;
function toggleLayers(open = !ED.layersOpen) { ED.layersOpen = open; lsSet('forge-editor', JSON.stringify(ED)); applyLayersOpen(); }
function applyLayersOpen() {
  const open = !!ED.layersOpen && !!cur(), pop = $('#layersPop'), was = !pop.hidden;
  pop.hidden = !open; $('#layersBtn').setAttribute('aria-pressed', open);
  if (open && !was) renderLayersPop();
}

// ---- pointer gestures on the card
const pts = new Map(), ptsC = new Map(); let gest = null;
const toCard = e => { const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse()); return { x: p.x, y: p.y }; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
const normDeg = d => ((d + 540) % 360) - 180;
const wantsPan = e => tool.name === 'hand' || tool.space || e.button === 1;
const startPan = e => ({ mode: 'pan', x0: e.clientX, y0: e.clientY, cx0: view.cx, cy0: view.cy, k: metrics().k });
const midC = () => { const [a, b] = [...ptsC.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.max(1, dist(a, b)) }; };
// Axis-aligned half-size of a layer after scale + rotation, for snapping and the align buttons.
function extents(L) {
  const { hw: bw, hh: bh } = layerBox(L), hw = bw * (L.sx ?? 1), hh = bh * (L.sy ?? 1), r = (L.rot || 0) * Math.PI / 180, s = L.scale, c = Math.abs(Math.cos(r)), n = Math.abs(Math.sin(r));
  return { ex: (hw * c + hh * n) * s, ey: (hw * n + hh * c) * s };
}
// Smart guides: snap the layer's centre or edges to the card centre and the art window, and
// draw a pink line while it's snapped (hold Alt to move freely).
function snapMove(L, free) {
  const g = svg.querySelector('#guides'); if (!g) return;
  const lines = [];
  if (!free) {
    const { ex, ey } = extents(L), thr = 7 / view.z, midArt = ART.y + ART.h / 2;
    const xs = [[250, 0], [ART.x, -1], [ART.x + ART.w, 1]];
    const ys = [...(L.zone === 'top' ? [[350, 0]] : []), [midArt, 0], [ART.y, -1], [ART.y + ART.h, 1]];
    for (const [axis, list, e] of [['x', xs, ex], ['y', ys, ey]])
      for (const [v, side] of list) { const pos = L[axis] + side * e; if (Math.abs(pos - v) < thr) { L[axis] += v - pos; lines.push([axis, v]); break; } }
  }
  const w = (1.6 / view.z).toFixed(2);
  g.innerHTML = lines.map(([a, v]) => a === 'x' ? `<line x1="${v}" y1="-70" x2="${v}" y2="770" stroke="#ff3ea5" stroke-width="${w}"/>` : `<line x1="-70" y1="${v}" x2="570" y2="${v}" stroke="#ff3ea5" stroke-width="${w}"/>`).join('');
}
let editTap = null;
svg.addEventListener('pointerdown', e => {
  if (!cur() || e.button > 1) return;
  // A first finger or the mouse means nothing else is down: forget any pointer whose release we
  // never saw (a file picker or alt-tab can swallow it), or every later tap would look like a pinch.
  if (e.isPrimary && (pts.size || editTap)) { pts.clear(); ptsC.clear(); editTap = null; if (gest?.mode === 'draw') cancelStroke(); gest = null; }
  const pan = wantsPan(e);
  const hit = !pan && tool.name !== 'draw' && e.target.closest('[data-edit]');
  if (hit && !pts.size) { editTap = { key: hit.dataset.edit, x: e.clientX, y: e.clientY }; gest = null; return; }
  if (e.button === 1) e.preventDefault();
  pts.set(e.pointerId, toCard(e)); ptsC.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { svg.setPointerCapture(e.pointerId); } catch { }
  let L = selLayer();
  if (pts.size === 2) {
    if (gest?.mode === 'draw') { cancelStroke(); gest = null; }
    if (L && !L.locked && gest?.mode !== 'pan' && tool.name !== 'draw') {
      const [a, b] = [...pts.values()]; snap();
      gest = { mode: 'pinch', d0: Math.max(1, dist(a, b)), a0: ang(a, b), s0: L.scale, r0: L.rot || 0, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, x0: L.x, y0: L.y };
    } else { const m = midC(); gest = { mode: 'vpinch', z0: view.z, d0: m.d, anchor: clientToCard(m.x, m.y) }; }
    return;
  }
  if (pan) { gest = startPan(e); return; }
  if (tool.name === 'draw') { gest = startStroke(e); return; }
  const h = e.target.closest('[data-handle]');
  if (h && L && !L.locked) {
    snap(); const p = pts.get(e.pointerId);
    const kind = h.dataset.handle;
    gest = kind === 'rotate' ? { mode: 'rotate' } : { mode: kind === 'scale' ? 'scale' : kind, d0: Math.max(1, dist(L, p)), s0: L.scale, sx0: L.sx ?? 1, sy0: L.sy ?? 1 };
    return;
  }
  const g = e.target.closest('[data-layer]');
  if (g) {
    if (ui.sel !== g.dataset.layer) select(g.dataset.layer);
    L = selLayer(); gest = { mode: 'move', p0: pts.get(e.pointerId), x0: L.x, y0: L.y, moved: false };
    return;
  }
  if (ui.sel) select(null);
  if (ui.field) clearField();
  gest = view.z > 1 ? startPan(e) : null;
});
svg.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, toCard(e)); ptsC.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!gest) return;
  if (gest.mode === 'pan') { view.cx = gest.cx0 - (e.clientX - gest.x0) / gest.k; view.cy = gest.cy0 - (e.clientY - gest.y0) / gest.k; return applyView(); }
  if (gest.mode === 'draw') return moveStroke(e);
  if (gest.mode === 'vpinch') {
    if (ptsC.size < 2) return;
    const m = midC(); view.z = clamp(gest.z0 * m.d / gest.d0, 1, 8);
    const mt = metrics(); view.cx = gest.anchor.x - (m.x - mt.x) / mt.k; view.cy = gest.anchor.y - (m.y - mt.y) / mt.k;
    return applyView();
  }
  const L = selLayer(); if (!L) return;
  const p = pts.get(e.pointerId);
  if (gest.mode === 'pinch') {
    if (pts.size < 2) return;
    const [a, b] = [...pts.values()], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    L.scale = clamp(gest.s0 * dist(a, b) / gest.d0, 0.05, 8);
    L.rot = normDeg(gest.r0 + ang(a, b) - gest.a0);
    L.x = gest.x0 + m.x - gest.m0.x; L.y = gest.y0 + m.y - gest.m0.y;
  } else if (gest.mode === 'move') {
    if (!gest.moved) { if (dist(p, gest.p0) < 3 / view.z) return; snap(); gest.moved = true; }
    L.x = gest.x0 + p.x - gest.p0.x; L.y = gest.y0 + p.y - gest.p0.y;
    snapMove(L, e.altKey);
  } else if (gest.mode === 'scale' || gest.mode === 'sx' || gest.mode === 'sy') {
    // Corners keep proportions; hold Shift for a free transform. Side handles stretch one way.
    const { hw, hh } = layerBox(L), r = (L.rot || 0) * Math.PI / 180, dx = p.x - L.x, dy = p.y - L.y;
    const lx = Math.abs(dx * Math.cos(r) + dy * Math.sin(r)), ly = Math.abs(-dx * Math.sin(r) + dy * Math.cos(r));
    const free = gest.mode !== 'scale' || e.shiftKey;
    if (!free) Object.assign(L, { scale: clamp(gest.s0 * dist(L, p) / gest.d0, 0.05, 8), sx: gest.sx0, sy: gest.sy0 });
    else {
      L.scale = gest.s0;
      if (gest.mode !== 'sy') L.sx = clamp(lx / (hw * L.scale), 0.02, 50);
      if (gest.mode !== 'sx') L.sy = clamp(ly / (hh * L.scale), 0.02, 50);
    }
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
    if (e.type === 'pointerup' && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10) { if (t.key === 'art') $('#imgPick').click(); else selectField(t.key); }
    return;
  }
  if (gest?.mode === 'draw') { pts.delete(e.pointerId); ptsC.delete(e.pointerId); const g = gest; gest = null; return e.type === 'pointerup' ? commitStroke(g) : cancelStroke(); }
  pts.delete(e.pointerId); ptsC.delete(e.pointerId);
  if ((gest?.mode === 'pinch' || gest?.mode === 'vpinch') && pts.size < 2) { if (gest.mode === 'pinch') save(); gest = null; }
  if (!pts.size) {
    if (gest && gest.mode !== 'pan' && (gest.mode !== 'move' || gest.moved)) save();
    gest = null; svg.querySelector('#guides')?.replaceChildren();
  }
};
svg.addEventListener('pointerup', pointerEnd);
svg.addEventListener('pointercancel', pointerEnd);
$('#stage').addEventListener('wheel', e => {
  if (!cur() || e.target.closest('.layers-pop, .rail, .zoom-pill, .layers-btn, .inline-edit')) return;
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomAt(view.z * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY); return; }
  const L = selLayer();
  if (L && !L.locked && e.target.closest('#cardSvg')) {
    e.preventDefault(); snap();
    if (e.altKey || e.shiftKey) L.rot = normDeg((L.rot || 0) + (e.deltaY > 0 ? 3 : -3));
    else L.scale = clamp(L.scale * Math.exp(-e.deltaY * 0.0015), 0.05, 8);
    updateLayerDOM(L); syncLayerBar(L); save();
  } else if (view.z > 1) { e.preventDefault(); const k = metrics().k; view.cx += e.deltaX / k; view.cy += e.deltaY / k; applyView(); }
}, { passive: false });
svg.addEventListener('dblclick', e => {
  const hit = tool.name !== 'draw' && e.target.closest('[data-edit]');
  if (hit && hit.dataset.edit !== 'art' && EDIT_REGIONS[hit.dataset.edit] && hit.dataset.edit !== 'partners') return openInline(hit.dataset.edit);
  if (!e.target.closest('[data-layer]') || selLayer()?.kind !== 'text') return;
  ui.dockTab = 'style'; renderLayerBar(); $('#layerBar [data-lf="text"]')?.select();
});

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
  if (key === 'text') { if (v.trim() !== c.text) setRulesText(v); }
}
// Keep their wording, and if it reads as a known effect, make the game do that too.
function setRulesText(v) {
  const c = cur(); if (!c) return;
  const t = v.trim();
  snap();
  if (!t) { c.textMode = 'auto'; normalize(c); }
  else {
    const r = parseAbility(t, c.type);
    if (r) {
      if (c.type === 'CHA') { c.timing = r.timing; if (r.passive) c.passive = r.passive; else if (r.timing !== 'passive') delete c.passive; }
      if (r.effect) c.effect = r.effect; else if (c.type === 'CHA') delete c.effect;
      if (r.abilityCost != null) c.abilityCost = r.abilityCost;
    }
    c.textMode = 'custom'; c.text = t; normalize(c);
    if (c.text === autoText(c)) c.textMode = 'auto';
    toast(r ? '✨ Saved. The game reads it as: ' + autoText(c) : "Saved your wording. The game effect didn't change — check the Mechanics tab.", !r);
  }
  renderStage(); renderInspector(); renderChecks(); save();
}

// ---------------------------------------------------------------- editor: layers
const layerName = L => L.label || (L.kind === 'logo' ? 'Brand logo' : L.kind === 'image' ? (L.name || 'Image') : L.kind === 'text' ? `“${L.text}”` : SHAPE_LABELS[L.shape] || 'Shape');
const layerIcon = L => L.kind === 'logo' ? `<span class="thumb">${I.logo}</span>` : L.kind === 'image' ? `<img class="thumb img" src="${href(L.asset)}" alt="">`
  : L.kind === 'text' ? `<span class="thumb txt" style="color:${esc(L.color || '#171724')}">Aa</span>` : `<span class="thumb">${shapeIcon(L.shape, L.fill, 22)}</span>`;

// Layer list for the floating Layers panel.
// Top of the list draws on top, like every paint app.
function layersList(c) {
  const rows = [...c.layout.layers].reverse().map(L => {
    const on = ui.sel === L.id, bits = [L.zone === 'top' ? 'Over card' : 'Art window'];
    if (L.blend && L.blend !== 'normal') bits.push(BLENDS[L.blend]);
    if ((L.opacity ?? 1) < 1) bits.push(Math.round(L.opacity * 100) + '%');
    return `<div class="lp-row${on ? ' on' : ''}${L.hidden ? ' off' : ''}" data-row="${L.id}">
      <span class="grip" data-grip="${L.id}" title="Drag to reorder">${I.grip}</span>${layerIcon(L)}
      <button type="button" class="nm" data-pick="${L.id}" title="Tap to select · double-click to rename"><span>${esc(layerName(L))}</span><small>${bits.join(' · ')}</small></button>
      <button type="button" class="lp-ic lock" data-lact="lock" data-id="${L.id}" title="${L.locked ? 'Unlock' : 'Lock'}" aria-label="${L.locked ? 'Unlock' : 'Lock'}" aria-pressed="${!!L.locked}">${L.locked ? I.lock : I.unlock}</button>
      <button type="button" class="lp-ic" data-lact="hide" data-id="${L.id}" title="${L.hidden ? 'Show' : 'Hide'}" aria-label="${L.hidden ? 'Show' : 'Hide'}" aria-pressed="${!L.hidden}">${L.hidden ? I.eyeOff : I.eye}</button>
    </div>${on ? `<div class="lp-more">${slider('opacity', 'Opacity', 0.05, 1, 0.01, L.opacity ?? 1)}
      <label class="dk-field"><span>Blend</span><select data-lf="blend">${Object.entries(BLENDS).map(([k, v]) => `<option value="${k}" ${(L.blend || 'normal') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>` : ''}`;
  }).join('');
  return `<div class="lp-list" data-layers>${rows}<div class="lp-row base"><span class="thumb">${I.card}</span><button type="button" class="nm" data-go="design"><span>Card frame</span><small>Colours, font &amp; foil → Design</small></button></div></div>`;
}
function renderLayersPop() {
  const c = cur(), n = c?.layout.layers.length ?? 0;
  $('#layersBtn').innerHTML = `${I.layers}<span>Layers</span>${n ? `<b>${n}</b>` : ''}`;
  const pop = $('#layersPop'); if (pop.hidden || !c) return;
  const top = pop.querySelector('.lp-body')?.scrollTop || 0;
  pop.innerHTML = `<div class="lp-head"><b>Layers</b><span class="spacer"></span>
    <button type="button" class="lp-ic" data-add="img" title="Add image" aria-label="Add image">${I.image}</button><button type="button" class="lp-ic" data-add="text" title="Add text" aria-label="Add text">${I.text}</button><button type="button" class="lp-ic" data-add="sticker" title="Add a shape or sticker" aria-label="Add a shape or sticker">${I.shapes}</button>
    <button type="button" class="lp-ic" data-lp="close" title="Close (L)" aria-label="Close layers">${I.close}</button></div>
    <div class="lp-body">${c.layout.layers.length ? '' : '<p class="lp-empty">No layers yet. Add an image, some text or a sticker — or drop a picture onto the card.</p>'}${layersList(c)}</div>`;
  pop.querySelector('.lp-body').scrollTop = top;
}
function layersClick(e) {
  const t = e.target.closest('[data-pick],[data-lact],[data-add],[data-lp],[data-go]'); if (!t) return false;
  const d = t.dataset;
  if (d.pick) { if (ui.sel !== d.pick) select(d.pick); }
  else if (d.lact) layerAction(d.lact, d.id);
  else if (d.add) ({ img: () => $('#imgPick').click(), text: addText, sticker: stickerPicker, logo: addLogo })[d.add]?.();
  else if (d.lp === 'close') toggleLayers(false);
  else if (d.go) { ui.sec = d.go; if (ED.focus) { ED.focus = false; applyEditorLayout(); } renderInspector(); }
  return true;
}
async function renameLayer(id) {
  const L = cur()?.layout.layers.find(l => l.id === id); if (!L) return;
  const n = await promptText('Rename layer', 'Layer name (blank = automatic)', layerName(L)); if (n == null) return;
  snap(); L.label = n.slice(0, 40); if (!L.label) delete L.label; refreshLayers(); save();
}
$('#layersPop').addEventListener('click', layersClick);
$('#layersPop').addEventListener('dblclick', e => { const p = e.target.closest('[data-pick]'); if (p) renameLayer(p.dataset.pick); });
// Drag a row's grip to restack (mouse or touch). Rows are shown top-first, so dropping on a
// row takes that row's place in the stack.
document.addEventListener('pointerdown', e => {
  const grip = e.target.closest('[data-grip]'), list = grip?.closest('[data-layers]'); if (!grip || !list) return;
  e.preventDefault();
  const id = grip.dataset.grip, row = grip.closest('[data-row]'); row.classList.add('dragging');
  let target = null;
  const move = ev => {
    const r = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-row]');
    for (const x of $$('.lp-row.drop', list)) x.classList.remove('drop');
    target = r && r !== row && list.contains(r) ? r.dataset.row : null;
    if (target) r.classList.add('drop');
  };
  const up = () => {
    removeEventListener('pointermove', move); row.classList.remove('dragging');
    const ls = cur()?.layout.layers; if (!target || !ls) return refreshLayers();
    const from = ls.findIndex(l => l.id === id), to = ls.findIndex(l => l.id === target); if (from < 0 || to < 0) return;
    snap(); ls.splice(to, 0, ls.splice(from, 1)[0]);
    renderStage(); refreshLayers(); save();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up, { once: true });
});

// ---- the context dock under the canvas: options for whatever is selected
const DOCK_TABS = { transform: 'Transform', style: 'Style', adjust: 'Adjust', fx: 'Effects' };
const SWATCHES = ['#ffffff', '#171724', '#ff5a5a', '#ff9ba7', '#ffda52', '#aff57e', '#89e4d7', '#89d6ff', '#ceacff', '#ff71ce'];
const FMT = { scale: v => Math.round(v * 100) + '%', rot: v => Math.round(v) + '°', opacity: v => Math.round(v * 100) + '%', bright: v => Math.round(v * 100) + '%', contrast: v => Math.round(v * 100) + '%', sat: v => Math.round(v * 100) + '%', hue: v => Math.round(v) + '°', fxSize: v => (+v).toFixed(1) + '×', size: v => Math.round(v), cutTol: v => Math.round(v) };
const slider = (k, label, min, max, step, v) => `<label class="sl"><span>${label}</span><input type="range" data-lf="${k}" min="${min}" max="${max}" step="${step}" value="${v}"><output data-out="${k}">${(FMT[k] || String)(v)}</output></label>`;
function swatchRow(c, field, value) {
  const list = [...new Set([accentFor(c), c.layout.ink, c.layout.paper, ...SWATCHES].filter(v => /^#[0-9a-f]{6}$/i.test(v)).map(v => v.toLowerCase()))].slice(0, 13);
  return `<div class="swatches">${list.map(v => `<button type="button" class="sw" data-sw="${v}" data-swf="${field}" style="--c:${v}" title="${v}" aria-label="Colour ${v}" aria-pressed="${String(value).toLowerCase() === v}"></button>`).join('')}
    <label class="sw sw-any" title="Any colour"><input type="color" data-lf="${field}" value="${esc(/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff')}" aria-label="Pick any colour"></label></div>`;
}
const dockMinBtn = () => `<button type="button" class="dk-ic dock-min" data-dockmin title="${ED.dockMin ? 'Expand the options' : 'Minimise the options'}" aria-label="${ED.dockMin ? 'Expand the options' : 'Minimise the options'}" aria-expanded="${!ED.dockMin}">${ED.dockMin ? I.up : I.down}</button>`;
const dk = (a, icon, title, pressed) => `<button type="button" class="dk-ic" data-la="${a}" title="${title}" aria-label="${title}"${pressed != null ? ` aria-pressed="${pressed}"` : ''}>${icon}</button>`;
const dkBtn = (a, icon, label, extra = '') => `<button type="button" class="dk-btn${extra}" data-la="${a}">${icon}<span>${label}</span></button>`;
function renderLayerBar() {
  const c = cur(), L = selLayer(), bar = $('#layerBar');
  if (!c) { bar.innerHTML = ''; return; }
  if (tool.name === 'draw') { bar.innerHTML = drawDock(c); return; }
  if (!L && ui.field) { bar.innerHTML = fieldDock(c, ui.field); return; }
  if (!L) {
    bar.innerHTML = `<div class="dock-hint">${dockMinBtn()}<span><b>Tap any text on the card</b> to edit it here</span><span><b>Tap art</b> to grab it · corners resize · yellow dot spins</span><span><b>Draw</b> sketches straight onto the card</span><span><b>Pinch</b> or <b>Ctrl + scroll</b> to zoom</span></div>`;
    return;
  }
  const tabs = Object.keys(DOCK_TABS).filter(k => k !== 'adjust' || L.kind === 'image');
  const tab = tabs.includes(ui.dockTab) ? ui.dockTab : 'style';
  const head = `<div class="dock-head">${layerIcon(L)}<b class="dock-name">${esc(layerName(L).slice(0, 28))}</b>
    <button type="button" class="zone-pill" data-la="zone" title="Clip inside the art window, or float over the whole card">${L.zone === 'top' ? 'Over card' : 'In art window'}</button>
    <span class="spacer"></span>
    <span class="dk-group">${dk('flip', I.flip, 'Mirror')}${dk('back', I.down, 'Send backward  [')}${dk('front', I.up, 'Bring forward  ]')}${dk('dup', I.dup, 'Duplicate  Ctrl+D')}${dk('lock', L.locked ? I.lock : I.unlock, L.locked ? 'Unlock' : 'Lock', !!L.locked)}${dk('del', I.trash, 'Delete  Del')}</span>
    ${dockMinBtn()}<button type="button" class="dk-done" data-la="done" title="Done (Esc)">${I.check}<span>Done</span></button></div>`;
  if (L.locked) { bar.innerHTML = head + `<div class="dock-body"><p class="dock-note">${I.lock} Locked, so it can't be nudged by accident. Unlock it to edit.</p></div>`; return; }
  const tabBar = `<div class="dock-tabs" role="tablist">${tabs.map(k => `<button type="button" role="tab" data-dtab="${k}" aria-selected="${k === tab}">${DOCK_TABS[k]}</button>`).join('')}</div>`;
  bar.innerHTML = head + tabBar + `<div class="dock-body">${dockBody(c, L, tab)}</div>`;
}
// ---- card text in the dock: tap a part of the card, change it here
const FIELD_LABEL = { name: 'Name', cost: 'Cost', hp: 'HP', origin: 'Brand', banner: 'Ability', text: 'Rules & lore', partners: 'Partners' };
const numStep = (path, v, label) => `<span class="dk-step" role="group" aria-label="${label}"><button type="button" class="dk-ic" data-fa="step" data-path="${path}" data-d="-1" aria-label="Less">${I.minus}</button><input type="number" class="dk-num" data-ff="${path}" value="${v ?? 0}" inputmode="numeric" aria-label="${label}"${path === 'cost' || path === 'hp' ? ' data-focus' : ''}><button type="button" class="dk-ic" data-fa="step" data-path="${path}" data-d="1" aria-label="More">${I.plus}</button></span>`;
const softBtn = (fa, v, label, on) => `<button type="button" data-fa="${fa}" data-v="${esc(v)}" aria-pressed="${!!on}">${label}</button>`;
function fieldDock(c, key) {
  const head = `<div class="dock-head"><span class="thumb txt">✎</span><b class="dock-name">${FIELD_LABEL[key] || 'Card text'}</b><span class="spacer"></span>${dockMinBtn()}<button type="button" class="dk-done" data-fa="done" title="Done (Esc)">${I.check}<span>Done</span></button></div>`;
  return head + `<div class="dock-body">${fieldBody(c, key)}</div>`;
}
function fieldBody(c, key) {
  const e = c.effect, spec = e && EFFECTS[e.kind];
  if (key === 'name') return `<div class="dock-row"><input type="text" class="dk-text" data-ff="name" value="${esc(c.name)}" maxlength="40" aria-label="Card name" data-focus>${dkBtn('randName', '🎲', 'Random').replace('data-la', 'data-fa')}</div>
    <div class="dock-row">${softBtn('type', 'CHA', '🥊 Character', c.type === 'CHA')}${softBtn('type', 'ACT', '⚡ Action', c.type === 'ACT')}<span class="dock-note">Double-click card text to type right on the card.</span></div>`;
  if (key === 'cost') return `<div class="dock-row"><span class="dk-lbl">SP to play</span>${numStep('cost', c.cost, 'Cost')}${c.type === 'CHA' ? `<span class="dk-lbl">HP</span>${numStep('hp', c.hp, 'HP').replace(' data-focus', '')}` : ''}</div>`;
  if (key === 'hp') return `<div class="dock-row"><span class="dk-lbl">HP</span>${numStep('hp', c.hp, 'HP')}<span class="dk-lbl">Cost</span>${numStep('cost', c.cost, 'Cost').replace(' data-focus', '')}<span class="dock-note">HP is also how hard it hits.</span></div>`;
  if (key === 'origin') return c.type === 'CHA'
    ? `<div class="chips dk-chips">${P.brands.map(b => `<button type="button" class="chip" data-fa="brand" data-v="${esc(b.name)}" aria-pressed="${c.origin === b.name}">${shapeIcon(b.shape, b.color || 'currentColor', 16)} ${esc(b.name)}</button>`).join('')}<button type="button" class="chip" data-fa="newBrand">＋ New brand</button></div>
      <div class="dock-row"><span class="dk-lbl">Tier</span><div class="seg-soft">${['low', 'mid', 'high'].map(t => softBtn('tier', t, cap(t), c.tier === t)).join('')}</div></div>`
    : `<div class="dock-row"><div class="seg-soft">${softBtn('family', 'direct', '▲ Direct', c.family === 'direct')}${softBtn('family', 'control', '⬢ Control', c.family === 'control')}</div><span class="dock-note">Actions have a family instead of a brand.</span></div>`;
  if (key === 'banner') return `${c.type === 'CHA' ? `<div class="dock-row"><div class="seg-soft">${Object.keys(TIMINGS).map(k => softBtn('timing', k, `${TRIGGERS[k].icon} ${TRIGGERS[k].short}`, c.timing === k)).join('')}</div></div>` : ''}
    <div class="dock-row"><input type="text" class="dk-text" data-ff="layout.banner" value="${esc(c.layout.banner || '')}" maxlength="28" placeholder="${esc(c.type === 'CHA' ? TIMING_LABEL[c.timing] : 'ACT / RESOLVE & DISCARD')}" aria-label="Ability name" data-focus><span class="dock-note">Give the ability its own name, or leave it blank.</span></div>`;
  if (key === 'text') return `<textarea class="dk-area" data-ff="text" rows="3" aria-label="Rules text" placeholder="Say what it does, e.g. “when this enters, deal 2 damage to an enemy”" data-focus>${esc(c.text)}</textarea>
    <div class="dock-row">${dkBtn('interpret', I.wand, 'Read my wording', ' accent').replace('data-la', 'data-fa')}${c.textMode === 'custom' ? dkBtn('autoText', I.restore, 'Back to auto text').replace('data-la', 'data-fa') : '<span class="dock-note">Auto text: written from the mechanics below.</span>'}</div>
    ${(c.type === 'ACT' || c.timing === 'entry' || c.timing === 'activated') && e ? `<div class="dock-row"><select data-ff="effect.kind" aria-label="Effect">${Object.entries(EFFECTS).map(([k, v]) => `<option value="${k}" ${e.kind === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      <select data-ff="effect.target" aria-label="Target">${spec.targets.map(t => `<option value="${t}" ${e.target === t ? 'selected' : ''}>${TARGET_LABELS[t]}</option>`).join('')}</select>
      ${spec.amount ? `<span class="dk-lbl">Amount</span>${numStep('effect.amount', e.amount, 'Amount')}` : ''}${c.timing === 'activated' ? `<span class="dk-lbl">Ability SP</span>${numStep('abilityCost', c.abilityCost, 'Ability cost')}` : ''}</div>` : ''}
    <textarea class="dk-area small" data-ff="flavor" rows="2" maxlength="140" aria-label="Flavor or lore" placeholder="Flavor or lore line (optional)">${esc(c.flavor || '')}</textarea>`;
  if (key === 'partners') {
    const pool = [...new Set([...P.tags, ...P.brands.map(b => b.name).filter(n => n !== 'Unassigned'), ...(c.partners || [])])];
    return `<div class="chips dk-chips">${pool.map(t => `<button type="button" class="chip" data-fa="partner" data-v="${esc(t)}" aria-pressed="${(c.partners || []).includes(t)}">${esc(t)}</button>`).join('') || '<span class="dock-note">No allegiances yet. Add them in the Brand tab.</span>'}</div>
      <p class="dock-note">${BACKUP_RULE}</p>`;
  }
  return '';
}
const liveField = new Set(['name', 'layout.banner', 'flavor']);
$('#layerBar').addEventListener('input', e => {
  const el = e.target, f = el.dataset.ff, c = cur(); if (!f || !c) return;
  if (liveField.has(f)) return apply(f, el.value, false);
  if (f === 'text') { snap(); c.textMode = 'custom'; c.text = el.value; el.dataset.dirty = '1'; renderStage(); renderChecks(); save(); }
});
$('#layerBar').addEventListener('change', e => {
  const el = e.target, f = el.dataset.ff, c = cur(); if (!f || !c) return;
  if (f === 'text') { if (el.dataset.dirty) { setRulesText(el.value); renderLayerBar(); } return; }
  if (el.type === 'number') { const lim = LIMITS[f.split('.').pop()] || [0, 99]; apply(f, clamp(Math.round(+el.value || 0), ...lim), true); return renderLayerBar(); }
  if (el.tagName === 'SELECT') { apply(f, el.value, true); return renderLayerBar(); }
});
$('#layerBar').addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.dataset.ff) { e.preventDefault(); e.target.blur(); clearField(); } });
$('#layerBar').addEventListener('click', async e => {
  const b = e.target.closest('[data-fa]'); if (!b) return;
  const c = cur(); if (!c) return;
  const a = b.dataset.fa, v = b.dataset.v;
  if (a === 'done') return clearField();
  if (a === 'step') { const p = b.dataset.path, lim = LIMITS[p.split('.').pop()] || [0, 99]; apply(p, clamp((getPath(c, p) ?? 0) + +b.dataset.d, ...lim), true); }
  if (a === 'randName') apply('name', randomName(c.type), true);
  if (['type', 'tier', 'family', 'timing'].includes(a)) apply(a, v, true);
  if (a === 'brand') apply('origin', v, true);
  if (a === 'newBrand') { const n = await promptText('New brand', 'Brand name (e.g. "Snackforce 2000")'); if (n && addBrand(n)) apply('origin', n, true); }
  if (a === 'partner') { const list = [...(c.partners || [])], i = list.indexOf(v); i >= 0 ? list.splice(i, 1) : list.push(v); apply('partners', list, true); }
  if (a === 'interpret') setRulesText($('#layerBar [data-ff="text"]')?.value || '');
  if (a === 'autoText') apply('textMode', 'auto', true);
  if (tool.name === 'draw') return;
  renderLayerBar();
});

function dockBody(c, L, tab) {
  if (tab === 'transform') return `<div class="dock-row"><span class="dk-group">${dk('alignL', I.alignL, 'Align left')}${dk('alignCH', I.alignCH, 'Centre horizontally')}${dk('alignR', I.alignR, 'Align right')}${dk('alignT', I.alignT, 'Align top')}${dk('alignCV', I.alignCV, 'Centre vertically')}${dk('alignB', I.alignB, 'Align bottom')}</span>
      <span class="dock-note">to the ${L.zone === 'top' ? 'card' : 'art window'}</span><span class="spacer"></span>
      ${L.kind === 'image' ? dkBtn('fill', I.fill, 'Fill art') + dkBtn('fit', I.fit, 'Fit art') : ''}${dkBtn('center', I.center, 'Center')}</div>
    <div class="sliders">${slider('scale', 'Size', 0.05, 4, 0.01, L.scale)}${slider('rot', 'Spin', -180, 180, 1, L.rot || 0)}${slider('opacity', 'Opacity', 0.05, 1, 0.01, L.opacity ?? 1)}</div>
    <div class="dock-row"><label class="dk-field"><span>W</span><input type="number" class="dk-num" data-lf="wpct" value="${Math.round(L.scale * (L.sx ?? 1) * 100)}" min="1" max="2000" aria-label="Width %"><span>%</span></label>
      <label class="dk-field"><span>H</span><input type="number" class="dk-num" data-lf="hpct" value="${Math.round(L.scale * (L.sy ?? 1) * 100)}" min="1" max="2000" aria-label="Height %"><span>%</span></label>
      ${(L.sx ?? 1) !== 1 || (L.sy ?? 1) !== 1 ? dkBtn('unstretch', I.restore, 'Keep proportions') : '<span class="dock-note">Drag a corner to resize · <b>Shift</b> + corner or a side handle to stretch</span>'}</div>`;
  if (tab === 'adjust') return `<div class="sliders">${slider('bright', 'Brightness', 0.2, 2, 0.05, L.bright ?? 1)}${slider('contrast', 'Contrast', 0.2, 2, 0.05, L.contrast ?? 1)}${slider('sat', 'Saturation', 0, 2, 0.05, L.sat ?? 1)}${slider('hue', 'Hue shift', -180, 180, 1, L.hue || 0)}</div>
    <div class="dock-row">${dkBtn('resetLook', I.restore, 'Reset adjustments')}</div>`;
  if (tab === 'fx') {
    const fx = L.fx || 'none';
    return `<div class="dock-row"><label class="dk-field"><span>Blend</span><select data-lf="blend">${Object.entries(BLENDS).map(([k, v]) => `<option value="${k}" ${(L.blend || 'normal') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="seg-soft" role="group" aria-label="Effect">${Object.entries(LAYER_FX).map(([k, v]) => `<button type="button" data-setfx="${k}" aria-pressed="${fx === k}">${v}</button>`).join('')}</div></div>
      ${fx !== 'none' ? `${swatchRow(c, 'fxColor', L.fxColor || FX_COLOR[fx])}<div class="sliders">${slider('fxSize', 'Amount', 0.2, 3, 0.05, L.fxSize ?? 1)}</div>`
      : '<p class="dock-note">Try <b>Sticker outline</b> on cut-out art, <b>Glow</b> on a title, or blend a scribble in with <b>Multiply</b>.</p>'}`;
  }
  const outline = `<label class="dk-check"><input type="checkbox" data-lf="hasStroke" ${L.stroke ? 'checked' : ''}> Outline</label><input type="color" data-lf="stroke" value="${esc(L.stroke || '#171724')}" aria-label="Outline colour">
    <label class="dk-check"><input type="checkbox" data-lf="hasFill2" ${L.fill2 ? 'checked' : ''}> Fade to</label><input type="color" data-lf="fill2" value="${esc(L.fill2 || '#ceacff')}" aria-label="Gradient end colour">`;
  if (L.kind === 'text') return `<div class="dock-row"><input type="text" class="dk-text" data-lf="text" value="${esc(L.text)}" maxlength="40" aria-label="Text">
      <select data-lf="font" aria-label="Font" class="dk-font">${FONTS.map(f => `<option ${L.font === f ? 'selected' : ''} style="font-family:'${f}'">${f}</option>`).join('')}</select>
      <button type="button" class="dk-ic" data-la="bold" title="Bold" aria-label="Bold" aria-pressed="${L.bold !== false}"><b>B</b></button></div>
    ${swatchRow(c, 'color', L.color)}<div class="dock-row">${outline}</div><div class="sliders">${slider('size', 'Text size', 10, 120, 1, L.size)}</div>`;
  if (L.kind === 'shape') return `<div class="shape-pick">${Object.keys(SHAPES).map(s => `<button type="button" data-setshape="${s}" title="${SHAPE_LABELS[s]}" aria-label="${SHAPE_LABELS[s]}" aria-pressed="${L.shape === s}">${shapeIcon(s, 'currentColor', 22)}</button>`).join('')}</div>
    ${swatchRow(c, 'fill', L.fill)}<div class="dock-row">${outline}</div>`;
  if (L.kind === 'image') return `<div class="dock-row">${dkBtn('cutout', I.wand, L.orig ? 'Background removed' : 'Remove background', ' accent')}${L.orig ? dkBtn('restore', I.restore, 'Original') : ''}
      <label class="dk-field"><span>Mask</span><select data-lf="mask">${Object.entries(MASKS).map(([k, v]) => `<option value="${k}" ${(L.mask || 'none') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
    ${L.orig ? `<div class="sliders">${slider('cutTol', 'Strength', 5, 120, 1, L.cutTol ?? 40)}</div><p class="dock-note">Too much eaten away? Lower the strength. Bits of background left? Raise it.</p>`
      : '<p class="dock-note">Remove background works best on a plain background, like a drawing on white paper or a green screen.</p>'}`;
  return `<p class="dock-note">Shows this card's brand logo. Upload logos in the Brands tab, then use Opacity (Transform) or a blend mode (Effects) to make it a watermark.</p>`;
}
function syncLayerBar(L) {
  for (const k of ['scale', 'rot']) {
    const s = $(`#layerBar [data-lf="${k}"]`), o = $(`#layerBar [data-out="${k}"]`), v = k === 'rot' ? L.rot || 0 : L.scale;
    if (s) s.value = v; if (o) o.textContent = FMT[k](v);
  }
}
function layerField(e) {
  const L = selLayer(), el = e.target, k = el.dataset.lf; if (!L || !k) return;
  const out = el.parentElement?.querySelector(`[data-out="${k}"]`); if (out) out.textContent = FMT[k](+el.value);
  if (k === 'cutTol') { if (e.type === 'change') { L.cutTol = +el.value; cutOut(L); } return; }
  // Exact W / H %: typed, committed on Enter or leaving the box. Changing one stretches that axis.
  if (k === 'wpct' || k === 'hpct') {
    if (e.type !== 'change') return;
    const v = clamp(+el.value || 100, 1, 2000) / 100; snap();
    if (k === 'wpct') L.sx = v / L.scale; else L.sy = v / L.scale;
    renderStage(); renderLayerBar(); save(); return;
  }
  if (e.type === 'change' && el.type === 'range') return renderLayersPop();
  if (e.type === 'change') return;
  snap();
  if (k === 'hasStroke') L.stroke = el.checked ? (el.parentElement.parentElement.querySelector('[data-lf="stroke"]')?.value || '#171724') : '';
  else if (k === 'stroke') { L.stroke = el.value; const cb = $('#layerBar [data-lf="hasStroke"]'); if (cb) cb.checked = true; }
  else if (k === 'hasFill2') L.fill2 = el.checked ? (el.parentElement.parentElement.querySelector('[data-lf="fill2"]')?.value || '#ceacff') : '';
  else if (k === 'fill2') { L.fill2 = el.value; const cb = $('#layerBar [data-lf="hasFill2"]'); if (cb) cb.checked = true; }
  else if (['scale', 'rot', 'opacity'].includes(k)) { L[k] = +el.value; updateLayerDOM(L); save(); return; }
  else if (['bright', 'contrast', 'sat', 'hue', 'fxSize', 'size'].includes(k)) { L[k] = +el.value; renderStage(); save(); return; }
  else if (k === 'blend') { L.blend = el.value; renderStage(); refreshLayers(); save(); return; }
  else L[k] = el.value;
  renderStage(); save();
  if (['color', 'fill', 'fxColor'].includes(k)) for (const b of $$(`#layerBar [data-swf="${k}"]`)) b.setAttribute('aria-pressed', b.dataset.sw === el.value.toLowerCase());
  if (k === 'text' || k === 'mask') renderLayersPop();
}
for (const box of [$('#layerBar'), $('#layersPop')]) { box.addEventListener('input', layerField); box.addEventListener('change', layerField); }
$('#layerBar').addEventListener('click', e => {
  if (e.target.closest('[data-dockmin]')) { ED.dockMin = !ED.dockMin; applyEditorLayout(); return renderLayerBar(); }
  const b = e.target.closest('[data-la],[data-dtab],[data-sw],[data-setshape],[data-setfx]'); if (!b) return;
  const L = selLayer(), d = b.dataset;
  if (d.la) return layerAction(d.la);
  if (d.dtab) { ui.dockTab = d.dtab; return renderLayerBar(); }
  if (!L) return;
  snap();
  if (d.sw) L[d.swf] = d.sw;
  if (d.setshape) L.shape = d.setshape;
  if (d.setfx) { L.fx = d.setfx; if (L.fx === 'none') delete L.fx; }
  renderStage(); renderLayerBar(); renderLayersPop(); save();
});
function layerAction(a, id = ui.sel) {
  const c = cur(); if (!c) return;
  const layers = c.layout.layers, i = layers.findIndex(l => l.id === id), L = layers[i]; if (!L) return;
  if (a === 'done') return select(null);
  if (a === 'cutout') return cutOut(L);
  snap();
  if (a === 'unstretch') { const k = Math.sqrt((L.sx ?? 1) * (L.sy ?? 1)); L.scale *= k; delete L.sx; delete L.sy; }
  if (a === 'fill' || a === 'fit') {
    delete L.sx; delete L.sy;
    const pick = a === 'fill' ? Math.max : Math.min;
    Object.assign(L, { zone: 'art', rot: 0, x: ART.x + ART.w / 2, y: ART.y + ART.h / 2, scale: pick(ART.w / L.w, ART.h / L.h) });
  }
  if (a === 'center') Object.assign(L, L.zone === 'top' ? { x: W / 2, y: H / 2 } : { x: ART.x + ART.w / 2, y: ART.y + ART.h / 2 });
  if (a.startsWith('align')) {
    const Z = L.zone === 'top' ? { x: 12, y: 12, w: 476, h: 676 } : ART, { ex, ey } = extents(L);
    ({ alignL: () => L.x = Z.x + ex, alignCH: () => L.x = Z.x + Z.w / 2, alignR: () => L.x = Z.x + Z.w - ex, alignT: () => L.y = Z.y + ey, alignCV: () => L.y = Z.y + Z.h / 2, alignB: () => L.y = Z.y + Z.h - ey })[a]?.();
  }
  if (a === 'resetLook') Object.assign(L, { bright: 1, contrast: 1, sat: 1, hue: 0 });
  if (a === 'restore' && L.orig) { L.asset = L.orig; delete L.orig; delete L.cutTol; }
  if (a === 'zone') L.zone = L.zone === 'top' ? 'art' : 'top';
  if (a === 'flip') L.flip = !L.flip;
  if (a === 'bold') L.bold = L.bold === false;
  if (a === 'lock') L.locked = !L.locked;
  if (a === 'hide') L.hidden = !L.hidden;
  if (a === 'front' && i < layers.length - 1) layers.splice(i + 1, 0, layers.splice(i, 1)[0]);
  if (a === 'back' && i > 0) layers.splice(i - 1, 0, layers.splice(i, 1)[0]);
  if (a === 'dup') { const d = { ...clone(L), id: newId(), x: L.x + 20, y: L.y + 20 }; delete d.label; delete d.locked; layers.splice(i + 1, 0, d); ui.sel = d.id; }
  if (a === 'del') { layers.splice(i, 1); if (ui.sel === id) ui.sel = null; toast('Layer deleted — Ctrl+Z / ↶ brings it back'); }
  renderStage(); refreshLayers(); if (ui.sec === 'design') renderInspector(); save();
}
function addLayer(L) {
  const c = cur(); if (!c) return toast('Make or open a card first.', true);
  snap(); c.layout.layers.push({ id: newId(), scale: 1, rot: 0, opacity: 1, ...L });
  ui.dockTab = L.kind === 'image' ? 'transform' : 'style';
  select(c.layout.layers.at(-1).id); save();
}

// ---- Draw: sketch straight onto the card. Strokes go into a "drawing" image layer (2 bitmap px per
// card unit), so a drawing moves, fades, masks and exports like any other picture.
const BR = { mode: 'pen', size: 6, color: '#171724' };
try { Object.assign(BR, JSON.parse(lsGet('forge-brush') || '{}')); } catch { }
const saveBrush = () => lsSet('forge-brush', JSON.stringify(BR));
const BRUSH_MODES = { pen: ['Pen', I.brush], marker: ['Marker', I.marker], eraser: ['Eraser', I.eraser] };
const DRAW_PX = 2;
const drawBitmaps = new Map(); // asset id -> canvas, so a drawing is decoded once, not every stroke
const overlay = $('#drawOverlay'), octx = overlay.getContext('2d');
// Where strokes go: the drawing you picked or last drew on, else the card's top drawing layer.
// "New drawing layer" sets drawId to 'new' so the next stroke starts a fresh one.
function drawTarget() {
  const c = cur(); if (!c || ui.drawId === 'new') return null;
  const usable = l => l.draw && !l.hidden && !l.locked;
  return c.layout.layers.find(l => l.id === ui.drawId && usable(l)) || (selLayer() && usable(selLayer()) ? selLayer() : null)
    || [...c.layout.layers].reverse().find(usable) || null;
}
function blankDrawing() {
  const cv = document.createElement('canvas'); cv.width = W * DRAW_PX; cv.height = H * DRAW_PX;
  const id = newId('d'); P.assets[id] = cv.toDataURL('image/png'); drawBitmaps.set(id, cv); return id;
}
async function bitmapFor(L) {
  let cv = drawBitmaps.get(L.asset); if (cv) return cv;
  const img = new Image(); img.src = P.assets[L.asset]; await img.decode();
  cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  cv.getContext('2d').drawImage(img, 0, 0); drawBitmaps.set(L.asset, cv); return cv;
}
// Old stroke images nobody can reach any more (not on a card, not in undo history) are dropped.
function pruneDrawings() {
  const keep = usedAssets(P), hist = undoStack.concat(redoStack).map(e => e.s).join(' ');
  for (const id of Object.keys(P.assets)) if (id[0] === 'd' && !keep.has(id) && !hist.includes(id)) { delete P.assets[id]; drawBitmaps.delete(id); }
}
const midPt = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const pressureW = p => 0.35 + 1.3 * clamp(p, 0, 1);
// One smoothed stroke. map: card point -> canvas point; unit: canvas px per card unit.
function paintStroke(ctx, pts, map, unit, mode, pen, color = BR.color) {
  const base = BR.size * unit * (mode === 'marker' ? 2.2 : 1), q = pts.map(map);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = mode === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = ctx.fillStyle = mode === 'eraser' ? '#000' : color;
  ctx.globalAlpha = mode === 'marker' ? 0.45 : 1;
  if (q.length === 1) { ctx.beginPath(); ctx.arc(q[0].x, q[0].y, base * (pen ? pressureW(pts[0].p) : 1) / 2, 0, Math.PI * 2); ctx.fill(); }
  else if (pen && mode === 'pen') {
    // Pressure: each piece gets its own width, joined at midpoints so it stays smooth.
    let a = q[0];
    for (let i = 1; i < q.length; i++) {
      const b = i < q.length - 1 ? midPt(q[i], q[i + 1]) : q[i];
      ctx.lineWidth = base * pressureW(pts[i].p); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(q[i].x, q[i].y, b.x, b.y); ctx.stroke(); a = b;
    }
  } else {
    ctx.lineWidth = base; ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y);
    for (let i = 1; i < q.length - 1; i++) { const m = midPt(q[i], q[i + 1]); ctx.quadraticCurveTo(q[i].x, q[i].y, m.x, m.y); }
    ctx.lineTo(q.at(-1).x, q.at(-1).y); ctx.stroke();
  }
  ctx.restore();
}
function clearOverlay() { octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, overlay.width, overlay.height); }
function drawPreview(g) {
  const m = svg.getScreenCTM(), r = $('#stage').getBoundingClientRect(), d = devicePixelRatio || 1;
  clearOverlay();
  const map = p => ({ x: (m.a * p.x + m.c * p.y + m.e - r.left) * d, y: (m.b * p.x + m.d * p.y + m.f - r.top) * d });
  const unit = Math.hypot(m.a, m.b) * d;
  // The eraser previews as a pink trail; it only cuts once you let go.
  if (BR.mode === 'eraser') paintStroke(octx, g.points, map, unit, 'pen', false, 'rgba(255,62,165,.5)');
  else paintStroke(octx, g.points, map, unit, BR.mode, g.pen);
}
// Card point -> pixel in the drawing's bitmap, through the layer's own move / scale / spin / mirror.
function cardToBitmap(L, cv) {
  const r = -(L.rot || 0) * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
  const kx = (L.flip ? -1 : 1) * L.scale * (L.sx ?? 1), ky = L.scale * (L.sy ?? 1), bx = cv.width / L.w, by = cv.height / L.h;
  return p => { const dx = p.x - L.x, dy = p.y - L.y; return { x: ((dx * cos - dy * sin) / kx + L.w / 2) * bx, y: ((dx * sin + dy * cos) / ky + L.h / 2) * by }; };
}
function startStroke(e) {
  const c = cur(); if (!c) return null;
  const p = toCard(e);
  let L = drawTarget(), created = false;
  if (!L) {
    // A new drawing layer: clipped to the art window when the first stroke starts inside it.
    const inArt = p.x >= ART.x && p.x <= ART.x + ART.w && p.y >= ART.y && p.y <= ART.y + ART.h;
    burst = false; snap();
    L = { id: newId(), kind: 'image', draw: true, asset: blankDrawing(), w: W, h: H, x: W / 2, y: H / 2, scale: 1, rot: 0, opacity: 1, zone: inArt ? 'art' : 'top', name: 'Drawing ' + (c.layout.layers.filter(l => l.draw).length + 1) };
    c.layout.layers.push(L); created = true; renderStage(); renderLayersPop();
  }
  ui.drawId = L.id;
  const r = $('#stage').getBoundingClientRect(), d = devicePixelRatio || 1;
  overlay.width = Math.round(r.width * d); overlay.height = Math.round(r.height * d);
  const pen = e.pointerType === 'pen';
  const g = { mode: 'draw', id: L.id, pen, created, points: [{ x: p.x, y: p.y, p: pen ? (e.pressure || 0.5) : 0.5 }], ready: bitmapFor(L) };
  drawPreview(g); renderLayerBar();
  return g;
}
function moveStroke(e) {
  const evs = e.getCoalescedEvents?.(); // can be empty (synthetic events, some browsers): fall back to the event itself
  for (const ev of evs?.length ? evs : [e]) { const p = toCard(ev); gest.points.push({ x: p.x, y: p.y, p: gest.pen ? (ev.pressure || 0.5) : 0.5 }); }
  drawPreview(gest);
}
async function commitStroke(g) {
  const L = cur()?.layout.layers.find(l => l.id === g.id);
  try {
    if (!L) return;
    const cv = await g.ready, kk = L.scale * (Math.abs(L.sx ?? 1) + Math.abs(L.sy ?? 1)) / 2;
    paintStroke(cv.getContext('2d'), g.points, cardToBitmap(L, cv), cv.width / L.w / kk, BR.mode, g.pen);
    // Every stroke is its own undo step (the first one also undoes the new drawing layer).
    if (!g.created) { burst = false; snap(); }
    const id = newId('d'); P.assets[id] = cv.toDataURL('image/png');
    drawBitmaps.set(id, cv); L.asset = id;
    pruneDrawings(); renderStage(); save();
  } catch (err) { console.error(err); toast("Couldn't save that stroke.", true); }
  finally { clearOverlay(); }
}
function cancelStroke() { clearOverlay(); }
function drawDock(c) {
  const t = drawTarget();
  const where = t ? `on “${esc(layerName(t))}” · ${t.zone === 'top' ? 'over the card' : 'in the art window'}` : 'your first stroke starts a drawing layer';
  const swatches = BR.mode === 'eraser' ? '' : `<div class="swatches">${[...new Set(['#171724', '#ffffff', ...SWATCHES, accentFor(c)].map(v => v.toLowerCase()))].slice(0, 13).map(v => `<button type="button" class="sw" data-drc="${v}" style="--c:${v}" title="${v}" aria-label="Colour ${v}" aria-pressed="${BR.color.toLowerCase() === v}"></button>`).join('')}
    <label class="sw sw-any" title="Any colour"><input type="color" data-drs="color" value="${esc(BR.color)}" aria-label="Pick any colour"></label></div>`;
  return `<div class="dock-head"><span class="thumb">${I.brush}</span><b class="dock-name">Draw</b><span class="dock-note">${where}</span><span class="spacer"></span>${dockMinBtn()}<button type="button" class="dk-done" data-dra="done" title="Done (Esc)">${I.check}<span>Done</span></button></div>
    <div class="dock-body"><div class="dock-row"><div class="seg-soft" role="group" aria-label="Brush">${Object.entries(BRUSH_MODES).map(([k, [l, ic]]) => `<button type="button" data-dra="mode" data-v="${k}" aria-pressed="${BR.mode === k}"><span class="seg-ic">${ic}</span>${l}</button>`).join('')}</div>
      <label class="sl dk-size"><span>Size</span><input type="range" data-drs="size" min="1" max="48" step="1" value="${BR.size}"><output>${BR.size}</output></label></div>
    ${swatches}
    <div class="dock-row">${dkBtn('newDraw', I.plus, 'New drawing layer').replace('data-la', 'data-dra')}${t ? dkBtn('clearDraw', I.trash, 'Clear this drawing').replace('data-la', 'data-dra') : ''}<span class="dock-note">Zoom in for detail · pen pressure works on tablets · Ctrl+Z undoes a stroke</span></div></div>`;
}
$('#layerBar').addEventListener('click', e => {
  const b = e.target.closest('[data-dra],[data-drc]'); if (!b || tool.name !== 'draw') return;
  const a = b.dataset.dra;
  if (b.dataset.drc) { BR.color = b.dataset.drc; if (BR.mode === 'eraser') BR.mode = 'pen'; }
  if (a === 'done') return setTool('move');
  if (a === 'mode') BR.mode = b.dataset.v;
  if (a === 'newDraw') { ui.drawId = 'new'; if (selLayer()?.draw) ui.sel = null; toast('Your next stroke starts a new drawing layer.'); }
  if (a === 'clearDraw') { const t = drawTarget(); if (t) { snap(); t.asset = blankDrawing(); pruneDrawings(); renderStage(); save(); } }
  saveBrush(); renderLayerBar();
});
$('#layerBar').addEventListener('input', e => {
  const k = e.target.dataset.drs; if (!k) return;
  BR[k] = k === 'size' ? +e.target.value : e.target.value;
  const o = e.target.parentElement.querySelector('output'); if (o) o.textContent = BR.size;
  saveBrush();
});

// ---- remove background: flood-fill the edge colour away, so cut-out art gets a clean shape.
// Works from the untouched original each time (kept in L.orig), so Strength can be re-tuned.
async function cutOut(L) {
  const src = P.assets[L.orig || L.asset]; if (!src) return;
  toast('✨ Removing the background…');
  await sleep(30);
  try {
    const img = new Image(); img.src = src; await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h), px = d.data, tol = L.cutTol ?? 40;
    const edge = [];
    for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
    for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1);
    // Background = the most common colour around the border (white paper, green screen…).
    const key = o => (px[o] >> 4) << 8 | (px[o + 1] >> 4) << 4 | (px[o + 2] >> 4), counts = new Map();
    for (const i of edge) if (px[i * 4 + 3] > 15) { const k = key(i * 4); counts.set(k, (counts.get(k) || 0) + 1); }
    if (!counts.size) return toast('This picture already has a see-through background.');
    const best = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    let r = 0, gr = 0, b = 0, n = 0;
    for (const i of edge) { const o = i * 4; if (px[o + 3] > 15 && key(o) === best) { r += px[o]; gr += px[o + 1]; b += px[o + 2]; n++; } }
    r /= n; gr /= n; b /= n;
    const far = o => Math.hypot(px[o] - r, px[o + 1] - gr, px[o + 2] - b), bg = i => px[i * 4 + 3] < 16 || far(i * 4) <= tol;
    // Flood inward from the border, so the same colour inside the drawing survives.
    const seen = new Uint8Array(w * h), stack = [];
    for (const i of edge) if (!seen[i] && bg(i)) { seen[i] = 1; stack.push(i); }
    while (stack.length) {
      const i = stack.pop(), x = i % w; px[i * 4 + 3] = 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < w * h && !seen[j] && bg(j)) { seen[j] = 1; stack.push(j); }
    }
    // Soften the new edge: pixels touching the cut fade by how close they are to the background.
    for (let i = 0; i < w * h; i++) {
      if (seen[i]) continue;
      const x = i % w;
      if (!((x > 0 && seen[i - 1]) || (x < w - 1 && seen[i + 1]) || (i >= w && seen[i - w]) || (i + w < w * h && seen[i + w]))) continue;
      const o = i * 4, f = far(o); if (f < tol * 2) px[o + 3] = Math.min(px[o + 3], Math.round(255 * (f - tol) / tol));
    }
    g.putImageData(d, 0, 0);
    snap(); const id = newId('a'); P.assets[id] = cv.toDataURL('image/png');
    L.orig ||= L.asset; L.asset = id; L.cutTol = tol;
    renderStage(); refreshLayers(); save();
    toast('✨ Background removed. Tweak Strength if it took too much or too little.');
  } catch (err) { console.error(err); toast("Couldn't remove the background from that picture.", true); }
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
const picName = f => f.name?.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 24) || 'Image';
// A picture laid over the art window, covering it (the player can shrink it or float it over the card).
function artLayer(a, name) {
  const ar = a.w / a.h, [w, h] = ar > ART.w / ART.h ? [ART.h * ar, ART.h] : [ART.w, ART.w / ar];
  return { kind: 'image', asset: a.id, w, h, x: ART.x + ART.w / 2, y: ART.y + ART.h / 2, zone: 'art', name };
}
async function addImageLayer(file) {
  if (!cur()) return toast('Make or open a card first, then add art to it.', true);
  try {
    addLayer(artLayer(await fileToAsset(file), picName(file)));
    toast('🖼 Image added — drag it around!');
  } catch (e) { console.error(e); toast("That image couldn't be read.", true); }
}
// Library: drop a picture on a card = that card's art (its main art picture is swapped, or one is added).
async function setCardArt(c, file) {
  try {
    const before = libState(), a = await fileToAsset(file), L = artLayer(a, picName(file));
    const old = c.layout.layers.find(l => l.kind === 'image' && l.zone !== 'top' && !l.draw);
    if (old) { Object.assign(old, L, { scale: 1, rot: 0 }); for (const k of ['sx', 'sy', 'orig', 'cutTol', 'flip']) delete old[k]; }
    else c.layout.layers.unshift({ id: newId(), scale: 1, rot: 0, opacity: 1, ...L });
    save(); renderLibrary(); undoable(`🖼 New art for “${c.name}”`, before);
  } catch (e) { console.error(e); toast("That image couldn't be read.", true); }
}
// Pictures in, characters out: one new card per picture, named after the file.
async function newCardsFromImages(files) {
  const made = [];
  for (const f of files) {
    try {
      const c = newCard('CHA', P, picName(f)); c.id = uniqueCardId(c.name, P.cards);
      c.layout.layers.push({ id: newId(), scale: 1, rot: 0, opacity: 1, ...artLayer(await fileToAsset(f), picName(f)) });
      addCard(c, false); made.push(c);
    } catch (e) { console.error(e); toast(`Couldn't read ${f.name}.`, true); }
  }
  if (made.length === 1) openEditor(made[0].uid);
  if (made.length) toast(made.length === 1 ? `🖼 “${made[0].name}” is ready. Tap its text to set the stats.` : `🖼 Made ${made.length} characters from your pictures.`);
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
const stepper = (f, v, label) => `<div class="stepper" role="group" aria-label="${label}"><button type="button" data-f="${f}" data-step="-1" aria-label="less">−</button><input type="number" inputmode="numeric" data-num="${f}" value="${v ?? 0}" min="${(LIMITS[f.split('.').pop()] || [0, 99])[0]}" max="${(LIMITS[f.split('.').pop()] || [0, 99])[1]}" aria-label="${label}"><button type="button" data-f="${f}" data-step="1" aria-label="more">+</button></div>`;
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
function setPath(o, p, v) { const ks = p.split('.'), last = ks.pop(); const t = ks.reduce((a, k) => a[k] ||= {}, o); t[last] = v; }
const compatible = (host, b) => b.type === 'CHA' && host.type === 'CHA' && host !== b && ((host.origin !== 'Unassigned' && host.origin === b.origin) || (host.partners || []).some(p => p === b.name || p === b.origin || (b.tags || []).includes(p)));

function renderInspector() {
  const c = cur(); if (!c) return;
  for (const b of $$('#sectabs button')) b.setAttribute('aria-selected', b.dataset.sec === ui.sec);
  const body = $('#inspector'), top = body.scrollTop;
  body.innerHTML = ({ stats: secStats, brand: secBrand, ability: secAbility, design: secDesign })[ui.sec](c);
  body.scrollTop = top;
}
function secStats(c) {
  return `
  <div class="field"><label for="fName">Card name</label><div class="inline"><input type="text" id="fName" data-f="name" value="${esc(c.name)}" maxlength="40"><button class="btn" data-act="randName" title="Random name">🎲</button></div></div>
  <div class="field"><span class="lbl">Card type</span><div class="seg wide">${segBtn('type', 'CHA', 'Character', c.type)}${segBtn('type', 'ACT', 'Action', c.type)}</div></div>
  ${c.type === 'CHA' ? `
    <div class="field"><span class="lbl">Tier</span><div class="seg wide">${['low', 'mid', 'high'].map(t => segBtn('tier', t, cap(t), c.tier)).join('')}</div></div>
    ${c.edgelord ? `<div class="field"><label style="text-transform:none;font-size:13px;color:inherit"><input type="checkbox" data-f="edgelord" checked> Old “Edgelord” tag <span class="muted">(retired, does nothing; untick to clear)</span></label></div>` : ''}`
    : `<div class="field"><span class="lbl">Action family</span><div class="seg wide">${segBtn('family', 'direct', '▲ Direct', c.family)}${segBtn('family', 'control', '⬢ Control', c.family)}</div></div>`}
  <div class="two"><div class="field"><span class="lbl">Cost (SP)</span>${stepper('cost', c.cost, 'Cost')}</div>
  ${c.type === 'CHA' ? `<div class="field"><span class="lbl">HP</span>${stepper('hp', c.hp, 'HP')}</div>` : ''}</div>
  <div class="field"><span class="lbl">Decks</span><div class="chips">${P.folders.map(f => `<button type="button" class="chip" data-folder-toggle="${f.id}" aria-pressed="${c.folders.includes(f.id)}">${f.icon} ${esc(f.name)}</button>`).join('')}<button type="button" class="chip" data-act="newFolder">＋ New deck</button></div></div>
  <div class="field"><label for="fFlavor">Flavor / lore</label><textarea id="fFlavor" data-f="flavor" rows="2" maxlength="140" placeholder="A one-liner printed in italics (optional)">${esc(c.flavor || '')}</textarea></div>
  <div class="field"><label for="fNote">Designer notes</label><textarea id="fNote" data-f="note" rows="2" placeholder="Lore, ideas, balance notes. Exported with the data, never printed">${esc(c.note || '')}</textarea></div>
  <details class="adv"><summary>More: art credit, file name, card ID</summary>
  <div class="field"><label for="fArtist">Art credit</label><input type="text" id="fArtist" data-f="artist" value="${esc(c.artist || '')}" maxlength="40" placeholder="Who made the art?"></div>
  <div class="field"><label for="fFile">Export file name</label><input type="text" id="fFile" data-f="fileName" value="${esc(c.fileName || '')}" maxlength="40" placeholder="${esc(c.id)}"><div class="help">Used for this card's PNG files. Blank = the card ID.</div></div>
  <div class="field"><label for="fId">Card ID</label><input type="text" id="fId" data-f="id" value="${esc(c.id)}" maxlength="28"><div class="help">The game's internal key. Follows the name until you edit it.</div></div>
  </details>
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
  <div class="idea"><b>🤝 Backup matchmaking</b><div class="small" style="margin-top:4px">${BACKUP_RULE}<br>Can be backed up by (${backers.length}): ${names(backers)}<br>Can back up (${hosts.length}): ${names(hosts)}</div></div>`;
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
  <div class="field"><span class="lbl">✨ Holographic finish</span><div class="seg wide">${segBtn('layout.holo', 'off', 'Off', L.holo === 'on' ? 'on' : 'off')}${segBtn('layout.holo', 'on', 'Holo foil', L.holo === 'on' ? 'on' : 'off')}</div>
    <div class="help">Rainbow foil + shine, for cards you want to stand out.</div></div>
  <div class="field"><label for="fFont">Font</label><select id="fFont" data-f="layout.font">${FONTS.map(f => `<option ${L.font === f ? 'selected' : ''} style="font-family:'${f}'">${f}</option>`).join('')}</select></div>
  <div class="field"><label class="inline" style="text-transform:none;font-size:13px;color:inherit"><input type="checkbox" data-f="layout.grid" ${L.grid !== false ? 'checked' : ''}> Grid lines in the art window</label>
  <label class="inline" style="text-transform:none;font-size:13px;color:inherit;margin-top:6px"><input type="checkbox" data-f="layout.placeholder" ${L.placeholder !== false ? 'checked' : ''}> Brand placeholder when there's no art</label>
  <label class="inline" style="text-transform:none;font-size:13px;color:inherit;margin-top:6px"><input type="checkbox" data-f="layout.badge" ${L.badge !== false ? 'checked' : ''}> Brand logo badge (when the brand has a logo)</label>
  ${L.badge !== false ? `<label class="slider inline small" style="margin-top:6px">Badge see-through <input type="range" data-f="layout.badgeOpacity" min="0.1" max="1" step="0.05" value="${L.badgeOpacity ?? 1}"></label>` : ''}</div>
  <div class="btnrow"><button class="btn" data-act="copyStyle">Apply this style to all cards of this brand</button><button class="btn danger-btn" data-act="resetDesign">Reset design</button></div>`;
}
function renderChecks() {
  const c = cur(); if (!c) return;
  const v = [...validate(c, P), ...readability(c).map(m => ['warn', m])], ic = { error: '❌', warn: '⚠️', tip: '💡' };
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
  // Picking HEY / NAP / STINK writes the matching rules text ("When this enters your ring, …").
  const rewrote = path === 'timing' && c.textMode === 'custom';
  if (path === 'timing') { c.textMode = 'auto'; if (value === 'none') delete c.passive; }
  normalize(c);
  if (rewrote) toast(`Rules text rewritten for ${TRIGGERS[c.timing]?.label || 'the new trigger'} (Ctrl+Z brings your wording back)`);
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
  const act = b.dataset.act; if (!act || b.type === 'checkbox') return;
  if (act === 'randName') apply('name', randomName(c.type), true);
  if (act === 'dup') { const d = clone(c); d.name = c.name + ' (copy)'; d.id = uniqueCardId(d.name, P.cards); d.autoId = true; addCard(d); d.folders = [...c.folders]; toast('Duplicated'); }
  if (act === 'moveUp' || act === 'moveDown') {
    const i = P.cards.indexOf(c), j = act === 'moveUp' ? i - 1 : i + 1;
    if (j >= 0 && j < P.cards.length) { [P.cards[i], P.cards[j]] = [P.cards[j], P.cards[i]]; renderStage(); updateTitle(); save(); }
  }
  if (act === 'del') {
    const before = libState(), i = P.cards.indexOf(c);
    trashCards([c]); ui.cur = P.cards[Math.max(0, i - 1)]?.uid; ui.sel = null; save();
    renderEditor(); undoable(`🗑 “${c.name}” moved to the Trash.`, before);
  }
  if (act === 'newFolder') { const f = await createFolder(); if (f) apply('folders', [...c.folders, f.id], true); }
  if (act === 'newBrand') { const n = await promptText('New brand', 'Brand name (e.g. "Snackforce 2000")'); if (n && addBrand(n)) apply('origin', n, true); }
  if (act === 'newTag') { const n = $('#newTagIn').value.trim(); if (n) { if (!P.tags.includes(n)) P.tags.push(n); apply('tags', [...new Set([...(c.tags || []), n])], true); } }
  if (act === 'interpret') interpret();
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
  // Typed stepper values (cost, HP, amounts): commit on Enter / leaving the box, clamped to the rules.
  if (el.dataset.num) { const f = el.dataset.num, lim = LIMITS[f.split('.').pop()] || [0, 99]; return apply(f, clamp(Math.round(+el.value || 0), ...lim), true); }
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
  const b = logoTarget === 'back' ? P.back : P.brands[logoTarget]; if (!file || !b) return;
  try { const id = newId('a'); P.assets[id] = await logoFromFile(file); b.logo = id; save(); renderBrands(); toast(logoTarget === 'back' ? '🏷 Logo added to the card back' : `🏷 Logo set for ${b.name}`); }
  catch (err) { toast(err.message, true); }
});
function renderBrands() {
  const bk = P.back, bcol = (k, l) => `<label class="inline small"><input type="color" data-back="${k}" value="${esc(bk[k])}"> ${l}</label>`;
  $('#setInfo').innerHTML = `
    <div class="field"><label for="sName">Set name <span class="muted">(printed on every card)</span></label><input type="text" id="sName" data-set="setName" value="${esc(P.setName)}" maxlength="32"></div>
    <div class="two"><div class="field"><label for="sCode">Set code</label><input type="text" id="sCode" data-set="setCode" value="${esc(P.setCode || '')}" maxlength="12"></div>
    <div class="field"><label for="sCred">Made by</label><input type="text" id="sCred" data-set="credits" value="${esc(P.credits || '')}" maxlength="60"></div></div>
    <p class="muted small">${P.cards.length} cards · ${P.cards.filter(c => c.type === 'CHA').length} CHA · ${P.cards.filter(c => c.type === 'ACT').length} ACT · ${P.brands.length} brands · ${P.tags.length} allegiances · ${P.folders.length} decks</p>
    <div class="field"><span class="lbl">Card back <span class="muted">(used in TTS sheets, print and playtest)</span></span>
      <div class="backedit"><div class="backprev" id="backPrev">${backMarkup(0.34, true)}</div>
      <div class="backctl"><div class="two">${bcol('bg', 'Background')}${bcol('frame', 'Frame')}${bcol('stripe', 'Stripes')}${bcol('ink', 'Text')}</div>
        <label class="field" style="display:block;margin-top:8px"><span class="lbl">Tagline</span><input type="text" data-back="tagline" value="${esc(bk.tagline)}" maxlength="40"></label>
        <div class="btnrow"><button class="btn small" id="backLogo">🏷 ${bk.logo ? 'Change' : 'Add'} logo</button>${bk.logo ? '<button class="btn small" id="backLogoDel">✕ Remove logo</button>' : ''}<button class="btn small" id="backReset">↺ Reset</button></div></div></div></div>`;
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
  const k = e.target.dataset.back;
  if (k) { P.back[k] = e.target.value; save(); $('#backPrev').innerHTML = backMarkup(0.34, true); return; }
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
  if (b.id === 'backLogo') { logoTarget = 'back'; $('#logoPick').click(); }
  if (b.id === 'backLogoDel') { delete P.back.logo; save(); renderBrands(); }
  if (b.id === 'backReset') { const logo = P.back.logo; P.back = { ...DEFAULT_BACK, ...(logo ? { logo } : {}) }; save(); renderBrands(); toast('Card back reset'); }
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
const backMarkup = (scale = 1, display = false) => backSVG(P.setName, scale, P.back, P.back.logo ? (display ? href(P.back.logo) : P.assets[P.back.logo] || '') : '');
const blobToDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
async function toImage(svgStr, w, h, type = 'image/png', q = 0.9) {
  const { img, done } = await svgImage(svgStr), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
  await sleep(20); g.drawImage(img, 0, 0, w, h);
  done(); return new Promise(r => cv.toBlob(r, type, q));
}
// One file the playtest table imports with art: DECK → Load a deck → Import deck file.
const realDecks = () => P.folders.filter(d => !d.sandbox && P.cards.some(c => c.folders.includes(d.id)));
async function buildPlaytest(decks, step = () => { }) {
  const data = playtestDeckData(P, decks), ids = new Set(data.cards.map(c => c.id)), cards = P.cards.filter(c => ids.has(c.id));
  data.images = {};
  for (let i = 0; i < cards.length; i++) { step(i, cards.length, `Playtest art ${i + 1}/${cards.length}: ${cards[i].name}`); data.images[cards[i].id] = await blobToDataURL(await toImage(exportSVG(cards[i], P.cards.indexOf(cards[i]), 1), W, H, 'image/jpeg', 0.86)); }
  data.back = await blobToDataURL(await toImage(backMarkup(1), W, H, 'image/jpeg', 0.86));
  return { data, cards };
}
async function playtestFile(decks, label) {
  decks = decks.filter(d => !d.sandbox && P.cards.some(c => c.folders.includes(d.id)));
  if (!decks.length) return toast('Put some cards in a deck first. The playtest table loads decks.', true);
  let data, cards;
  await withProgress('🕹 Building the playtest file', async step => { ({ data, cards } = await buildPlaytest(decks, step)); });
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${slug(label || P.setName)}.lftdeck.json`);
  toast(`🕹 Playtest file ready (${cards.length} cards with art). On the table: DECK → Load a deck → Import deck file.`);
}
// Real-size print sheet: 9 poker-size cards (63 × 88 mm) per page with cut lines.
async function printSheet(cards, label) {
  if (!cards.length) return toast('No cards to print.', true);
  const w = window.open('', '_blank'); if (!w) return toast('Your browser blocked the print window. Allow pop-ups for this site and try again.', true);
  w.document.write('<p style="font:16px Arial;padding:20px">Preparing your cards…</p>');
  const urls = [];
  await withProgress('🖨 Preparing the print sheet', async step => {
    for (let i = 0; i < cards.length; i++) { step(i, cards.length, `Card ${i + 1}/${cards.length}`); urls.push(await blobToDataURL(await toImage(exportSVG(cards[i], P.cards.indexOf(cards[i]), 2), W * 2, H * 2, 'image/jpeg', 0.92))); }
  });
  const pages = []; for (let i = 0; i < urls.length; i += 9) pages.push(urls.slice(i, i + 9));
  w.document.open();
  w.document.write(`<!doctype html><title>${esc(label)}: print sheet</title><style>@page{size:auto;margin:7mm}body{margin:0;font:13px Arial}.page{display:grid;grid-template-columns:repeat(3,63mm);grid-auto-rows:88mm;justify-content:center;break-after:page}.page:last-child{break-after:auto}.page img{width:63mm;height:88mm;display:block;outline:.2mm dashed #888;outline-offset:-.1mm}.hint{padding:10px;text-align:center;background:#fff3c4}@media print{.hint{display:none}}</style><div class="hint">Print at <b>100% / Actual size</b> on Letter or A4, then cut on the dashed lines. <button onclick="print()">🖨 Print</button></div>${pages.map(p => `<div class="page">${p.map(u => `<img src="${u}" alt="">`).join('')}</div>`).join('')}`);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { } }, 700);
}
const cardPNG = (c, scale = 1) => toPNG(exportSVG(c, P.cards.indexOf(c), scale), W * scale, H * scale);
function cardBundle(c) {
  const assets = {}; for (const l of c.layout.layers) for (const id of [l.asset, l.orig]) if (l.kind === 'image' && P.assets[id]) assets[id] = P.assets[id];
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
  const opt = { png: $('#xPng').checked, hi: $('#xHi').checked, tts: $('#xTts').checked, data: $('#xData').checked, save: $('#xSave').checked, play: $('#xPlay').checked };
  if (!Object.values(opt).some(Boolean)) return toast('Tick at least one thing to export (Save & Share tab).', true);
  let JSZip;
  try { JSZip = (await lib(JSZIP, 'ZIP export')).default; } catch (e) { return toast(e.message, true); }
  gcAssets();
  const base = slug(label || 'cards'), zip = new JSZip(), n = cards.length, idx = c => P.cards.indexOf(c);
  try {
    await withProgress('📦 Packing your cards', async step => {
      if (opt.save) {
        const part = cards === P.cards ? P : { ...P, cards, folders: P.folders.filter(f => cards.some(c => c.folders.includes(f.id))), assets: Object.fromEntries(Object.entries(P.assets).filter(([k]) => cards.some(c => c.layout.layers.some(l => l.asset === k || l.orig === k)))) };
        zip.file(`${base}.lftset.json`, JSON.stringify(part));
      }
      if (opt.data) {
        zip.file('data/cards.json', JSON.stringify(cards.map(toEngine), null, 2) + '\n');
        zip.file('data/cards.csv', toCSV(cards));
        const gd = gameDecksJson(P); if (Object.keys(gd).length) zip.file('data/decks.json', JSON.stringify(gd, null, 2) + '\n');
        try { zip.file('data/cards.xlsx', await xlsxBlob(cards)); } catch { /* offline: CSV still there */ }
      }
      if (opt.play) {
        const decks = realDecks().filter(d => cards.some(c => c.folders.includes(d.id)));
        if (decks.length) { const { data } = await buildPlaytest(decks, step); zip.file(`playtest/${base}.lftdeck.json`, JSON.stringify(data)); }
      }
      if (opt.png) for (let i = 0; i < n; i++) {
        step(i, n, `Card ${i + 1}/${n}: ${cards[i].name}`);
        zip.file(`png/${String(idx(cards[i]) + 1).padStart(2, '0')}-${fileBase(cards[i])}.png`, await cardPNG(cards[i], opt.hi ? 2 : 1));
      }
      let ttsNote = '';
      if (opt.tts) {
        // TTS custom decks: up to 10x7 per sheet, last slot holds the hidden-card image.
        const cw = 400, ch = 560, per = 69;
        zip.file('tts/back.png', await toPNG(backMarkup(1), W, H));
        for (let s = 0; s * per < n; s++) {
          const chunk = cards.slice(s * per, s * per + per), cols = Math.min(10, chunk.length + 1), rows = Math.ceil((chunk.length + 1) / cols);
          const cv = document.createElement('canvas'); cv.width = cols * cw; cv.height = rows * ch; const g = cv.getContext('2d');
          g.fillStyle = '#171724'; g.fillRect(0, 0, cv.width, cv.height);
          for (let i = 0; i < chunk.length; i++) {
            step(i, chunk.length, `Deck sheet ${s + 1}: ${chunk[i].name}`);
            const { img, done } = await svgImage(exportSVG(chunk[i], idx(chunk[i]), 1));
            g.drawImage(img, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch); done();
          }
          const { img, done } = await svgImage(backMarkup(1)); g.drawImage(img, (cols - 1) * cw, (rows - 1) * ch, cw, ch); done();
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
  data/decks.json The decks marked 🔴 Red / 🔵 Blue, ready for the scripted TTS mod.
  playtest/       *.lftdeck.json: every deck with its card art, for the playtest table
                  (DECK → Load a deck → Import deck file).
  data/cards.csv  Same again as plain CSV. Edit either, drop it back into the Forge:
                  stats and text update, art stays.
  png/            One image per card.
  tts/            Deck sheet(s) + card back for Tabletop Simulator.

TABLETOP SIMULATOR (quick custom deck)
  Objects > Components > Custom > Deck. Face = tts/sheet-N.png, Back = tts/back.png,
  and use these grid numbers:
${tts || '  (not exported)\n'}  For online play the images must be uploaded somewhere public (e.g. Steam Cloud).

INTO THE SCRIPTED TTS MOD
  Merge data/cards.json into the repo's data/cards.json (and data/decks.json, if you marked
  Red / Blue decks) and run npm run build.
  The scripted engine only runs the effect types this Forge offers.
`;

// ---------------------------------------------------------------- import
// `dropped` = files dragged in from the desktop: a save with no overlapping cards merges straight away (↶ Undo).
async function importFiles(files, dropped = false) {
  for (const f of files) {
    const n = f.name.toLowerCase();
    try {
      if (n.endsWith('.zip')) await importZip(f, dropped);
      else if (n.endsWith('.csv')) await importRules(parseCSV(await f.text()), f.name);
      else if (/\.(xlsx|xls|ods)$/.test(n)) await importRules(await readSheetFile(f), f.name);
      else if (n.endsWith('.json')) {
        const o = JSON.parse(await f.text());
        if (o.format === 'lft-forge') await importProject(o, f.name, dropped);
        else if (o.format === 'lft-card') await importBundle(o);
        else if (o.format === 'lft-deck') await importProject(lftDeckToProject(o), f.name, dropped, ' (deck file: stats and text, no art)');
        else if (Array.isArray(o)) await importRules(o.map(x => ({ ...x })), f.name);
        else throw new Error('not a Forge file');
      } else if (f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(n)) {
        const meta = (f.type === 'image/png' || n.endsWith('.png')) ? await extract(f, 'lft-card') : null;
        if (meta) await importBundle(JSON.parse(meta));
        else if (ui.view === 'editor' && cur()) await addImageLayer(f);
        else await newCardsFromImages([f]);
      } else toast(`Not sure what to do with ${f.name}.`, true);
    } catch (e) { console.error(e); toast(`Couldn't open ${f.name}: ${e.message}`, true); }
  }
}
async function importZip(f, dropped = false) {
  const JSZip = (await lib(JSZIP, 'ZIP import')).default;
  const zip = await JSZip.loadAsync(f), names = Object.keys(zip.files);
  const saveF = names.find(x => x.endsWith('.lftset.json')), json = names.find(x => x.endsWith('cards.json')), csv = names.find(x => x.endsWith('.csv'));
  if (saveF) return importProject(JSON.parse(await zip.file(saveF).async('string')), f.name, dropped);
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
async function importProject(o, name, dropped = false, note = '') {
  warnIfNewer(o, name);
  const inc = upgrade(clone(o));
  if (!P.cards.length) { resetTo(inc); setView('library'); return toast(`📂 Opened “${inc.setName}” (${inc.cards.length} cards)${note}`); }
  // Dropping a save of new cards is the quick path: merge it, no dialog. Cards that would overwrite
  // ones you already have still get the Merge / Replace question, so a re-drop can't wipe your art.
  if (dropped && !inc.cards.some(c => P.cards.some(x => x.id === c.id))) {
    const before = libState(), { add } = mergeProject(inc); save(); setView('library');
    return undoable(`📂 Added ${add} card${add === 1 ? '' : 's'} from “${inc.setName}”${note}`, before);
  }
  const v = await ask({ title: '📂 Open save', body: `<p><b>${esc(name)}</b> — “${esc(inc.setName)}”, ${inc.cards.length} cards.</p><p><b>Merge</b> adds its cards to yours (same card ID = theirs wins, decks with the same name combine). <b>Replace</b> swaps your whole set for theirs.</p>`, buttons: [{ label: 'Cancel', value: '' }, { label: 'Replace my set', value: 'replace' }, { label: 'Merge', value: 'merge', primary: true }] });
  if (!v) return;
  if (v === 'replace') resetTo(inc);
  else { const { add, upd } = mergeProject(inc); save(); toast(`Merged: ${add} new, ${upd} updated${note}`); }
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
$('#dlPlay').addEventListener('click', () => playtestFile(realDecks(), P.setName));
$('#printAll').addEventListener('click', () => printSheet(P.cards, P.setName));
$('#dlCsv').addEventListener('click', () => { if (!P.cards.length) return toast('No cards yet.', true); download(new Blob(['﻿' + toCSV(P.cards)], { type: 'text/csv' }), `${slug(P.setName)}-cards.csv`); toast('📊 CSV downloaded'); });
$('#dlXlsx').addEventListener('click', async () => { if (!P.cards.length) return toast('No cards yet — try the blank template.', true); try { download(await xlsxBlob(P.cards), `${slug(P.setName)}-cards.xlsx`); toast('📊 Excel file downloaded'); } catch (e) { toast(e.message, true); } });
$('#dlTemplate').addEventListener('click', async () => { try { download(await xlsxBlob([], true), 'card-forge-template.xlsx'); toast('📊 Template downloaded — see the “How to fill” tab'); } catch (e) { toast(e.message, true); } });
$('#sheetUrl').addEventListener('change', e => { P.sheet.url = e.target.value.trim(); P.sheet.last = ''; $('#sheetStatus').textContent = P.sheet.url ? 'Linked — press Pull now.' : 'Not linked yet.'; save(); });
$('#sheetAuto').addEventListener('change', e => { P.sheet.auto = e.target.checked; save(); });
$('#sheetPull').addEventListener('click', () => { P.sheet.url = $('#sheetUrl').value.trim(); pullSheet(); });
async function loadBase() {
  try { const base = await baseProject(); await importProject(base, 'Base game'); }
  catch (e) { console.error(e); toast("Couldn't load the base set here (it ships with the hosted Forge).", true); }
}
$('#loadBase').addEventListener('click', loadBase);
$('#emptySet').addEventListener('click', async () => {
  if (!await confirmAsk('Wipe everything?', 'Delete every card, deck and brand in this browser and start blank? Download a save file first if you want to keep your work.', 'Wipe it')) return;
  resetTo(emptyProject()); setView('library'); toast('Fresh start!');
});

// ---------------------------------------------------------------- versions & backups
// Snapshots of the whole set or of one folder (deck), kept in this browser. Each one can be
// restored, downloaded as a save file, or all bundled into one archive ZIP.
function partialProject(cards) {
  if (cards === P.cards) { gcAssets(); return clone(P); }
  const keep = new Set([...cards.flatMap(c => c.layout.layers.flatMap(l => [l.asset, l.orig])), ...P.brands.map(b => b.logo)].filter(Boolean));
  return clone({ ...P, cards, folders: P.folders.filter(f => cards.some(c => c.folders.includes(f.id))), assets: Object.fromEntries(Object.entries(P.assets).filter(([k]) => keep.has(k))) });
}
const versionList = async () => (await store.get('snaps')) || [];
// Snapshot images are stored once each ("asset:<id>") and shared between snapshots, instead of
// being copied into every snapshot. Older snapshots with inline images still load.
async function putSnap(id, data) {
  const assets = data.assets || {}, have = new Set((await store.get('assetKeys')) || []);
  for (const [k, v] of Object.entries(assets)) if (!have.has(k)) { await store.set('asset:' + k, v); have.add(k); }
  await store.set('assetKeys', [...have]);
  await store.set('snap:' + id, { ...data, assets: {}, assetIds: Object.keys(assets) });
  return Object.keys(assets);
}
async function getSnap(id) {
  const d = await store.get('snap:' + id); if (!d?.assetIds) return d;
  d.assets = {}; for (const k of d.assetIds) { const v = await store.get('asset:' + k); if (v) d.assets[k] = v; }
  delete d.assetIds; return d;
}
async function dropSnap(id) {
  await store.del('snap:' + id);
  const list = await versionList(), keep = new Set(list.flatMap(s => s.assetIds || []));
  const have = (await store.get('assetKeys')) || [];
  for (const k of have) if (!keep.has(k)) await store.del('asset:' + k);
  await store.set('assetKeys', have.filter(k => keep.has(k)));
}
async function saveVersion(scope = 'set', auto = false) {
  const f = P.folders.find(x => x.id === scope);
  const cards = scope === 'set' ? P.cards : P.cards.filter(c => c.folders.includes(scope));
  if (!cards.length) return auto || toast('Nothing to back up yet.', true);
  const list = await versionList(), n = list.filter(s => s.scope === scope && !s.auto).length + 1;
  const when = new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  let label = auto ? 'Auto backup' : `Snapshot ${n} · ${when}`;
  if (!auto) { const named = await promptText(`📸 Snapshot ${f ? '“' + esc(f.name) + '”' : 'the whole set'}`, 'Name it so you’ll recognise it later (e.g. “before nerfs”, “playtest 2”)', label); if (named === null) return; label = named || label; }
  const meta = { id: newId('v'), scope, scopeName: f ? f.name : P.setName, icon: f ? f.icon : '📦', label: label.slice(0, 40), date: Date.now(), count: cards.length, auto };
  try {
    meta.assetIds = await putSnap(meta.id, partialProject(cards));
    list.unshift(meta);
    const autos = list.filter(s => s.auto);
    const gone = autos.slice(8); for (const old of gone) list.splice(list.indexOf(old), 1);
    await store.set('snaps', list); for (const old of gone) await dropSnap(old.id);
    await store.set('snaps', list);
    if (!auto) toast(`📸 Snapshot saved: “${meta.label}” (${meta.count} cards)`);
    if (ui.view === 'share') renderVersions();
  } catch (e) { console.error(e); if (!auto) toast('Could not store the snapshot (browser storage full?). Download a save file instead.', true); }
}
const vDate = t => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const vFileName = s => `${slug(s.scopeName)}-${slug(s.label)}-${new Date(s.date).toISOString().slice(0, 10)}.lftset.json`;
async function renderVersions() {
  const list = await versionList(), el = $('#versionList');
  el.innerHTML = list.length ? list.map(s => `<div class="vrow"><span class="vicon">${s.icon}</span><span class="vtxt"><b>${esc(s.scopeName)}</b> · ${esc(s.label)}<small>${vDate(s.date)} · ${s.count} card${s.count === 1 ? '' : 's'}${s.auto ? ' · automatic' : ''}</small></span>
    <button class="btn small" data-v="restore" data-id="${s.id}">↺ Roll back to this</button><button class="btn small" data-v="dl" data-id="${s.id}" title="Download">⬇</button><button class="btn small danger-btn" data-v="del" data-id="${s.id}" title="Delete">🗑</button></div>`).join('')
    : '<p class="muted small">No snapshots yet. Take one before big changes. The Forge also keeps a few automatic backups.</p>';
}
$('#pVersions').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'saveSetVersion') return saveVersion('set');
  if (b.id === 'archiveVersions') {
    const list = await versionList(); if (!list.length) return toast('No snapshots to archive yet.', true);
    let JSZip; try { JSZip = (await lib(JSZIP, 'Archive')).default; } catch (err) { return toast(err.message, true); }
    const zip = new JSZip();
    for (const s of list) { const d = await getSnap(s.id); if (d) zip.file(`${s.auto ? 'auto/' : ''}${vFileName(s)}`, JSON.stringify(d)); }
    zip.file('current.lftset.json', JSON.stringify(partialProject(P.cards)));
    download(await zip.generateAsync({ type: 'blob' }), `${slug(P.setName)}-archive-${new Date().toISOString().slice(0, 10)}.zip`);
    return toast('🗄 Archive downloaded — every snapshot in one ZIP');
  }
  const id = b.dataset.id, list = await versionList(), s = list.find(x => x.id === id); if (!s) return;
  if (b.dataset.v === 'dl') { const d = await getSnap(id); if (d) download(new Blob([JSON.stringify(d)], { type: 'application/json' }), vFileName(s)); }
  if (b.dataset.v === 'restore') { const d = await getSnap(id); if (d) { await saveVersion('set', true); await importProject(d, `${s.scopeName} · ${s.label}`); } }
  if (b.dataset.v === 'del' && await confirmAsk('Delete snapshot?', `Delete ${esc(s.label)} of “${esc(s.scopeName)}”?`, 'Delete')) { list.splice(list.indexOf(s), 1); await store.set('snaps', list); await dropSnap(id); renderVersions(); }
});

// ---------------------------------------------------------------- manual
function renderManual() {
  if ($('#manualBody').dataset.ready) return;
  const row = cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  const table = (head, rows) => `<table class="mtable"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row).join('')}</tbody></table>`;
  const sections = [
    ['start', '🚀 Quick start', `<ol class="steps"><li><b>Make a card</b>: Cards → <b>+ Character</b> or <b>+ Action</b>, or <b>🖼 From picture</b> to turn pictures into characters. Stuck? <b>🎲</b> rolls a random card.</li>
      <li><b>Edit it</b>: tap any part of the card (name, cost, HP, brand, ability, rules, partners) and change it in the bar under the card. <b>Draw</b> sketches art right on it. The side panel has everything else.</li>
      <li><b>Put it in a deck</b>: drag it onto a deck (on touch, hold it first). 20 different cards = tournament-legal ✓.</li>
      <li><b>Share or test it</b>: <b>🕹 Send to playtest</b> (playtest table or SAGA), <b>🖨 Print</b>, or <b>Share</b> → Download save file.</li></ol>
      <p>Everything saves automatically in this browser. Take a <b>📸 Snapshot</b> or <b>Download save file</b> before big changes.</p>`],
    ['card', '🃏 Anatomy of a card', `<div class="manual-card">${cardSVG(M_SAMPLE(), { project: P, uid: 'man' })}<ol>
      <li><b>Type line</b>: CHA (Character) or ACT (Action).</li><li><b>Name</b> and <b>cost</b> in SP (0–10).</li>
      <li><b>Brand</b> (Origin): where a character comes from. Its logo can sit next to it.</li><li><b>Art window</b>: your art, clipped to this box.</li>
      <li><b>Banner</b>: the ability's trigger words (HEY, I'M HERE! / NAP TIEM! / BIG STINK!).</li><li><b>Rules text</b>, written for you from the ability, plus optional flavor.</li>
      <li><b>Partners</b>: who can Backup this card. <b>HP</b> for characters.</li></ol></div>`],
    ['types', '🥊 Card types &amp; ability categories', table(['Filter', 'Means'], [['🃏 All', 'Every card'], ['🥊 CHA', 'Characters: stay in the ring, have HP'], ['⚡ ACT', 'Actions: resolve once, then discard']]) +
      table(['Category', 'When it happens'], Object.values(TRIGGERS).map(t => [`${t.icon} ${t.short}`, esc(t.label)]))],
    ['abilities', '✨ Abilities &amp; mechanics', `<p>Pick a trigger, an effect, a target and an amount, or type it in plain English (tap the rules text on the card, or use the <b>Mechanics</b> tab) and the Forge maps it for you. If nothing matches, your idea is saved to the card's notes for the team.</p>` +
      table(['Effect', 'Can target'], Object.entries(EFFECTS).map(([k, e]) => [esc(e.label), e.targets.map(t => esc(TARGET_LABELS[t])).join(', ')])) +
      table(['Passive trait', ''], Object.entries(PASSIVES).filter(([k]) => k).map(([, v]) => [esc(v), ''])) +
      `<p class="muted small">These are exactly the effects the game engine runs today (checked automatically on every release).</p>`],
    ['brands', '🏷 Brands, allegiances &amp; Backups', `<p><b>Brands</b> (Origins) group characters; same-brand characters can Backup each other (except Unassigned). <b>Allegiances</b> are tags like Pets or Snacks. A card's <b>Partners</b> list which allegiances can attach to it as a Backup. ${BACKUP_RULE} The <b>Brand</b> tab in the editor shows who can Backup whom. Brand logos must be a PNG with a transparent background, or an SVG.</p>`],
    ['decks', '📚 Decks, Sandbox &amp; Trash', `<ul><li>A card can be in several decks. Each deck shows <b>x/20</b> and turns ✓ at 20 cards with different names.</li>
      <li>Drag cards onto a deck in the sidebar, onto a deck stack, or onto the tray that slides up while dragging. Dropping asks <b>Add</b> (same card, both places), <b>Move</b> (out of the deck you're in) or <b>Duplicate</b> (independent copy).</li>
      <li>Pick up many: on touch, hold a card and let go to select, then tap more (or tap cards with a second finger mid-drag). On PC, Ctrl/⌘-click, Shift-click, or drag a box.</li>
      <li>Open a deck to see its <b>cost curve</b>, <b>brand mix</b> and whether it's legal. Its <b>⋯ Deck</b> menu renames, exports, snapshots, duplicates or deletes it (and sets the legacy Tabletop Simulator Red/Blue deck).</li>
      <li><b>🧪 Sandbox</b>: a scratch deck for random experiments. It never counts toward a deck.</li>
      <li><b>🗑 Trash</b>: deleted cards wait ${TRASH_DAYS} days. Most library actions also show <b>↶ Undo</b> for a few seconds.</li></ul>`],
    ['art', '🎨 Art &amp; design', `<ul><li>The <b>tool rail</b> left of the card adds an <b>Image</b>, <b>Text</b>, <b>Shapes</b> &amp; stickers or your brand <b>Logo</b>. Drag to move, white corners resize (keeping proportions), square side handles stretch one way, <b>Shift</b> + corner stretches freely, yellow dot spins; pinch on touch, scroll wheel on PC. Exact <b>W / H %</b> live under Transform. Pink guides show when a layer snaps to the centre or the art window.</li>
      <li><b>Pictures</b>: <b>🖼 From picture</b> in Cards makes one character per picture. Drop a picture on a card in Cards to make it that card's art, or anywhere else for new characters. In the editor, tap an empty art window, drop, or paste.</li>
      <li><b>Draw</b> (B): pen (pressure works on tablets), marker and eraser (E), with size and colour in the bar under the card. Strokes land in a drawing layer you can move, fade or switch between the art window and over the card. Every stroke is one undo.</li>
      <li><b>Windows</b>: minimise the tool rail (top dash) or the options bar (arrow), or go <b>Full canvas</b> (F). <b>Details ›</b> brings the panels back.</li>
      <li><b>Zoom</b>: pinch, Ctrl + scroll or the zoom pill. <b>Pan</b>: the hand tool, Space + drag, or drag empty space while zoomed.</li>
      <li><b>Layers</b> panel: drag the dots to restack, hide 👁, lock 🔒, double-click to rename, and set opacity and blend mode (Multiply, Screen, Overlay…).</li>
      <li>The <b>dock</b> under the card changes with your selection. <b>Transform</b>: align buttons, Fill / Fit / Center, size, spin, opacity. <b>Style</b>: colour swatches, fonts, outlines, shape picker, masks and <b>✨ Remove background</b> (best on plain backgrounds; Strength tunes it, Original undoes it). <b>Adjust</b>: brightness, contrast, saturation, hue. <b>Effects</b>: drop shadow, glow, sticker outline.</li>
      <li><b>Design</b> tab: style presets, colors, gradients, fonts and holo foil. The rules check warns when text gets hard to read.</li>
      <li><b>Brands</b> tab → Set Info: the set name printed on every card and the <b>card back</b> design.</li>
      <li>On PC, drag the side panel's edge to resize it.</li></ul>`],
    ['share', '📦 Saving, sharing &amp; testing', table(['Want to…', 'Use', 'You get'], [
      ['Hand one card to someone', 'Editor → <b>Share card</b>', 'A PNG with the card data hidden inside; drop it into any Forge'],
      ['Move your whole set / back up', 'Share → <b>Download save file</b>', '<code>.lftset.json</code>; open it anywhere to merge or replace'],
      ['Playtest online', 'Open a deck → <b>🕹 Send to playtest</b>', '<code>.lftdeck.json</code> with card art; drop it on SAGA, or on the playtest table: DECK → Load a deck → Import deck file. Opening it in a Forge brings back the cards (not the art)'],
      ['Playtest on paper', '<b>🖨 Print</b> (deck, selection, or all)', '9 real-size cards per page with cut lines'],
      ['Tabletop Simulator (legacy)', 'Share → Export everything (ZIP), tick the TTS option', 'Deck sheet + back for a custom deck, and <code>data/cards.json</code> / <code>decks.json</code> for the scripted mod'],
      ['Work in a spreadsheet', 'Share → Spreadsheet', 'Excel template or CSV; drop it back in, stats update and art stays; or link a Google Sheet'],
      ['Undo a big mistake', 'Share → <b>📸 Snapshots</b>', 'Roll back to any snapshot; the Forge also keeps automatic and pre-update backups'],
    ])],
    ['keys', '⌨ Shortcuts', table(['Keys', 'Does'], [['Ctrl/⌘ + Z · Ctrl/⌘ + Y', 'Undo · redo (editor)'], ['Arrow keys (+Shift)', 'Nudge the selected layer 1 (10) px'], ['Delete / Backspace', 'Delete the selected layer'], ['Ctrl/⌘ + D', 'Duplicate the selected layer'], ['V · H', 'Move tool · pan tool (or hold Space)'], ['B · E', 'Draw · eraser'], ['I · T · S', 'Add image · text · shape'], ['L', 'Show / hide Layers'], ['F', 'Full canvas: hide everything but the card (F or Esc to exit)'], ['[ · ]', 'Send backward · bring forward'], ['Ctrl/⌘ + + / − / 0', 'Zoom the card in / out / fit (editor)'], ['Alt while dragging', 'Move without snapping'], ['Esc', 'Deselect, leave a card-text field or the brush, close help'], ['Ctrl/⌘ + scroll', 'Zoom the card grid'], ['Ctrl/⌘-click · Shift-click', 'Pick cards · pick a range']])],
    ['faq', '❓ Questions', `<dl><dt>Where are my cards stored?</dt><dd>In this browser on this device. Other devices and browsers don't see them until you open a save file there.</dd>
      <dt>The page says a new version is out.</dt><dd>Press <b>Reload now</b>. Your work is saved, and a backup is taken before any upgrade.</dd>
      <dt>It says the Forge is open in another tab.</dt><dd>Use one tab at a time; a tab that falls behind stops saving so it can't overwrite newer work.</dd>
      <dt>My art doesn't show on the playtest table.</dt><dd>Use <b>🕹 Send to playtest</b>. A plain save file carries designs, not finished pictures.</dd></dl>`],
  ];
  $('#manualBody').innerHTML = `<nav class="mtoc">${sections.map(([id, t]) => `<a href="#m-${id}">${t}</a>`).join('')}</nav>` +
    sections.map(([id, t, body]) => `<section class="msec" id="m-${id}"><h2>${t}</h2>${body}</section>`).join('');
  $('#manualBody').dataset.ready = '1';
}
const M_SAMPLE = () => normalize({ id: 'sample', name: 'Unassuming Monkey', type: 'CHA', tier: 'low', cost: 1, hp: 3, origin: 'PawSpace', tags: ['Monkeys'], partners: ['Monkeys'], timing: 'entry', effect: { kind: 'draw', amount: 1, target: 'selfPlayer' }, flavor: 'Suspiciously calm.', layout: defaultLayout() });
$('#manualBody').addEventListener('click', e => { const a = e.target.closest('.mtoc a'); if (!a) return; e.preventDefault(); $(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });

// ---------------------------------------------------------------- help overlay
const HELP = {
  library: { title: 'Your card library', flow: 0, steps: [
    ['.newrow', 'Make a card', 'Start a Character or an Action, or turn pictures into characters with 🖼 From picture (dropping pictures on the page works too). 🎲 rolls a random card to riff on.'],
    ['#folders', 'Decks', 'Group cards into decks. 20 cards with different names is tournament-legal (you’ll see a ✓). A card can be in several decks.'],
    ['#grid', 'Tap to edit · drag into decks', 'Tap a card to edit it. Drag it onto a deck (on touch, hold it first). Drop a picture on a card to make it that card’s art.'],
    ['.libbar', 'Find stuff', 'Search, show only CHA or ACT, or open ⚙ Filters for tier, brand, allegiance, ability and sort.'],
    ['#selectBtn', 'Select several', 'Add many cards to a deck, duplicate, export or delete them at once.'],
  ] },
  editor: { title: 'Designing a card', flow: 1, steps: [
    ['#stage', 'Tap the card to change it', 'Tap the name, cost, HP, brand, ability, rules or partners and edit them in the bar under the card. Tap an empty art window to add a picture. Drag art to move it; white corners resize, the yellow dot spins.'],
    ['#toolRail', 'Tools', 'Draw and erase right on the card, or add an image, text, shapes & stickers or your brand logo (dropping or pasting a picture works too). Pinch or Ctrl + scroll zooms; the hand or Space + drag pans.'],
    ['#layersBtn', 'Layers', 'Every image, text and sticker is a layer. Drag the dots to restack, hide or lock layers, set opacity and blend modes, double-click to rename.'],
    ['#layerBar', 'Options bar', 'Shows what you tapped: card text fields, brush settings while drawing, or align, colours, remove background and effects for art.'],
    ['#sectabs', 'Card details', 'Stats, brand, mechanics, colors and holo foil, all in one place.'],
    ['#checks', 'Rules check', 'Warns you if the card breaks a rule or looks unbalanced.'],
    ['#zenBtn', 'Full canvas', 'Hide everything but the card (F). On PC, drag the edge of the side panel to resize it.'],
    ['#shareCardBtn', 'Share one card', 'Makes a picture with the card data hidden inside. Anyone can drop it into their Forge to keep editing.'],
  ] },
  brands: { title: 'Brands & allegiances', flow: 0, steps: [
    ['#setInfo', 'Your set', 'The set name is printed at the bottom of every card.'],
    ['#brandList', 'Brands', 'Where characters come from. Same-brand characters can Backup each other.'],
    ['#tagList', 'Allegiances', 'Groups like Pets or Snacks. A card’s Partners decide who can Backup it.'],
  ] },
  manual: { title: 'The manual', flow: 0, steps: [
    ['.mtoc', 'Jump to a topic', 'Everything the Forge does, in one place. Tap a topic to jump there.'],
  ] },
  share: { title: 'Saving & sharing', flow: 2, steps: [
    ['#dlPlay', 'Playtest it', 'One file with every deck and its card art. Drop it on the playtest table or SAGA.'],
    ['#printAll', 'Print it', 'Real-size cards, 9 per page, ready to cut out.'],
    ['#dlSave', 'Keep a copy', 'Autosave keeps your cards in this browser. A save file moves them to another device or a teammate.'],
    ['#pSheet', 'More options', 'Spreadsheets, the full ZIP export, snapshots and the app install live in these folding panels.'],
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
    $('#help').classList.add('compact'); $('#help').classList.remove('dock-left');
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
  // Dock the card on whichever side hides fewer of the things it points at.
  const hiddenBy = side => { const cw = Math.min(370, innerWidth - 32), x0 = side === 'left' ? 16 : innerWidth - 16 - cw;
    return h.steps.filter(([sel]) => { const r = $(sel)?.getBoundingClientRect(); return r?.width && r.left >= x0 - 4 && r.right <= x0 + cw + 4; }).length; };
  $('#help').classList.toggle('dock-left', hiddenBy('left') < hiddenBy('right'));
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
  const card = $('#helpCard').getBoundingClientRect(), placed = [];
  const clash = (x, y) => placed.some(p => Math.abs(p.x - x) < 38 && Math.abs(p.y - y) < 38) || (x + 18 > card.left && x - 18 < card.right && y + 18 > card.top && y - 18 < card.bottom);
  let nums = '';
  $('#helpMarks').innerHTML = steps.map(([sel], i) => {
    if (only >= 0 && i !== only) return '';
    const el = $(sel), r = el?.getBoundingClientRect(), off = !r || !r.width || r.bottom < 8 || r.top > vh - 8;
    const flag = $(`[data-help-off="${i}"]`); if (flag) flag.hidden = !off || !r?.width;
    if (off) return '';
    const t = Math.max(r.top, 18), l = Math.max(r.left, 18), b = Math.max(t + 24, Math.min(r.bottom, floor)), rr = Math.min(r.right, vw - 4);
    const cands = [[l, t], [rr, t], [l, b], [rr, b]];
    for (let k = 1; k < 10; k++) cands.push([l + k * 42, t], [l, t + k * 42]);
    const pos = cands.find(([x, y]) => x >= 16 && x <= vw - 16 && y >= 16 && y <= vh - 16 && !clash(x, y)) || cands[0];
    placed.push({ x: pos[0], y: pos[1] });
    nums += `<span class="hnum" style="left:${pos[0] - 16}px;top:${pos[1] - 16}px">${i + 1}</span>`;
    return `<div class="hmark" data-hm="${i}" style="top:${t}px;left:${l}px;width:${Math.max(24, rr - l)}px;height:${Math.max(24, b - t)}px"></div>`;
  }).join('') + nums;
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
  if (justDragged) return;
  const nb = e.target.closest('[data-new]'); if (nb) return newFromButton(nb.dataset.new);
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'clearFilters') return clearFilters();
  if (act === 'loadBase') return loadBase();
  if (act === 'openHelp') return openHelp();
  const tr = e.target.closest('[data-trash-restore]'); if (tr) return restoreFromTrash([+tr.dataset.trashRestore]);
  const td = e.target.closest('[data-trash-del]');
  if (td) { const t = P.trash[+td.dataset.trashDel]; if (t) { P.trash.splice(+td.dataset.trashDel, 1); save(); renderLibrary(); toast(`“${t.card.name}” deleted for good.`); } return; }
  if (act === 'roll5') return rollSandbox(5);
  const ef = e.target.closest('[data-edit-folder]'); if (ef) return editFolder(ef.dataset.editFolder);
  const of = e.target.closest('[data-open-folder]'); if (of) { ui.folder = of.dataset.openFolder; ui.picked.clear(); renderLibrary(); window.scrollTo({ top: 0 }); return; }
  const t = e.target.closest('.tile'); if (!t) return;
  if (e.ctrlKey || e.metaKey || e.shiftKey) {
    const uids = $$('#grid .tile').map(x => x.dataset.uid), a = uids.indexOf(ui.lastPick), b = uids.indexOf(t.dataset.uid);
    if (!ui.selecting) { ui.selecting = true; ui.picked.clear(); }
    if (e.shiftKey && a >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) ui.picked.add(uids[i]);
    else ui.picked.has(t.dataset.uid) ? ui.picked.delete(t.dataset.uid) : ui.picked.add(t.dataset.uid);
    ui.lastPick = t.dataset.uid; return renderLibrary();
  }
  if (ui.selecting) { ui.picked.has(t.dataset.uid) ? ui.picked.delete(t.dataset.uid) : ui.picked.add(t.dataset.uid); ui.lastPick = t.dataset.uid; renderLibrary(); }
  else openEditor(t.dataset.uid);
});
$('#moreFilters').addEventListener('click', e => { const f = $('#filters'); f.hidden = !f.hidden; e.currentTarget.setAttribute('aria-expanded', !f.hidden); });
function clearFilters() { Object.assign(ui.f, { q: '', type: 'all', tier: 'all', brand: 'all', tag: 'all', trig: 'all', sort: 'num' }); for (const [id, v] of [['#q', ''], ['#fTrig', 'all'], ['#fTier', 'all'], ['#fSort', 'num']]) $(id).value = v; renderLibrary(); }
$('#clearFilters').addEventListener('click', clearFilters);
$('#newCha').addEventListener('click', () => newFromButton('CHA'));
$('#newAct').addEventListener('click', () => newFromButton('ACT'));
$('#surprise').addEventListener('click', surprise);
$('#prevCard').addEventListener('click', () => stepCard(-1));
$('#nextCard').addEventListener('click', () => stepCard(1));
$('#undoBtn').addEventListener('click', () => undoRedo(undoStack, redoStack));
$('#redoBtn').addEventListener('click', () => undoRedo(redoStack, undoStack));
$('#pngBtn').addEventListener('click', async () => { const c = cur(); if (c) { download(await cardPNG(c, 2), `${fileBase(c)}.png`); toast('⬇ PNG downloaded (1000×1400)'); } });
$('#shareCardBtn').addEventListener('click', shareCard);
$('#imgPick').addEventListener('change', e => { const f = e.target.files[0]; if (f) addImageLayer(f); e.target.value = ''; });
$('#fromPic').addEventListener('click', () => $('#cardPicPick').click());
$('#cardPicPick').addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) newCardsFromImages(fs); });
$('#filePick').addEventListener('change', e => { importFiles([...e.target.files]); e.target.value = ''; });

let dragDepth = 0;
const hasFiles = e => e.dataTransfer?.types?.includes('Files');
addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; document.body.classList.add('dragging'); } });
addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
const isPic = f => f.type.startsWith('image/') && !/\.lftcard\.png$/i.test(f.name);
addEventListener('drop', e => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging'); $$('.tile.drop').forEach(t => t.classList.remove('drop'));
  const files = [...e.dataTransfer.files];
  // Plain pictures in the library: on a card = its art, anywhere else = new characters.
  if (ui.view === 'library' && files.every(isPic)) {
    const tile = e.target.closest?.('.tile'), c = tile && P.cards.find(x => x.uid === tile.dataset.uid);
    return c ? setCardArt(c, files[0]) : newCardsFromImages(files);
  }
  importFiles(files, true);
});
$('#grid').addEventListener('dragover', e => {
  if (!hasFiles(e)) return;
  const t = e.target.closest('.tile');
  $$('.tile.drop').forEach(x => x !== t && x.classList.remove('drop')); t?.classList.add('drop');
});
addEventListener('paste', e => {
  const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'));
  if (!f || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if (ui.view === 'editor') { e.preventDefault(); importFiles([f]); }
  else if (ui.view === 'library') { e.preventDefault(); newCardsFromImages([f]); }
});
addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#help').hidden) return closeHelp();
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || $('#modal').open;
  const mod = e.ctrlKey || e.metaKey;
  if (ui.view !== 'editor' || typing || !cur()) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? undoRedo(redoStack, undoStack) : undoRedo(undoStack, redoStack); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); undoRedo(redoStack, undoStack); return; }
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); return zoomAt(view.z * 1.25); }
  if (mod && e.key === '-') { e.preventDefault(); return zoomAt(view.z * 0.8); }
  if (mod && e.key === '0') { e.preventDefault(); return zoomAt(1); }
  if (e.key === ' ') { e.preventDefault(); if (!tool.space) { tool.space = true; setTool(tool.name); } return; }
  // Paint-app single-key tools.
  if (!mod && !e.altKey) {
    const tk = { f: () => toggleZen(), v: () => setTool('move'), h: () => setTool('hand'), b: () => { BR.mode = BR.mode === 'eraser' ? 'pen' : BR.mode; setTool('draw'); renderLayerBar(); }, e: () => { BR.mode = 'eraser'; setTool('draw'); renderLayerBar(); }, i: () => $('#imgPick').click(), t: addText, s: stickerPicker, l: () => toggleLayers() }[e.key.toLowerCase()];
    if (tk) { e.preventDefault(); return tk(); }
  }
  const L = selLayer();
  if (!L) {
    if (e.key === 'Escape' && tool.name === 'draw') return setTool('move');
    if (e.key === 'Escape' && ui.field) return clearField();
    if (e.key === 'Escape' && ED.zen) toggleZen(false);
    return;
  }
  const step = e.shiftKey ? 10 : 1, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv && !L.locked) { e.preventDefault(); snap(); L.x += mv[0]; L.y += mv[1]; updateLayerDOM(L); save(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); layerAction('del'); }
  else if (e.key === 'Escape') select(null);
  else if (e.key === '[' || e.key === ']') { e.preventDefault(); layerAction(e.key === ']' ? 'front' : 'back'); }
  else if (mod && (e.key.toLowerCase() === 'd' || e.key.toLowerCase() === 'j')) { e.preventDefault(); layerAction('dup'); }
});
const spaceUp = () => { if (tool.space) { tool.space = false; setTool(tool.name); } };
addEventListener('keyup', e => { if (e.key === ' ') spaceUp(); });
addEventListener('blur', spaceUp);

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
  $('#appFoot').innerHTML = `LFT Card Forge <b>v${VERSION} “${esc(CODENAME)}”</b> · released ${RELEASED} · ${build} · <button class="link" id="whatsNew">What’s new</button> · <a href="https://github.com/dustooned/lftcf" target="_blank" rel="noopener">source</a>`;
}

function whatsNew() {
  ask({ title: `✨ What’s new`, body: CHANGELOG.map(r => `<h3 class="cl-h">v${r.v} “${esc(r.name)}” <small>${r.date}</small></h3><ul class="cl">${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`).join(''), buttons: [{ label: 'Nice!', value: 'ok', primary: true }] });
}
$('#appFoot').addEventListener('click', e => { if (e.target.closest('#whatsNew')) whatsNew(); });

// ---------------------------------------------------------------- banners: new version, other tab
function showBanner(msg, label, fn) {
  const b = $('#banner'); b.hidden = false;
  b.innerHTML = `<span>${msg}</span><button class="btn small primary" id="bannerBtn">${label}</button><button class="link small" id="bannerX">dismiss</button>`;
  $('#bannerBtn').onclick = fn; $('#bannerX').onclick = () => { b.hidden = true; };
}
async function checkForUpdate() {
  if (location.protocol !== 'https:') return;
  try {
    const v = (await (await fetch('version.js', { cache: 'no-store' })).text()).match(/VERSION = '([^']+)'/)?.[1];
    if (v && v !== VERSION) showBanner(`✨ A new version of the Card Forge (v${esc(v)}) is out. Your work is saved.`, 'Reload now', () => location.reload());
  } catch { }
}
bc?.addEventListener('message', e => {
  const m = e.data || {}; if (m.tab === TAB) return;
  if (m.type === 'hello') bc.postMessage({ type: 'here', tab: TAB });
  if (m.type === 'here') showBanner('The Card Forge is also open in another tab. Work in one tab at a time so they don’t overwrite each other.', 'OK', () => { $('#banner').hidden = true; });
  if (m.type === 'saved' && !staleTab) { staleTab = true; showBanner('You changed your cards in another tab. This tab has stopped saving so it can’t overwrite that work.', 'Reload to continue', () => location.reload()); }
});
async function backupBeforeUpgrade(raw) {
  try {
    const list = await versionList(), from = raw.forgeVersion || 'an older version';
    const meta = { id: newId('v'), scope: 'set', scopeName: String(raw.setName || 'My Card Set'), icon: '🛟', label: `Before update to v${VERSION} (from ${from})`, date: Date.now(), count: raw.cards.length, auto: false, safety: true };
    meta.assetIds = await putSnap(meta.id, raw); list.unshift(meta);
    const gone = list.filter(s => s.safety).slice(3); for (const old of gone) list.splice(list.indexOf(old), 1);
    await store.set('snaps', list); for (const old of gone) await dropSnap(old.id);
  } catch (e) { console.warn('pre-update backup failed', e); }
}

// ---------------------------------------------------------------- boot
(async () => {
  thumbStore = (await store.get('thumbs')) || {};
  const saved = await store.get('project');
  // A save written by an older Forge is copied to a snapshot BEFORE it is upgraded, so an update can never lose it.
  if (saved?.cards?.length && saved.forgeVersion !== VERSION) await backupBeforeUpgrade(structuredClone(saved));
  const wasOlder = saved && saved.forgeVersion !== VERSION;
  P = saved ? upgrade(saved) : emptyProject();
  if (wasOlder) save(); // store the upgraded save once, so the backup above isn't repeated on every load
  $('#status').textContent = saved ? '✓ loaded your save' : '✓ ready';
  if (!saved) save();
  store.persist();
  renderFooter();
  const seen = lsGet('forge-seen-version');
  if (seen && seen !== VERSION) setTimeout(() => toast(`✨ Updated to v${VERSION} “${CODENAME}”. Tap “What’s new” at the bottom.`), 1200);
  lsSet('forge-seen-version', VERSION);
  if (saved) warnIfNewer(saved, 'Your saved set');
  setView('library');
  if (!lsGet('forge-help-seen')) openHelp();
  if (saved && P.cards.length) { const last = (await versionList()).find(s => s.auto); if (!last || Date.now() - last.date > 6 * 3600e3) saveVersion('set', true); }
  if (P.sheet.auto && P.sheet.url && navigator.onLine) pullSheet(true);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  bc?.postMessage({ type: 'hello', tab: TAB });
  setInterval(checkForUpdate, 10 * 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
})();
