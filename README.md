# Lantern Logic

A pumpkin carving puzzle game. Each trick or treater arrives with a wish, a shape they
dream of seeing in a lantern. Carve it on a drawn grid pumpkin before the candle burns
down, and the engine grades your shape match, your symmetry, and the shell you saved
from the compost heap.

Built for the Pumpkin Playground hackathon by Aariv Patel.

## Play

Open `index.html` in any modern browser. That is the whole install. The page is a
static single page app with zero dependencies and no build step, so it also works
straight from GitHub Pages.

## How it plays

- Arrow keys move the knife on the pumpkin grid, space carves, Enter lights the lantern.
- Mouse and touch work too, tap or drag on the pumpkin face.
- Twelve hand designed levels escalate the rules, mirror carving, tight cut budgets,
  and a stem that must stay whole.
- Every star, silhouette, and pumpkin is drawn in code on canvas. There are no image
  files, and the reduced motion preference swaps the flicker for a steady glow.

## Solvability lab

A Solvability and Symmetry Lab sits under the game (the Solvability Lab button on
the title screen). It proves every level beatable inside its own rules, grades
four carving strategies through the real engine, draws the budget versus minimum
cut chart and a grid diff blueprint, and exports a SHA-256 stamped proof brief
as JSON, CSV, or Markdown. A `#ll=` hash in the URL bookmarks the lab state.

## Test

```
npm test
```

runs the node:test suites in `tests/`, no dependencies and no network. A standalone
wiring check lives at `node scripts/dom-smoke.js`, and a headless Chromium audit
at `node scripts/browser-audit.js` (needs a local Chrome install only).

## Structure

| Path | Purpose |
| --- | --- |
| `index.html` | Markup, semantic landmarks, aria hooks |
| `styles.css` | Design tokens, layout, states, reduced motion block |
| `js/levels.js` | Twelve deterministic levels as authored grids |
| `js/engine.js` | Pure carving engine, node importable, no DOM access |
| `js/solver-lab.js` | Solvability analyzer, strategy comparator, SHA-256 proof exporter, share hash codec, all pure |
| `js/app.js` | Screens, canvas painting, input, game clock, lab wiring |
| `tests/` | Engine, level data, scoring, shell, and solver lab suites |
| `scripts/dom-smoke.js` | DOM stubbed wiring check for the browser shell |
| `scripts/browser-audit.js` | Headless Chromium CDP audit, zero dependencies |
| `NOTES.md` | Build notes, exact test counts, honest caveats |
