// Shared Playwright setup for the browser tests (tests/*-browser.cjs).
// Uses the repository's node_modules/playwright with its installed Chromium (npx playwright install chromium),
// and loads the current build (index.html, build 20) through the v20 interface.
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const {chromium} = require(root + '/node_modules/playwright');
const E = require('../src/engine.js');
const html = 'file://' + root + '/index.html';

// Open index.html at the Nexus 5 app area (360x568) unless a viewport is given.
async function launch({viewport = {width: 360, height: 568}, deviceScaleFactor = 1, isMobile = false, hasTouch = false, timeout = 5000, url = html} = {}) {
  const browser = await chromium.launch({headless: true});
  const context = await browser.newContext({viewport, deviceScaleFactor, isMobile, hasTouch, acceptDownloads: true});
  const page = await context.newPage(), errors = [], network = [];
  page.setDefaultTimeout(timeout);
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await page.goto(url);
  return {browser, context, page, errors, network, ...tools(page)};
}

function tools(page) {
  const t = {};
  t.state = () => page.evaluate(() => Trial.state);
  t.screenName = () => page.locator('#screen').getAttribute('data-screen');
  t.screen = async name => { await page.waitForFunction(n => document.getElementById('screen').dataset.screen === n, name).catch(() => {}); assert.equal(await t.screenName(), name); };
  t.click = name => page.getByRole('button', {name, exact: true}).click();
  t.modal = () => page.locator('.modal-host');
  t.modalTitle = async () => (await page.locator('.modal-host h2').first().textContent()).trim();
  t.text = () => page.locator('#screen').textContent();
  // Reload and check that the saved game comes back unchanged.
  t.reload = async () => { const before = await t.state(); await page.reload(); assert.deepEqual(await t.state(), before); };
  // Load a game through the hidden Import Save input. The UI rewrites the `ui` block when it saves, so
  // only the game state outside `ui` is compared.
  t.load = async (s, ui) => {
    const copy = JSON.parse(typeof s === 'string' ? s : E.serialize(s));
    if (ui !== undefined) copy.ui = ui; else copy.ui ??= {tab: 'buy', selected: null};
    const text = JSON.stringify(copy);
    await page.locator('#save-file').setInputFiles({name: 'scenario.json', mimeType: 'application/json', buffer: Buffer.from(text)});
    await page.waitForFunction(expected => { const a = Trial.state; delete a.ui; const b = JSON.parse(expected); delete b.ui; return JSON.stringify(a) === JSON.stringify(b); }, text);
  };
  t.loadFile = async file => {
    const text = require('node:fs').readFileSync(file, 'utf8');
    await page.locator('#save-file').setInputFiles(file);
    await page.waitForFunction(expected => { const a = Trial.state; delete a.ui; const b = JSON.parse(expected); delete b.ui; return JSON.stringify(a) === JSON.stringify(b); }, text);
  };
  // Original action-mode menu: tap the screen title, then a dropdown item.
  t.openMenu = async () => { if (await page.locator('#menu-bar').isHidden()) await page.locator('#screen-title').click(); };
  t.command = async id => { await t.openMenu(); if (await page.locator(`[data-menu-item="command:${id}"]`).count() === 0) await page.locator('[data-menu-drop=command]').click(); await page.locator(`[data-menu-item="command:${id}"]`).click(); };
  t.gameMenu = async id => { await t.openMenu(); await page.locator('[data-menu-drop=game]').click(); await page.locator(`[data-menu-item="game:${id}"]`).click(); };
  t.helpMenu = async id => { await t.openMenu(); await page.locator('[data-menu-drop=help]').click(); await page.locator(`[data-menu-item="help:${id}"]`).click(); };
  t.seqOK = () => page.locator('.modal-host [data-seq-ok]').click();
  t.boxButton = i => page.locator(`.modal-host [data-box="${i}"]`).click();
  t.yes = () => page.locator('.modal-host [data-box="1"]').click();
  t.no = () => page.locator('.modal-host [data-box="0"]').click();
  t.closeOverlay = () => page.locator('.modal-host .native-buttons [data-close-overlay]').click();
  t.noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
  // Options dialog via Game > Options; DONE closes it.
  t.options = () => t.gameMenu('options');
  t.closeOptions = () => page.locator('.modal-host .native-buttons button').click();
  // New commander from the title screen or Game > New Game: 4 points in every skill (20 in total).
  t.newCommander = async ({confirmNew = true} = {}) => {
    if (!await page.locator('.modal-host [data-create-commander]').count()) {
      if (await page.locator('#screen > .title-screen [data-start-commander]').count()) await page.locator('[data-start-commander]').click();
      else { await t.gameMenu('new'); if (confirmNew && await page.locator('.modal-host [data-box="1"]').count()) await t.yes(); }
    }
    for (const k of ['pilot', 'fighter', 'trader', 'engineer']) for (let i = 0; i < 4; i++) await page.getByRole('button', {name: 'Increase ' + k, exact: true}).click();
    await page.locator('[data-create-commander]').click();
  };
  // Short Range Chart: tap a system dot (mouse click at its centre) to open Target System.
  t.tapSystem = async id => {
    const g = page.locator(`.native-chart g[data-map-focus="${id}"]`), b = await g.boundingBox();
    assert.ok(b, 'system ' + id + ' is not on the chart');
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  };
  // Open Target System for a system within the Short Range Chart.
  t.target = async id => { await t.command('warp'); await t.tapSystem(id); await t.screen('departure'); };
  t.warpTo = async id => { await t.target(id); await page.locator('.warp-button').click(); };
  // Drive a journey to its end through the player controls. `choose(state)` returns a combat move for an
  // encounter (default: ignore/flee/submit). Returns a log of the dialogs and encounters seen.
  t.travel = async ({choose, decide = () => 'yes', untilArrival = true, max = 300} = {}) => {
    const log = [];
    for (let i = 0; i < max; i++) {
      const s = await t.state();
      if (s.ended) { log.push('ended'); return log; }
      if (!s.trip && !s.pending) return log;
      const p = s.pending;
      if (p) {
        if (p.kind === 'arrival' && !untilArrival) return log;
        const ok = page.locator('.modal-host [data-seq-ok]');
        if (await ok.count()) { log.push(p.kind + ': ' + await t.modalTitle()); if (p.kind === 'arrival' && untilArrival === 'stop') return log; await ok.click(); continue; }
        if (p.kind === 'decision') { log.push('decision: ' + await t.modalTitle()); await page.locator(`.modal-host [data-decision="${decide(s)}"]`).click(); continue; }
        if (p.kind === 'scoop') { await page.locator('.modal-host [data-scoop="leave"]').click(); continue; }
        if (p.kind === 'plunder') { await page.locator('.modal-host [data-plunder-done]').click(); continue; }
        if (p.kind === 'orbit') { await page.locator('.modal-host [data-orbit="none"]').click(); continue; }
        if (p.kind === 'rareDecision') { await page.locator('.modal-host [data-rare="no"]').click(); continue; }
        const any = page.locator('.modal-host [data-acknowledge],.modal-host [data-arrest],.modal-host [data-recovery],.modal-host [data-box]').first();
        if (await any.count()) { log.push(p.kind + ': ' + await t.modalTitle()); await any.click(); continue; }
        throw Error('Travel stalled at pending ' + JSON.stringify(p).slice(0, 200));
      }
      if (await page.locator('.modal-host [data-box]').count()) { log.push('box: ' + await t.modalTitle()); await page.locator('.modal-host [data-box]').last().click(); continue; }
      if (s.encounter) {
        const e = s.encounter, move = choose ? choose(s) : e.state === 'INSPECTION' ? 'submit' : e.state === 'ATTACK' ? 'flee' : 'continue';
        log.push(`encounter ${e.kind} ${e.state} -> ${move}`);
        await page.locator(`.combat-actions [data-combat="${move}"]`).click();
        continue;
      }
      throw Error('Travel stalled on screen ' + await t.screenName());
    }
    throw Error('Travel did not finish');
  };
  return t;
}

module.exports = {launch, root, html, E, assert, chromium};
