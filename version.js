// Every release people will see gets a number AND a name, plus a changelog entry, so testers
// can say which build they're on and anyone can find it again (the lftcf repo tags each one).
// Bump SAVE_FORMAT only when the saved data shape changes in a way older Forges can't read,
// and add a migration in upgrade().
export const VERSION = '0.9.6';
export const CODENAME = 'Quick Draw';
export const RELEASED = '2026-10-04';
export const SAVE_FORMAT = 1;

export const CHANGELOG = [
  { v: '0.9.6', name: 'Quick Draw', date: '2026-10-04', notes: [
    '📖 Brand lore: every brand gets a lore box (Brands tab or the card back designer), and the new “Brand lore” card back sets up the forces of your deck: a deck story plus up to four brands with their lore. Every card shares the same back, so it gives nothing away in play.',
    '↺ Print in real life has a Start over button that puts every print option back to the standard setup without closing the window.',
  ] },
  { v: '0.9.5', name: 'Quick Draw', date: '2026-10-04', notes: [
    '🖨 Print in real life: choose the paper (Letter, A4, Legal, Tabloid, A3, Super B), the card size (Poker, Bridge, Mini Euro, Tarot, Jumbo or custom), bleed, space between cards, crop marks and cut outlines, and backs (long- or short-edge double-sided, or separate pages). It fits as many cards per sheet as it can and remembers your choices.',
    '💥 Direct and 🎛️ Control actions get their own emoji: on the card (“ACT · 💥 DIRECT”), in filters and pills, and on the family buttons with a short blurb each.',
    'Long card names now shrink (and wrap to two lines) to stay clear of the cost bubble, and the bubble says SP COST.',
    '🖨 The print window shows a to-scale preview of sheet 1 (front and back) that updates as you change options, and dialogs now fit any window size.',
    '🕘 Version history: the whole changelog is in the Manual, and archived in the repo as docs/CARD_FORGE_VERSION_HISTORY.md.',
  ] },
  { v: '0.9.4', name: 'Quick Draw', date: '2026-10-04', notes: [
    '😈 EXE is back with a real cost: it takes up two of your three ring slots. 🕹️ 1337 Tier is new: super rare, and it must be your only character in the ring. Both print that on the card, the game enforces it, and Backups still work the normal way (+2 HP).',
    '🎴 Card back designer, right next to your decks: presets, big title / LFT badge / your logo, stripes or dots, an LFT watermark, colours and tagline. Playtest and SAGA files, the TTS sheet and print sheets use it automatically.',
    '🖨 Print sheets now add a backs page after each page of cards, mirrored for double-sided printing (untick it in the print window to skip).',
    'The studio is now Harper House Games: new card backs say so, and backs still showing the old default tagline update automatically.',
    '🏷 The LOL, FIGHT TIEM! logo is always available: the Logo tool offers it on any card, e.g. as a watermark.',
  ] },
  { v: '0.9.3', name: 'Quick Draw', date: '2026-10-04', notes: [
    '🏆 Tiers are 💩 Shit Tier, 😐 Mid Tier and 👑 GOD Tier, printed small after CHA at the top of the card, with a short blurb for each in the editor. (Saves still store low / mid / high.)',
    '♾️ Passive (BIG STINK!) abilities show an infinity sign: always on.',
    'The small print (set name, PLAYER-MADE CARD) sits on the HP line now, further from the trim edge.',
    'Emoji labels on the editor’s fields (⚡ cost, ❤️ HP, 🏢 brand, 🤝 partners, 📜 rules…) so things are quicker to spot.',
  ] },
  { v: '0.9.2', name: 'Quick Draw', date: '2026-10-04', notes: [
    '🎉 HEY, I’M HERE! abilities show a party popper, per the dev notes (❄️ NAP and 💨 STINK stay).',
    'The builder uses game-dev names: On enter, Activated, Passive. Cards still print HEY, I’M HERE! / NAP TIEM! / BIG STINK!.',
  ] },
  { v: '0.9.1', name: 'Quick Draw', date: '2026-10-04', notes: [
    '❄️ NAP TIEM! abilities now show a snowflake (on the card and in filters), since using one freezes the character. HEY keeps the waving hand; BIG STINK keeps its stink lines for now.',
    'Picking an ability type (HEY / NAP / STINK) writes its rules text for you, e.g. “When this enters your ring, …”, then you tune the effect.',
  ] },
  { v: '0.9.0', name: 'Quick Draw', date: '2026-10-04', notes: [
    '✏️ Draw right on the card: pen (pressure on tablets), marker and eraser, with size and colour. Strokes go into a drawing layer, and every stroke is one undo.',
    '✎ Tap any part of the card (name, cost, HP, brand, ability, rules, partners) and change it in the bar under the card. Double-click still types on the card.',
    '🖼 Pictures in, cards out: “From picture” makes one character per picture, dropping a picture on a card swaps its art, and tapping an empty art window adds one.',
    '🧹 Tidier everywhere: one library toolbar with Filters, a Share tab with four big actions (the rest folds away), deck extras in the ⋯ Deck menu, and a calmer editor bar.',
    '“Edgelord” is retired (the game no longer uses it), holo foil is a plain per-card choice, and the editor states the new Backup rule: same brand or Partner, once per turn, not on a character that just came into play, +2 HP.',
    'Your saves are untouched: nothing in the save format changed, and the Forge still backs up your set before any update.',
  ] },
  { v: '0.8.4', name: 'Studio', date: '2026-10-04', notes: [
    'Open a playtest deck file: drop a .lftdeck.json from Send to playtest and its decks, stats, text, flavor and notes come back as cards. The art inside is a flattened card face, so it is not imported.',
  ] },
  { v: '0.8.3', name: 'Studio', date: '2026-10-02', notes: [
    'Ability symbols on the card: a waving hand for HEY, I’M HERE!, Zz for NAP TIEM!, stink lines for BIG STINK!. They sit beside the banner, which can now carry a character’s own ability name. Turn them off per card with layout.icon = false.',
    'Drag a save file in from your desktop and, when it only brings new cards, it merges straight away with ↶ Undo. If it would overwrite cards you already have, you still get the Merge / Replace question.',
  ] },
  { v: '0.8.2', name: 'Studio', date: '2026-09-27', notes: [
    'Free transform: corners keep proportions, Shift + corner or the new side handles stretch, and Transform has exact W / H %.',
    'Type cost, HP and amounts straight into the number between − and +.',
  ] },
  { v: '0.8.1', name: 'Studio', date: '2026-09-27', notes: [
    'Minimise the tool rail or the options dock, and ⛶ Full canvas (F) hides everything but the card. Details › brings the panels back.',
    'Tidied the editor: layers live only in the Layers panel, and art is added from the tool rail.',
  ] },
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
