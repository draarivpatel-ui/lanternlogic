'use strict';
/*
 * Deep boundary regressions for scoring, proof state, stem analysis, and the
 * interactive lab chart. These cases use custom levels and hostile payloads so
 * they do not only prove that the twelve shipped levels happen to be safe.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../js/engine.js');
const data = require('../js/levels.js');
const LAB = require('../js/solver-lab.js');

function blankRows() {
  return Array.from({ length: L.GRID }, () => '.'.repeat(L.GRID));
}

function rowsFor(cells) {
  const rows = blankRows();
  for (const [r, c] of cells) {
    rows[r] = rows[r].slice(0, c) + 'X' + rows[r].slice(c + 1);
  }
  return rows;
}

function customLevel(id, cells, extras) {
  return L.normalizeLevel(Object.assign({
    id: id,
    name: 'Proof Fixture ' + id,
    visitor: 'Fixture Visitor',
    hint: 'A test hint',
    intro: 'A test intro',
    time: 60,
    rows: rowsFor(cells),
    constraints: {}
  }, extras || {}));
}

test('a peek still costs points when the time bonus reaches the score cap', () => {
  const level = L.normalizeLevel(data.LEVELS[0]);
  const perfect = new Set(level.target);
  const clean = L.scoreCarve(level, perfect, { timeLeft: level.time, peeks: 0 });
  const peeked = L.scoreCarve(level, perfect, { timeLeft: level.time, peeks: 1 });
  assert.equal(clean.total, 100);
  assert.equal(peeked.total, 95);
});

test('proof caching cannot confuse two different levels that share an id', () => {
  const first = customLevel(99, [[4, 5]], { name: 'Original proof fixture' });
  const changed = customLevel(99, [[4, 6], [5, 6]], { name: 'Changed proof fixture' });
  const firstProof = LAB.buildProof(first, 'exact-optimal');
  const changedProof = LAB.buildProof(changed, 'exact-optimal');
  assert.notEqual(changedProof, firstProof);
  assert.equal(changedProof.level.name, 'Changed proof fixture');
  assert.equal(changedProof.analysis.targetCount, 2);
});

test('verifyProof refuses a foreign payload even when it carries a self consistent digest', () => {
  const foreign = { anything: 1 };
  foreign.sha256 = LAB.sha256(LAB.stableStringify(foreign));
  const result = LAB.verifyProof(foreign);
  assert.equal(result.ok, false);
  assert.match(result.reason, /tool|format|proof/);
});

test('verifyProof refuses the wrong format version before trusting the digest', () => {
  const level = L.normalizeLevel(data.LEVELS[0]);
  const proof = JSON.parse(LAB.exportJson(LAB.buildProof(level, 'exact-optimal')));
  proof.format = 999;
  const clone = {};
  for (const key of Object.keys(proof)) {
    if (key !== 'sha256') clone[key] = proof[key];
  }
  proof.sha256 = LAB.sha256(LAB.stableStringify(clone));
  assert.equal(LAB.verifyProof(proof).ok, false);
});

test('a stem twin only conflicts with a target on mirror levels', () => {
  // The target at 4,6 has its horizontal twin inside the stem zone at 4,5.
  // Without mirror carving that twin is never carved, so the stem is intact.
  const level = customLevel(98, [[4, 6]], {
    constraints: { stemSafe: [[4, 5]] }
  });
  const analysis = LAB.analyzeLevel(level);
  assert.equal(level.mirror, false);
  assert.equal(analysis.stemProtected, true);
});

test('the interactive budget chart is not exposed as one presentational image', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const tag = html.match(/<svg id="lab-budget-chart"[^>]+>/)[0];
  assert.doesNotMatch(tag, /role="img"/);
  assert.match(tag, /role="group"/);
});
