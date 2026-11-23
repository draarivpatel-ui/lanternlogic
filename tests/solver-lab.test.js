'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/engine.js');
const data = require('../js/levels.js');
const Lab = require('../js/solver-lab.js');

const LEVELS = data.LEVELS.map((level) => L.normalizeLevel(level));
const RAW = data.LEVELS;
const STRATS = Lab.STRATEGIES;

function level(id) {
  return LEVELS[id - 1];
}

/* Module shape */

test('the lab exports every public surface it documents', () => {
  for (const name of ['simulate', 'minCuts', 'analyzeLevel', 'analyzeAll', 'compare',
    'compareAll', 'diffBlueprint', 'budgetRows', 'sha256', 'stableStringify',
    'buildProof', 'verifyProof', 'csvCell', 'exportJson', 'exportCsv',
    'exportMarkdown', 'normalizeState', 'encodeHash', 'decodeHash', 'selfTests']) {
    assert.equal(typeof Lab[name], 'function', name + ' is a function');
  }
  assert.deepEqual(STRATS, ['exact-optimal', 'conservative-half', 'noisy-overcarve', 'mirror-unaware']);
});

test('strategy labels cover every strategy id', () => {
  for (const id of STRATS) {
    assert.equal(typeof Lab.STRATEGY_LABELS[id], 'string');
    assert.ok(Lab.STRATEGY_LABELS[id].length > 0);
    assert.equal(typeof Lab.STRATEGY_NOTES[id], 'string');
  }
});

test('analyzer accepts raw level records and normalized levels alike', () => {
  const fromRaw = Lab.analyzeLevel(RAW[0]);
  const fromNorm = Lab.analyzeLevel(LEVELS[0]);
  assert.equal(fromRaw.id, fromNorm.id);
  assert.equal(fromRaw.targetCount, fromNorm.targetCount);
  assert.equal(fromRaw.minActions, fromNorm.minActions);
  assert.equal(fromRaw.optimalScore, fromNorm.optimalScore);
});

test('unknown strategy ids fail closed everywhere', () => {
  assert.equal(Lab.simulate(level(1), 'bogus'), null);
  assert.equal(Lab.compare(level(1), 'bogus'), null);
  assert.equal(Lab.compare(level(1), '__proto__'), null);
  assert.equal(Lab.compare(level(1), ''), null);
  assert.equal(Lab.buildProof(level(1), 'bogus'), null);
  assert.equal(Lab.diffBlueprint(level(1), 'bogus'), null);
});

/* SHA-256 */

const SHA_VECTORS = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ['abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
    'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1'],
  ['The quick brown fox jumps over the lazy dog',
    'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'],
  ['The quick brown fox jumps over the lazy dog.',
    'ef537f25c895bfa782526529a9b63d97aa631564d5d789c2b765448c8635fb6c']
];

for (const [input, expected] of SHA_VECTORS) {
  test('sha256 KAT for input of length ' + input.length, () => {
    assert.equal(Lab.sha256(input), expected);
  });
}

