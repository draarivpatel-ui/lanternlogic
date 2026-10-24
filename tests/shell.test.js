'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('the page shell is a valid single page app', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport"[^>]*width=device-width[^>]*>/);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /<script src="js\/levels.js"><\/script>/);
  assert.match(html, /<script src="js\/engine.js"><\/script>/);
  assert.match(html, /<script src="js\/app.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="styles.css">/);
  assert.match(html, /<main[^>]*id="main"/, 'a main landmark exists for the skip link');
  assert.match(html, /class="skip-link"/, 'a skip link comes first in the body');
});

test('the shell carries the accessibility hooks the game needs', () => {
  assert.match(html, /aria-live="polite"/, 'a polite live region announces game state');
  assert.match(html, /role="application"/, 'the carving grid is exposed as an application');
  assert.match(html, /aria-label="Pumpkin carving grid"/);
  assert.match(html, /<footer[\s>]/, 'a footer landmark holds the byline');
  assert.equal((html.match(/<h1/g) || []).length, 1, 'exactly one h1 lives on the page');
});

test('no banned punctuation or placeholder text ships in the shell', () => {
  assert.equal(html.includes('\u2013'), false, 'no en dash in the markup');
  assert.equal(html.includes('\u2014'), false, 'no em dash in the markup');
  assert.equal(css.includes('\u2013'), false, 'no en dash in the styles');
  assert.equal(css.includes('\u2014'), false, 'no em dash in the styles');
  assert.equal(/TODO|FIXME|PLACEHOLDER/i.test(html), false, 'no unfinished markers in the markup');
});

test('the stylesheet is token led and motion aware', () => {
  assert.match(css, /:root\s*\{/, 'design tokens live on the root');
  assert.match(css, /--color-ink:/, 'ink token exists');
  assert.match(css, /--color-accent:/, 'accent token exists');
  assert.match(css, /prefers-reduced-motion/, 'reduced motion is honored');
  assert.match(css, /:focus-visible/, 'focus visibility is styled');
  assert.match(css, /overflow-x:\s*clip/, 'horizontal overflow is clipped');
  assert.match(css, /@media[^{]*max-width:\s*480px/, 'a small phone breakpoint exists');
});

test('the test command runs node:test with no dependencies', () => {
  assert.equal(typeof pkg.scripts.test, 'string');
  assert.match(pkg.scripts.test, /node --test/);
  assert.equal(pkg.dependencies, undefined, 'zero runtime dependencies');
  assert.equal(pkg.devDependencies, undefined, 'zero dev dependencies');
});

function parseHex(token) {
  const match = css.match(new RegExp('--' + token + ':\\s*(#[0-9a-fA-F]{6})'));
  assert.ok(match, 'token ' + token + ' resolves to a hex color');
  return match[1];
}

function luminance(hex) {
  const channel = (i) => {
    const raw = parseInt(hex.slice(i, i + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

test('the palette passes WCAG contrast on its core text pairs', () => {
  const sky = parseHex('color-sky-top');
  const ink = parseHex('color-ink');
  const soft = parseHex('color-ink-soft');
  const accent = parseHex('color-accent');
  const buttonInk = parseHex('color-btn-ink');
  assert.ok(contrast(ink, sky) >= 7, 'body text on the plum sky clears AAA, got ' + contrast(ink, sky).toFixed(2));
  assert.ok(contrast(soft, sky) >= 4.5, 'soft text on the plum sky clears AA, got ' + contrast(soft, sky).toFixed(2));
  assert.ok(contrast(accent, sky) >= 4.5, 'accent text on the plum sky clears AA, got ' + contrast(accent, sky).toFixed(2));
  assert.ok(contrast(buttonInk, accent) >= 4.5, 'button label on lantern orange clears AA, got ' + contrast(buttonInk, accent).toFixed(2));
});
