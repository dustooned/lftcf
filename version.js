// Every release people will see gets a number AND a name, plus a changelog entry, so testers
// can say which build they're on and anyone can find it again (the lftcf repo tags each one).
// Bump SAVE_FORMAT only when the saved data shape changes in a way older Forges can't read,
// and add a migration in upgrade().
export const VERSION = '0.6.0';
export const CODENAME = 'Shuffle & Stack';
export const RELEASED = '2026-09-23';
export const SAVE_FORMAT = 1;

export const CHANGELOG = [
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
