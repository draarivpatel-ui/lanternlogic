'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/engine.js');
const data = require('../js/levels.js');

const LEVELS = data.LEVELS.map((level) => L.normalizeLevel(level));
const FIRST = LEVELS[0];

/* The First Spark target is both eye pairs plus the eight smile cells.
 * These helpers carve named subsets of it for deterministic scoring cases. */
const EYE_LEFT = ['4,3', '4,4'];
const EYE_RIGHT = ['4,7', '4,8'];
const STRAYS = ['2,4', '2,7', '5,4', '5,7'];

function carveSet(keys) {
  return new Set(keys);
}

test('a perfect carve scores one hundred with the top grade and verdict', () => {
  const carved = carveSet([...FIRST.target]);
  const result = L.scoreCarve(FIRST, carved, { timeLeft: 0, peeks: 0 });
  assert.equal(result.coverage, 1);
  assert.equal(result.waste, 0);
  assert.equal(result.shape, 100);
  assert.equal(result.symmetry, 100);
  assert.equal(result.wasteScore, 100);
  assert.equal(result.base, 100);
  assert.equal(result.timeBonus, 0);
  assert.equal(result.total, 100);
  assert.equal(result.grade, 'A Plus');
  assert.ok(L.VERDICTS['A Plus'].includes(result.verdict), 'the verdict comes from the top band');
});

test('a partial face scores its true share with exact math', () => {
  const carved = carveSet([...EYE_LEFT, ...EYE_RIGHT]);
  const result = L.scoreCarve(FIRST, carved, { timeLeft: 0, peeks: 0 });
  assert.equal(result.coverage, 4 / 12);
  assert.equal(result.stray, 0);
  assert.equal(result.waste, 0);
  assert.equal(result.shape, 33);
  assert.equal(result.symmetry, 100);
  assert.equal(result.base, 33);
  assert.equal(result.total, 33);
  assert.equal(result.grade, 'D');
  assert.ok(L.VERDICTS.D.includes(result.verdict));
});

test('stray cuts burn shell and drag the score down', () => {
  const clean = carveSet([...FIRST.target]);
  const sloppy = carveSet([...FIRST.target, ...STRAYS]);
  const cleanScore = L.scoreCarve(FIRST, clean, { timeLeft: 0, peeks: 0 });
  const sloppyScore = L.scoreCarve(FIRST, sloppy, { timeLeft: 0, peeks: 0 });
  assert.equal(sloppyScore.stray, 4);
  assert.equal(sloppyScore.waste, 0.25);
  assert.equal(sloppyScore.shape, 88, 'shape pays half of the waste share');
  assert.equal(sloppyScore.wasteScore, 75);
  assert.equal(sloppyScore.base, 88);
  assert.equal(sloppyScore.total, 88);
  assert.ok(sloppyScore.total < cleanScore.total, 'waste never helps');
  assert.equal(sloppyScore.grade, 'A');
});

test('an asymmetric carve loses the symmetry share', () => {
  const carved = carveSet(EYE_LEFT);
  const result = L.scoreCarve(FIRST, carved, { timeLeft: 0, peeks: 0 });
  assert.equal(result.symmetry, 0);
  assert.equal(result.coverage, 2 / 12);
  assert.equal(result.shape, 17);
  assert.equal(result.base, 13);
  assert.equal(result.total, 13);
  assert.equal(result.grade, 'E');
});

test('time left over converts into a bonus only above the bar', () => {
  const good = carveSet([...FIRST.target, ...STRAYS]);
  const withTime = L.scoreCarve(FIRST, good, { timeLeft: 45, peeks: 0 });
  assert.equal(withTime.timeBonus, 5, 'half the candle left earns half the bonus');
  assert.equal(withTime.total, 93);
  assert.equal(withTime.grade, 'A');

  const fullCandle = L.scoreCarve(FIRST, good, { timeLeft: 90, peeks: 0 });
  assert.equal(fullCandle.timeBonus, 10, 'every second left pays out up to ten points');
  assert.equal(fullCandle.total, 98);

  const slow = carveSet(EYE_LEFT);
  const belowBar = L.scoreCarve(FIRST, slow, { timeLeft: 60, peeks: 0 });
  assert.equal(belowBar.timeBonus, 0, 'a carve under the bar earns no time bonus');
  assert.equal(belowBar.total, 13);
});

