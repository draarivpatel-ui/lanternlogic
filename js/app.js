'use strict';
/*
 * Lantern Logic, browser shell. Screens, canvas painting, input, and the
 * game clock live here. All rules and numbers come from the pure engine so
 * the tests and the page always agree. Every visual is drawn in code.
 */
(function () {
  const L = window.LanternLogic;
  const LEVELS = window.LANTERN_LEVELS.map((level) => L.normalizeLevel(level));

  const PALETTE = {
    skyTop: '#170b2c',
    skyMid: '#241243',
    skyLow: '#3a1c50',
    ground: '#0d0618',
    hill: '#140a24',
    ink: '#f6ead2',
    inkSoft: 'rgba(246, 234, 210, 0.55)',
    accent: '#ff9d3d',
    accentDeep: '#e2702a',
    glow: '#ffd27a',
    pumpkinLight: '#f08c2e',
    pumpkinMid: '#c65f1d',
    pumpkinDark: '#a34a15',
    pumpkinEdge: '#1a0d05',
    stem: '#4f6b31',
    stemDark: '#2c3d1a',
    night: '#0d0618'
  };

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  const STORE_KEY = 'lanternlogic.v1';
  const $ = (id) => document.getElementById(id);

  const dom = {
    sky: $('sky'),
    titleArt: $('title-art'),
    titleHeading: $('title-heading'),
    btnStart: $('btn-start'),
    btnLevels: $('btn-levels'),
    btnLevelsBack: $('btn-levels-back'),
    screenTitle: $('screen-title'),
    screenLevels: $('screen-levels'),
    screenGame: $('screen-game'),
    screenResults: $('screen-results'),
    screenEnd: $('screen-end'),
    levelsHeading: $('levels-heading'),
    levelList: $('level-list'),
    btnQuit: $('btn-quit'),
    gameHeading: $('game-heading'),
    gameLevelTag: $('game-level-tag'),
    gameLevelName: $('game-level-name'),
    timerBox: $('timer-box'),
    timeNum: $('time-num'),
    timerFill: $('timer-fill'),
    visitorCanvas: $('visitor'),
    visitorIntro: $('visitor-intro'),
    visitorHint: $('visitor-hint'),
    constraints: $('constraints'),
    cutsNum: $('cuts-num'),
    cutsCap: $('cuts-cap'),
    gridWrap: $('grid-wrap'),
    pumpkin: $('pumpkin'),
    btnUndo: $('btn-undo'),
    btnReset: $('btn-reset'),
    btnPeek: $('btn-peek'),
    btnSubmit: $('btn-submit'),
    resultsHeading: $('results-heading'),
    resultArt: $('result-art'),
    reportTotalNum: $('report-total-num'),
    reportGrade: $('report-grade'),
    reportShape: $('report-shape'),
    reportSymmetry: $('report-symmetry'),
    reportWaste: $('report-waste'),
    reportTime: $('report-time'),
    reportPeek: $('report-peek'),
    reportVerdict: $('report-verdict'),
    btnNext: $('btn-next'),
    btnReplay: $('btn-replay'),
    btnResultsLevels: $('btn-results-levels'),
    endHeading: $('end-heading'),
    endTotal: $('end-total'),
    endLine: $('end-line'),
    btnEndLevels: $('btn-end-levels'),
    btnEndAgain: $('btn-end-again'),
    live: $('live')
  };

  /* Progress lives in localStorage when it can, memory when it cannot. */
  let progress = loadProgress();
  function loadProgress() {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            unlocked: Math.min(12, Math.max(1, parsed.unlocked || 1)),
            best: parsed.best && typeof parsed.best === 'object' ? parsed.best : {}
          };
        }
      }
    } catch (err) {
      /* Private browsing or blocked storage falls through to memory only. */
    }
    return { unlocked: 1, best: {} };
  }

  function saveProgress() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(progress));
    } catch (err) {
      /* Ignore, the session still plays fine without persistence. */
    }
  }

  function announce(message) {
    dom.live.textContent = message;
  }

  /* Screen management. */

  const SCREENS = {
    title: { el: dom.screenTitle, heading: dom.titleHeading },
    levels: { el: dom.screenLevels, heading: dom.levelsHeading },
    game: { el: dom.screenGame, heading: dom.gameHeading },
    results: { el: dom.screenResults, heading: dom.resultsHeading },
    end: { el: dom.screenEnd, heading: dom.endHeading }
  };

  let currentScreen = 'title';

  function showScreen(name) {
    for (const key of Object.keys(SCREENS)) {
      SCREENS[key].el.hidden = key !== name;
    }
    currentScreen = name;
    SCREENS[name].heading.focus({ preventScroll: true });
  }

  /* Deterministic star field and helpers. */

  function mulberry32(seed) {
    return L.mulberry32(seed);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function setupCanvas(canvas, cssWidth, cssHeight) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function glowAlpha(t) {
    if (REDUCED.matches) return 0.9;
    return 0.78 + 0.13 * Math.sin(t * 0.0021) + 0.07 * Math.sin(t * 0.0053 + 1.7);
  }

  let glowSprite = null;
  function getGlowSprite() {
    if (glowSprite) return glowSprite;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255, 210, 122, 0.85)');
    grad.addColorStop(0.45, 'rgba(255, 157, 61, 0.30)');
    grad.addColorStop(1, 'rgba(255, 157, 61, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    glowSprite = canvas;
    return canvas;
  }

  /* Night sky backdrop. */

  const SKY_SEED = 20261024;
  let skyStars = [];
  let skyCtx = null;
  let skyW = 0;
  let skyH = 0;

  function buildStars() {
    const rand = mulberry32(SKY_SEED);
    skyStars = [];
    for (let i = 0; i < 110; i++) {
      skyStars.push({
        x: rand(),
        y: rand() * 0.72,
        r: 0.4 + rand() * 1.3,
        phase: rand() * Math.PI * 2,
        speed: 0.0004 + rand() * 0.0009,
        big: rand() > 0.93
      });
    }
  }

  function sizeSky() {
    skyW = window.innerWidth;
    skyH = window.innerHeight;
    skyCtx = setupCanvas(dom.sky, skyW, skyH);
  }

  function drawSky(t) {
    const ctx = skyCtx;
    if (!ctx) return;
    const grad = ctx.createLinearGradient(0, 0, 0, skyH);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.55, PALETTE.skyMid);
    grad.addColorStop(0.85, PALETTE.skyLow);
    grad.addColorStop(1, PALETTE.ground);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, skyW, skyH);

    /* Stars. */
    for (const star of skyStars) {
      const twinkle = REDUCED.matches
        ? 0.6
        : 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(star.phase + t * star.speed));
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.arc(star.x * skyW, star.y * skyH, star.r, 0, Math.PI * 2);
      ctx.fill();
      if (star.big) {
        ctx.globalAlpha = twinkle * 0.5;
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 0.7;
        const px = star.x * skyW;
        const py = star.y * skyH;
        const arm = star.r * 4;
        ctx.beginPath();
        ctx.moveTo(px - arm, py);
        ctx.lineTo(px + arm, py);
        ctx.moveTo(px, py - arm);
        ctx.lineTo(px, py + arm);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    /* Crescent moon with a soft coat of glow. */
    const moonX = skyW * 0.84;
    const moonY = skyH * 0.16;
    const moonR = Math.max(18, Math.min(skyW, skyH) * 0.035);
    ctx.globalAlpha = REDUCED.matches ? 0.5 : 0.35 + 0.08 * Math.sin(t * 0.0011);
    ctx.drawImage(getGlowSprite(), moonX - moonR * 3.2, moonY - moonR * 3.2, moonR * 6.4, moonR * 6.4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.skyTop;
    ctx.beginPath();
    ctx.arc(moonX - moonR * 0.42, moonY - moonR * 0.22, moonR * 0.88, 0, Math.PI * 2);
    ctx.fill();

    /* Hills, a tiny house, one lit window, a fence. */
    const groundY = skyH * 0.86;
    ctx.fillStyle = PALETTE.hill;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.quadraticCurveTo(skyW * 0.22, groundY - skyH * 0.06, skyW * 0.5, groundY - skyH * 0.015);
    ctx.quadraticCurveTo(skyW * 0.78, groundY + skyH * 0.03, skyW, groundY - skyH * 0.04);
    ctx.lineTo(skyW, skyH);
    ctx.lineTo(0, skyH);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, groundY + skyH * 0.02, skyW, skyH);

    const houseW = Math.max(46, skyW * 0.05);
    const houseX = skyW * 0.12;
    const houseY = groundY + skyH * 0.024 - houseW * 0.7;
    ctx.fillStyle = PALETTE.night;
    ctx.fillRect(houseX, houseY, houseW, houseW * 0.7);
    ctx.beginPath();
    ctx.moveTo(houseX - houseW * 0.1, houseY);
    ctx.lineTo(houseX + houseW * 0.5, houseY - houseW * 0.42);
    ctx.lineTo(houseX + houseW * 1.1, houseY);
    ctx.closePath();
    ctx.fill();
    const flicker = REDUCED.matches ? 0.85 : 0.7 + 0.25 * Math.sin(t * 0.0034);
    ctx.globalAlpha = Math.max(0.25, flicker);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillRect(houseX + houseW * 0.18, houseY + houseW * 0.2, houseW * 0.2, houseW * 0.24);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = PALETTE.night;
    ctx.lineWidth = Math.max(2, skyW * 0.002);
    const fenceTop = groundY + skyH * 0.01;
    for (let fx = skyW * 0.3; fx < skyW * 0.95; fx += Math.max(22, skyW * 0.028)) {
      ctx.beginPath();
      ctx.moveTo(fx, fenceTop);
      ctx.lineTo(fx, fenceTop + skyH * 0.045);
      ctx.stroke();
    }
  }

  /* Pumpkin painting. The body path is rebuilt only when the level or the
   * pixel size changes, so frames stay cheap. */

  let pumpkinCtx = null;
  let pumpkinSize = 0;
  let artCache = { key: '', body: null, ribs: [] };

  function pumpkinLayout() {
    const margin = pumpkinSize * 0.055;
    const cell = (pumpkinSize - margin * 2) / L.GRID;
    return {
      margin: margin,
      cell: cell,
      cx: margin + L.CENTER_X * cell,
      cy: margin + L.CENTER_Y * cell,
      rx: L.RADIUS * cell,
      ry: L.RADIUS * cell * 0.96
    };
  }

  function buildArt(levelId, layout) {
    const rand = mulberry32(levelId * 1013 + 77);
    const body = new Path2D();
    const steps = 26;
    const jitter = layout.cell * 0.06;
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const w = 1 + (rand() - 0.5) * (jitter / layout.rx);
      pts.push([layout.cx + Math.cos(a) * layout.rx * w, layout.cy + Math.sin(a) * layout.ry * w]);
    }
    body.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= steps; i++) {
      const prev = pts[i - 1];
      const cur = pts[i % steps];
      body.quadraticCurveTo(prev[0], prev[1], (prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2);
    }
    body.closePath();

    const ribs = [];
    for (const k of [-0.62, -0.24, 0.24, 0.62]) {
      const path = new Path2D();
      const topX = layout.cx + k * layout.rx * 0.94;
      const botX = topX;
      path.moveTo(topX, layout.cy - layout.ry * 0.82);
      path.quadraticCurveTo(layout.cx + k * layout.rx * 1.3, layout.cy, botX, layout.cy + layout.ry * 0.82);
      ribs.push(path);
    }
    return { body: body, ribs: ribs };
  }

  function ensureArt(levelId, layout) {
    const key = levelId + ':' + Math.round(layout.cell * 100);
    if (artCache.key !== key) {
      artCache = { key: key, body: null, ribs: [] };
      artCache = buildArt(levelId, layout);
      artCache.key = key;
    }
    return artCache;
  }

  /*
   * Draw one pumpkin scene into a square region whose top left corner sits
   * at (ox, oy) and whose side is size pixels. Used by the game grid, the
   * title art, and the results art alike.
   */
  function drawPumpkinScene(ctx, ox, oy, size, opts) {
    const layout = {
      margin: size * 0.055,
      cell: 0,
      cx: 0,
      cy: 0,
      rx: 0,
      ry: 0
    };
    layout.cell = (size - layout.margin * 2) / L.GRID;
    layout.cx = ox + layout.margin + L.CENTER_X * layout.cell;
    layout.cy = oy + layout.margin + L.CENTER_Y * layout.cell;
    layout.rx = L.RADIUS * layout.cell;
    layout.ry = L.RADIUS * layout.cell * 0.96;

    const art = ensureArt(opts.levelId, layout);
    const glow = glowAlpha(opts.t || 0);

    /* Body. */
    const grad = ctx.createRadialGradient(layout.cx, layout.cy - layout.ry * 0.2, layout.rx * 0.2, layout.cx, layout.cy, layout.rx * 1.05);
    grad.addColorStop(0, PALETTE.pumpkinLight);
    grad.addColorStop(0.65, PALETTE.pumpkinMid);
    grad.addColorStop(1, PALETTE.pumpkinDark);
    ctx.fillStyle = grad;
    ctx.fill(art.body);
    ctx.strokeStyle = 'rgba(26, 13, 5, 0.85)';
    ctx.lineWidth = Math.max(2, size * 0.009);
    ctx.stroke(art.body);

    ctx.strokeStyle = 'rgba(26, 13, 5, 0.18)';
    ctx.lineWidth = Math.max(1.2, size * 0.004);
    for (const rib of art.ribs) ctx.stroke(rib);

    /* Stem. */
    const stemBase = layout.cy - layout.ry * 0.9;
    const stemW = layout.cell * 0.9;
    ctx.fillStyle = PALETTE.stem;
    ctx.strokeStyle = PALETTE.stemDark;
    ctx.lineWidth = Math.max(1.5, size * 0.006);
    ctx.beginPath();
    ctx.moveTo(layout.cx - stemW * 0.5, stemBase + layout.cell * 0.3);
    ctx.quadraticCurveTo(layout.cx - stemW * 0.62, stemBase - layout.cell * 0.9, layout.cx - stemW * 0.1, stemBase - layout.cell * 1.5);
    ctx.quadraticCurveTo(layout.cx + stemW * 0.25, stemBase - layout.cell * 1.9, layout.cx + stemW * 0.42, stemBase - layout.cell * 1.35);
    ctx.quadraticCurveTo(layout.cx + stemW * 0.5, stemBase - layout.cell * 0.4, layout.cx + stemW * 0.5, stemBase + layout.cell * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    /* Cells. */
    const inset = layout.cell * 0.1;
    const inner = layout.cell * 0.8;
    const sprite = getGlowSprite();
    const cells = L.allInsideCells();
    for (const pair of cells) {
      const r = pair[0];
      const c = pair[1];
      const k = L.key(r, c);
      const x = ox + layout.margin + c * layout.cell + inset;
      const y = oy + layout.margin + r * layout.cell + inset;
      const carved = opts.carved.has(k);

      if (!opts.hideGrid) {
        ctx.strokeStyle = 'rgba(246, 234, 210, 0.07)';
        ctx.lineWidth = 1;
        roundRectPath(ctx, x, y, inner, inner, inner * 0.3);
        ctx.stroke();
      }

      if (opts.stemSafe && opts.stemSafe.has(k) && !carved) {
        ctx.strokeStyle = 'rgba(246, 234, 210, 0.3)';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.4;
        roundRectPath(ctx, x, y, inner, inner, inner * 0.3);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (opts.target && opts.peekOn && opts.target.has(k) && !carved) {
        ctx.strokeStyle = 'rgba(255, 210, 122, 0.85)';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.6;
        roundRectPath(ctx, x, y, inner, inner, inner * 0.3);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (carved) {
        const gcx = x + inner / 2;
        const gcy = y + inner / 2;
        const gw = inner * 2.4;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = glow * (opts.lit ? 1 : 0.8);
        ctx.drawImage(sprite, gcx - gw / 2, gcy - gw / 2, gw, gw);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = opts.lit ? PALETTE.glow : '#ffd98a';
        roundRectPath(ctx, x, y, inner, inner, inner * 0.3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(226, 112, 42, 0.8)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    /* Knife cursor. */
    if (opts.cursorKey) {
      const pair = L.unkey(opts.cursorKey);
      const x = ox + layout.margin + pair[1] * layout.cell + inset;
      const y = oy + layout.margin + pair[0] * layout.cell + inset;
      ctx.strokeStyle = 'rgba(246, 234, 210, 0.95)';
      ctx.lineWidth = 2.4;
      roundRectPath(ctx, x - 2, y - 2, inner + 4, inner + 4, inner * 0.34);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 157, 61, 0.5)';
      ctx.lineWidth = 1.2;
      roundRectPath(ctx, x - 5, y - 5, inner + 10, inner + 10, inner * 0.38);
      ctx.stroke();
    }
  }

  function sizePumpkin() {
    const width = dom.gridWrap.clientWidth || 320;
    pumpkinSize = Math.max(220, Math.min(560, width));
    pumpkinCtx = setupCanvas(dom.pumpkin, pumpkinSize, pumpkinSize);
    /* The square display size comes from the stylesheet (width 100 percent
     * plus aspect ratio), so the drawing size and the rendered size agree at
     * every viewport without an inline height fighting the CSS. */
    if (game) {
      ensureArt(game.level.id, pumpkinLayout());
    }
  }

  function drawGamePumpkin(t) {
    if (!game || !pumpkinCtx) return;
    pumpkinCtx.clearRect(0, 0, pumpkinSize, pumpkinSize);
    drawPumpkinScene(pumpkinCtx, 0, 0, pumpkinSize, {
      levelId: game.level.id,
      carved: game.state.carved,
      target: game.level.target,
      stemSafe: game.level.stemSafe,
      cursorKey: L.key(game.state.cursor.r, game.state.cursor.c),
      peekOn: t < game.peekUntil,
      lit: false,
      t: t
    });
  }

  /* Visitor silhouettes. One shared night stage, twelve costumed guests. */

  let visitorCtx = null;
  let visitorW = 0;
  let visitorH = 0;

  function sizeVisitor() {
    const width = dom.visitorCanvas.clientWidth || 220;
    visitorW = width;
    visitorH = Math.round(width * (240 / 220));
    visitorCtx = setupCanvas(dom.visitorCanvas, visitorW, visitorH);
  }

  function figureBody(ctx, x, baseY, h) {
    ctx.beginPath();
    ctx.moveTo(x - h * 0.3, baseY);
    ctx.quadraticCurveTo(x - h * 0.34, baseY - h * 0.42, x - h * 0.18, baseY - h * 0.58);
    ctx.quadraticCurveTo(x - h * 0.06, baseY - h * 0.66, x, baseY - h * 0.66);
    ctx.quadraticCurveTo(x + h * 0.06, baseY - h * 0.66, x + h * 0.18, baseY - h * 0.58);
    ctx.quadraticCurveTo(x + h * 0.34, baseY - h * 0.42, x + h * 0.3, baseY);
    ctx.closePath();
    ctx.fill();
  }

  function figureHead(ctx, x, baseY, h) {
    ctx.beginPath();
    ctx.arc(x, baseY - h * 0.78, h * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGuest(ctx, kind, x, baseY, h, t) {
    const bob = REDUCED.matches ? 0 : Math.sin(t * 0.0012 + h) * h * 0.008;
    const y = baseY + (kind === 'ghost' || kind === 'fairy' ? bob : 0);
    ctx.fillStyle = PALETTE.night;
    ctx.strokeStyle = PALETTE.night;
    ctx.lineWidth = Math.max(1.5, h * 0.035);

    if (kind === 'ghost') {
      ctx.beginPath();
      ctx.moveTo(x - h * 0.28, y);
      ctx.quadraticCurveTo(x - h * 0.34, y - h * 0.5, x - h * 0.16, y - h * 0.68);
      ctx.quadraticCurveTo(x, y - h * 0.86, x + h * 0.16, y - h * 0.68);
      ctx.quadraticCurveTo(x + h * 0.34, y - h * 0.5, x + h * 0.28, y);
      const scallops = 4;
      const span = h * 0.56;
      for (let i = 0; i < scallops; i++) {
        const x1 = x + h * 0.28 - (span * (i + 0.5)) / scallops;
        const x2 = x + h * 0.28 - (span * (i + 1)) / scallops;
        ctx.quadraticCurveTo(x1, y - h * 0.07, x2, y);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (kind === 'owl') {
      ctx.beginPath();
      ctx.ellipse(x, y - h * 0.38, h * 0.26, h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - h * 0.2, y - h * 0.68);
      ctx.lineTo(x - h * 0.12, y - h * 0.86);
      ctx.lineTo(x - h * 0.02, y - h * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + h * 0.2, y - h * 0.68);
      ctx.lineTo(x + h * 0.12, y - h * 0.86);
      ctx.lineTo(x + h * 0.02, y - h * 0.7);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (kind === 'robot') {
      figureBody(ctx, x, y, h * 0.72);
      ctx.fillRect(x - h * 0.17, y - h * 0.92, h * 0.34, h * 0.28);
      ctx.beginPath();
      ctx.moveTo(x, y - h * 0.92);
      ctx.lineTo(x, y - h * 1.04);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y - h * 1.08, h * 0.035, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (kind === 'parade') {
      drawGuest(ctx, 'ghost', x - h * 0.36, y, h * 0.62, t);
      drawGuest(ctx, 'cat', x, y, h * 0.66, t);
      drawGuest(ctx, 'wizard', x + h * 0.36, y, h * 0.66, t);
      return;
    }

    figureBody(ctx, x, y, h);
    figureHead(ctx, x, y, h);

    if (kind === 'wizard') {
      ctx.beginPath();
      ctx.ellipse(x, y - h * 0.9, h * 0.24, h * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - h * 0.12, y - h * 0.9);
      ctx.lineTo(x + h * 0.14, y - h * 0.9);
      ctx.lineTo(x + h * 0.05, y - h * 1.22);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + h * 0.3, y);
      ctx.lineTo(x + h * 0.3, y - h * 0.9);
      ctx.stroke();
    }

    if (kind === 'vampire') {
      ctx.beginPath();
      ctx.moveTo(x - h * 0.2, y - h * 0.58);
      ctx.lineTo(x - h * 0.32, y - h * 0.86);
      ctx.lineTo(x - h * 0.08, y - h * 0.66);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + h * 0.2, y - h * 0.58);
      ctx.lineTo(x + h * 0.32, y - h * 0.86);
      ctx.lineTo(x + h * 0.08, y - h * 0.66);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - h * 0.06, y - h * 0.92);
      ctx.lineTo(x, y - h * 0.84);
      ctx.lineTo(x + h * 0.06, y - h * 0.92);
      ctx.closePath();
      ctx.fill();
    }

    if (kind === 'cat' || kind === 'fox') {
      const earH = kind === 'fox' ? 0.3 : 0.24;
      ctx.beginPath();
      ctx.moveTo(x - h * 0.14, y - h * 0.86);
      ctx.lineTo(x - h * 0.18, y - h * (0.86 + earH));
      ctx.lineTo(x - h * 0.02, y - h * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + h * 0.14, y - h * 0.86);
      ctx.lineTo(x + h * 0.18, y - h * (0.86 + earH));
      ctx.lineTo(x + h * 0.02, y - h * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + h * 0.26, y - h * 0.3);
      ctx.quadraticCurveTo(x + h * 0.52, y - h * 0.4, x + h * 0.44, y - h * 0.78);
      ctx.quadraticCurveTo(x + h * 0.4, y - h * 0.9, x + h * 0.3, y - h * 0.88);
      ctx.stroke();
      if (kind === 'fox') {
        ctx.beginPath();
        ctx.moveTo(x, y - h * 0.78);
        ctx.lineTo(x + h * 0.12, y - h * 0.74);
        ctx.lineTo(x, y - h * 0.7);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (kind === 'scarecrow') {
      ctx.beginPath();
      ctx.ellipse(x, y - h * 0.9, h * 0.3, h * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - h * 0.12, y - h * 1.06, h * 0.24, h * 0.17);
      ctx.lineWidth = Math.max(1, h * 0.02);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(x + side * h * 0.3, y - h * (0.34 + i * 0.05));
          ctx.lineTo(x + side * h * (0.4 + i * 0.015), y - h * (0.24 + i * 0.05));
          ctx.stroke();
        }
      }
    }

    if (kind === 'mummy') {
      ctx.strokeStyle = 'rgba(246, 234, 210, 0.3)';
      ctx.lineWidth = Math.max(1, h * 0.02);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x - h * 0.26, y - h * (0.12 + i * 0.13));
        ctx.lineTo(x + h * 0.24, y - h * (0.2 + i * 0.13));
        ctx.stroke();
      }
    }

    if (kind === 'skeleton') {
      ctx.strokeStyle = 'rgba(246, 234, 210, 0.3)';
      ctx.lineWidth = Math.max(1, h * 0.02);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x, y - h * (0.42 + i * 0.07), h * (0.14 - i * 0.02), 0.2, Math.PI - 0.2);
        ctx.stroke();
      }
    }

    if (kind === 'fairy') {
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.ellipse(x - h * 0.3, y - h * 0.62, h * 0.16, h * 0.26, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + h * 0.3, y - h * 0.62, h * 0.16, h * 0.26, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(x + h * 0.2, y - h * 0.5);
      ctx.lineTo(x + h * 0.38, y - h * 0.9);
      ctx.stroke();
      const spark = 0.5 + 0.5 * Math.sin(t * 0.004);
      ctx.fillStyle = PALETTE.glow;
      ctx.globalAlpha = REDUCED.matches ? 0.9 : 0.5 + 0.5 * spark;
      ctx.beginPath();
      ctx.arc(x + h * 0.38, y - h * 0.94, h * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawVisitor(level, t) {
    if (!visitorCtx) return;
    const ctx = visitorCtx;
    const grad = ctx.createLinearGradient(0, 0, 0, visitorH);
    grad.addColorStop(0, '#2a1846');
    grad.addColorStop(1, '#1d1033');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, visitorW, visitorH);

    const rand = mulberry32(level.id * 555 + 9);
    ctx.fillStyle = PALETTE.ink;
    for (let i = 0; i < 9; i++) {
      ctx.globalAlpha = 0.25 + rand() * 0.5;
      ctx.beginPath();
      ctx.arc(rand() * visitorW, rand() * visitorH * 0.5, 0.6 + rand() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const groundY = visitorH * 0.84;
    ctx.fillStyle = PALETTE.night;
    ctx.beginPath();
    ctx.moveTo(0, groundY + visitorH * 0.04);
    ctx.quadraticCurveTo(visitorW * 0.5, groundY - visitorH * 0.03, visitorW, groundY + visitorH * 0.02);
    ctx.lineTo(visitorW, visitorH);
    ctx.lineTo(0, visitorH);
    ctx.closePath();
    ctx.fill();

    drawGuest(ctx, level.visitor, visitorW / 2, groundY + visitorH * 0.02, visitorH * 0.6, t || 0);
  }

  /* Title art: tonight's porch with a lit lantern waiting. */

  let titleCtx = null;
  let titleW = 0;
  let titleH = 0;

  function sizeTitle() {
    const width = dom.titleArt.clientWidth || 560;
    titleW = width;
    titleH = Math.round(width / 2);
    titleCtx = setupCanvas(dom.titleArt, titleW, titleH);
  }

  function drawTitle(t) {
    if (!titleCtx) return;
    const ctx = titleCtx;
    ctx.clearRect(0, 0, titleW, titleH);
    const groundY = titleH * 0.8;
    ctx.fillStyle = PALETTE.night;
    ctx.beginPath();
    ctx.moveTo(0, groundY + titleH * 0.05);
    ctx.quadraticCurveTo(titleW * 0.5, groundY - titleH * 0.06, titleW, groundY + titleH * 0.03);
    ctx.lineTo(titleW, titleH);
    ctx.lineTo(0, titleH);
    ctx.closePath();
    ctx.fill();

    const size = titleH * 0.92;
    drawPumpkinScene(ctx, titleW / 2 - size / 2, groundY - size * 0.86, size, {
      levelId: 0,
      carved: LEVELS[0].target,
      target: null,
      stemSafe: null,
      cursorKey: null,
      peekOn: false,
      lit: true,
      t: t || 0
    });
  }

  /* Game flow. */

  let game = null;

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }

  function updateTimer() {
    if (!game) return;
    dom.timeNum.textContent = formatTime(game.timeLeft);
    const share = Math.max(0, Math.min(1, game.timeLeft / game.level.time));
    dom.timerFill.style.transform = 'scaleX(' + share.toFixed(3) + ')';
    dom.timerBox.classList.toggle('is-low', game.timeLeft <= 15);
  }

  function updateCuts() {
    if (!game) return;
    dom.cutsNum.textContent = String(game.state.carved.size);
    dom.cutsCap.textContent = game.level.maxCarved != null ? ' of ' + game.level.maxCarved : '';
  }

  function renderConstraints(level) {
    dom.constraints.innerHTML = '';
    const chips = [];
    if (level.mirror) chips.push(['Mirror carving on', true]);
    if (level.maxCarved != null) chips.push(['Up to ' + level.maxCarved + ' cuts', true]);
    if (level.stemSafe.size > 0) chips.push(['Stem stays whole', true]);
    if (chips.length === 0) chips.push(['Free carving', false]);
    for (const chip of chips) {
      const li = document.createElement('li');
      li.textContent = chip[0];
      if (chip[1]) li.className = 'is-live';
      dom.constraints.appendChild(li);
    }
  }

  function startLevel(id) {
    const level = LEVELS.find((entry) => entry.id === id) || LEVELS[0];
    game = {
      level: level,
      state: L.createGameState(level),
      timeLeft: level.time,
      peekUntil: 0,
      over: false,
      lastResult: null
    };
    dom.gameLevelTag.textContent = 'Level ' + level.id + ' of 12';
    dom.gameLevelName.textContent = level.name;
    dom.visitorIntro.textContent = level.intro;
    dom.visitorHint.textContent = 'The wish, ' + level.hint.toLowerCase();
    renderConstraints(level);
    updateCuts();
    updateTimer();
    showScreen('game');
    sizePumpkin();
    sizeVisitor();
    drawVisitor(level, 0);
    announce('Level ' + level.id + ', ' + level.name + '. ' + level.intro);
    if (REDUCED.matches) {
      drawGamePumpkin(performance.now());
    }
  }

  function carveResultMessage(result, r, c) {
    const place = 'Row ' + (r + 1) + ', column ' + (c + 1);
    if (!result.ok) {
      if (result.reason === 'outside') return place + ' is outside the shell.';
      if (result.reason === 'stem') return place + ' holds the stem, leave it whole.';
      if (result.reason === 'budget') return 'The knife is spent. Undo a cut to make room.';
      return 'That cut does not land.';
    }
    if (result.added) {
      const left = game.level.maxCarved != null
        ? ' ' + (game.level.maxCarved - game.state.carved.size) + ' cuts left.'
        : '';
      return place + ' carved.' + left;
    }
    return place + ' cleared.';
  }

  function carveAt(r, c) {
    if (!game || game.over) return;
    const result = L.applyCarve(game.state, game.level, r, c);
    announce(carveResultMessage(result, r, c));
    updateCuts();
    if (REDUCED.matches) drawGamePumpkin(performance.now());
  }

  function moveCursor(dr, dc) {
    if (!game || game.over) return;
    let r = game.state.cursor.r;
    let c = game.state.cursor.c;
    for (let step = 0; step < L.GRID; step++) {
      r += dr;
      c += dc;
      if (r < 0 || c < 0 || r >= L.GRID || c >= L.GRID) break;
      if (L.insidePumpkin(r, c)) {
        game.state.cursor = { r: r, c: c };
        announce('Row ' + (r + 1) + ', column ' + (c + 1));
        if (REDUCED.matches) drawGamePumpkin(performance.now());
        return;
      }
    }
  }

  function undoAction() {
    if (!game || game.over) return;
    const result = L.undoCarve(game.state);
    announce(result.ok ? 'Last cut undone.' : 'Nothing to undo.');
    updateCuts();
    if (REDUCED.matches) drawGamePumpkin(performance.now());
  }

  function resetAction() {
    if (!game || game.over) return;
    L.resetState(game.state);
    announce('Pumpkin reset. A fresh shell waits.');
    updateCuts();
    if (REDUCED.matches) drawGamePumpkin(performance.now());
  }

  function peekAction() {
    if (!game || game.over) return;
    game.state.peeks += 1;
    game.peekUntil = performance.now() + 1600;
    announce('Peek used. The wish shows for a moment and costs 5 points.');
    if (REDUCED.matches) {
      drawGamePumpkin(performance.now());
      window.setTimeout(() => drawGamePumpkin(performance.now()), 1650);
    }
  }

  function submitCarve(auto) {
    if (!game || game.over) return;
    game.over = true;
    const timeLeft = Math.max(0, Math.round(game.timeLeft));
    const result = L.scoreCarve(game.level, game.state.carved, {
      timeLeft: timeLeft,
      peeks: game.state.peeks
    });
    game.lastResult = result;

    const best = progress.best[game.level.id];
    if (best == null || result.total > best) progress.best[game.level.id] = result.total;
    progress.unlocked = Math.min(12, Math.max(progress.unlocked, game.level.id + 1));
    saveProgress();

    fillReport(result, auto);
    drawResultArt();
    showScreen('results');
    announce('Lantern lit with ' + result.total + ' of 100 points, grade ' + result.grade + '. ' + result.verdict);
  }

  function fillReport(result, auto) {
    dom.reportTotalNum.textContent = String(result.total);
    dom.reportGrade.textContent = result.grade;
    dom.reportShape.textContent = result.shape + ' of 100';
    dom.reportSymmetry.textContent = result.symmetry + ' of 100';
    dom.reportWaste.textContent = result.wasteScore + ' of 100';
    dom.reportTime.textContent = '+' + result.timeBonus;
    dom.reportPeek.textContent = result.peekPenalty > 0 ? '-' + result.peekPenalty : '0';
    dom.reportVerdict.textContent = (auto ? 'The candle burned out. ' : '') + result.verdict;
    if (game.level.id < 12) {
      dom.btnNext.textContent = 'Next Level';
    } else {
      dom.btnNext.textContent = 'See The Night';
    }
  }

  function drawResultArt() {
    const ctx = setupCanvas(dom.resultArt, 360, 300);
    const grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, '#2a1846');
    grad.addColorStop(1, '#1d1033');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 360, 300);

    const rand = mulberry32(game.level.id * 77 + 3);
    ctx.fillStyle = PALETTE.ink;
    for (let i = 0; i < 14; i++) {
      ctx.globalAlpha = 0.2 + rand() * 0.5;
      ctx.beginPath();
      ctx.arc(rand() * 360, rand() * 150, 0.6 + rand() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = PALETTE.night;
    ctx.beginPath();
    ctx.moveTo(0, 252);
    ctx.quadraticCurveTo(180, 236, 360, 250);
    ctx.lineTo(360, 300);
    ctx.lineTo(0, 300);
    ctx.closePath();
    ctx.fill();

    drawPumpkinScene(ctx, 6, 34, 246, {
      levelId: game.level.id,
      carved: game.state.carved,
      target: null,
      stemSafe: null,
      cursorKey: null,
      peekOn: false,
      lit: true,
      t: 0
    });
    drawGuest(ctx, game.level.visitor, 316, 250, 120, 0);
  }

  /* Level select. */

  function renderLevels() {
    dom.levelList.innerHTML = '';
    for (const level of LEVELS) {
      const locked = level.id > progress.unlocked;
      const best = progress.best[level.id];
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'level-card' + (locked ? ' is-locked' : ' is-open');
      button.dataset.levelId = String(level.id);
      if (locked) button.setAttribute('aria-disabled', 'true');

      const num = document.createElement('span');
      num.className = 'level-num';
      num.textContent = 'Level ' + level.id;
      const name = document.createElement('span');
      name.className = 'level-name';
      name.textContent = level.name;
      const meta = document.createElement('span');
      meta.className = 'level-meta';
      meta.textContent = locked
        ? 'Finish level ' + (level.id - 1) + ' to open'
        : best != null ? 'Best ' + best + ' of 100' : 'Unlit, waiting';
      button.append(num, name, meta);
      li.appendChild(button);
      dom.levelList.appendChild(li);
    }
  }

  function levelClick(event) {
    const button = event.target.closest('.level-card');
    if (!button) return;
    const id = Number(button.dataset.levelId);
    if (button.getAttribute('aria-disabled') === 'true') {
      announce('Finish the earlier lanterns to open this one.');
      return;
    }
    startLevel(id);
  }

  function showEnd() {
    let total = 0;
    for (const level of LEVELS) {
      total += progress.best[level.id] || 0;
    }
    dom.endTotal.textContent = total + ' of 1200';
    let line;
    if (total >= 1080) line = 'The porch is famous now. Moths write songs about it.';
    else if (total >= 840) line = 'A warm, well lit street. The neighbors approve.';
    else if (total >= 600) line = 'Every visitor got a lantern worth remembering.';
    else if (total >= 300) line = 'Twelve lanterns stand, some prouder than others. Carve again soon.';
    else line = 'The night is carved open for you. Every lantern can glow brighter.';
    dom.endLine.textContent = line;
    showScreen('end');
    announce('All twelve lanterns lit, ' + total + ' of 1200 points. ' + line);
  }

  /* Wiring. */

  dom.btnStart.addEventListener('click', () => startLevel(Math.min(progress.unlocked, 12)));
  dom.btnLevels.addEventListener('click', () => {
    renderLevels();
    showScreen('levels');
  });
  dom.btnLevelsBack.addEventListener('click', () => showScreen('title'));
  dom.btnQuit.addEventListener('click', () => {
    renderLevels();
    showScreen('levels');
  });
  dom.levelList.addEventListener('click', levelClick);
  dom.btnUndo.addEventListener('click', undoAction);
  dom.btnReset.addEventListener('click', resetAction);
  dom.btnPeek.addEventListener('click', peekAction);
  dom.btnSubmit.addEventListener('click', () => submitCarve(false));
  dom.btnReplay.addEventListener('click', () => startLevel(game ? game.level.id : 1));
  dom.btnResultsLevels.addEventListener('click', () => {
    renderLevels();
    showScreen('levels');
  });
  dom.btnNext.addEventListener('click', () => {
    if (game && game.level.id < 12) startLevel(game.level.id + 1);
    else showEnd();
  });
  dom.btnEndLevels.addEventListener('click', () => {
    renderLevels();
    showScreen('levels');
  });
  dom.btnEndAgain.addEventListener('click', () => startLevel(1));

  dom.gridWrap.addEventListener('keydown', (event) => {
    if (!game) return;
    const key = event.key;
    if (key === 'ArrowUp') {
      event.preventDefault();
      moveCursor(-1, 0);
    } else if (key === 'ArrowDown') {
      event.preventDefault();
      moveCursor(1, 0);
    } else if (key === 'ArrowLeft') {
      event.preventDefault();
      moveCursor(0, -1);
    } else if (key === 'ArrowRight') {
      event.preventDefault();
      moveCursor(0, 1);
    } else if (key === ' ' || key === 'Spacebar' || key === 'Enter') {
      event.preventDefault();
      carveAt(game.state.cursor.r, game.state.cursor.c);
    } else if (key === 'u' || key === 'U') {
      event.preventDefault();
      undoAction();
    } else if (key === 'p' || key === 'P') {
      event.preventDefault();
      peekAction();
    } else if (key === 'r' || key === 'R') {
      event.preventDefault();
      resetAction();
    } else if (key === 'Escape') {
      renderLevels();
      showScreen('levels');
      announce('Back at the pumpkin path.');
    }
  });

  let painting = false;

  function cellFromEvent(event) {
    const rect = dom.pumpkin.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const layout = pumpkinLayout();
    const c = Math.floor((x - layout.margin) / layout.cell);
    const r = Math.floor((y - layout.margin) / layout.cell);
    if (r < 0 || c < 0 || r >= L.GRID || c >= L.GRID) return null;
    return { r: r, c: c };
  }

  dom.pumpkin.addEventListener('pointerdown', (event) => {
    if (!game || game.over) return;
    event.preventDefault();
    painting = true;
    const cell = cellFromEvent(event);
    if (cell) {
      game.state.cursor = { r: cell.r, c: cell.c };
      carveAt(cell.r, cell.c);
    }
  });

  dom.pumpkin.addEventListener('pointermove', (event) => {
    if (!painting || !game || game.over) return;
    const cell = cellFromEvent(event);
    if (cell && !game.state.carved.has(L.key(cell.r, cell.c))) {
      game.state.cursor = { r: cell.r, c: cell.c };
      carveAt(cell.r, cell.c);
    }
  });

  window.addEventListener('pointerup', () => {
    painting = false;
  });

  /* Clocks. A slow gameplay tick and one shared visual frame, both dark
   * friendly and frugal with the CPU. */

  let lastTick = performance.now();
  window.setInterval(() => {
    const now = performance.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    if (!game || game.over || document.hidden || currentScreen !== 'game') return;
    game.timeLeft -= dt;
    if (game.timeLeft <= 0) {
      game.timeLeft = 0;
      updateTimer();
      submitCarve(true);
      return;
    }
    updateTimer();
  }, 250);

  let lastVisual = 0;

  function visualLoop(now) {
    window.requestAnimationFrame(visualLoop);
    if (document.hidden) return;
    if (now - lastVisual < 31) return;
    lastVisual = now;
    if (REDUCED.matches) return;
    drawSky(now);
    if (currentScreen === 'title') drawTitle(now);
    if (currentScreen === 'game' && game) drawGamePumpkin(now);
  }

  /* Resize and motion preferences. */

  function resizeAll() {
    sizeSky();
    sizeVisitor();
    sizeTitle();
    if (game) sizePumpkin();
    if (REDUCED.matches) {
      drawSky(0);
      drawVisitor(game ? game.level : LEVELS[0], 0);
      drawTitle(0);
      if (game && currentScreen === 'game') drawGamePumpkin(performance.now());
    }
  }

  window.addEventListener('resize', resizeAll);
  try {
    REDUCED.addEventListener('change', resizeAll);
  } catch (err) {
    REDUCED.addListener(resizeAll);
  }

  /* Boot. */

  buildStars();
  resizeAll();
  showScreen('title');
  window.requestAnimationFrame(visualLoop);
  if (REDUCED.matches) {
    drawSky(0);
    drawTitle(0);
  }
})();
