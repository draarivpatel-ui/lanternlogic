'use strict';
/*
 * Lantern Logic carving engine. Pure functions only, no DOM access, so the
 * same code runs in the browser and under node:test. The grid is 12 by 12
 * and the pumpkin is a circle inscribed in it; a cell is carvable only when
 * its center falls inside that circle.
 */
(function (root) {
  const GRID = 12;
  const CENTER_X = 6;
  const CENTER_Y = 6.2;
  const RADIUS = 5.5;
  const PEEK_COST = 5;

  function key(r, c) {
    return r + ',' + c;
  }

  function unkey(k) {
    const i = k.indexOf(',');
    return [Number(k.slice(0, i)), Number(k.slice(i + 1))];
  }

  function twinKey(k) {
    const pair = unkey(k);
    return key(pair[0], GRID - 1 - pair[1]);
  }

  function insidePumpkin(r, c) {
    const dx = c + 0.5 - CENTER_X;
    const dy = r + 0.5 - CENTER_Y;
    return dx * dx + dy * dy <= RADIUS * RADIUS;
  }

  function allInsideCells() {
    const cells = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (insidePumpkin(r, c)) cells.push([r, c]);
      }
    }
    return cells;
  }

  function firstInsideCell() {
    const cells = allInsideCells();
    return cells.length ? { r: cells[0][0], c: cells[0][1] } : { r: 0, c: 0 };
  }

  /*
   * Turn the authored row strings into a Set of cell keys. Throws on any
   * malformed row so bad level data fails loudly in tests.
   */
  function parsePattern(rows) {
    if (!Array.isArray(rows) || rows.length !== GRID) {
      throw new Error('pattern needs exactly ' + GRID + ' rows');
    }
    const cells = new Set();
    for (let r = 0; r < GRID; r++) {
      const row = rows[r];
      if (typeof row !== 'string' || row.length !== GRID) {
        throw new Error('row ' + r + ' needs exactly ' + GRID + ' cells');
      }
      for (let c = 0; c < GRID; c++) {
        const ch = row[c];
        if (ch !== '.' && ch !== 'X') {
          throw new Error('row ' + r + ' column ' + c + ' has an unknown character');
        }
        if (ch === 'X') cells.add(key(r, c));
      }
    }
    return cells;
  }

  /*
   * Validate one level and derive its runtime fields. Throws on broken data.
   */
  function normalizeLevel(level) {
    if (!level || typeof level !== 'object') throw new Error('level must be an object');
    if (!Number.isInteger(level.id) || level.id < 1) throw new Error('level needs a positive integer id');
    if (typeof level.name !== 'string' || level.name.length === 0) throw new Error('level needs a name');
    if (typeof level.visitor !== 'string' || level.visitor.length === 0) throw new Error('level needs a visitor');
    if (typeof level.hint !== 'string' || level.hint.length === 0) throw new Error('level needs a hint');
    if (typeof level.intro !== 'string' || level.intro.length === 0) throw new Error('level needs an intro');
    if (typeof level.time !== 'number' || !(level.time > 0)) throw new Error('level needs a positive time');

    const constraints = level.constraints || {};
    const mirror = constraints.mirror === true;
    const maxCarved = constraints.maxCarved != null ? constraints.maxCarved : null;
    if (maxCarved !== null && (!Number.isInteger(maxCarved) || maxCarved < 1)) {
      throw new Error('maxCarved must be a positive integer');
    }

    const stemSafe = new Set();
    if (constraints.stemSafe) {
      for (const cell of constraints.stemSafe) {
        const k = key(cell[0], cell[1]);
        if (!insidePumpkin(cell[0], cell[1])) {
          throw new Error('stem safe cell ' + k + ' sits outside the pumpkin');
        }
        stemSafe.add(k);
      }
    }

    const target = parsePattern(level.rows);
    for (const k of target) {
      const pair = unkey(k);
      if (!insidePumpkin(pair[0], pair[1])) {
        throw new Error('target cell ' + k + ' sits outside the pumpkin');
      }
      if (stemSafe.has(k)) {
        throw new Error('target cell ' + k + ' collides with the stem safe zone');
      }
    }
    if (target.size === 0) throw new Error('level needs at least one target cell');

    return {
      id: level.id,
      name: level.name,
      visitor: level.visitor,
      hint: level.hint,
      intro: level.intro,
      time: level.time,
      rows: level.rows,
      mirror: mirror,
      maxCarved: maxCarved,
      stemSafe: stemSafe,
      target: target,
      constraintCount: (mirror ? 1 : 0) + (maxCarved != null ? 1 : 0) + (stemSafe.size > 0 ? 1 : 0)
    };
  }

  function createGameState(level) {
    const start = firstInsideCell();
    return {
      carved: new Set(),
      cursor: { r: start.r, c: start.c },
      undo: [],
      peeks: 0
    };
  }

  /*
   * Toggle the carve state of one cell. On mirror levels the mirrored twin
   * moves with it. Returns { ok, reason, added, cells } where cells lists
   * every cell whose state actually changed.
   */
  function applyCarve(state, level, r, c) {
    if (r < 0 || c < 0 || r >= GRID || c >= GRID) return { ok: false, reason: 'outside' };
    if (!insidePumpkin(r, c)) return { ok: false, reason: 'outside' };
    const k = key(r, c);
    if (level.stemSafe && level.stemSafe.has(k)) return { ok: false, reason: 'stem' };

    const tk = twinKey(k);
    const twinBlocked = level.stemSafe ? level.stemSafe.has(tk) : false;
    const adding = !state.carved.has(k);

    if (adding && level.maxCarved != null) {
      let grow = 1;
      if (level.mirror && tk !== k && !twinBlocked && !state.carved.has(tk)) grow = 2;
      if (state.carved.size + grow > level.maxCarved) return { ok: false, reason: 'budget' };
    }

    const touched = [k];
    if (level.mirror && tk !== k && !twinBlocked) touched.push(tk);

    const changed = [];
    for (const cell of touched) {
      if (adding) {
        if (!state.carved.has(cell)) {
          state.carved.add(cell);
          changed.push(cell);
        }
      } else if (state.carved.has(cell)) {
        state.carved.delete(cell);
        changed.push(cell);
      }
    }
    if (changed.length > 0) state.undo.push({ cells: changed, added: adding });
    return { ok: true, added: adding, cells: changed };
  }

  function undoCarve(state) {
    const action = state.undo.pop();
    if (!action) return { ok: false, reason: 'empty' };
    for (const cell of action.cells) {
      if (action.added) state.carved.delete(cell);
      else state.carved.add(cell);
    }
    return { ok: true, restored: action.cells };
  }

  function resetState(state) {
    state.carved.clear();
    state.undo.length = 0;
    state.peeks = 0;
  }

  /*
   * Share of carved cells whose mirror twin is also carved. An empty carve
   * counts as symmetric so an untouched pumpkin is never punished.
   */
  function symmetryScore(carved) {
    if (carved.size === 0) return 1;
    let matched = 0;
    for (const k of carved) {
      if (carved.has(twinKey(k))) matched++;
    }
    return matched / carved.size;
  }

  /*
   * Shape overlap between the carve and the target. Waste is the share of
   * carved shell that the visitor never asked for, the leftover shell gone
   * to the compost for nothing.
   */
  function computeWaste(carved, target) {
    let kept = 0;
    for (const k of carved) {
      if (target.has(k)) kept++;
    }
    const stray = carved.size - kept;
    const coverage = target.size > 0 ? kept / target.size : 0;
    const waste = carved.size > 0 ? stray / carved.size : 0;
    return { kept: kept, stray: stray, missing: target.size - kept, coverage: coverage, waste: waste };
  }

  function gradeFor(total) {
    if (total >= 95) return 'A Plus';
    if (total >= 85) return 'A';
    if (total >= 65) return 'B';
    if (total >= 45) return 'C';
    if (total >= 20) return 'D';
    return 'E';
  }

  const VERDICTS = {
    'A Plus': [
      'A flawless lantern. The whole street slows down to look.',
      'Every cut landed. The candle inside just got prouder.',
      'Perfect. This porch is now the destination.'
    ],
    'A': [
      'Warm and bright. Compliments incoming.',
      'That glow could guide a lost moth home.',
      'A very good lantern with very good manners.'
    ],
    'B': [
      'A fine carve with a little wobble. The night approves.',
      'Charming, slightly crooked, entirely lovable.',
      'The visitors nod. The pumpkin glows on.'
    ],
    'C': [
      'The shape shows through. The candle forgives.',
      'A lantern with stories to tell. Keep going.',
      'Not your finest hour, still a light on the porch.'
    ],
    'D': [
      'Rustic charm counts for something.',
      'The pumpkin tried its best and so did you.',
      'A carve only a parent could love. Try again.'
    ],
    'E': [
      'Every lantern starts somewhere. Light another.',
      'The dark won this round. Carve again.',
      'The candle is patient. So are we.'
    ]
  };

  function verdictFor(grade, levelId) {
    const list = VERDICTS[grade] || VERDICTS.E;
    return list[(Math.max(1, levelId) - 1) % list.length];
  }

  /*
   * Grade a finished carve. Shape carries the most weight, symmetry and
   * shell cleanliness share the rest, then a small time bonus and a peek
   * cost. Symmetry and waste only pay out in proportion to coverage, so an
   * untouched pumpkin earns nothing for being neatly untouched. Everything
   * is deterministic for a given carve state.
   */
  function scoreCarve(level, carved, opts) {
    const options = opts || {};
    const timeLeft = options.timeLeft != null ? options.timeLeft : 0;
    const peeks = options.peeks || 0;

    const metrics = computeWaste(carved, level.target);
    const shapeFrac = metrics.coverage * (1 - 0.5 * metrics.waste);
    const symFrac = symmetryScore(carved);
    const wasteFrac = 1 - metrics.waste;
    const base = Math.round(100 * (
      0.55 * shapeFrac +
      0.25 * symFrac * metrics.coverage +
      0.20 * wasteFrac * metrics.coverage
    ));
    const shape = 100 * shapeFrac;
    const sym = 100 * symFrac;
    const wasteScore = 100 * wasteFrac;

    const timeBonus = base >= 60
      ? Math.round(10 * Math.max(0, timeLeft) / Math.max(1, level.time))
      : 0;
    const peekPenalty = PEEK_COST * peeks;
    const total = Math.max(0, Math.min(100, base - peekPenalty + timeBonus));

    const grade = gradeFor(total);
    return {
      kept: metrics.kept,
      stray: metrics.stray,
      missing: metrics.missing,
      coverage: metrics.coverage,
      waste: metrics.waste,
      shape: Math.round(shape),
      symmetry: Math.round(sym),
      wasteScore: Math.round(wasteScore),
      base: base,
      timeBonus: timeBonus,
      peekPenalty: peekPenalty,
      total: total,
      grade: grade,
      verdict: verdictFor(grade, level.id)
    };
  }

  /* Small deterministic PRNG so star fields and hand drawn wobble are
   * identical on every load. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const api = {
    GRID: GRID,
    CENTER_X: CENTER_X,
    CENTER_Y: CENTER_Y,
    RADIUS: RADIUS,
    PEEK_COST: PEEK_COST,
    key: key,
    unkey: unkey,
    twinKey: twinKey,
    insidePumpkin: insidePumpkin,
    allInsideCells: allInsideCells,
    firstInsideCell: firstInsideCell,
    parsePattern: parsePattern,
    normalizeLevel: normalizeLevel,
    createGameState: createGameState,
    applyCarve: applyCarve,
    undoCarve: undoCarve,
    resetState: resetState,
    symmetryScore: symmetryScore,
    computeWaste: computeWaste,
    gradeFor: gradeFor,
    verdictFor: verdictFor,
    VERDICTS: VERDICTS,
    scoreCarve: scoreCarve,
    mulberry32: mulberry32
  };

  root.LanternLogic = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
