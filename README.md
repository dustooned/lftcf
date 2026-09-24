# LFT Card Forge

A card maker for **LOL, FIGHT TIEM!** by Hmm, Hmm! Games. It runs in the browser on PC, tablet and phone, and it installs as an offline app.

**Open it:** https://dustooned.github.io/lftcf/

## For collaborators

- Tap the yellow **?** button (bottom-left) for a guided tour of whichever screen you're on.
- Your cards save **in your own browser** on that device. Before clearing browser data, switching devices or making big changes, use **Save & Share → Download save file** or **Save version**.
- To send work to the team, use one of these:
  - **Share card:** makes one PNG with the card's data hidden inside it.
  - **Download save file:** your whole set.
  - **Export ZIP:** images, the Tabletop Simulator deck sheet, the game data and a spreadsheet.
- Spreadsheet fans: download the Excel template from **Save & Share**, fill it in, and drop it back onto the page.
- The version and build are shown at the bottom of the page. Include them when you report a bug.

## For maintainers

This repo is generated. The Forge is developed in the (private) game repo under `creator/`, and the base card list comes from its `data/cards.json`.

1. In the game repo: `npm run forge:sync`. This copies the Forge and the base cards into this repo's folder.
2. Here: commit, then push to `main`. The **Publish Card Forge** workflow checks every script and deploys to Pages in about a minute.
3. If a release misbehaves, revert the commit and push. The previous version goes back live.

Bump `VERSION` in `version.js` for every release. Bump `SAVE_FORMAT` only when the saved data shape changes.
