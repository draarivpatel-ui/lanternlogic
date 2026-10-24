'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/engine.js');

function blankRows() {
  const rows = [];
  for (let r = 0; r < L.GRID; r++) rows.push('............');
  return rows;
}

function makeLevel(overrides) {
  const rows = blankRows();
  rows[4] = '...XX..XX...';
  const base = {
    id: 1,
    name: 'Test Lantern',
    visitor: 'ghost',
    hint: 'A test hint',
    intro: 'A test intro',
    time: 60,
    rows: rows,
    constraints: {}
  };
  return Object.assign(base, overrides || {});
}

test('pumpkin geometry accepts the face and rejects the corners', () => {
  assert.equal(L.insidePumpkin(5, 5), true);
  assert.equal(L.insidePumpkin(6, 6), true);
  assert.equal(L.insidePumpkin(6, 1), true);
  assert.equal(L.insidePumpkin(6, 10), true);
  assert.equal(L.insidePumpkin(0, 0), false);
  assert.equal(L.insidePumpkin(0, 11), false);
  assert.equal(L.insidePumpkin(11, 0), false);
  assert.equal(L.insidePumpkin(11, 11), false);
  const inside = L.allInsideCells();
  assert.ok(inside.length > 60 && inside.length < 130, 'a 12 by 12 circle holds a sane cell count');
  for (const cell of inside) assert.equal(L.insidePumpkin(cell[0], cell[1]), true);
});

test('pattern parsing counts carved cells and rejects malformed rows', () => {
  const rows = blankRows();
  rows[4] = '..XXXX......';
  rows[7] = '......XX....';
  const cells = L.parsePattern(rows);
  assert.equal(cells.size, 6);
  assert.equal(cells.has(L.key(4, 2)), true);
  assert.equal(cells.has(L.key(7, 7)), true);
  assert.equal(cells.has(L.key(4, 6)), false);
  assert.throws(() => L.parsePattern(['...........']), /12 rows/);
  const shortRow = blankRows();
  shortRow[3] = '...X...';
  assert.throws(() => L.parsePattern(shortRow), /12 cells/);
  const badChar = blankRows();
  badChar[3] = '....o.......';
  assert.throws(() => L.parsePattern(badChar), /unknown character/);
});

test('level normalization validates shape, stem zone, and fields', () => {
  const good = L.normalizeLevel(makeLevel());
  assert.equal(good.target.size, 4);
  assert.throws(() => L.normalizeLevel(makeLevel({ rows: blankRows() })), /at least one target cell/);

  const outside = blankRows();
  outside[0] = 'X...........';
  assert.throws(() => L.normalizeLevel(makeLevel({ rows: outside })), /outside the pumpkin/);

  const colliding = blankRows();
  colliding[1] = '.....X......';
  assert.throws(() => L.normalizeLevel(makeLevel({
    rows: colliding,
    constraints: { stemSafe: [[1, 5]] }
  })), /collides with the stem safe zone/);

  assert.throws(() => L.normalizeLevel(makeLevel({ time: 0 })), /positive time/);
  assert.throws(() => L.normalizeLevel(makeLevel({ constraints: { maxCarved: 0 } })), /positive integer/);

  const ok = L.normalizeLevel(makeLevel({
    rows: (() => { const r = blankRows(); r[4] = '...XX..XX...'; return r; })(),
    constraints: { mirror: true, stemSafe: [[1, 5], [1, 6]], maxCarved: 5 }
  }));
  assert.equal(ok.mirror, true);
  assert.equal(ok.maxCarved, 5);
  assert.equal(ok.stemSafe.size, 2);
  assert.equal(ok.constraintCount, 3);
  assert.equal(ok.target.size, 4);
});

test('region selection toggles cells on and off', () => {
  const level = L.normalizeLevel(makeLevel());
  const state = L.createGameState(level);
  const first = L.applyCarve(state, level, 4, 3);
  assert.equal(first.ok, true);
  assert.equal(first.added, true);
  assert.deepEqual(first.cells, ['4,3']);
  assert.equal(state.carved.size, 1);
  const second = L.applyCarve(state, level, 4, 3);
  assert.equal(second.ok, true);
  assert.equal(second.added, false);
  assert.equal(state.carved.size, 0);
  assert.equal(state.undo.length, 2, 'both toggles land on the undo stack');
});