test('peeks cost points and the score never drops below zero', () => {
  const perfect = carveSet([...FIRST.target]);
  const peeked = L.scoreCarve(FIRST, perfect, { timeLeft: 0, peeks: 1 });
  assert.equal(peeked.peekPenalty, 5);
  assert.equal(peeked.total, 95);
  assert.equal(peeked.grade, 'A Plus', 'a peeked perfect lantern still tops the band');

  const weak = carveSet(EYE_LEFT);
  const charged = L.scoreCarve(FIRST, weak, { timeLeft: 0, peeks: 3 });
  assert.equal(charged.peekPenalty, 15);
  assert.equal(charged.total, 0, 'the floor holds at zero');
  assert.equal(charged.grade, 'E');
  assert.ok(L.VERDICTS.E.includes(charged.verdict));

  const buried = L.scoreCarve(FIRST, new Set(), { timeLeft: 0, peeks: 99 });
  assert.equal(buried.total, 0);
});

test('an untouched pumpkin grades honestly at the bottom', () => {
  const result = L.scoreCarve(FIRST, new Set(), { timeLeft: 0, peeks: 0 });
  assert.equal(result.coverage, 0);
  assert.equal(result.waste, 0);
  assert.equal(result.shape, 0);
  assert.equal(result.symmetry, 100, 'nothing carved is perfectly symmetric');
  assert.equal(result.base, 0, 'neatly doing nothing earns nothing');
  assert.equal(result.total, 0);
  assert.equal(result.grade, 'E');
});

test('grade bands hold their thresholds', () => {
  assert.equal(L.gradeFor(100), 'A Plus');
  assert.equal(L.gradeFor(95), 'A Plus');
  assert.equal(L.gradeFor(94), 'A');
  assert.equal(L.gradeFor(85), 'A');
  assert.equal(L.gradeFor(84), 'B');
  assert.equal(L.gradeFor(65), 'B');
  assert.equal(L.gradeFor(64), 'C');
  assert.equal(L.gradeFor(45), 'C');
  assert.equal(L.gradeFor(44), 'D');
  assert.equal(L.gradeFor(20), 'D');
  assert.equal(L.gradeFor(19), 'E');
  assert.equal(L.gradeFor(0), 'E');
});

test('verdicts are deterministic, per level, and always from the right band', () => {
  const grades = ['A Plus', 'A', 'B', 'C', 'D', 'E'];
  for (const level of LEVELS) {
    for (const grade of grades) {
      const first = L.verdictFor(grade, level.id);
      const second = L.verdictFor(grade, level.id);
      assert.equal(first, second, 'level ' + level.id + ' verdict never changes between calls');
      assert.ok(L.VERDICTS[grade].includes(first));
      assert.equal(first.includes('\u2014'), false, 'no em dashes in verdicts');
      assert.equal(first.includes('\u2013'), false, 'no en dashes in verdicts');
    }
  }
  assert.notEqual(L.verdictFor('B', 1), L.verdictFor('B', 2), 'different levels hear different lines');
});

test('every level scores its perfect carve at one hundred', () => {
  for (const level of LEVELS) {
    const result = L.scoreCarve(level, new Set(level.target), { timeLeft: 0, peeks: 0 });
    assert.equal(result.total, 100, 'level ' + level.id + ' is solvable to a perfect score');
    assert.equal(result.grade, 'A Plus');
  }
});

test('scoring survives empty options and defaults the candle to spent', () => {
  const carved = carveSet([...FIRST.target]);
  const bare = L.scoreCarve(FIRST, carved);
  assert.equal(bare.total, 100);
  assert.equal(typeof bare.verdict, 'string');
});
