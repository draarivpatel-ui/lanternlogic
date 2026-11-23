'use strict';
/*
 * Lantern Logic DOM smoke check. Runs the real browser shell in Node with
 * a minimal stub of the DOM and canvas APIs, then clicks through the whole
 * flow: title, game, carving, report, level select. Catches wiring bugs a
 * pure engine suite cannot see. Not part of the default test suite; run it
 * with node scripts/dom-smoke.js.
 */

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed++;
    console.log('  ok   ' + label);
  } else {
    failed++;
    console.log('  FAIL ' + label);
  }
}

const rafQueue = [];
let lastFocus = null;

function makeCtx() {
  const gradient = { addColorStop() {} };
  const target = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    setTransform() {},
    measureText: () => ({ width: 0 })
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return function () {};
    },
    set(t, prop, value) {
      t[prop] = value;
      return true;
    }
  });
}

function makeElement(id) {
  const el = {
    id: id,
    hidden: true,
    children: [],
    dataset: {},
    style: {},
    className: '',
    textContent: '',
    clientWidth: 0,
    handlers: {},
    attrs: {},
    addEventListener(type, fn) {
      (this.handlers[type] = this.handlers[type] || []).push(fn);
    },
    dispatch(type, event) {
      for (const fn of this.handlers[type] || []) fn(event || { preventDefault() {} });
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    append() {
      for (const child of arguments) this.children.push(child);
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    getAttribute(name) {
      return this.attrs[name] == null ? null : this.attrs[name];
    },
    focus() {
      lastFocus = this.id;
    },
    closest() {
      return null;
    },
    classList: {
      add() {},
      remove() {},
      toggle() {}
    },
    getContext() {
      return makeCtx();
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 320, bottom: 320, width: 320, height: 320 };
    }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() {
      return '';
    },
    set(value) {
      if (value === '') el.children.length = 0;
    }
  });
  return el;
}

const registry = new Map();

global.Path2D = class Path2D {
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  closePath() {}
};

global.document = {
  hidden: false,
  getElementById(id) {
    if (!registry.has(id)) registry.set(id, makeElement(id));
    return registry.get(id);
  },
  createElement(tag) {
    return makeElement('created-' + tag + '-' + registry.size);
  }
};

global.window = {
  addEventListener(type, fn) {
    (this.handlers = this.handlers || {});
    (this.handlers[type] = this.handlers[type] || []).push(fn);
  },
  matchMedia() {
    return { matches: false, addEventListener() {}, addListener() {} };
  },
  requestAnimationFrame(fn) {
    rafQueue.push(fn);
    return rafQueue.length;
  },
  setInterval() {
    return 0;
  },
  setTimeout() {
    return 0;
  },
  localStorage: {
    /* A poisoned save: a non-numeric unlock value used to NaN its way into
     * opening every level, and a negative best used to print on a card.
     * The loader must fall back to one and drop the bogus scores. */
    getItem(key) {
      return key === 'lanternlogic.v1' ? '{"unlocked":"garbage","best":{"2":-2}}' : null;
    },
    setItem() {}
  },
  devicePixelRatio: 1,
  innerWidth: 1024,
  innerHeight: 768
};

require('../js/levels.js');
require('../js/engine.js');
require('../js/solver-lab.js');
global.window.LANTERN_LEVELS = globalThis.LANTERN_LEVELS;
global.window.LanternLogic = globalThis.LanternLogic;
global.window.LanternLab = globalThis.LanternLab;
require('../js/app.js');

const $ = (id) => global.document.getElementById(id);
const live = $('live');

function frame(t) {
  const fns = rafQueue.splice(0, rafQueue.length);
  for (const fn of fns) fn(t);
}

console.log('Lantern Logic DOM smoke');

check('engine attaches to the window', typeof global.window.LanternLogic.scoreCarve === 'function');
check('twelve levels attach to the window', global.window.LANTERN_LEVELS.length === 12);

frame(100);
check('the visual loop paints the night sky without crashing', true);
check('boot lands focus on the title heading', lastFocus === 'title-heading');

