'use strict';
/*
 * Lantern Logic headless Chromium audit. Zero dependencies: a Node http
 * server serves the repo on an ephemeral localhost port and the Chrome
 * DevTools Protocol drives a throwaway headless profile over the built in
 * WebSocket client. Everything the run creates lives under one scratch
 * directory that is deleted in the finally block, pass or fail.
 *
 * Run with: node scripts/browser-audit.js
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRATCH = process.env.LL_AUDIT_DIR || path.join('/tmp', 'll-audit-' + process.pid);
const CHROME = process.env.LL_CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORTS = [
  { width: 1440, height: 900, mobile: false, label: '1440x900 desktop' },
  { width: 390, height: 844, mobile: true, label: '390x844 mobile' }
];
const TIMEOUT = 20000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.md': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

let passed = 0;
let failed = 0;

function check(label, condition, extra) {
  if (condition) {
    passed++;
    console.log('  ok   ' + label);
  } else {
    failed++;
    console.log('  FAIL ' + label + (extra ? ' :: ' + extra : ''));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serve() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const file = path.normalize(path.join(ROOT, urlPath));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/* Minimal CDP client over the built in WebSocket. */
class Cdp {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    this.ws = null;
  }

  connect(wsUrl) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(new Error('CDP websocket failed: ' + (err && err.message)));
      this.ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (err) {
          return;
        }
        if (msg.id != null && this.pending.has(msg.id)) {
          const slot = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) slot.reject(new Error(msg.error.message || 'CDP error'));
          else slot.resolve(msg.result || {});
          return;
        }
        for (const fn of this.listeners.slice()) fn(msg);
      };
    });
  }

  onEvent(fn) {
    this.listeners.push(fn);
  }

  send(method, params, sessionId) {
    const id = this.nextId++;
    const msg = { id: id, method: method, params: params || {} };
    if (sessionId) msg.sessionId = sessionId;
    this.ws.send(JSON.stringify(msg));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve, reject: reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error('CDP timeout: ' + method));
      }, TIMEOUT);
    });
  }

  waitEvent(name, sessionId, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || TIMEOUT);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for ' + name)),
        timeoutMs || TIMEOUT);
      const fn = (msg) => {
        if (msg.method === name && (!sessionId || msg.sessionId === sessionId)) {
          clearTimeout(timer);
          this.listeners.splice(this.listeners.indexOf(fn), 1);
          resolve(msg.params || {});
        } else if (Date.now() > deadline) {
          clearTimeout(timer);
          this.listeners.splice(this.listeners.indexOf(fn), 1);
          reject(new Error('timed out waiting for ' + name));
        }
      };
      this.listeners.push(fn);
    });
  }

  close() {
    try {
      if (this.ws) this.ws.close();
    } catch (err) {
      /* already gone */
    }
  }
}

async function waitForDevTools(profileDir) {
  const file = path.join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const text = fs.readFileSync(file, 'utf8').trim().split('\n');
      if (text.length >= 2) return { port: Number(text[0]), path: text[1] };
    } catch (err) {
      /* not written yet */
    }
    await sleep(120);
  }
  throw new Error('DevToolsActivePort never appeared');
}

