'use strict';
/*
 * Lantern Logic Solvability and Symmetry Lab. Pure functions only, no DOM
 * access, so the same code runs in the browser and under node:test. Every
 * number the lab shows comes from simulating real carves through the engine,
 * never from a reimplementation of the rules.
 */
(function (root) {
  let L = root.LanternLogic;
  let LEVELS_SRC = root.LANTERN_LEVELS;
  if ((!L || !LEVELS_SRC) && typeof require === 'function') {
    try {
      if (!L) L = require('./engine.js');
      if (!LEVELS_SRC) LEVELS_SRC = require('./levels.js').LEVELS;
    } catch (err) {
      /* The lab fails closed: every public entry point guards on L. */
    }
  }

  const STRATEGIES = [
    'exact-optimal',
    'conservative-half',
    'noisy-overcarve',
    'mirror-unaware'
  ];

  const STRATEGY_LABELS = {
    'exact-optimal': 'Exact Optimal',
    'conservative-half': 'Conservative Half',
    'noisy-overcarve': 'Noisy Overcarve',
    'mirror-unaware': 'Mirror Unaware'
  };

  const STRATEGY_NOTES = {
    'exact-optimal': 'Carves only the cells the visitor asked for.',
    'conservative-half': 'Stops after half of the required cuts.',
    'noisy-overcarve': 'Finishes the wish, then keeps carving extra shell.',
    'mirror-unaware': 'Recuts every marked cell, never noticing the twin moved.'
  };

  const HASH_PREFIX = 'll=';
  const PROOF_TOOL = 'lanternlogic-level-proof';
  const PROOF_FORMAT = 1;

  /* Accepts a normalized level or a raw level record. */
  function asLevel(level) {
    if (level && level.target instanceof Set) return level;
    return L.normalizeLevel(level);
  }

  function normalizedLevels() {
    return LEVELS_SRC.map((level) => L.normalizeLevel(level));
  }

  function rowMajorCells(set) {
    const cells = [];
    for (const k of set) cells.push(L.unkey(k));
    cells.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
    return cells;
  }

  /*
   * Run one carving strategy against the real engine and report what the
   * rules allowed. applyCarve is the only writer to the carved set, so the
   * mirror pairing, the cut budget, and the stem zone are all enforced by
   * the game itself rather than reimplemented here.
   */
  function simulate(level, strategyId) {
    level = asLevel(level);
    const state = L.createGameState(level);
    const plan = rowMajorCells(level.target);
    let actions = 0;
    const refused = [];

    function attempt(r, c) {
      const res = L.applyCarve(state, level, r, c);
      if (res.ok) actions++;
      else refused.push({ cell: L.key(r, c), reason: res.reason });
    }

    function optimalPasses(limit) {
      for (const pair of plan) {
        if (limit != null && actions >= limit) break;
        if (!state.carved.has(L.key(pair[0], pair[1]))) attempt(pair[0], pair[1]);
      }
    }

    if (strategyId === 'exact-optimal') {
      optimalPasses(null);
    } else if (strategyId === 'conservative-half') {
      optimalPasses(Math.ceil(minCuts(level).actions / 2));
    } else if (strategyId === 'noisy-overcarve') {
      optimalPasses(null);
      const wantExtra = Math.max(2, Math.ceil(actions / 4));
      let extra = 0;
      for (const pair of strayCandidates(level)) {
        if (extra >= wantExtra) break;
        const k = L.key(pair[0], pair[1]);
        if (state.carved.has(k)) continue;
        const before = state.carved.size;
        const res = L.applyCarve(state, level, pair[0], pair[1]);
        if (res.ok) {
          actions++;
          if (state.carved.size > before) extra++;
        } else {
          refused.push({ cell: k, reason: res.reason });
          /* A spent budget cannot refill inside this strategy. */
          if (res.reason === 'budget') break;
        }
      }
    } else if (strategyId === 'mirror-unaware') {
      for (const pair of plan) attempt(pair[0], pair[1]);
    } else {
      return null;
    }

    return {
      strategy: strategyId,
      actions: actions,
      refused: refused,
      carved: state.carved
    };
  }

  /*
   * Cells a noisy player might wrongly open: inside the shell, not part of
   * the wish, not the stem, and whose mirror twin is not part of the wish
   * either, so stray cuts stay honest noise instead of free coverage.
   */
  function strayCandidates(level) {
    level = asLevel(level);
    const cells = [];
    for (const pair of L.allInsideCells()) {
      const r = pair[0];
      const c = pair[1];
      const k = L.key(r, c);
      if (level.target.has(k) || level.stemSafe.has(k)) continue;
      if (level.mirror && level.target.has(L.twinKey(k))) continue;
      cells.push([r, c]);
    }
    return cells;
  }

  /*
   * Minimum work a perfect player must do. Cuts are carve actions, so a
   * mirror level halves the action count; the carved cells needed are the
   * target size in every case, which is what the budget counts.
   */
  function minCuts(level) {
    level = asLevel(level);
    const sim = simulate(level, 'exact-optimal');
    return { actions: sim.actions, cells: sim.carved.size };
  }

  function stemVerdictFor(level, carved) {
    level = asLevel(level);
    if (level.stemSafe.size === 0) return 'not required';
    for (const k of level.stemSafe) {
      if (carved.has(k)) return 'violated';
    }
    return 'intact';
  }

  /*
   * Prove a level end to end: simulate the optimal carve, confirm the
   * engine accepted every needed cell inside the budget, confirm the stem
   * zone is untouchable, and score the result.
   */
  function analyzeLevel(level) {
    level = asLevel(level);
    const sim = simulate(level, 'exact-optimal');
    const solved = sim.carved.size === level.target.size &&
      [...level.target].every((k) => sim.carved.has(k));
    const budget = level.maxCarved != null ? level.maxCarved : null;
    const headroom = budget != null ? budget - sim.carved.size : null;

    let stemProtected = true;
    let stemDetail = 'no stem zone';
    if (level.stemSafe.size > 0) {
      const probe = L.createGameState(level);
      for (const k of level.stemSafe) {
        const pair = L.unkey(k);
        const res = L.applyCarve(probe, level, pair[0], pair[1]);
        if (res.ok || res.reason !== 'stem') stemProtected = false;
      }
      for (const k of level.target) {
        if (level.stemSafe.has(k) || (level.mirror && level.stemSafe.has(L.twinKey(k)))) {
          stemProtected = false;
        }
      }
      stemDetail = stemProtected
        ? level.stemSafe.size + ' cells refuse the knife'
        : 'stem zone can be broken';
    }

    const optimal = L.scoreCarve(level, new Set(level.target), {
      timeLeft: level.time,
      peeks: 0
    });

    return {
      id: level.id,
      name: level.name,
      visitor: level.visitor,
      time: level.time,
      mirror: level.mirror,
      targetCount: level.target.size,
      minActions: sim.actions,
      minCells: sim.carved.size,
      budget: budget,
      headroom: headroom,
      solvable: solved,
      stemCount: level.stemSafe.size,
      stemProtected: stemProtected,
      stemDetail: stemDetail,
      optimalScore: optimal.total,
      optimalGrade: optimal.grade,
      stars: starsFor(optimal.grade)
    };
  }

  function analyzeAll() {
    if (!L || !LEVELS_SRC) return [];
    return normalizedLevels().map((level) => analyzeLevel(level));
  }

  function starsFor(grade) {
    if (grade === 'A Plus' || grade === 'A') return 3;
    if (grade === 'B' || grade === 'C') return 2;
    if (grade === 'D') return 1;
    return 0;
  }

  /*
   * Grade one strategy on one level through the real scoring path and shape
   * the row the comparator table shows.
   */
  function compare(level, strategyId) {
    level = asLevel(level);
    const sim = simulate(level, strategyId);
    if (!sim) return null;
    const score = L.scoreCarve(level, sim.carved, { timeLeft: 0, peeks: 0 });
    return {
      strategy: strategyId,
      label: STRATEGY_LABELS[strategyId] || strategyId,
      note: STRATEGY_NOTES[strategyId] || '',
      actions: sim.actions,
      refusals: sim.refused.length,
      refusalReasons: sim.refused,
      carvedCount: sim.carved.size,
      coverage: score.coverage,
      shape: score.shape,
      symmetry: score.symmetry,
      shellSaved: score.wasteScore,
      stemVerdict: stemVerdictFor(level, sim.carved),
      total: score.total,
      grade: score.grade,
      carved: sim.carved
    };
  }

  function compareAll(level) {
    const rows = [];
    for (const id of STRATEGIES) rows.push(compare(level, id));
    return rows;
  }

  /*
   * Per-cell classification for the diff blueprint: what the strategy
   * carved versus what the visitor asked for.
   */
  function diffBlueprint(level, strategyId) {
    level = asLevel(level);
    const sim = simulate(level, strategyId);
    if (!sim) return null;
    const cells = [];
    let kept = 0;
    let stray = 0;
    let missing = 0;
    for (let r = 0; r < L.GRID; r++) {
      const row = [];
      for (let c = 0; c < L.GRID; c++) {
        const k = L.key(r, c);
        let cls;
        if (level.stemSafe.has(k)) cls = 'stem';
        else if (!L.insidePumpkin(r, c)) cls = 'void';
        else if (sim.carved.has(k) && level.target.has(k)) { cls = 'kept'; kept++; }
        else if (sim.carved.has(k)) { cls = 'stray'; stray++; }
        else if (level.target.has(k)) { cls = 'missing'; missing++; }
        else cls = 'shell';
        row.push({ r: r, c: c, cls: cls });
      }
      cells.push(row);
    }
    return { cells: cells, kept: kept, stray: stray, missing: missing, actions: sim.actions };
  }

  /* Rows for the budget versus minimum cuts chart. */
  function budgetRows() {
    return analyzeAll().map((a) => ({
      id: a.id,
      name: a.name,
      budget: a.budget,
      minCells: a.minCells,
      minActions: a.minActions,
      headroom: a.headroom
    }));
  }

  /* FIPS 180-4 SHA-256, pure JS, no dependencies. */

  const SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  const SHA_H0 = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  function rotr(x, n) {
    return ((x >>> n) | (x << (32 - n))) >>> 0;
  }

  /* UTF-8 encode with lone surrogates replaced by U+FFFD. */
  function utf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let cp = str.charCodeAt(i);
      if (cp >= 0xd800 && cp <= 0xdbff) {
        const next = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
        if (next >= 0xdc00 && next <= 0xdfff) {
          cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
          i++;
        } else {
          cp = 0xfffd;
        }
      } else if (cp >= 0xdc00 && cp <= 0xdfff) {
        cp = 0xfffd;
      }
      if (cp < 0x80) out.push(cp);
      else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
      else if (cp < 0x10000) {
        out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else {
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
          0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      }
    }
    return out;
  }

  function sha256(input) {
    const bytes = typeof input === 'string'
      ? utf8Bytes(input)
      : Array.from(input || []);
    const bitLen = bytes.length * 8;
    const total = Math.ceil((bytes.length + 9) / 64) * 64;
    const msg = new Uint8Array(total);
    msg.set(bytes);
    msg[bytes.length] = 0x80;
    const hi = Math.floor(bitLen / 0x100000000);
    const lo = bitLen >>> 0;
    msg[total - 8] = (hi >>> 24) & 255;
    msg[total - 7] = (hi >>> 16) & 255;
    msg[total - 6] = (hi >>> 8) & 255;
    msg[total - 5] = hi & 255;
    msg[total - 4] = (lo >>> 24) & 255;
    msg[total - 3] = (lo >>> 16) & 255;
    msg[total - 2] = (lo >>> 8) & 255;
    msg[total - 1] = lo & 255;

    const H = SHA_H0.slice();
    const w = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) {
        w[i] = ((msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) |
          (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3]) >>> 0;
      }
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let a = H[0];
      let b = H[1];
      let c = H[2];
      let d = H[3];
      let e = H[4];
      let f = H[5];
      let g = H[6];
      let h = H[7];
      for (let i = 0; i < 64; i++) {
        const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ ((~e >>> 0) & g);
        const t1 = (h + s1 + ch + SHA_K[i] + w[i]) >>> 0;
        const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (s0 + maj) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0;
      H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0;
      H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0;
      H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0;
      H[7] = (H[7] + h) >>> 0;
    }
    let hex = '';
    for (const word of H) {
      hex += ('0000000' + word.toString(16)).slice(-8);
    }
    return hex;
  }

  /* Deterministic JSON: sorted object keys, undefined becomes null. */
  function stableStringify(value) {
    if (value === undefined) return 'null';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(stableStringify).join(',') + ']';
    }
    const keys = Object.keys(value).sort();
    const parts = [];
    for (const k of keys) parts.push(JSON.stringify(k) + ':' + stableStringify(value[k]));
    return '{' + parts.join(',') + '}';
  }

  function deepFreeze(value) {
    if (value && typeof value === 'object') {
      for (const k of Object.keys(value)) deepFreeze(value[k]);
      Object.freeze(value);
    }
    return value;
  }

  /*
   * One canonical digest-stamped proof per state key. The cached object is
   * frozen so the on-page fingerprint, the JSON download, the CSV header,
   * and the Markdown footer can never drift apart.
   */
  const proofCache = new Map();

  function proofCacheKey(level, strategyId) {
    const identity = {
      id: level.id,
      name: level.name,
      visitor: level.visitor,
      time: level.time,
      rows: level.rows.slice(),
      mirror: level.mirror,
      maxCarved: level.maxCarved,
      stemSafe: Array.from(level.stemSafe).sort(),
      target: Array.from(level.target).sort()
    };
    return stableStringify(identity) + '|' + strategyId;
  }

  function buildProof(level, strategyId) {
    level = asLevel(level);
    if (!STRATEGIES.includes(strategyId)) return null;
    const key = proofCacheKey(level, strategyId);
    if (proofCache.has(key)) return proofCache.get(key);

    const analysis = analyzeLevel(level);
    const row = compare(level, strategyId);
    const all = analyzeAll().map((a) => ({
      id: a.id,
      targetCount: a.targetCount,
      minActions: a.minActions,
      minCells: a.minCells,
      budget: a.budget,
      headroom: a.headroom,
      solvable: a.solvable,
      stemProtected: a.stemProtected,
      optimalScore: a.optimalScore,
      optimalGrade: a.optimalGrade
    }));

    const payload = {
      tool: PROOF_TOOL,
      format: PROOF_FORMAT,
      level: { id: level.id, name: level.name, visitor: level.visitor },
      strategy: strategyId,
      analysis: {
        targetCount: analysis.targetCount,
        minActions: analysis.minActions,
        minCells: analysis.minCells,
        mirror: analysis.mirror,
        budget: analysis.budget,
        headroom: analysis.headroom,
        solvable: analysis.solvable,
        stemProtected: analysis.stemProtected,
        optimalScore: analysis.optimalScore,
        optimalGrade: analysis.optimalGrade
      },
      comparison: {
        actions: row.actions,
        refusals: row.refusals,
        carvedCount: row.carvedCount,
        coverage: Math.round(row.coverage * 1000) / 1000,
        shape: row.shape,
        symmetry: row.symmetry,
        shellSaved: row.shellSaved,
        stemVerdict: row.stemVerdict,
        total: row.total,
        grade: row.grade
      },
      allLevels: all,
      selfTestCount: SELF_TEST_NAMES.length
    };
    payload.sha256 = sha256(stableStringify(payload));
    proofCache.set(key, deepFreeze(payload));
    return proofCache.get(key);
  }

  /* Recompute the digest over the payload minus its stamp. */
  function verifyProof(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, reason: 'not a proof payload' };
    }
    if (payload.tool !== PROOF_TOOL) {
      return { ok: false, reason: 'not a lantern logic level proof' };
    }
    if (payload.format !== PROOF_FORMAT) {
      return { ok: false, reason: 'unsupported proof format' };
    }
    if (typeof payload.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(payload.sha256)) {
      return { ok: false, reason: 'missing or malformed digest' };
    }
    const clone = {};
    for (const k of Object.keys(payload)) {
      if (k !== 'sha256') clone[k] = payload[k];
    }
    const digest = sha256(stableStringify(clone));
    if (digest === payload.sha256) return { ok: true, digest: digest };
    return { ok: false, reason: 'digest mismatch', expected: payload.sha256, actual: digest };
  }

  /*
   * Escape one CSV cell: quote when the text needs it, double inner quotes,
   * and defuse formula injection by leading apostrophe when the first
   * character is one a spreadsheet would treat as a formula or control.
   */
  function csvCell(value) {
    let s = value == null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s) || s.charAt(0) === "'") {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function csvRows(payload) {
    const a = payload.analysis;
    const c = payload.comparison;
    const rows = [
      ['field', 'value'],
      ['proof_sha256', payload.sha256],
      ['tool', payload.tool],
      ['format', payload.format],
      ['level_id', payload.level.id],
      ['level_name', payload.level.name],
      ['visitor', payload.level.visitor],
      ['strategy', payload.strategy],
      ['target_cells', a.targetCount],
      ['min_actions', a.minActions],
      ['min_cells', a.minCells],
      ['mirror', a.mirror],
      ['budget', a.budget == null ? 'none' : a.budget],
      ['budget_headroom', a.headroom == null ? 'none' : a.headroom],
      ['solvable', a.solvable],
      ['stem_protected', a.stemProtected],
      ['optimal_score', a.optimalScore],
      ['optimal_grade', a.optimalGrade],
      ['strategy_actions', c.actions],
      ['strategy_refusals', c.refusals],
      ['strategy_carved', c.carvedCount],
      ['shape_match_pct', c.shape],
      ['symmetry_pct', c.symmetry],
      ['shell_saved_pct', c.shellSaved],
      ['stem_verdict', c.stemVerdict],
      ['strategy_total', c.total],
      ['strategy_grade', c.grade]
    ];
    return rows;
  }

  function exportJson(payload) {
    return JSON.stringify(payload, null, 2) + '\n';
  }

  function exportCsv(payload) {
    return csvRows(payload)
      .map((row) => row.map(csvCell).join(','))
      .join('\n') + '\n';
  }

  function exportMarkdown(payload) {
    const a = payload.analysis;
    const c = payload.comparison;
    const lines = [
      '# Lantern Logic Level Proof',
      '',
      '| Field | Value |',
      '| --- | --- |',
      '| Level | ' + payload.level.id + ' ' + payload.level.name + ' |',
      '| Visitor | ' + payload.level.visitor + ' |',
      '| Strategy | ' + payload.strategy + ' |',
      '| Target cells | ' + a.targetCount + ' |',
      '| Minimum cuts | ' + a.minActions + ' actions, ' + a.minCells + ' cells |',
      '| Cut budget | ' + (a.budget == null ? 'none' : a.budget) + ' |',
      '| Budget headroom | ' + (a.headroom == null ? 'none' : a.headroom) + ' |',
      '| Solvable | ' + a.solvable + ' |',
      '| Stem protected | ' + a.stemProtected + ' |',
      '| Optimal score | ' + a.optimalScore + ' (' + a.optimalGrade + ') |',
      '| Shape match | ' + c.shape + ' of 100 |',
      '| Symmetry | ' + c.symmetry + ' of 100 |',
      '| Shell saved | ' + c.shellSaved + ' of 100 |',
      '| Stem verdict | ' + c.stemVerdict + ' |',
      '| Strategy total | ' + c.total + ' (' + c.grade + ') |',
      '',
      'sha256: ' + payload.sha256,
      ''
    ];
    return lines.join('\n');
  }

  /* Strict state normalization. Only the three whitelist keys are read, and
   * dangerous keys are refused outright even when they are own properties. */
  function normalizeState(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
    if (has('__proto__') || has('constructor') || has('prototype')) return null;

    const out = { level: 1, strategy: STRATEGIES[0], lab: false };
    if (has('level')) {
      const v = input.level;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 12) return null;
      out.level = v;
    }
    if (has('strategy')) {
      const v = input.strategy;
      if (typeof v !== 'string' || !STRATEGIES.includes(v)) return null;
      out.strategy = v;
    }
    if (has('lab')) {
      const v = input.lab;
      if (v === true || v === 1 || v === '1') out.lab = true;
      else if (v === false || v === 0 || v === '0') out.lab = false;
      else return null;
    }
    return out;
  }

  /*
   * Bookmark codec. Wire format is '#ll=<level>.<strategy>.<visible>' with
   * visible in {0,1}. Decoding is fail closed: anything that is not exactly
   * that shape returns null, including double encodings and extra fields.
   */
  function encodeHash(state) {
    const n = normalizeState(state);
    if (!n) return null;
    return '#' + HASH_PREFIX + n.level + '.' + n.strategy + '.' + (n.lab ? 1 : 0);
  }

  function decodeHash(raw) {
    if (typeof raw !== 'string' || raw.length === 0) return null;
    if (raw.charAt(0) !== '#') return null;
    const s = raw.slice(1);
    if (s.indexOf(HASH_PREFIX) !== 0) return null;
    let body = s.slice(HASH_PREFIX.length);
    if (body.indexOf('%') !== -1) {
      try {
        body = decodeURIComponent(body);
      } catch (err) {
        return null;
      }
      if (body.indexOf('%') !== -1) return null;
    }
    const parts = body.split('.');
    if (parts.length !== 3) return null;
    if (!/^([1-9]|1[0-2])$/.test(parts[0])) return null;
    if (!STRATEGIES.includes(parts[1])) return null;
    if (!/^[01]$/.test(parts[2])) return null;
    return { level: Number(parts[0]), strategy: parts[1], lab: parts[2] === '1' };
  }

  /*
   * Deterministic self checks the page can run in place. Each entry is a
   * small proof about the engine, the codec, or the exporter.
   */
  /* Static name list so a proof can count the self checks without running
   * them (running them would call buildProof right back). */
  const SELF_TEST_NAMES = [
    'sha256 of the empty string matches the FIPS KAT',
    'sha256 of abc matches the FIPS KAT',
    'sha256 handles a 56 byte padding boundary',
    'sha256 is deterministic and input sensitive',
    'all twelve levels analyze as solvable inside budget',
    'mirror carving halves the action count exactly',
    'non mirror levels need one action per target cell',
    'every stem cell refuses the knife on stem levels',
    'optimal play never loses to a weaker strategy',
    'exact optimal carves exactly the target on all levels',
    'mirror unaware empties mirror levels and solves free ones',
    'the stem verdict stays intact through every strategy',
    'csv cells defuse formula injection',
    'a tampered proof fails verification',
    'the share hash round trips level, strategy, and visibility',
    'hostile hashes all fail closed',
    'the digest on the page matches a fresh recomputation',
    'the blueprint marks every optimal cell kept'
  ];

  function selfTests() {
    const out = [];
    const add = (name, fn) => {
      let pass = false;
      let detail = '';
      try {
        const res = fn();
        pass = res === true || (res && res.pass === true);
        detail = res && res.detail ? res.detail : (pass ? 'ok' : 'check returned false');
      } catch (err) {
        detail = 'threw ' + (err && err.message ? err.message : String(err));
      }
      out.push({ name: name, pass: pass, detail: detail });
    };

    add('sha256 of the empty string matches the FIPS KAT', () =>
      sha256('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    add('sha256 of abc matches the FIPS KAT', () =>
      sha256('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    add('sha256 handles a 56 byte padding boundary', () =>
      sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq') ===
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    add('sha256 is deterministic and input sensitive', () =>
      sha256('lantern') === sha256('lantern') && sha256('lantern') !== sha256('lanterns'));

    add('all twelve levels analyze as solvable inside budget', () => {
      const all = analyzeAll();
      return all.length === 12 && all.every((a) =>
        a.solvable && (a.headroom == null || a.headroom >= 0));
    });
    add('mirror carving halves the action count exactly', () => {
      const all = analyzeAll();
      return all.every((a) =>
        !a.mirror || a.minActions * 2 === a.targetCount);
    });
    add('non mirror levels need one action per target cell', () => {
      const all = analyzeAll();
      return all.every((a) => a.mirror || a.minActions === a.targetCount);
    });
    add('every stem cell refuses the knife on stem levels', () => {
      const all = analyzeAll();
      return all.every((a) => a.stemCount === 0 || a.stemProtected);
    });
    add('optimal play never loses to a weaker strategy', () => {
      const all = analyzeAll();
      for (const a of all) {
        const level = normalizedLevels().find((lv) => lv.id === a.id);
        for (const id of STRATEGIES) {
          if (id === 'exact-optimal') continue;
          const row = compare(level, id);
          if (row.total > a.optimalScore) return { pass: false, detail: 'level ' + a.id + ' ' + id };
        }
      }
      return true;
    });
    add('exact optimal carves exactly the target on all levels', () =>
      normalizedLevels().every((level) => {
        const sim = simulate(level, 'exact-optimal');
        return sim.carved.size === level.target.size &&
          [...level.target].every((k) => sim.carved.has(k));
      }));
    add('mirror unaware empties mirror levels and solves free ones', () =>
      normalizedLevels().every((level) => {
        const sim = simulate(level, 'mirror-unaware');
        return level.mirror ? sim.carved.size === 0 : sim.carved.size === level.target.size;
      }));
    add('the stem verdict stays intact through every strategy', () =>
      normalizedLevels().every((level) => {
        if (level.stemSafe.size === 0) return true;
        return STRATEGIES.every((id) => compare(level, id).stemVerdict === 'intact');
      }));

    add('csv cells defuse formula injection', () =>
      csvCell('=CMD()') === '"\'=CMD()"' &&
      csvCell('+1+1') === '"\'+1+1"' &&
      csvCell('-5') === '"\'-5"' &&
      csvCell('@x') === '"\'@x"' &&
      csvCell('plain') === 'plain');
    add('a tampered proof fails verification', () => {
      const p = buildProof(normalizedLevels()[0], 'exact-optimal');
      if (!verifyProof(p).ok) return { pass: false, detail: 'clean proof refused' };
      const forged = JSON.parse(exportJson(p));
      forged.comparison.total = 0;
      return verifyProof(forged).ok === false;
    });
    add('the share hash round trips level, strategy, and visibility', () => {
      for (let lv = 1; lv <= 12; lv++) {
        for (const s of STRATEGIES) {
          for (const open of [true, false]) {
            const decoded = decodeHash(encodeHash({ level: lv, strategy: s, lab: open }));
            if (!decoded || decoded.level !== lv || decoded.strategy !== s || decoded.lab !== open) {
              return { pass: false, detail: 'level ' + lv + ' ' + s };
            }
          }
        }
      }
      return true;
    });
    add('hostile hashes all fail closed', () => {
      const bad = ['', '#', '#ll=', 'll=1.exact-optimal.1', '#ll=0.exact-optimal.1',
        '#ll=13.exact-optimal.1', '#ll=1.bogus.1', '#ll=1.exact-optimal.2',
        '#ll=1.exact-optimal', '#ll=1.exact-optimal.1.x', '#ll=__proto__.x.1',
        null, 5, {}];
      return bad.every((b) => decodeHash(b) === null);
    });
    add('the digest on the page matches a fresh recomputation', () => {
      const p = buildProof(normalizedLevels()[2], 'noisy-overcarve');
      return p.sha256 === verifyProof(p).digest;
    });
    add('the blueprint marks every optimal cell kept', () =>
      normalizedLevels().every((level) => {
        const bp = diffBlueprint(level, 'exact-optimal');
        return bp.kept === level.target.size && bp.missing === 0 && bp.stray === 0;
      }));

    return out;
  }

  const api = {
    STRATEGIES: STRATEGIES,
    STRATEGY_LABELS: STRATEGY_LABELS,
    STRATEGY_NOTES: STRATEGY_NOTES,
    HASH_PREFIX: HASH_PREFIX,
    simulate: simulate,
    minCuts: minCuts,
    analyzeLevel: analyzeLevel,
    analyzeAll: analyzeAll,
    starsFor: starsFor,
    compare: compare,
    compareAll: compareAll,
    diffBlueprint: diffBlueprint,
    budgetRows: budgetRows,
    sha256: sha256,
    utf8Bytes: utf8Bytes,
    stableStringify: stableStringify,
    buildProof: buildProof,
    verifyProof: verifyProof,
    csvCell: csvCell,
    csvRows: csvRows,
    exportJson: exportJson,
    exportCsv: exportCsv,
    exportMarkdown: exportMarkdown,
    normalizeState: normalizeState,
    encodeHash: encodeHash,
    decodeHash: decodeHash,
    selfTests: selfTests,
    _proofCache: proofCache
  };

  root.LanternLab = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