test('carving is refused outside the pumpkin shell', () => {
  const level = L.normalizeLevel(makeLevel());
  const state = L.createGameState(level);
  assert.equal(L.applyCarve(state, level, 0, 0).ok, false);
  assert.equal(L.applyCarve(state, level, 0, 0).reason, 'outside');
  assert.equal(L.applyCarve(state, level, 11, 11).ok, false);
  assert.equal(L.applyCarve(state, level, -1, 5).ok, false);
  assert.equal(state.carved.size, 0);
  assert.equal(state.undo.length, 0, 'refused carves never touch the undo stack');
});

test('the stem safe zone is protected', () => {
  const level = L.normalizeLevel(makeLevel({
    rows: (() => { const r = blankRows(); r[4] = '...XX..XX...'; return r; })(),
    constraints: { stemSafe: [[1, 5], [1, 6]] }
  }));
  const state = L.createGameState(level);
  const stem = L.applyCarve(state, level, 1, 5);
  assert.equal(stem.ok, false);
  assert.equal(stem.reason, 'stem');
  const stemTwo = L.applyCarve(state, level, 1, 6);
  assert.equal(stemTwo.ok, false);
  assert.equal(state.carved.size, 0);
  const face = L.applyCarve(state, level, 4, 3);
  assert.equal(face.ok, true);
});

test('limited cuts refuse carves beyond the budget but allow removals', () => {
  const rows = blankRows();
  rows[4] = '...XX..XX...';
  const level = L.normalizeLevel(makeLevel({ rows: rows, constraints: { maxCarved: 20 } }));
  const state = L.createGameState(level);
  const inside = L.allInsideCells();
  for (let i = 0; i < 20; i++) {
    const cell = inside[i];
    const result = L.applyCarve(state, level, cell[0], cell[1]);
    assert.equal(result.ok, true, 'carve ' + (i + 1) + ' of 20 succeeds');
  }
  const over = L.applyCarve(state, level, inside[20][0], inside[20][1]);
  assert.equal(over.ok, false);
  assert.equal(over.reason, 'budget');
  const removeOne = L.applyCarve(state, level, inside[19][0], inside[19][1]);
  assert.equal(removeOne.ok, true);
  assert.equal(removeOne.added, false);
  const refill = L.applyCarve(state, level, inside[20][0], inside[20][1]);
  assert.equal(refill.ok, true);
  assert.equal(state.carved.size, 20);
});

test('mirror carving moves the twin cell with every cut', () => {
  const rows = blankRows();
  rows[4] = '...XX..XX...';
  const level = L.normalizeLevel(makeLevel({ rows: rows, constraints: { mirror: true } }));
  const state = L.createGameState(level);
  const cut = L.applyCarve(state, level, 4, 3);
  assert.equal(cut.ok, true);
  assert.deepEqual(cut.cells, ['4,3', '4,8']);
  assert.equal(state.carved.size, 2);
  const again = L.applyCarve(state, level, 4, 3);
  assert.equal(again.ok, true);
  assert.deepEqual(again.cells, ['4,3', '4,8']);
  assert.equal(state.carved.size, 0, 'toggling one side clears both');
});

test('mirror carving respects the cut budget across pairs', () => {
  const rows = blankRows();
  rows[4] = '...XX..XX...';
  const tight = L.normalizeLevel(makeLevel({ rows: rows, constraints: { mirror: true, maxCarved: 1 } }));
  const tightState = L.createGameState(tight);
  const refused = L.applyCarve(tightState, tight, 4, 3);
  assert.equal(refused.ok, false, 'a mirror pair needs 2 slots and cannot fit a budget of 1');
  assert.equal(refused.reason, 'budget');
  assert.equal(tightState.carved.size, 0);

  const level = L.normalizeLevel(makeLevel({ rows: rows, constraints: { mirror: true, maxCarved: 3 } }));
  const state = L.createGameState(level);
  assert.equal(L.applyCarve(state, level, 4, 3).ok, true, 'the first pair fits a budget of 3');
  const secondPair = L.applyCarve(state, level, 4, 4);
  assert.equal(secondPair.ok, false);
  assert.equal(secondPair.reason, 'budget');
  assert.equal(state.carved.size, 2);
});

