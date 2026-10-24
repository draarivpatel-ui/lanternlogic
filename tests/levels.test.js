'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/engine.js');
const data = require('../js/levels.js');

const DASHES = /[\u2013\u2014]/;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/u;

test('there are exactly twelve levels with ordered unique ids', () => {
  assert.equal(data.LEVELS.length, 12);
  data.LEVELS.forEach((level, index) => {
    assert.equal(level.id, index + 1, 'level ' + index + ' carries id ' + (index + 1));
  });
});

test('every level normalizes without throwing', () => {
  for (const level of data.LEVELS) {
    const norm = L.normalizeLevel(level);
    assert.equal(norm.id, level.id);
    assert.ok(norm.target.size >= 6, 'level ' + level.id + ' has a real face to carve');
  }
});

test('every level names a known visitor and each visitor appears once', () => {
  const seen = new Set();
  for (const level of data.LEVELS) {
    assert.ok(data.VISITORS.includes(level.visitor), 'level ' + level.id + ' visitor is known');
    seen.add(level.visitor);
  }
  assert.equal(seen.size, 12, 'all twelve visitor silhouettes get a level');
});

test('mirror levels demand perfectly symmetric targets', () => {
  for (const level of data.LEVELS) {
    const norm = L.normalizeLevel(level);
    if (!norm.mirror) continue;
    for (const k of norm.target) {
      const pair = L.unkey(k);
      assert.ok(
        norm.target.has(L.twinKey(k)),
        'level ' + level.id + ' cell ' + k + ' has its mirror twin in the target'
      );
      assert.equal(L.GRID - 1 - pair[1] !== pair[1], true, 'an even grid has no center column to cheat with');
    }
  }
});

test('cut budgets leave room to solve the level', () => {
  for (const level of data.LEVELS) {
    const norm = L.normalizeLevel(level);
    if (norm.maxCarved == null) continue;
    assert.ok(
      norm.maxCarved >= norm.target.size,
      'level ' + level.id + ' budget of ' + norm.maxCarved + ' covers its ' + norm.target.size + ' target cells'
    );
    if (norm.mirror) {
      assert.equal(norm.target.size % 2, 0, 'level ' + level.id + ' mirror target has an even cell count');
    }
  }
});

test('time budgets sit in a playable range and taper for late levels', () => {
  for (const level of data.LEVELS) {
    assert.ok(level.time >= 30 && level.time <= 120, 'level ' + level.id + ' time of ' + level.time + 's is sane');
  }
  assert.ok(data.LEVELS[11].time <= data.LEVELS[0].time, 'the finale gets no extra time over the opener');
});

test('constraints escalate and the finale uses all three types', () => {
  let previous = 0;
  const kinds = new Set();
  for (const level of data.LEVELS) {
    const norm = L.normalizeLevel(level);
    assert.ok(
      norm.constraintCount >= previous,
      'level ' + level.id + ' does not shed constraints as the night goes on'
    );
    previous = norm.constraintCount;
    if (norm.mirror) kinds.add('mirror');
    if (norm.maxCarved != null) kinds.add('budget');
    if (norm.stemSafe.size > 0) kinds.add('stem');
  }
  assert.deepEqual([...kinds].sort(), ['budget', 'mirror', 'stem']);
  assert.equal(previous, 3, 'level twelve carries all three constraints');
});

test('level copy is clean, warm, and free of banned punctuation', () => {
  for (const level of data.LEVELS) {
    const fields = [level.name, level.hint, level.intro];
    for (const field of fields) {
      assert.equal(typeof field, 'string');
      assert.ok(field.length > 0, 'level ' + level.id + ' copy is present');
      assert.equal(DASHES.test(field), false, 'level ' + level.id + ' copy avoids em and en dashes');
      assert.equal(EMOJI.test(field), false, 'level ' + level.id + ' copy avoids emoji and glyph stand ins');
      assert.equal(field.includes('  '), false, 'level ' + level.id + ' copy has no double spaces');
    }
    const words = level.name.split(' ');
    for (const word of words) {
      assert.match(word, /^[A-Z]/, 'level ' + level.id + ' name stays in Title Case');
    }
  }
});

test('shape hints describe real pattern features', () => {
  for (const level of data.LEVELS) {
    const norm = L.normalizeLevel(level);
    assert.ok(norm.target.size >= 6);
    assert.ok(level.hint.length >= 12, 'level ' + level.id + ' hint carries real guidance');
    assert.ok(level.intro.length >= 20, 'level ' + level.id + ' intro sets the scene');
  }
});
