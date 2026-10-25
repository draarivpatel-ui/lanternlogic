# Lantern Logic: Build Notes

Built 2026-10-24 for the Pumpkin Playground hackathon (Devpost window closes Oct 30).
Author: Aariv Patel. Node v26.8.1. No git repository, remote, push, or install was
performed in this build; the folder is a plain static site ready for GitHub Pages.

## What was built

- `index.html`: the game as a static single page. Semantic landmarks with a skip link,
  exactly one h1, a role application carving grid with an aria described help block, a
  polite live region that announces every knife move and verdict, labelled buttons for
  undo, reset, peek, and light it, and a details block for how to play.
- `styles.css`: the design tokens (deep plum sky, lantern orange, cream ink), a serif
  display voice over a rounded body stack, uneven radii for the hand drawn feel, hover,
  focus visible, active, and disabled states, a 900 and a 480 pixel breakpoint, and a
  reduced motion block that stills the flicker and the hover lifts.
- `js/levels.js`: twelve deterministic levels authored as twelve by twelve character
  grids, each with a named visitor, a shape hint, a time budget, and constraint data.
- `js/engine.js`: the pure carving engine. Pumpkin circle geometry, pattern parsing,
  carve toggling with mirror twins, cut budgets, and stem safe zones, undo, symmetry
  scoring, waste computation, the grade bands, the verdict bands, and a seeded random
  source for deterministic star fields and wobble. No DOM access, so node tests and the
  page run the same code.
- `js/app.js`: the browser shell. Five screens (title, level path, carving, lantern
  report, night recap), canvas painting for the sky, stars, moon, hills, one lit house
  window, twelve visitor silhouettes, and the pumpkin itself, keyboard and pointer
  input, a 250 millisecond game clock that pauses when the tab hides, and localStorage
  progress that degrades to memory when storage is blocked.
- `tests/`: four node:test suites, detailed below.
- `scripts/dom-smoke.js`: a Node wiring check that stubs the DOM and canvas, then
  clicks through boot, start, carve, peek, undo, reset, submit, report, next level,
  level select, and escape. Not part of the default suite.
- `README.md` and `LICENSE` (MIT).

## Spec compliance

- Static single page at `index.html`, vanilla HTML, CSS, and JS, zero dependencies,
  GitHub Pages ready: yes. `package.json` declares no dependencies at all.
- Twelve hand designed levels with escalating constraints: yes. Levels 1 to 3 are free
  carving, mirror symmetry arrives at level 4, the stem safe zone at level 5, cut
  budgets at level 6, and level 12 combines all three. A test locks the escalation.
- Scoring on shape match, symmetry, and leftover shell waste: yes. Shape carries 55
  percent, symmetry 25, shell cleanliness 20, then up to 10 time bonus points and a
  5 point peek cost. Symmetry and cleanliness pay out in proportion to coverage, so an
  untouched pumpkin earns nothing for being neatly untouched.
- Witty but wholesome verdict lines: yes, six grade bands with three lines each, chosen
  deterministically per level.
- Full keyboard operability: yes. Arrow keys move the knife, space or enter carves,
  U undoes, P peeks, R resets, escape leaves, and every button is a real button. The
  live region narrates each move.
- All rendering on canvas, all art in code, no image assets: yes. The only non code
  graphic is an inline SVG favicon as a data URI.
- Deterministic level data: yes, authored grids plus a seeded PRNG for stars and wobble,
  so every load looks the same.
- Responsive including mobile: yes, down to 320 pixels with no horizontal scroll, a
  44 pixel touch floor on controls, and a stacked layout under 900 pixels.

## Exact real test counts

`npm test` runs 41 tests, 41 pass, 0 fail, about 45 ms on this machine. Well inside the
30 second budget. No network access anywhere.

- `tests/engine.test.js`: 15 tests covering pumpkin geometry, pattern parsing, region
  selection toggles, refusals outside the shell, the stem safe zone, cut budgets,
  mirror twins, undo, reset, symmetry scoring, waste computation, and PRNG determinism.
- `tests/levels.test.js`: 9 tests on level data integrity, twelve ordered ids, every
  target inside the pumpkin, mirror symmetric targets, solvable cut budgets, sane time
  budgets, constraint escalation, known visitors, and copy hygiene with no em or en
  dashes and no emoji.