test('undo restores carves step by step and empties cleanly', () => {
  const rows = blankRows();
  rows[4] = '...XX..XX...';
  const level = L.normalizeLevel(makeLevel({ rows: rows, constraints: { mirror: true } }));
  const state = L.createGameState(level);
  assert.equal(L.undoCarve(state).ok, false);
  L.applyCarve(state, level, 4, 3);
  L.applyCarve(state, level, 7, 5);
  assert.equal(state.carved.size, 4);
  const backOne = L.undoCarve(state);
  assert.equal(backOne.ok, true);
  assert.equal(state.carved.size, 2);
  const backTwo = L.undoCarve(state);
  assert.equal(backTwo.ok, true);
  assert.equal(state.carved.size, 0);
  assert.equal(L.undoCarve(state).ok, false);
});

test('reset clears the carve, the undo stack, and peek charges', () => {
  const level = L.normalizeLevel(makeLevel());
  const state = L.createGameState(level);
  L.applyCarve(state, level, 4, 3);
  L.applyCarve(state, level, 6, 2);
  state.peeks = 2;
  L.resetState(state);
  assert.equal(state.carved.size, 0);
  assert.equal(state.undo.length, 0);
  assert.equal(state.peeks, 0);
});

test('symmetry scoring reads the mirror match of the carve', () => {
  const empty = new Set();
  assert.equal(L.symmetryScore(empty), 1);
  const pair = new Set(['6,2', '6,9']);
  assert.equal(L.symmetryScore(pair), 1);
  const lone = new Set(['6,2']);
  assert.equal(L.symmetryScore(lone), 0);
  const mixed = new Set(['6,2', '6,9', '4,3']);
  assert.ok(Math.abs(L.symmetryScore(mixed) - 2 / 3) < 1e-9);
});

test('waste computation separates kept shell from stray shell', () => {
  const target = new Set(['4,3', '4,4', '4,7', '4,8']);
  const perfect = new Set(['4,3', '4,4', '4,7', '4,8']);
  const clean = L.computeWaste(perfect, target);
  assert.equal(clean.kept, 4);
  assert.equal(clean.stray, 0);
  assert.equal(clean.missing, 0);
  assert.equal(clean.coverage, 1);
  assert.equal(clean.waste, 0);

  const sloppy = new Set(['4,3', '6,2', '6,9', '8,5']);
  const messy = L.computeWaste(sloppy, target);
  assert.equal(messy.kept, 1);
  assert.equal(messy.stray, 3);
  assert.equal(messy.missing, 3);
  assert.equal(messy.coverage, 0.25);
  assert.equal(messy.waste, 0.75);

  const untouched = L.computeWaste(new Set(), target);
  assert.equal(untouched.waste, 0);
  assert.equal(untouched.coverage, 0);
  assert.equal(untouched.missing, 4);
});

test('the seeded random source is deterministic', () => {
  const a = L.mulberry32(2026);
  const b = L.mulberry32(2026);
  const c = L.mulberry32(2027);
  for (let i = 0; i < 8; i++) {
    assert.equal(a(), b(), 'same seed gives the same sequence');
  }
  let differs = false;
  for (let i = 0; i < 8; i++) {
    if (a() !== c()) differs = true;
  }
  assert.equal(differs, true, 'a different seed wanders elsewhere');
});

test('cursor start sits inside the pumpkin', () => {
  const level = L.normalizeLevel(makeLevel());
  const state = L.createGameState(level);
  assert.equal(L.insidePumpkin(state.cursor.r, state.cursor.c), true);
});
