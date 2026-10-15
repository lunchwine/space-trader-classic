// Native-looking interface checks for v20: title, new commander, themes, trading dialogs, newspaper, screens at all widths.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch({viewport: {width: 360, height: 568}}), {page, browser, errors, network, state, screen, click} = L;
  let reloads = 0, widthChecks = 0;
  const reload = async () => { await L.reload(); reloads++; };
  const fits = async () => { for (const width of [320, 360, 412, 640, 1280]) { await page.setViewportSize({width, height: 800}); await L.noOverflow(); widthChecks++; } await page.setViewportSize({width: 360, height: 568}); };
  const amount = async (selector, n, confirm) => { await page.locator(selector).click(); await page.locator('#native-amount').fill(String(n)); await page.locator(`.modal-host [data-quantity="${confirm}"]`).click(); };
  // Title screen and the original skill allocation dialog.
  await screen('title'); assert.equal(await page.evaluate(() => Trial.buildVersion), '20');
  await page.locator('[data-start-commander]').click(); await screen('newCommander'); assert.equal(await page.locator('.modal-host').count(), 1);
  for (const skill of ['pilot', 'fighter', 'trader', 'engineer']) for (let i = 0; i < 4; i++) await page.getByRole('button', {name: 'Increase ' + skill, exact: true}).click();
  await page.locator('#new-commander-name').fill('Reference Commander'); await page.locator('[data-create-commander]').click(); await screen('info');
  assert.equal((await state()).commanderName, 'Reference Commander'); assert.deepEqual((await state()).ship.skills, {pilot: 5, fighter: 5, trader: 5, engineer: 5}); await reload();
  // Theme chooser: Classic, then Holo and Material each with Light / Dark / Match system (follows prefers-color-scheme).
  await L.options();
  assert.deepEqual(await page.locator('.modal-host .opt-theme-family').allTextContents(), ['Holo:', 'Material:']);
  assert.deepEqual(await page.locator('.modal-host .opt-theme-modes label').allTextContents(), ['Light', 'Dark', 'Match system', 'Light', 'Dark', 'Match system']);
  const bodyTheme = () => page.evaluate(() => document.body.dataset.theme);
  for (const [value, scheme, expected] of [['holo-system', 'light', 'light'], ['holo-system', 'dark', 'dark'], ['material-system', 'dark', 'material-dark'], ['material-system', 'light', 'material-light']]) {
    await page.emulateMedia({colorScheme: scheme}); await page.waitForTimeout(100); await page.locator(`.modal-host input[name="theme"][value="${value}"]`).check(); assert.equal(await bodyTheme(), expected, value + ' ' + scheme);
  }
  // Changing the system scheme while on a Match system setting re-renders.
  await page.emulateMedia({colorScheme: 'dark'}); await page.waitForTimeout(100); assert.equal(await bodyTheme(), 'material-dark');
  await page.emulateMedia({colorScheme: 'light'}); await L.closeOptions();
  // Every theme in Options renders every main screen without overflow.
  for (const theme of ['classic', 'light', 'dark', 'material-light', 'material-dark']) {
    await L.options(); await page.locator(`.modal-host input[name="theme"][value="${theme}"]`).check(); await L.closeOptions();
    await L.command('buy'); await fits(); await page.screenshot({path: root + '/tests/out/v20-market-' + theme + '.png'});
    await L.command('warp'); assert.equal(await page.locator('.local-map').count(), 1); await fits();
    await L.command('chart'); assert.equal(await page.locator('.galaxy-map g[data-map-focus]').count(), 120); await fits(); await page.screenshot({path: root + '/tests/out/v20-chart-' + theme + '.png'}); await reload();
  }
  // Quantity dialogs for cargo (original None / All / OK).
  let s = E.newGame(2000, 0); s.credits = 100000; s.systems[s.current].tech = 7; s.ui = {tab: 'buy', selected: null}; await L.load(s);
  await amount('[data-market-amount="WATER"][data-operation="buy"]', 3, 'confirm'); assert.equal((await state()).ship.cargo.WATER, 3);
  await L.command('sell'); await amount('[data-market-amount="WATER"][data-operation="sell"]', 2, 'confirm'); assert.equal((await state()).ship.cargo.WATER, 1); await reload();
  // Newspaper: fee dialog, stable headlines, no second charge for the same edition.
  await L.command('info'); const old = await state(); await page.locator('[data-news]').click(); assert.equal(await L.modalTitle(), 'Buy Newspaper?'); await page.locator('.modal-host [data-read-news]').click();
  assert.equal((await state()).credits, old.credits - 1); const edition = await page.locator('.newspaper').textContent(); await fits(); await page.locator('.modal-host [data-close-overlay]').click();
  await page.locator('[data-news]').click(); assert.equal(await page.locator('.newspaper').textContent(), edition); assert.equal((await state()).credits, old.credits - 1); await page.locator('.modal-host [data-close-overlay]').click(); await reload();
  // Every command screen fits all widths.
  for (const cmd of ['status', 'personnel', 'bank', 'buyeq', 'selleq', 'yard', 'buy', 'sell', 'info']) { await L.command(cmd); await fits(); }
  await L.command('yard'); await page.locator('[data-tab=ships]').click(); await fits(); await page.locator('[data-yard-ship="FIREFLY"]').click().catch(() => {}); if (await page.locator('.modal-host [data-purchase="no"]').count()) await page.locator('.modal-host [data-purchase="no"]').click();
  // Original graphical encounter: layered ship sprites, no health bars, distance line.
  s = E.newGame(3000, 0); s.ship = E.makeShip('GRASSHOPPER'); s.ship.shields = ['ENERGY']; s.ship.shieldStrength = [100]; s.trip = {target: 10, clicks: 15};
  s.encounter = {kind: 'PIRATE', state: 'ATTACK', round: 0, opponent: E.makeShip('HORNET')}; s.encounter.opponent.shields = ['REFLECTIVE']; s.encounter.opponent.shieldStrength = [200]; s.ui = {tab: 'chart', selected: null}; await L.load(s);
  assert.equal(await page.locator('#screen-title').textContent(), 'Encounter'); assert.ok(await page.locator('.sprite-layer').count() >= 2); assert.equal(await page.locator('.bar').count(), 0); assert.match(await page.locator('.encounter-description').textContent(), /15 clicks/);
  await fits(); await page.screenshot({path: root + '/tests/out/v20-pirate-scene.png'});
  await page.locator('[data-combat="surrender"]').click(); await screen('result');
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {themes: 5, widthChecks, reloads, errors, networkRequests: network.length, checks: ['title and original skill allocation', 'five themes with market and both charts', 'quantity trading', 'newspaper fee and stable headlines', 'every command screen at five widths', 'graphical encounter layers', 'no overflow/errors/network']};
  fs.writeFileSync(root + '/tests/out/native-ui-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
