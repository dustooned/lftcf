// Card face renderer. Ported from tools/build.mjs face() so a card exported here matches the
// ones the TTS build generates, plus a layout layer (colors, font, art/sticker layers) on top.
export const W = 500, H = 700;
export const ART = { x: 25, y: 207, w: 450, h: 188 };
export const TIER_COLORS = { low: '#ff9ba7', mid: '#89e4d7', high: '#ceacff' };
export const ACT_COLOR = '#ffda52';
export const TIMING_LABEL = { none: 'NO ABILITY', entry: "HEY, I'M HERE!", activated: 'NAP TIEM!', passive: 'BIG STINK!' };
export const FONTS = ['Arial', 'Verdana', 'Trebuchet MS', 'Georgia', 'Impact', 'Comic Sans MS', 'Courier New', 'Tahoma'];

// Silhouettes: brand shapes for CHA placeholder art, and sticker shapes.
export const SHAPES = {
  circle: { sides: 0 }, triangle: { sides: 3 }, square: { sides: 4, rotate: -45 }, diamond: { sides: 4 },
  pentagon: { sides: 5 }, hexagon: { sides: 6 }, star5: { star: 5 }, star8: { star: 8 },
  burst: { star: 14, inner: 0.72 }, heart: { heart: true },
};
export const SHAPE_LABELS = { circle: 'Circle', triangle: 'Triangle', square: 'Square', diamond: 'Diamond', pentagon: 'Pentagon', hexagon: 'Hexagon', star5: '5-point star', star8: '8-point star', burst: 'Burst', heart: 'Heart' };

export const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fam = f => `'${String(f || 'Arial').replace(/[^\w -]/g, '')}', Arial, sans-serif`;

