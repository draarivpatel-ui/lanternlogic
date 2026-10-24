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
    getItem() {
      return null;
    },
    setItem() {}
  },
  devicePixelRatio: 1,
  innerWidth: 1024,
  innerHeight: 768
};

require('../js/levels.js');
require('../js/engine.js');
global.window.LANTERN_LEVELS = globalThis.LANTERN_LEVELS;
global.window.LanternLogic = globalThis.LanternLogic;
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

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
