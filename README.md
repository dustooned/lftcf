# LFT Card Forge

A card maker for **LOL, FIGHT TIEM!** by Hmm, Hmm! Games. It runs in the browser on PC, tablet and phone, and it installs as an offline app.

**Open it:** https://dustooned.github.io/lftcf/

## For collaborators

- Tap the yellow **?** button (bottom-left) for a guided tour of whichever screen you're on.
- Your cards save **in your own browser** on that device. Before clearing browser data, switching devices or making big changes, use **Save & Share → Download save file** or take a **📸 Snapshot**.
- To send work to the team, use one of these:
  - **Share card:** makes one PNG with the card's data hidden inside it.
  - **Download save file:** your whole set.
  - **Export ZIP:** images, the Tabletop Simulator deck sheet, the game data and a spreadsheet.
- Spreadsheet fans: download the Excel template from **Save & Share**, fill it in, and drop it back onto the page.
- The release name, version and build are shown at the bottom of the page (tap **What’s new** for the changelog). Include them when you report a bug.
- Testing on the playtest table? Open a deck and press **🕹 Send to playtest**, then on the table: DECK → Load a deck → Import deck file. Cards arrive with their art.
- Testing on paper? **🖨 Print** makes real-size sheets with cut lines.
- Deleted something by accident? Look in **🗑 Trash** (kept 30 days), or press **↶ Undo** on the message that pops up. The **📖 Manual** tab explains every tool.
- Stuck for ideas? **🎲 Roll 5 into the Sandbox**, keep the fun ones by dragging them into a deck, then clear the rest.

## For maintainers

This repo is generated. The Forge is developed in the (private) game repo under `creator/`, and the base card list comes from its `data/cards.json`.

1. In the game repo: `npm run forge:sync`. This copies the Forge and the base cards into this repo's folder.
2. Here: commit, then push to `main`. The **Publish Card Forge** workflow checks every script and deploys to Pages in about a minute.
3. If a release misbehaves, revert the commit and push. The previous version goes back live.

For every release, bump `VERSION`, give it a `CODENAME`, add a `CHANGELOG` entry in `version.js`, and tag the commit (`git tag v0.6.0`). Bump `SAVE_FORMAT` only when the saved data shape changes.