test('sha256 of one million a characters matches the FIPS KAT', () => {
  assert.equal(Lab.sha256('a'.repeat(1000000)),
    'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
});

test('sha256 accepts byte arrays and matches the string form', () => {
  const viaBytes = Lab.sha256([97, 98, 99]);
  assert.equal(viaBytes, Lab.sha256('abc'));
});

test('sha256 output is always 64 lowercase hex chars', () => {
  for (const s of ['', 'x', 'lantern logic', JSON.stringify({ a: 1 }), 'z'.repeat(5000)]) {
    assert.match(Lab.sha256(s), /^[0-9a-f]{64}$/);
  }
});

test('sha256 is deterministic across repeated calls', () => {
  const a = Lab.sha256('deterministic');
  for (let i = 0; i < 5; i++) assert.equal(Lab.sha256('deterministic'), a);
});

test('sha256 distinguishes near-identical inputs', () => {
  assert.notEqual(Lab.sha256('level-1'), Lab.sha256('level-2'));
  assert.notEqual(Lab.sha256('a'), Lab.sha256('a '));
  assert.notEqual(Lab.sha256('A'), Lab.sha256('a'));
});

test('utf8 encoding handles multibyte, emoji, and lone surrogates', () => {
  assert.deepEqual(Lab.utf8Bytes('A'), [65]);
  assert.deepEqual(Lab.utf8Bytes('é'), [0xc3, 0xa9]);
  assert.deepEqual(Lab.utf8Bytes('€'), [0xe2, 0x82, 0xac]);
  assert.deepEqual(Lab.utf8Bytes('\u{1F383}'), [0xf0, 0x9f, 0x8e, 0x83]);
  assert.deepEqual(Lab.utf8Bytes('\ud800'), [0xef, 0xbf, 0xbd]);
  assert.deepEqual(Lab.utf8Bytes('\udc00'), [0xef, 0xbf, 0xbd]);
});

test('sha256 over multibyte text matches a trusted digest', () => {
  const { createHash } = require('node:crypto');
  for (const s of ['caf\u00e9', '\u{1F383} pumpkin', 'a\u0301', '\u4e2d\u6587']) {
    assert.equal(Lab.sha256(s), createHash('sha256').update(s, 'utf8').digest('hex'), 'digest of ' + JSON.stringify(s));
  }
});

test('sha256 survives hostile input types without throwing garbage', () => {
  assert.match(Lab.sha256([]), /^[0-9a-f]{64}$/);
  assert.match(Lab.sha256(new Uint8Array([1, 2, 3])), /^[0-9a-f]{64}$/);
});

/* Analyzer, one block per level */

const analysis = Lab.analyzeAll();

test('analyzeAll returns twelve rows in level order', () => {
  assert.equal(analysis.length, 12);
  analysis.forEach((a, i) => assert.equal(a.id, i + 1));
});

for (const a of analysis) {
  test('level ' + a.id + ' ' + a.name + ' proves solvable inside its rules', () => {
    assert.equal(a.solvable, true);
    assert.equal(a.targetCount, level(a.id).target.size);
    assert.equal(a.minCells, a.targetCount);
    if (a.mirror) {
      assert.equal(a.minActions * 2, a.targetCount, 'mirror halves the actions');
    } else {
      assert.equal(a.minActions, a.targetCount);
    }
    if (a.budget == null) {
      assert.equal(a.headroom, null);
    } else {
      assert.ok(a.headroom >= 0, 'headroom ' + a.headroom + ' is not negative');
      assert.equal(a.budget - a.minCells, a.headroom);
    }
    assert.equal(a.stemProtected, true);
    assert.equal(a.optimalScore, 100);
    assert.equal(a.optimalGrade, 'A Plus');
    assert.equal(a.stars, 3);
    assert.equal(typeof a.stemDetail, 'string');
  });
}

for (const a of analysis) {
  test('level ' + a.id + ' exact optimal carve lands on the target exactly', () => {
    const sim = Lab.simulate(level(a.id), 'exact-optimal');
    assert.equal(sim.refused.length, 0, 'no refusals on the optimal line');
    assert.equal(sim.carved.size, a.targetCount);
    for (const k of level(a.id).target) assert.ok(sim.carved.has(k), k + ' carved');
    for (const k of sim.carved) assert.ok(level(a.id).target.has(k), k + ' is wanted');
    assert.equal(sim.actions, a.minActions);
  });
}

for (const a of analysis) {
  test('level ' + a.id + ' comparator rows stay inside the game rules', () => {
    for (const sid of STRATS) {
      const row = Lab.compare(level(a.id), sid);
      assert.equal(row.strategy, sid);
      assert.ok(Number.isInteger(row.actions) && row.actions >= 0);
      assert.ok(Number.isInteger(row.refusals) && row.refusals >= 0);
      assert.ok(row.carved instanceof Set);
      assert.equal(row.carvedCount, row.carved.size);
      assert.ok(row.shape >= 0 && row.shape <= 100, 'shape inside range');
      assert.ok(row.symmetry >= 0 && row.symmetry <= 100, 'symmetry inside range');
      assert.ok(row.shellSaved >= 0 && row.shellSaved <= 100, 'shell inside range');
      assert.ok(row.total >= 0 && row.total <= 100, 'total inside range');
      assert.ok(['intact', 'violated', 'not required'].includes(row.stemVerdict));
      if (a.stemCount === 0) assert.equal(row.stemVerdict, 'not required');
      else assert.equal(row.stemVerdict, 'intact', 'stem never breaks under any strategy');
    }
  });
}

for (const a of analysis) {
  test('level ' + a.id + ' exact optimal reaches 100 and beats the weaker lines', () => {
    const rows = Lab.compareAll(level(a.id));
    assert.equal(rows.length, 4);
    const opt = rows[0];
    assert.equal(opt.strategy, 'exact-optimal');
    assert.equal(opt.total, 100);
    assert.equal(opt.grade, 'A Plus');
    for (const row of rows.slice(1)) {
      assert.ok(row.total <= opt.total, row.strategy + ' never beats optimal');
    }
    const unaware = rows.find((r) => r.strategy === 'mirror-unaware');
    if (a.mirror) {
      assert.equal(unaware.carvedCount, 0, 'mirror pairs cancel on a blind recut');
      assert.equal(unaware.total, 0);
    } else {
      assert.equal(unaware.carvedCount, a.targetCount);
      assert.equal(unaware.total, 100);
    }
    const half = rows.find((r) => r.strategy === 'conservative-half');
    assert.equal(half.actions, Math.ceil(a.minActions / 2));
    assert.ok(half.total < 100, 'half a carve cannot reach a perfect score');
  });
}

for (const a of analysis) {
  test('level ' + a.id + ' noisy overcarve matches the budget truth', () => {
    const row = Lab.compare(level(a.id), 'noisy-overcarve');
    const stray = row.carvedCount - a.targetCount;
    assert.ok(stray >= 0, 'overcarve never loses target cells');
    for (const k of level(a.id).target) assert.ok(row.carved.has(k), 'target cell ' + k + ' kept');
    if (a.budget != null) {
      assert.ok(row.carvedCount <= a.budget, 'carved stays inside budget');
      assert.ok(stray <= Math.max(0, a.headroom), 'stray bounded by headroom');
      if (a.headroom < 2 && a.mirror) assert.equal(stray, 0, 'a pair cannot fit under one slot');
      if (a.headroom === 0) assert.ok(row.refusals >= 1, 'a full budget records a refusal');
    } else {
      assert.ok(stray > 0, 'uncapped levels always attract noise');
    }
  });
}

for (const a of analysis) {
  for (const sid of STRATS) {
    test('level ' + a.id + ' ' + sid + ' reports the engine score for its own carve', () => {
      const row = Lab.compare(level(a.id), sid);
      const sim = Lab.simulate(level(a.id), sid);
      const direct = L.scoreCarve(level(a.id), sim.carved, { timeLeft: 0, peeks: 0 });
      assert.equal(row.total, direct.total);
      assert.equal(row.shape, direct.shape);
      assert.equal(row.symmetry, direct.symmetry);
      assert.equal(row.shellSaved, direct.wasteScore);
      assert.equal(row.grade, direct.grade);
    });
  }
}

for (const a of analysis) {
  test('level ' + a.id + ' analysis is identical across three independent runs', () => {
    const runs = [0, 1, 2].map(() => Lab.analyzeLevel(level(a.id)));
    for (const field of ['targetCount', 'minActions', 'minCells', 'budget',
      'headroom', 'solvable', 'stemProtected', 'optimalScore', 'optimalGrade', 'stars']) {
      assert.deepEqual(runs[0][field], runs[1][field], field + ' run one equals run two');
      assert.deepEqual(runs[1][field], runs[2][field], field + ' run two equals run three');
    }
  });
}

for (const a of analysis) {
  if (a.stemCount === 0) continue;
  test('level ' + a.id + ' refuses every stem cell by name', () => {
    const lv = level(a.id);
    const state = L.createGameState(lv);
    for (const k of lv.stemSafe) {
      const pair = L.unkey(k);
      const res = L.applyCarve(state, lv, pair[0], pair[1]);
      assert.equal(res.ok, false, 'stem cell ' + k + ' refuses');
      assert.equal(res.reason, 'stem');
    }
    assert.equal(state.carved.size, 0);
  });
}

for (const a of analysis) {
  test('level ' + a.id + ' optimal blueprint keeps the wish and nothing else', () => {
    const bp = Lab.diffBlueprint(level(a.id), 'exact-optimal');
    assert.equal(bp.kept, a.targetCount);
    assert.equal(bp.missing, 0);
    assert.equal(bp.stray, 0);
    let targetMarked = 0;
    for (const row of bp.cells) {
      for (const cell of row) {
        if (cell.cls === 'kept') targetMarked++;
        if (cell.cls === 'stem') {
          assert.ok(level(a.id).stemSafe.has(L.key(cell.r, cell.c)), 'stem marks only stem cells');
        }
      }
    }
    assert.equal(targetMarked, a.targetCount);
  });
}

/* Blueprint diff */

for (const a of analysis) {
  test('level ' + a.id + ' blueprint classifies every cell consistently', () => {
    for (const sid of STRATS) {
      const bp = Lab.diffBlueprint(level(a.id), sid);
      assert.equal(bp.cells.length, 12);
      let kept = 0;
      let stray = 0;
      let missing = 0;
      const legal = new Set(['stem', 'void', 'kept', 'stray', 'missing', 'shell']);
      for (const row of bp.cells) {
        assert.equal(row.length, 12);
        for (const cell of row) {
          assert.ok(legal.has(cell.cls), 'cell class ' + cell.cls + ' is known');
          assert.equal(cell.r >= 0 && cell.r < 12, true);
          assert.equal(cell.c >= 0 && cell.c < 12, true);
          if (cell.cls === 'kept') kept++;
          if (cell.cls === 'stray') stray++;
          if (cell.cls === 'missing') missing++;
        }
      }
      assert.equal(kept, bp.kept);
      assert.equal(stray, bp.stray);
      assert.equal(missing, bp.missing);
      assert.equal(kept + missing, a.targetCount, 'kept plus missing covers the wish');
    }
  });
}

/* Chart rows */

test('budget chart rows cover all twelve levels with sane numbers', () => {
  const rows = Lab.budgetRows();
  assert.equal(rows.length, 12);
  rows.forEach((row, i) => {
    assert.equal(row.id, i + 1);
    assert.equal(typeof row.name, 'string');
    assert.ok(row.minCells >= 6);
    assert.ok(row.minActions >= 1 && row.minActions <= row.minCells);
    if (row.budget != null) assert.ok(row.budget >= row.minCells, 'budget can pay the minimum');
    if (row.headroom != null) assert.equal(row.headroom, row.budget - row.minCells);
  });
});

test('every budgeted level leaves non-negative headroom', () => {
  for (const row of Lab.budgetRows()) {
    if (row.budget != null) assert.ok(row.headroom >= 0, 'level ' + row.id);
  }
});

/* Codec */

for (let lv = 1; lv <= 12; lv++) {
  for (const sid of STRATS) {
    for (const open of [true, false]) {
      test('hash round trip ' + lv + ' ' + sid + ' lab ' + open, () => {
        const encoded = Lab.encodeHash({ level: lv, strategy: sid, lab: open });
        assert.equal(encoded, '#ll=' + lv + '.' + sid + '.' + (open ? 1 : 0));
        assert.deepEqual(Lab.decodeHash(encoded), { level: lv, strategy: sid, lab: open });
      });
    }
  }
}

const BAD_HASHES = [
  '', '#', '#ll=', 'll=1.exact-optimal.1', '#LL=1.exact-optimal.1',
  '#ll=0.exact-optimal.1', '#ll=13.exact-optimal.1', '#ll=-1.exact-optimal.1',
  '#ll=01.exact-optimal.1', '#ll=1.5.exact-optimal.1', '#ll=x.exact-optimal.1',
  '#ll= .exact-optimal.1', '#ll=1 .exact-optimal.1', '#ll=1..1',
  '#ll=1.bogus.1', '#ll=1.EXACT-OPTIMAL.1', '#ll=1.exact_optimal.1',
  '#ll=1.exact-optimal', '#ll=1.exact-optimal.', '#ll=1.exact-optimal.2',
  '#ll=1.exact-optimal.-1', '#ll=1.exact-optimal.true', '#ll=1.exact-optimal.1.x',
  '#ll=.exact-optimal.1', '#ll=1.exact-optimal.1.', '#ll=1.exact-optimal.1 ',
  '#ll=%6c%6c%3d1.exact-optimal.1', '#ll=%252e', '#ll=%zz.1',
  '#ll=__proto__.exact-optimal.1',
  '#ll=constructor.exact-optimal.1', '#ll=1.exact-optimal.1#ll=2.exact-optimal.1',
  null, undefined, 5, NaN, {}, [], true
];

for (const bad of BAD_HASHES) {
  test('hostile hash ' + JSON.stringify(bad) + ' fails closed', () => {
    assert.equal(Lab.decodeHash(bad), null);
  });
}

test('decodeHash accepts a single layer of percent encoding', () => {
  assert.deepEqual(Lab.decodeHash('#ll=%31%2e%65xact-optimal.1'),
    { level: 1, strategy: 'exact-optimal', lab: true });
  assert.deepEqual(Lab.decodeHash('#ll=1.%65xact-optimal.1'),
    { level: 1, strategy: 'exact-optimal', lab: true });
  assert.deepEqual(Lab.decodeHash('#ll=1.exact-optimal.%31'),
    { level: 1, strategy: 'exact-optimal', lab: true });
});

const BAD_STATES = [
  null, undefined, 5, 'x', [], [1, 2],
  { level: 0 }, { level: 13 }, { level: -1 }, { level: 1.5 }, { level: '4' },
  { level: NaN }, { level: Infinity }, { level: null },
  { strategy: 'bogus' }, { strategy: 5 }, { strategy: null }, { strategy: 'EXACT-OPTIMAL' },
  { lab: 'yes' }, { lab: 'no' }, { lab: 2 }, { lab: -1 }, { lab: {} },
  { level: 3, strategy: 'bogus' }, { level: 99, lab: true }
];

for (const bad of BAD_STATES) {
  test('hostile state ' + JSON.stringify(bad) + ' fails closed', () => {
    assert.equal(Lab.normalizeState(bad), null);
    assert.equal(Lab.encodeHash(bad), null);
  });
}

test('prototype pollution keys are refused even as own properties', () => {
  const forged = JSON.parse('{"level":3,"strategy":"exact-optimal","lab":true,"__proto__":{"x":1}}');
  assert.equal(Lab.normalizeState(forged), null);
  const forged2 = JSON.parse('{"level":3,"constructor":{}}');
  assert.equal(Lab.normalizeState(forged2), null);
  const forged3 = JSON.parse('{"prototype":{}}');
  assert.equal(Lab.normalizeState(forged3), null);
});

test('normalizeState fills defaults for missing fields only', () => {
  assert.deepEqual(Lab.normalizeState({}), { level: 1, strategy: 'exact-optimal', lab: false });
  assert.deepEqual(Lab.normalizeState({ level: 7 }), { level: 7, strategy: 'exact-optimal', lab: false });
  assert.deepEqual(Lab.normalizeState({ lab: 1 }), { level: 1, strategy: 'exact-optimal', lab: true });
  assert.deepEqual(Lab.normalizeState({ extra: 'ignored', level: 2 }),
    { level: 2, strategy: 'exact-optimal', lab: false });
});

test('normalizeState ignores inherited properties', () => {
  const base = { level: 9, strategy: 'mirror-unaware', lab: true };
  const child = Object.create(base);
  assert.deepEqual(Lab.normalizeState(child), { level: 1, strategy: 'exact-optimal', lab: false });
});

test('objects without a prototype still normalize', () => {
  const bare = Object.create(null);
  bare.level = 4;
  bare.strategy = 'noisy-overcarve';
  bare.lab = true;
  assert.deepEqual(Lab.normalizeState(bare), { level: 4, strategy: 'noisy-overcarve', lab: true });
});

/* CSV and exporter */

test('csvCell defuses every formula-leading character', () => {
  for (const s of ['=CMD()', '=1+1', '+SUM(A1)', '-10', '@import', '\tcmd', '\rcmd']) {
    const cell = Lab.csvCell(s);
    assert.equal(cell.charAt(0), '"', s + ' becomes quoted');
    assert.equal(cell.charAt(1), "'", s + ' carries the apostrophe defuser');
    assert.ok(cell.includes(s), 'the payload text is preserved');
  }
});

test('csvCell quotes commas, quotes, and newlines only when needed', () => {
  assert.equal(Lab.csvCell('plain'), 'plain');
  assert.equal(Lab.csvCell('a,b'), '"a,b"');
  assert.equal(Lab.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(Lab.csvCell('two\nlines'), '"two\nlines"');
  assert.equal(Lab.csvCell(''), '');
  assert.equal(Lab.csvCell(0), '0');
  assert.equal(Lab.csvCell(null), '');
  assert.equal(Lab.csvCell(12.5), '12.5');
});

test('csv export carries the shared digest and escapes every row', () => {
  const p = Lab.buildProof(level(3), 'noisy-overcarve');
  const csv = Lab.exportCsv(p);
  assert.ok(csv.includes('proof_sha256,' + p.sha256), 'provenance header stamps the digest');
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'field,value');
  for (const line of lines) {
    assert.ok(!/^[=+\-@\t\r]/.test(line), 'no line starts as a formula: ' + line);
  }
});

test('all three exports carry the exact same digest', () => {
  const p = Lab.buildProof(level(7), 'conservative-half');
  const json = JSON.parse(Lab.exportJson(p));
  const csv = Lab.exportCsv(p);
  const md = Lab.exportMarkdown(p);
  assert.equal(json.sha256, p.sha256);
  assert.ok(csv.includes(p.sha256), 'csv stamps it');
  assert.ok(md.includes('sha256: ' + p.sha256), 'markdown footer stamps it');
  assert.equal(Lab.verifyProof(json).ok, true, 'a round-tripped export still verifies');
});

test('buildProof caches one canonical payload per state key', () => {
  const a = Lab.buildProof(level(4), 'exact-optimal');
  const b = Lab.buildProof(level(4), 'exact-optimal');
  assert.equal(a, b, 'same key returns the same frozen object');
  const c = Lab.buildProof(level(4), 'mirror-unaware');
  assert.notEqual(a.sha256, c.sha256, 'a different strategy is a different proof');
});

test('proof payloads are frozen against mutation', () => {
  const p = Lab.buildProof(level(2), 'exact-optimal');
  assert.equal(Object.isFrozen(p), true);
  assert.equal(Object.isFrozen(p.comparison), true);
  assert.equal(Object.isFrozen(p.analysis), true);
  assert.throws(() => { p.comparison.total = 0; }, TypeError);
});

test('the stamped digest equals a hand recomputation', () => {
  const p = Lab.buildProof(level(11), 'noisy-overcarve');
  const clone = JSON.parse(Lab.exportJson(p));
  delete clone.sha256;
  assert.equal(Lab.sha256(Lab.stableStringify(clone)), p.sha256);
});

test('verifyProof flags tampering in every field', () => {
  const p = Lab.buildProof(level(6), 'exact-optimal');
  const fields = ['level', 'strategy', 'analysis', 'comparison', 'allLevels', 'selfTestCount', 'tool', 'format'];
  for (const f of fields) {
    const forged = JSON.parse(Lab.exportJson(p));
    forged[f] = f === 'level' ? { id: 99, name: 'x', visitor: 'x' } : 'tampered';
    const verdict = Lab.verifyProof(forged);
    assert.equal(verdict.ok, false, 'tampering ' + f + ' is caught');
  }
});

test('verifyProof refuses malformed payloads', () => {
  for (const bad of [null, undefined, 5, 'x', [], {}, { sha256: 'zz' }, { sha256: 4 }]) {
    assert.equal(Lab.verifyProof(bad).ok, false, JSON.stringify(bad));
  }
});

test('a digest from another payload fails on this one', () => {
  const a = Lab.buildProof(level(1), 'exact-optimal');
  const b = Lab.buildProof(level(2), 'exact-optimal');
  const forged = JSON.parse(Lab.exportJson(a));
  forged.sha256 = b.sha256;
  assert.equal(Lab.verifyProof(forged).ok, false);
});

test('stableStringify sorts keys and handles the odd cases', () => {
  assert.equal(Lab.stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(Lab.stableStringify({ a: { d: [3, 2], c: 1 } }), '{"a":{"c":1,"d":[3,2]}}');
  assert.equal(Lab.stableStringify([1, 'x', null]), '[1,"x",null]');
  assert.equal(Lab.stableStringify(undefined), 'null');
  assert.equal(Lab.stableStringify(-0), '0');
  assert.equal(Lab.stableStringify({}), '{}');
  assert.equal(Lab.stableStringify('s'), '"s"');
});

test('markdown export is a table with the digest in the footer', () => {
  const p = Lab.buildProof(level(12), 'mirror-unaware');
  const md = Lab.exportMarkdown(p);
  assert.ok(md.startsWith('# Lantern Logic Level Proof'));
  assert.ok(md.includes('| Level | 12 The Great Lantern |'));
  assert.ok(md.trim().endsWith('sha256: ' + p.sha256));
  assert.equal(md.includes('\u2014'), false);
  assert.equal(md.includes('\u2013'), false);
});

/* Self tests */

test('the in-page self test list holds at least sixteen checks', () => {
  const list = Lab.selfTests();
  assert.ok(list.length >= 16, 'got ' + list.length);
});

test('every in-page self test passes right now', () => {
  for (const entry of Lab.selfTests()) {
    assert.equal(entry.pass, true, entry.name + ' :: ' + entry.detail);
  }
});

test('self test names are unique and entries well formed', () => {
  const list = Lab.selfTests();
  const names = new Set(list.map((e) => e.name));
  assert.equal(names.size, list.length);
  for (const e of list) {
    assert.equal(typeof e.name, 'string');
    assert.equal(typeof e.pass, 'boolean');
    assert.equal(typeof e.detail, 'string');
  }
});

test('self tests are deterministic across runs', () => {
  const a = Lab.selfTests().map((e) => e.pass).join(',');
  const b = Lab.selfTests().map((e) => e.pass).join(',');
  assert.equal(a, b);
});

/* Hostile probes against the comparators */

test('simulate and compare reject hostile levels the same way the engine does', () => {
  assert.throws(() => Lab.simulate(null, 'exact-optimal'));
  assert.throws(() => Lab.simulate({}, 'exact-optimal'));
  assert.throws(() => Lab.analyzeLevel('x'));
  assert.throws(() => Lab.compare(5, 'exact-optimal'));
});

test('stray noise never touches stem cells on stem levels', () => {
  for (const a of analysis) {
    if (a.stemCount === 0) continue;
    const sim = Lab.simulate(level(a.id), 'noisy-overcarve');
    for (const k of level(a.id).stemSafe) {
      assert.equal(sim.carved.has(k), false, 'level ' + a.id + ' stem ' + k + ' survives noise');
    }
  }
});

test('strategy actions equal real applyCarve calls, not raw cell counts', () => {
  for (const a of analysis) {
    if (!a.mirror) continue;
    const sim = Lab.simulate(level(a.id), 'exact-optimal');
    assert.equal(sim.actions, a.targetCount / 2, 'level ' + a.id + ' actions are halved');
    assert.equal(sim.carved.size, a.targetCount, 'level ' + a.id + ' cells are not');
  }
});

test('minCuts agrees with the exact optimal simulation', () => {
  for (const lv of LEVELS) {
    const mc = Lab.minCuts(lv);
    const sim = Lab.simulate(lv, 'exact-optimal');
    assert.equal(mc.actions, sim.actions);
    assert.equal(mc.cells, sim.carved.size);
  }
});

test('no banned dashes hide in lab copy', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'js', 'solver-lab.js'), 'utf8');
  assert.equal(src.includes('\u2014'), false);
  assert.equal(src.includes('\u2013'), false);
  for (const id of STRATS) {
    assert.equal(Lab.STRATEGY_LABELS[id].includes('\u2014'), false);
    assert.equal(Lab.STRATEGY_NOTES[id].includes('\u2014'), false);
  }
});