- `tests/scoring.test.js`: 9 tests on scoring, including hand computed exact totals for
  perfect, partial, sloppy, and asymmetric carves, the time bonus bar, the peek cost and
  the zero floor, grade band thresholds, verdict determinism, and a proof that every
  level is solvable to exactly 100.
- `tests/shell.test.js`: 8 tests on the shipped files, markup hooks, banned punctuation,
  token led CSS, the reduced motion block, the zero dependency manifest, and four real
  WCAG contrast ratios computed from the parsed tokens, 15.72 for body ink on the sky,
  9.96 for soft text, 9.05 for accent text, and 8.45 for button labels on lantern
  orange.

The suites contain 232 written assert calls; because several run inside loops over all
twelve levels and all inside cells, a runtime count comes to 1190 executed assertions.
`scripts/dom-smoke.js` adds 26 wiring checks outside the default suite. The station
honesty harness audits the repo clean at 0 violations.

## Honest caveats

- No browser was opened in this build, per the build rules. Visual QA therefore rested
  on the DOM smoke harness plus code review. Real rendering, the flicker feel, and the
  rounded font fallbacks on Windows or Android are unverified by eye.
- Screen reader play is narrated through a live region rather than a native grid
  semantic. Keyboard play was exercised through the stubbed harness, not with assistive
  technology, so the two experiences are expected to work but are not proven equal.
- Fonts are system stacks (Iowan Old Style or Palatino for display, ui-rounded or the
  platform sans for body) because the zero dependency rule rules out webfonts, so
  letterforms shift between platforms.
- Progress and best scores live in localStorage per browser and clear with site data.
- The timer pauses while the tab is hidden, which is kinder than real candle physics.
- Playtesting was done by the automated test suites and the stubbed smoke run only.
  No human playtesting has happened yet, so difficulty tuning at levels 9 to 12 is an
  estimate, not a finding.

## Devpost bullets

- Carve the right pumpkin for every trick or treater: twelve hand designed visitors each
  wish for a face, and you carve it cell by cell on a drawn grid pumpkin before the
  candle burns down.
- A carving engine that grades like a judge: shape match, symmetry, and the shell you
  saved from waste are weighed into one score, then a wholesome verdict line tells you
  how the night went.
- Rules that escalate the craft: mirror carving locks both halves of the face together,
  cut budgets make every cell count, and protected stems teach you to carve around the
  grain across twelve levels.
- Every pixel drawn in code: stars, moon, hills, twelve costumed silhouettes, and a
  flickering lantern glow are all canvas, with no image files and a reduced motion mode
  that swaps the flicker for a steady flame.
- Small, testable, honest: a zero dependency static page where the pure engine runs
  unchanged in node:test, 41 tests with 1190 assertion executions, plus a DOM smoke pass
  over the whole game flow.

## The short version

Lantern Logic is a complete, offline, dependency free puzzle game with a real scoring
engine, twelve authored levels, keyboard and pointer play, and a test suite that proves
the engine, the level data, and the page wiring. The build is GitHub Pages ready as is.
The one thing it has not had is a human holding it, so a five minute play pass on real
hardware, phone and laptop, is the highest value next step before submission.

## Refinement Pass 2026-10-24

A presentation wiring pass only. The engine and the level data are untouched.

- Wiring audit: every id the shell references exists in the markup, no duplicate ids, no dead listeners, no reachable console errors.
- Added Open Graph title, description and type tags. Share sheets had nothing to read before.
- Fixed: sizePumpkin stamped an inline pixel height on the game canvas, which could fight the stylesheet square below about 245 px viewports and distort the drawing. The canvas now takes its square from CSS alone (width 100 percent, aspect ratio 1 to 1) and the drawing size and rendered size agree at every width.
- Verified the game canvas scales down cleanly at 320 px: the carve area is 296 px wide there and the canvas follows it exactly, level cards collapse to one column, and the control buttons reflow into two columns.
- Verified: the game clock and the visual loop already pause while the tab is hidden, reduced motion draws single static frames instead of animating, contrast tokens pass the suite's own AA assertions, and the copy carries no em or en dashes, no emoji, no all caps kickers.
- Tests before the pass: 41 passed, 0 failed. Tests after: 41 passed, 0 failed. The DOM smoke script still clicks through the full flow with 26 checks passing.