$('btn-start').dispatch('click');
check('start opens the game screen', $('screen-game').hidden === false);
check('focus moves to the game heading', lastFocus === 'game-heading');
check('the level tag reads Level 1 of 12', $('game-level-tag').textContent === 'Level 1 of 12');
check('the visitor intro is filled', $('visitor-intro').textContent.indexOf('little ghost') !== -1);
check('the live region announces the level', live.textContent.indexOf('Level 1') !== -1);

$('grid-wrap').dispatch('keydown', { key: 'ArrowRight', preventDefault() {} });
check('arrow right announces the new cell', live.textContent === 'Row 2, column 5');

$('grid-wrap').dispatch('keydown', { key: ' ', preventDefault() {} });
check('space carves and announces it', live.textContent.indexOf('carved') !== -1);
check('the cut counter reads 1', $('cuts-num').textContent === '1');

$('grid-wrap').dispatch('keydown', { key: 'p', preventDefault() {} });
check('peek announces its cost', live.textContent.indexOf('5 points') !== -1);

$('grid-wrap').dispatch('keydown', { key: 'u', preventDefault() {} });
check('undo empties the carve', $('cuts-num').textContent === '0');

$('grid-wrap').dispatch('keydown', { key: 'r', preventDefault() {} });
check('reset keeps the counter at zero', $('cuts-num').textContent === '0');

const pumpkin = $('pumpkin');
pumpkin.dispatch('pointerdown', { clientX: 150, clientY: 150, preventDefault() {} });
check('pointerdown starts a paint stroke', $('cuts-num').textContent === '1');
check('a tap hands keyboard focus to the playfield', lastFocus === 'grid-wrap');
const strokeLive = live.textContent;
pumpkin.dispatch('pointermove', { clientX: 180, clientY: 150, preventDefault() {} });
check('dragging paints the next cell', $('cuts-num').textContent === '2');
check('the drag carve stays quiet on the live region', live.textContent === strokeLive);
for (const fn of (global.window.handlers && global.window.handlers.pointercancel) || []) fn();
pumpkin.dispatch('pointermove', { clientX: 200, clientY: 150, preventDefault() {} });
check('a cancelled pointer stops the stroke', $('cuts-num').textContent === '2');

$('grid-wrap').dispatch('keydown', { key: 'r', ctrlKey: true, preventDefault() {} });
check('Ctrl+R keeps the carve (shortcuts ignore modifiers)', $('cuts-num').textContent === '2');
$('grid-wrap').dispatch('keydown', { key: 'u', metaKey: true, preventDefault() {} });
check('Cmd+U keeps the carve (shortcuts ignore modifiers)', $('cuts-num').textContent === '2');
$('grid-wrap').dispatch('keydown', { key: 'p', altKey: true, preventDefault() {} });
check('Alt+P does not spend a peek', live.textContent.indexOf('5 points') === -1);

pumpkin.dispatch('pointerdown', { clientX: 30, clientY: 30, preventDefault() {} });
check('a tap on the bare margin adds no cut', $('cuts-num').textContent === '2');
$('grid-wrap').dispatch('keydown', { key: 'ArrowRight', preventDefault() {} });
check('the knife survives a tap outside the shell', live.textContent === 'Row 6, column 8');

$('grid-wrap').dispatch('keydown', { key: 'p', repeat: true, preventDefault() {} });
$('grid-wrap').dispatch('keydown', { key: 'p', repeat: true, preventDefault() {} });
$('grid-wrap').dispatch('keydown', { key: 'p', repeat: true, preventDefault() {} });
$('grid-wrap').dispatch('keydown', { key: ' ', repeat: true, preventDefault() {} });
check('held keys do not repeat into cuts', $('cuts-num').textContent === '2');

$('grid-wrap').dispatch('keydown', { key: 'Enter', preventDefault() {} });
check('Enter lights the lantern like the help text promises', $('screen-results').hidden === false);
check('the report total is numeric', !Number.isNaN(Number($('report-total-num').textContent)));
check('held peeks cost nothing extra', $('report-peek').textContent === '0');

frame(200);
check('a game frame paints the pumpkin without crashing', true);

$('btn-submit').dispatch('click');
check('lighting opens the report', $('screen-results').hidden === false);
check('the report carries a numeric total', !Number.isNaN(Number($('report-total-num').textContent)));
check('the verdict line is filled', $('report-verdict').textContent.length > 10);

$('btn-next').dispatch('click');
check('next level opens level 2', $('game-level-tag').textContent === 'Level 2 of 12');