async function main() {
  fs.mkdirSync(path.join(SCRATCH, 'profile'), { recursive: true });
  const server = await serve();
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;

  const chrome = spawn(CHROME, [
    '--headless=new',
    '--mute-audio',
    '--user-data-dir=' + path.join(SCRATCH, 'profile'),
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--hide-scrollbars',
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  try {
    const devtools = await waitForDevTools(path.join(SCRATCH, 'profile'));
    const cdp = new Cdp();
    await cdp.connect('ws://127.0.0.1:' + devtools.port + devtools.path);
    const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const attached = await cdp.send('Target.attachToTarget',
      { targetId: target.targetId, flatten: true });
    const session = attached.sessionId;

    const consoleErrors = [];
    const exceptions = [];
    const external = [];
    cdp.onEvent((msg) => {
      if (msg.sessionId !== session) return;
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push((msg.params.args || []).map((a) => a.value || a.description).join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        exceptions.push(d.text + ' ' + (d.exception && d.exception.description || ''));
      }
      if (msg.method === 'Network.requestWillBeSent') {
        const url = msg.params.request.url;
        if (!url.startsWith(base + '/') && !url.startsWith('data:') &&
            !url.startsWith('about:') && !url.startsWith('chrome:')) {
          external.push(url);
        }
      }
    });

    await cdp.send('Page.enable', {}, session);
    await cdp.send('Runtime.enable', {}, session);
    await cdp.send('Network.enable', {}, session);

    async function evalJson(expression) {
      const res = await cdp.send('Runtime.evaluate', {
        expression: expression,
        returnByValue: true,
        awaitPromise: true
      }, session);
      if (res.exceptionDetails) {
        throw new Error('evaluate failed: ' + res.exceptionDetails.text);
      }
      return res.result.value;
    }

    async function navigate(url) {
      const loaded = cdp.waitEvent('Page.loadEventFired', session);
      await cdp.send('Page.navigate', { url: url }, session);
      await loaded;
      await sleep(350);
    }

    async function center(selector) {
      const box = await evalJson(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
      })()`);
      return box;
    }

    async function click(selector) {
      const box = await center(selector);
      if (!box) throw new Error('no element for ' + selector);
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', {
          type: type, x: box.x, y: box.y, button: 'left', clickCount: 1
        }, session);
      }
      await sleep(160);
    }

    let navCount = 0;
    function navUrl(hash) {
      /* A unique query forces a real document load; a bare hash change only
       * fires navigatedWithinDocument and the load event never comes. */
      navCount++;
      return base + '/index.html?nav=' + navCount + (hash || '');
    }

    for (const vp of VIEWPORTS) {
      console.log('\nViewport ' + vp.label);
      consoleErrors.length = 0;
      exceptions.length = 0;
      external.length = 0;

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile
      }, session);
      await navigate(navUrl());

      check('title screen shows on load', await evalJson(
        "document.getElementById('screen-title').hidden === false"));
      check('lab toggle offered because the module loaded', await evalJson(
        "document.getElementById('btn-lab').hidden === false"));
      check('lab panel starts closed', await evalJson(
        "document.getElementById('lab-section').hidden === true"));
      check('no horizontal overflow at ' + vp.width, await evalJson(
        'document.documentElement.scrollWidth <= window.innerWidth'));

      await click('#btn-lab');
      check('lab opens after a real click', await evalJson(
        "document.getElementById('lab-section').hidden === false"));
      check('solvability table lists twelve levels', await evalJson(
        "document.getElementById('lab-level-rows').children.length") === 12);
      check('comparator lists four strategies', await evalJson(
        "document.getElementById('lab-strategy-rows').children.length") === 4);
      check('blueprint draws 144 cells', await evalJson(
        "document.getElementById('lab-blueprint').children.length") === 144);
      check('chart draws twelve focusable bars', await evalJson(
        "document.querySelectorAll('#lab-budget-chart [role=button]').length") === 12);
      check('page digest is a 64 char hex', /^[0-9a-f]{64}$/.test(await evalJson(
        "document.getElementById('lab-digest-code').textContent")));

      await click('#lab-level-rows tr:nth-child(5) .lab-row-btn');
      check('level row click selects level five', await evalJson(
        "document.querySelector('#lab-level-rows tr:nth-child(5) .lab-row-btn').getAttribute('aria-current') === 'true'"));

      await click('#lab-strategies .lab-strategy-btn:nth-child(3)');
      check('strategy button click presses noisy overcarve', await evalJson(
        "document.querySelectorAll('#lab-strategies .lab-strategy-btn')[2].getAttribute('aria-pressed') === 'true'"));

      await click('#lab-budget-chart g[aria-label^="Level 8"]');
      check('svg bar click selects level eight', await evalJson(
        "document.querySelector('#lab-level-rows tr:nth-child(8) .lab-row-btn').getAttribute('aria-current') === 'true'"));

      await click('#btn-lab-verify');
      check('verify reports the digest match', /^Verified/.test(await evalJson(
        "document.getElementById('lab-verify-out').textContent")));

      await click('#btn-lab-tamper');
      check('tamper demo catches the forged total', /^Tamper caught/.test(await evalJson(
        "document.getElementById('lab-verify-out').textContent")));

      await click('#btn-lab-tests');
      const testCount = await evalJson(
        "document.getElementById('lab-test-count').textContent");
      check('in page self tests all pass (' + testCount + ')', (() => {
        const m = testCount.match(/^(\d+) of (\d+) lab checks passing$/);
        return m && m[1] === m[2] && Number(m[1]) >= 16;
      })());

      check('share link button emits an ll hash', await (async () => {
        await click('#btn-lab-link');
        return /ll=\d+\.[a-z-]+\.[01]/.test(await evalJson(
          "document.getElementById('lab-verify-out').textContent"));
      })());

      await click('#btn-lab-jump');
      check('jump to level opens level eight', await evalJson(
        "document.getElementById('game-level-tag').textContent") === 'Level 8 of 12');

      if (vp.mobile) {
        const fold = await evalJson(`(() => {
          const r = document.getElementById('grid-wrap').getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, w: r.width };
        })()`);
        check('playfield sits fully above the 844px fold',
          fold.top >= 0 && fold.bottom <= vp.height,
          JSON.stringify(fold));
        check('playfield fits the 390px width', fold.w <= vp.width, JSON.stringify(fold));
      }

      /* Hash restore: fresh navigation with the bookmark, then a reload. */
      const hash = '#ll=12.mirror-unaware.1';
      await navigate(navUrl(hash));
      check('bookmark opens the lab', await evalJson(
        "document.getElementById('lab-section').hidden === false"));
      check('bookmark selects level twelve', await evalJson(
        "document.querySelector('#lab-level-rows tr:nth-child(12) .lab-row-btn').getAttribute('aria-current') === 'true'"));
      check('bookmark selects mirror unaware', await evalJson(
        "document.querySelectorAll('#lab-strategies .lab-strategy-btn')[3].getAttribute('aria-pressed') === 'true'"));

      const reloaded = cdp.waitEvent('Page.loadEventFired', session);
      await cdp.send('Page.reload', {}, session);
      await reloaded;
      await sleep(350);
      check('reload restores every bookmark field', await evalJson(`(() => {
        const level = document.querySelector('#lab-level-rows tr:nth-child(12) .lab-row-btn')
          .getAttribute('aria-current') === 'true';
        const strat = document.querySelectorAll('#lab-strategies .lab-strategy-btn')[3]
          .getAttribute('aria-pressed') === 'true';
        const open = document.getElementById('lab-section').hidden === false;
        return level && strat && open;
      })()`));
      check('a hostile hash falls back cleanly', await (async () => {
        const loaded = cdp.waitEvent('Page.loadEventFired', session);
        await cdp.send('Page.navigate', { url: navUrl('#ll=99.bogus.9') }, session);
        await loaded;
        await sleep(300);
        return evalJson(
          "document.getElementById('lab-section').hidden === true && " +
          "document.getElementById('btn-lab').hidden === false");
      })());

      check('zero console errors at ' + vp.label, consoleErrors.length === 0,
        consoleErrors.join(' | '));
      check('zero page exceptions at ' + vp.label, exceptions.length === 0,
        exceptions.join(' | '));
      check('zero external network requests at ' + vp.label, external.length === 0,
        external.join(' | '));
      check('still no horizontal overflow at ' + vp.width, await evalJson(
        'document.documentElement.scrollWidth <= window.innerWidth'));
    }

    cdp.close();
  } finally {
    try { chrome.kill('SIGKILL'); } catch (err) { /* already dead */ }
    await new Promise((resolve) => server.close(resolve));
    await sleep(300);
    fs.rmSync(SCRATCH, { recursive: true, force: true });
  }
}

main().then(() => {
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}).catch((err) => {
  console.log('AUDIT ERROR: ' + (err && err.stack || err));
  try {
    fs.rmSync(SCRATCH, { recursive: true, force: true });
  } catch (e) {
    /* scratch already gone */
  }
  process.exit(1);
});
