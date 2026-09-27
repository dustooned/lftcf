// Every release people will see gets a number AND a name, plus a changelog entry, so testers
// can say which build they're on and anyone can find it again (the lftcf repo tags each one).
// Bump SAVE_FORMAT only when the saved data shape changes in a way older Forges can't read,
// and add a migration in upgrade().
export const VERSION = '0.8.0';
export const CODENAME = 'Studio';
export const RELEASED = '2026-09-27';
export const SAVE_FORMAT = 1;

export const CHANGELOG = [
  { v: '0.8.0', name: 'Studio', date: '2026-09-27', notes: [
    '🎨 New art workspace: tool rail, floating Layers panel, and a dock with options for whatever you select.',
    'Layers: drag to restack, hide, lock, rename, opacity and blend modes (Multiply, Screen, Overlay…).',
    '✨ One-tap Remove background, plus Drop shadow, Glow and Sticker outline effects, and Hue shift.',
    'Zoom and pan the canvas (pinch, Ctrl + scroll, Space + drag), pink smart guides, align buttons and colour swatches.',
    'Shortcuts: V move, H pan, I image, T text, S shapes, L layers, [ ] restack, Ctrl+D duplicate.',
  ] },
  { v: '0.7.1', name: 'Table Ready', date: '2026-09-25', notes: [
    'Fixed the default card back: the big pink X is now a subtle diagonal stripe.',
  ] },
  { v: '0.7.0', name: 'Table Ready', date: '2026-09-25', notes: [
    '🕹 Send to playtest: one file with a deck and its finished card art for the playtest table (DECK → Load a deck → Import deck file).',
    '🖨 Print sheets: 9 real-size cards per page with cut lines, for a deck, a selection or everything.',
    'Decks show a cost curve and brand mix, and can be marked 🔴 Red / 🔵 Blue for the TTS game (exports data/decks.json).',
    '🗑 Trash: deleted cards wait 30 days, and most library actions offer ↶ Undo.',
    'Art tools: ⤢ Fill / ⊡ Fit / ✛ Center, plus brightness, contrast and color sliders.',
    'Design your own card back (colors, tagline, logo). The rules check warns when text is hard to read.',
    '📖 Manual tab covering every tool, with exports explained in one table.',
    'Safer updates: a backup is taken before any save is upgraded, a banner offers to reload when a new version is out, and a second open tab can no longer overwrite your work.',
    'Faster with big sets (cached card thumbnails) and snapshots that store each image only once.',
  ] },
  { v: '0.6.1', name: 'Shuffle & Stack', date: '2026-09-23', notes: [
    'Emoji labels on the card-type filter: 🃏 All · 🥊 CHA · 😈 EXE · ⚡ ACT (hover for what each means).',
  ] },
  { v: '0.6.0', name: 'Shuffle & Stack', date: '2026-09-23', notes: [
    'Folders are now Decks, with a 20-card meter that turns ✓ when a deck is tournament-legal.',
    'Drag cards onto decks: click-and-drag with a mouse, or hold then drag on touch. Choose Add, Move or Duplicate.',
    'Pick up many cards: hold to select on phones then tap more, tap other cards with a second finger while dragging, or Ctrl/Shift-click and box-select on PC.',
    '🧪 Sandbox: roll random cards, keep the fun ones by dragging them into decks, then clear the rest.',
    'Ability categories (👋 HEY / 💤 NAP / 💨 STINK / Actions) to filter, sort and see each deck’s mix.',
    '“Save version” is now 📸 Snapshot, with clearer automatic names.',
    'Fixes: help numbers no longer overlap, card zoom works on phones, the drop tray fits small screens.',
  ] },
  { v: '0.5.0', name: 'First Forge', date: '2026-09-23', notes: [
    'First public release: card editor with on-card editing, art layers and masks, gradients, holo EXE foil, brand logos.',
    'Excel / CSV / Google Sheets round-trip, versions and backups, ZIP export with Tabletop Simulator deck sheets.',
    'Guided help tour on every screen.',
  ] },
];