$('grid-wrap').dispatch('keydown', { key: 'Escape', preventDefault() {} });
check('escape returns to the level path', $('screen-levels').hidden === false);
check('the level list rendered twelve cards', $('level-list').children.length === 12);
check('a corrupt unlock value still locks level five',
  $('level-list').children[4].children[0].getAttribute('aria-disabled') === 'true');
check('a poisoned best score is clamped to zero',
  $('level-list').children[1].children[0].children[2].textContent === 'Best 0 of 100');

$('level-list').dispatch('click', {
  target: {
    closest: () => ({ dataset: { levelId: '5' }, getAttribute: () => 'true' })
  }
});
check('a locked card refuses with a kind message', live.textContent.indexOf('Finish the earlier lanterns') !== -1);

$('level-list').dispatch('click', {
  target: {
    closest: () => ({ dataset: { levelId: '2' }, getAttribute: () => null })
  }
});
check('an open card starts its level', $('game-level-tag').textContent === 'Level 2 of 12');

global.window.resize && global.window.resize();
for (const fn of (global.window.handlers && global.window.handlers.resize) || []) fn();
check('a resize pass rebuilds the canvases without crashing', true);

$('btn-quit').dispatch('click');
$('btn-levels-back').dispatch('click');
check('back returns to the title', lastFocus === 'title-heading');

/* Lab wiring: the toggle appears only because the module loaded. */
check('the lab module attaches to the window', typeof global.window.LanternLab.analyzeAll === 'function');
check('the lab toggle is offered', $('btn-lab').hidden === false);
check('the lab starts closed', $('lab-section').hidden === true);

$('btn-lab').dispatch('click');
check('opening the lab shows the panel', $('lab-section').hidden === false);
check('the solvability table lists all twelve levels', $('lab-level-rows').children.length === 12);
check('four strategy buttons render', $('lab-strategies').children.length === 4);
check('the comparator table lists four strategies', $('lab-strategy-rows').children.length === 4);
check('the blueprint draws the full 12 by 12 grid', $('lab-blueprint').children.length === 144);
check('the on page digest is a 64 char hex', /^[0-9a-f]{64}$/.test($('lab-digest-code').textContent));

$('lab-level-rows').children[4].children[0].children[0].dispatch('click');
check('clicking a level row selects it',
  $('lab-level-rows').children[4].children[0].children[0].getAttribute('aria-current') === 'true');

$('lab-strategies').children[3].dispatch('click');
check('clicking a strategy button presses it',
  $('lab-strategies').children[3].getAttribute('aria-pressed') === 'true');
check('the comparator rebuilt for the new strategy',
  $('lab-strategy-rows').children[3].children[0].children[0].textContent === 'Mirror Unaware');

const budgetBars = $('lab-budget-chart').children.filter((el) => el.getAttribute('role') === 'button');
check('the chart draws twelve focusable level bars', budgetBars.length === 12);
budgetBars[7].dispatch('keydown', { key: 'Enter', preventDefault() {} });
check('a keyboard Enter on a bar selects its level',
  $('lab-level-rows').children[7].children[0].children[0].getAttribute('aria-current') === 'true');

$('btn-lab-verify').dispatch('click');
check('the verify button confirms the digest', $('lab-verify-out').textContent.indexOf('Verified') === 0);

$('btn-lab-tamper').dispatch('click');
check('the tamper demo catches a forged total', $('lab-verify-out').textContent.indexOf('Tamper caught') === 0);

$('btn-lab-tests').dispatch('click');
check('the self test list ran every check', $('lab-test-list').children.length >= 16);
check('every in page self test passed', /(\d+) of \d+ lab checks passing/.test($('lab-test-count').textContent) &&
  $('lab-test-count').textContent.split(' ')[0] === $('lab-test-count').textContent.split(' ')[2]);

const svgBars2 = $('lab-budget-chart').children.filter((el) => el.getAttribute('role') === 'button');
svgBars2[4].dispatch('click');
check('a pointer click on a bar selects level five',
  $('lab-level-rows').children[4].children[0].children[0].getAttribute('aria-current') === 'true');

$('btn-lab-jump').dispatch('click');
check('jump to level opens the game on the lab selection', $('game-level-tag').textContent === 'Level 5 of 12');

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