const poly = (cx, cy, r, sides, rot = -90) => Array.from({ length: sides }, (_, i) => {
  const a = (rot + i * 360 / sides) * Math.PI / 180; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');
const star = (cx, cy, ro, ri, n, rot = -90) => Array.from({ length: n * 2 }, (_, i) => {
  const r = i % 2 ? ri : ro, a = (rot + i * 180 / n) * Math.PI / 180; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');

export function shapeMarkup(name, cx, cy, r, fill, opacity = 1, stroke = '', sw = 0) {
  const spec = SHAPES[name] || SHAPES.circle;
  const paint = `fill="${esc(fill)}" fill-opacity="${opacity}"${stroke ? ` stroke="${esc(stroke)}" stroke-width="${sw}" stroke-linejoin="round"` : ''}`;
  if (spec.heart) {
    const s = r / 50;
    return `<path transform="translate(${cx} ${cy}) scale(${s})" d="M0 42C-30 20-50 4-50-18-50-36-36-48-22-48-10-48-3-40 0-33 3-40 10-48 22-48 36-48 50-36 50-18 50 4 30 20 0 42Z" ${paint}/>`;
  }
  if (spec.star) return `<polygon points="${star(cx, cy, r, r * (spec.inner ?? 0.48), spec.star)}" ${paint}/>`;
  if (!spec.sides) return `<circle cx="${cx}" cy="${cy}" r="${r}" ${paint}/>`;
  return `<polygon points="${poly(cx, cy, r, spec.sides, spec.rotate ?? -90)}" ${paint}/>`;
}

function wrap(s, count) {
  const lines = [''];
  for (const w of String(s ?? '').split(/\s+/)) {
    if (!w) continue;
    const cur = lines.at(-1);
    if (cur && (cur + ' ' + w).length > count) lines.push(w); else lines[lines.length - 1] = (cur + ' ' + w).trim();
  }
  return lines;
}
// Shrink font until the text fits maxLines, the same char-count heuristic build.mjs uses.
function fit(s, base, count, maxLines, min) {
  for (let size = base; size >= min; size--) {
    const lines = wrap(s, Math.floor(count * base / size));
    if (lines.length <= maxLines) return { size, lines };
  }
  return { size: min, lines: wrap(s, Math.floor(count * base / min)).slice(0, maxLines) };
}
const text = (s, x, y, size, color, weight = 500, font = 'Arial', extra = '') =>
  `<text x="${x}" y="${y}" font-family="${fam(font)}" font-weight="${weight}" font-size="${size}" fill="${esc(color)}"${extra}>${esc(s)}</text>`;

export function accentFor(c) {
  if (c.layout?.accent) return c.layout.accent;
  return c.type === 'ACT' ? ACT_COLOR : (TIER_COLORS[c.tier] || TIER_COLORS.low);
}
export function brandShape(c, project) {
  if (c.type === 'ACT') return c.family === 'control' ? 'hexagon' : 'triangle';
  return project?.brands?.find(b => b.name === c.origin)?.shape || 'circle';
}
const brandOf = (c, project) => c.type === 'CHA' ? project?.brands?.find(b => b.name === c.origin) : null;
// Edgelord (EXE) cards get the holographic finish unless the designer turns it off.
export const isHolo = c => c.layout?.holo === 'on' || ((c.layout?.holo ?? 'auto') === 'auto' && c.type === 'CHA' && !!c.edgelord);
export const MASKS = { none: 'No mask', circle: 'Circle', rounded: 'Rounded', hexagon: 'Hexagon', star5: 'Star', heart: 'Heart', diamond: 'Diamond' };
// Layer blend modes (CSS mix-blend-mode, which SVG-to-PNG export honours too) and layer effects.
export const BLENDS = { normal: 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', 'soft-light': 'Soft light', 'hard-light': 'Hard light', darken: 'Darken', lighten: 'Lighten', 'color-dodge': 'Color dodge', 'color-burn': 'Color burn', difference: 'Difference', hue: 'Hue', color: 'Color', luminosity: 'Luminosity' };
export const LAYER_FX = { none: 'No effect', shadow: 'Drop shadow', glow: 'Glow', outline: 'Sticker outline' };
export const FX_COLOR = { shadow: '#000000', glow: '#ffda52', outline: '#ffffff' };

const gradient = (id, a, b, angle = 90) => `<linearGradient id="${id}" gradientTransform="rotate(${+angle || 0} .5 .5)"><stop offset="0" stop-color="${esc(a)}"/><stop offset="1" stop-color="${esc(b)}"/></linearGradient>`;
const HOLO_STOPS = ['#ff9ba7', '#ffda52', '#aff57e', '#89e4d7', '#89d6ff', '#ceacff', '#ff9ba7'];

// Local half-extents of a layer before scale/rotation — used for selection handles.
export function layerBox(L) {
  if (L.kind === 'image') return { hw: L.w / 2, hh: L.h / 2 };
  if (L.kind === 'shape' || L.kind === 'logo') return { hw: 50, hh: 50 };
  const lines = String(L.text || ' ').split('\n');
  const longest = Math.max(1, ...lines.map(l => l.length));
  return { hw: Math.max(20, longest * L.size * 0.3), hh: Math.max(14, lines.length * L.size * 1.15 / 2) };
}
export const layerTransform = L => `translate(${L.x.toFixed(1)} ${L.y.toFixed(1)}) rotate(${(L.rot || 0).toFixed(1)}) scale(${((L.flip ? -1 : 1) * L.scale).toFixed(3)} ${L.scale.toFixed(3)})`;

function maskShape(L) {
  const r = Math.min(L.w, L.h) / 2;
  if (L.mask === 'circle') return `<circle r="${r}"/>`;
  if (L.mask === 'rounded') return `<rect x="${-L.w / 2}" y="${-L.h / 2}" width="${L.w}" height="${L.h}" rx="${r * 0.35}"/>`;
  return shapeMarkup(L.mask, 0, 0, r, '#000');
}
function layerBody(L, href, uid, c, project) {
  const fillId = `lf-${uid}-${L.id}`, fillDef = L.fill2 ? `<defs>${gradient(fillId, L.kind === 'text' ? (L.color || '#171724') : (L.fill || '#ffda52'), L.fill2, 90)}</defs>` : '';
  if (L.kind === 'image') {
    // Brightness / contrast / colour: one SVG filter, so exports match the editor exactly.
    const b = L.bright ?? 1, k = L.contrast ?? 1, s = L.sat ?? 1, hue = L.hue || 0, fx = `fx-${uid}-${L.id}`;
    const tuned = b !== 1 || k !== 1 || s !== 1 || hue !== 0;
    const fn = ch => `<feFunc${ch} type="linear" slope="${(k * b).toFixed(3)}" intercept="${((0.5 - 0.5 * k) * b).toFixed(3)}"/>`;
    const filter = tuned ? `<defs><filter id="${fx}" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="${s}"/>${hue ? `<feColorMatrix type="hueRotate" values="${+hue}"/>` : ''}<feComponentTransfer>${fn('R')}${fn('G')}${fn('B')}</feComponentTransfer></filter></defs>` : '';
    const img = `${filter}<image href="${esc(href(L.asset))}" x="${-L.w / 2}" y="${-L.h / 2}" width="${L.w}" height="${L.h}" preserveAspectRatio="none"${tuned ? ` filter="url(#${fx})"` : ''}/>`;
    if (!L.mask || L.mask === 'none' || !MASKS[L.mask]) return img;
    const id = `mk-${uid}-${L.id}`;
    return `<defs><clipPath id="${id}">${maskShape(L)}</clipPath></defs><g clip-path="url(#${id})">${img}</g>`;
  }
  if (L.kind === 'logo') {
    const b = brandOf(c, project), logo = b?.logo && href(b.logo);
    return logo ? `<image href="${esc(logo)}" x="-50" y="-50" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>`
      : shapeMarkup(brandShape(c, project), 0, 0, 48, b?.color || '#171724', 0.8);
  }
  if (L.kind === 'shape') return fillDef + shapeMarkup(L.shape, 0, 0, 50, L.fill2 ? `url(#${fillId})` : (L.fill || '#ffda52'), 1, L.stroke || '', L.stroke ? 6 : 0);
  const lines = String(L.text || '').split('\n'), step = L.size * 1.15, y0 = -(lines.length - 1) * step / 2 + L.size * 0.35;
  const outline = L.stroke ? ` stroke="${esc(L.stroke)}" stroke-width="${Math.max(2, L.size / 7).toFixed(1)}" paint-order="stroke" stroke-linejoin="round"` : '';
  const fill = L.fill2 ? `url(#${fillId})` : (L.color || '#171724');
  return fillDef + lines.map((l, i) => `<text x="0" y="${(y0 + i * step).toFixed(1)}" text-anchor="middle" font-family="${fam(L.font)}" font-weight="${L.bold === false ? 500 : 800}" font-size="${L.size}" fill="${esc(fill)}"${outline}>${esc(l)}</text>`).join('');
}
// Shadow / glow / outline, in card units so they don't grow when the layer is scaled up.
function fxFilter(L, id) {
  const col = esc(/^#[0-9a-f]{6}$/i.test(L.fxColor || '') ? L.fxColor : FX_COLOR[L.fx]), k = +(L.fxSize ?? 1) || 1;
  const open = `<filter id="${id}" filterUnits="userSpaceOnUse" x="-80" y="-80" width="660" height="860" color-interpolation-filters="sRGB">`;
  if (L.fx === 'shadow') return `${open}<feDropShadow dx="${(4 * k).toFixed(1)}" dy="${(7 * k).toFixed(1)}" stdDeviation="${(5 * k).toFixed(1)}" flood-color="${col}" flood-opacity=".6"/></filter>`;
  if (L.fx === 'glow') return `${open}<feMorphology in="SourceAlpha" operator="dilate" radius="${(2 * k).toFixed(1)}"/><feGaussianBlur stdDeviation="${(7 * k).toFixed(1)}" result="b"/><feFlood flood-color="${col}"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  if (L.fx === 'outline') return `${open}<feMorphology in="SourceAlpha" operator="dilate" radius="${(5 * k).toFixed(1)}" result="d"/><feFlood flood-color="${col}"/><feComposite in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  return '';
}
// Each layer gets its own wrapper that carries the clip, effect and blend mode. The wrapper
// sits straight on the card (no isolated group in between), so Multiply/Screen/etc. blend
// with the real card underneath, in the editor and in exported PNGs alike.
function layerMarkup(L, ctx, c, ghost) {
  if (L.hidden) return '';
  const uid = (ctx.uid || 'c') + (ghost ? 'g' : '');
  const inner = `<g ${ghost ? 'data-ghost' : 'data-layer'}="${L.id}" transform="${layerTransform(L)}" opacity="${ghost ? 0.28 : (L.opacity ?? 1)}"${ghost ? ' pointer-events="none"' : ' class="layer"'}>${layerBody(L, ctx.href || (() => ''), uid, c, ctx.project)}</g>`;
  if (ghost) return inner;
  const fid = `lx-${uid}-${L.id}`, filter = LAYER_FX[L.fx] && L.fx !== 'none' ? fxFilter(L, fid) : '';
  const blend = BLENDS[L.blend] && L.blend !== 'normal' ? ` style="mix-blend-mode:${L.blend}"` : '';
  return `${filter ? `<defs>${filter}</defs>` : ''}<g data-wrap="${L.id}" clip-path="url(#${L.zone === 'top' ? 'card' : 'art'}-${uid})"${filter ? ` filter="url(#${fid})"` : ''}${blend}${L.locked ? ' pointer-events="none"' : ''}>${inner}</g>`;
}

// k = 1 / canvas zoom, so handles stay finger-sized however far the canvas is zoomed in.
export function handlesMarkup(L, k = 1) {
  if (!L || L.hidden) return '';
  const { hw, hh } = layerBox(L), s = L.scale, r = (L.rot || 0) * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
  const P = (lx, ly) => [L.x + lx * cos - ly * sin, L.y + lx * sin + ly * cos];
  const corners = [[-hw * s, -hh * s], [hw * s, -hh * s], [hw * s, hh * s], [-hw * s, hh * s]].map(p => P(...p));
  const box = `<polygon points="${corners.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${L.locked ? '#8a8fa8' : '#2f7bff'}" stroke-width="${(2.5 * k).toFixed(2)}" stroke-dasharray="${L.locked ? `${6 * k} ${5 * k}` : 'none'}" pointer-events="none"/>`;
  if (L.locked) return box;
  const top = P(0, -hh * s), rot = [top[0] + 46 * k * sin, top[1] - 46 * k * cos];
  const dot = (p, kind, fill) => `<circle data-handle="${kind}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${(28 * k).toFixed(1)}" fill="transparent"/><circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${(10 * k).toFixed(1)}" fill="${fill}" stroke="#2f7bff" stroke-width="${(2.5 * k).toFixed(2)}" pointer-events="none"/>`;
  return `${box}<line x1="${top[0].toFixed(1)}" y1="${top[1].toFixed(1)}" x2="${rot[0].toFixed(1)}" y2="${rot[1].toFixed(1)}" stroke="#2f7bff" stroke-width="${(2.5 * k).toFixed(2)}" pointer-events="none"/>
  ${corners.map(p => dot(p, 'scale', '#ffffff')).join('')}${dot(rot, 'rotate', '#ffda52')}`;
}

// Tap targets for editing the card's own text in place (editor only, never exported).
export const EDIT_REGIONS = {
  name: [24, 24, 372, 125], cost: [398, 26, 70, 70], origin: [24, 154, 400, 46],
  banner: [24, 404, 452, 36], text: [24, 440, 452, 150], hp: [356, 634, 120, 42],
};

// ctx: { project, index, uid, href(assetId)->url, sel (layer id), editing }
export function cardInner(c, ctx) {
  const L = c.layout || {}, font = L.font || 'Arial', ink = L.ink || '#171724', paper = L.paper || '#fff9eb', border = L.border || '#171724';
  const accent = accentFor(c), sub = L.sub || '#454554', uid = ctx.uid || 'c', href = ctx.href || (() => '');
  const layers = L.layers || [], artLayers = layers.filter(l => l.zone !== 'top'), topLayers = layers.filter(l => l.zone === 'top');
  const hasArt = artLayers.some(l => !l.hidden);
  const initials = String(c.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  const typeLine = c.type + (c.type === 'CHA' && c.edgelord ? ' / EDGELORD SUMMON' : '');
  const name = fit(c.name || 'Untitled', 29, 22, 2, 18);
  const originLine = c.type === 'CHA' ? (c.origin || 'Unassigned') : String(c.family || 'direct').toUpperCase() + ' EFFECT';
  const brand = brandOf(c, ctx.project), logo = brand?.logo && href(brand.logo), badge = logo && L.badge !== false;
  const origin = fit(originLine, 16, badge ? 44 : 49, 2, 12);
  const banner = L.banner || (c.type === 'CHA' ? TIMING_LABEL[c.timing || 'none'] : 'ACT / RESOLVE & DISCARD');
  const partners = c.type === 'CHA' ? 'PARTNERS: ' + ((c.partners || []).join(', ') || 'none') : 'Pay SP. Choose a legal target.';
  const angle = L.gradAngle ?? 90, holo = isHolo(c);
  const accentFill = L.accent2 ? `url(#ga-${uid})` : accent, paperFill = L.paper2 ? `url(#gp-${uid})` : paper, borderFill = L.border2 ? `url(#gb-${uid})` : border;

  // Rules + flavor share the text box; shrink both together until they fit.
  let body = null;
  for (let size = 21; size >= 11; size--) {
    const count = Math.floor(38 * 21 / size), r = wrap(c.text || '', count), f = c.flavor ? wrap(c.flavor, count) : [];
    const step = size * 1.28, h = (r.length + f.length - 1) * step + (f.length ? 8 : 0);
    body = { size, r, f, step };
    if (h <= 112) break;
  }
  const bodyMarkup = body.r.map((l, i) => text(l, 32, 465 + i * body.step, body.size, ink, 500, font)).join('') +
    body.f.map((l, i) => text(l, 32, 465 + (body.r.length + i) * body.step + 8, body.size, sub, 500, font, ' font-style="italic"')).join('');
  const bc = brand?.color;
  const placeholder = !hasArt && L.placeholder !== false
    ? logo ? `<image href="${esc(logo)}" x="160" y="216" width="180" height="150" preserveAspectRatio="xMidYMid meet"/>${text('ART PENDING', 250, 383, 15, ink, 700, font, ' text-anchor="middle"')}`
    : `${shapeMarkup(brandShape(c, ctx.project), 250, 300, 92, bc || ink, bc ? 0.55 : 0.16)}
       <circle cx="250" cy="292" r="65" fill="${esc(paper)}" stroke="${esc(ink)}" stroke-width="5"/>
       <text x="250" y="314" text-anchor="middle" font-family="${fam(font)}" font-weight="800" font-size="55" fill="${esc(ink)}">${esc(initials)}</text>
       ${text('ART PENDING', 250, 383, 15, ink, 700, font, ' text-anchor="middle"')}` : '';
  const selL = ctx.sel && layers.find(l => l.id === ctx.sel);
  const footer = `${ctx.project?.setName || 'LOL, FIGHT TIEM!'}  /  ${String((ctx.index ?? 0) + 1).padStart(2, '0')}`;
  const credit = c.artist ? 'ART: ' + c.artist : (c.provenance === 'designer-confirmed' ? 'DESIGNER BASELINE' : c.provenance === 'player-made' ? 'PLAYER-MADE CARD' : 'PROVISIONAL DEMO CARD / Hmm, Hmm! Games');
  // Foil sits under the header text but over the art, so names and costs stay crisp.
  const sheen = 'M60 0L150 0L40 400L-50 400Z M250 0L290 0L180 400L140 400Z';
  const holoHead = holo ? `<rect x="24" y="24" width="452" height="125" rx="10" fill="url(#holo-${uid})" opacity=".42"/>
    <path d="${sheen}" fill="#fff" opacity=".18" clip-path="url(#head-${uid})"/>
    <rect x="15" y="15" width="470" height="670" rx="16" fill="none" stroke="url(#holo-${uid})" stroke-width="6"/>` : '';
  const holoFx = holo ? `<g pointer-events="none" clip-path="url(#art-${uid})"><rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" fill="url(#holo-${uid})" opacity=".3"/><path d="${sheen}" fill="#fff" opacity=".16"/></g>` : '';
  const hits = ctx.editing ? `<g class="edit-hits">${Object.entries(EDIT_REGIONS).filter(([k]) => k !== 'hp' || c.type === 'CHA').map(([k, [x, y, w, h]]) =>
    `<rect data-edit="${k}" x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="transparent"><title>Tap to edit</title></rect>`).join('')}</g>` : '';

  return `<defs><clipPath id="art-${uid}"><rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}"/></clipPath>
    <clipPath id="card-${uid}"><rect width="${W}" height="${H}"/></clipPath><clipPath id="head-${uid}"><rect x="24" y="24" width="452" height="125" rx="10"/></clipPath>
    ${L.accent2 ? gradient(`ga-${uid}`, accent, L.accent2, angle) : ''}${L.paper2 ? gradient(`gp-${uid}`, paper, L.paper2, angle) : ''}${L.border2 ? gradient(`gb-${uid}`, border, L.border2, angle) : ''}
    ${holo ? `<linearGradient id="holo-${uid}" gradientTransform="rotate(35 .5 .5)">${HOLO_STOPS.map((s, i) => `<stop offset="${(i / (HOLO_STOPS.length - 1)).toFixed(3)}" stop-color="${s}"/>`).join('')}</linearGradient>` : ''}</defs>
  <rect width="${W}" height="${H}" fill="${esc(borderFill)}" data-bg="1"/>
  <g pointer-events="none">
  <rect x="12" y="12" width="476" height="676" rx="18" fill="${esc(paperFill)}"/>
  <rect x="24" y="24" width="452" height="125" rx="10" fill="${esc(accentFill)}"/>
  ${holoHead}
  ${text(typeLine, 38, 50, 16, ink, 700, font)}
  ${name.lines.map((l, i) => text(l, 38, 86 + i * name.size * 1.1, name.size, ink, 800, font)).join('')}
  <circle cx="432" cy="60" r="29" fill="${esc(ink)}"/>
  <text x="432" y="69" text-anchor="middle" font-family="${fam(font)}" font-weight="800" font-size="27" fill="${esc(paper)}">${esc(c.cost ?? 0)}</text>
  ${text('SP', 422, 108, 15, ink, 500, font)}
  ${origin.lines.map((l, i) => text(l, 32, 175 + i * 19, origin.size, sub, 500, font)).join('')}
  ${badge ? `<image href="${esc(logo)}" x="426" y="156" width="46" height="46" opacity="${L.badgeOpacity ?? 1}" preserveAspectRatio="xMidYMid meet"/>` : ''}
  <rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" fill="${esc(accentFill)}"/>
  ${L.grid !== false ? `<path d="M25 235H475M25 285H475M25 335H475M75 207V395M175 207V395M275 207V395M375 207V395" stroke="${esc(ink)}" opacity=".1"/>` : ''}
  ${placeholder}
  </g>
  ${selL ? layerMarkup(selL, ctx, c, true) : ''}
  ${artLayers.map(l => layerMarkup(l, ctx, c)).join('')}
  ${holoFx}
  <g pointer-events="none">
  ${text(banner, 32, 431, 21, ink, 800, font)}
  ${bodyMarkup}
  <path d="M30 594H470" stroke="${esc(ink)}" stroke-width="2"/>
  ${fit(partners, 17, 43, 2, 12).lines.map((l, i) => text(l, 32, 620 + i * 20, 16, sub, 500, font)).join('')}
  ${text(c.type === 'CHA' ? 'HP ' + (c.hp ?? 0) : 'ACT', 468, 663, 29, ink, 800, font, ' text-anchor="end"')}
  ${text(footer, 32, 661, 15, ink, 700, font)}
  ${text(credit, 32, 682, 11, sub, 500, font)}
  </g>
  ${hits}
  ${topLayers.map(l => layerMarkup(l, ctx, c)).join('')}
  ${ctx.editing ? `<g id="guides" pointer-events="none"></g><g id="handles">${handlesMarkup(selL, ctx.handleK ?? 1)}</g>` : ''}`;
}

export function cardSVG(c, ctx, scale = 1) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * scale}" height="${H * scale}" viewBox="0 0 ${W} ${H}">${cardInner(c, ctx)}</svg>`;
}

// Card back. `back` = { bg, frame, stripe, ink, tagline } from the set; `logo` = image URL or ''.
export function backSVG(setName = 'LOL, FIGHT TIEM!', scale = 1, back = {}, logo = '') {
  const bg = back.bg || '#171724', frame = back.frame || '#aff57e', stripe = back.stripe || '#ff9ba7', ink = back.ink || '#fff9eb';
  const t = (s, x, y, size, color, weight) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="${weight}" font-size="${size}" fill="${esc(color)}">${esc(s)}</text>`;
  const mark = logo ? `<circle cx="250" cy="150" r="78" fill="${esc(bg)}" stroke="${esc(frame)}" stroke-width="6"/><image href="${esc(logo)}" x="186" y="86" width="128" height="128" preserveAspectRatio="xMidYMid meet"/>` : '';
  const pattern = `<defs><pattern id="backstripe" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="34" stroke="${esc(stripe)}" stroke-width="10"/></pattern><clipPath id="backclip"><rect x="22" y="22" width="456" height="656" rx="24"/></clipPath></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * scale}" height="${H * scale}" viewBox="0 0 ${W} ${H}">${pattern}<rect width="500" height="700" fill="${esc(bg)}"/><g clip-path="url(#backclip)"><rect x="22" y="22" width="456" height="656" fill="url(#backstripe)" fill-opacity="0.12"/></g><rect x="22" y="22" width="456" height="656" rx="24" fill="none" stroke="${esc(frame)}" stroke-width="8"/>${mark}${t('LOL,', 250, 280 + (logo ? 20 : 0), 84, ink, 900)}${t('FIGHT', 250, 375 + (logo ? 20 : 0), 84, ink, 900)}${t('TIEM!', 250, 470 + (logo ? 20 : 0), 84, frame, 900)}${t(setName, 250, 610, 27, ink, 600)}${t(back.tagline ?? 'Hmm, Hmm! Games', 250, 650, 20, ink, 500)}</svg>`;
}

export function shapeIcon(name, fill = 'currentColor', size = 28) {
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">${shapeMarkup(name, 60, 62, 52, fill)}</svg>`;
}
