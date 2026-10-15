// Arrival services (get full tank / full hull repair on arrival) through the v20 Options dialog and arrival dialogs.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch(), {page, browser, errors, network, state, screen} = L;
  let reloads = 0;
  const reload = async () => { await L.reload(); reloads++; };
  const box = name => page.locator(`.modal-host [data-arrival-option="${name}"]`);
  // Options dialog: both switches start off for a game without them and persist across reloads.
  let s = E.newFixtureGame(2000, 0); delete s.autoFuel; delete s.autoRepair; await L.load(s);
  await L.options(); assert.equal(await box('autoFuel').isChecked(), false); assert.equal(await box('autoRepair').isChecked(), false);
  assert.equal((await box('autoFuel').locator('xpath=..').textContent()).trim(), 'Get full tank on arrival');
  assert.equal((await box('autoRepair').locator('xpath=..').textContent()).trim(), 'Get full hull repair on arrival');
  await box('autoFuel').check(); await box('autoRepair').check(); await L.closeOptions(); await reload();
  assert.equal((await state()).autoFuel, true); assert.equal((await state()).autoRepair, true);
  // Ordinary departure, encounters and arrival through the player controls.
  s = await state(); s.ship.hull = 10; await L.load(s);
  await L.target(1); await page.locator('.warp-button').click();
  await L.travel({untilArrival: 'stop'});
  await screen('arrival'); s = await state();
  assert.equal(s.ship.fuel, 14); assert.equal(s.ship.hull, 100); assert.equal(s.pending.services.fuel, 9); assert.ok(s.pending.services.repair > 0);
  await reload();
  const paid = s.credits; await L.seqOK(); assert.equal((await state()).credits, paid); await screen('info');
  // Saved warning screens: partial fuel skips repairs; full fuel permits partial repairs.
  for (const [credits, fuel, warning] of [[7, 3, 'both'], [23, 3, 'repair'], [0, 14, 'repair']]) {
    s = E.newGame(2000, 0, {autoFuel: true, autoRepair: true}); s.credits = credits; s.ship.fuel = fuel; s.ship.hull = 50;
    s.trip = {target: 10, clicks: 0, raided: false}; s.pending = {kind: 'result', title: 'Passed', text: 'Continue'}; s.ui = {tab: 'chart', selected: null};
    await L.load(s); await L.seqOK(); await screen('arrival');
    const arrived = await state(); assert.equal(arrived.pending.services.warning, warning);
    if (warning === 'both') assert.equal(arrived.ship.hull, 50);
    assert.ok(arrived.credits >= 0); await reload(); assert.equal((await state()).credits, arrived.credits);
    await L.seqOK(); if (await page.locator('.modal-host [data-seq-ok]').count()) await L.seqOK(); await screen('info');
  }
  // Both switches can be disabled; their values survive Export/Import Save and New Game.
  await L.options(); await box('autoFuel').uncheck(); await box('autoRepair').uncheck(); await L.closeOptions(); await reload();
  await L.options(); await box('autoFuel').check(); await L.closeOptions();
  const download = page.waitForEvent('download'); await L.gameMenu('export'); const d = await download; const savePath = root + '/tests/out/arrival-browser-save.json'; await d.saveAs(savePath);
  const saved = await state();
  await L.gameMenu('new'); await L.yes(); await L.newCommander();
  assert.equal((await state()).autoFuel, true); assert.equal((await state()).autoRepair, false);
  await L.loadFile(savePath); assert.deepEqual(await state(), saved); await reload();
  for (const width of [320, 360, 390, 1280]) { await page.setViewportSize({width, height: 800}); await L.options(); await L.noOverflow(); await L.closeOptions(); }
  await page.setViewportSize({width: 360, height: 568}); await L.options(); await page.screenshot({path: root + '/tests/out/arrival-options.png', fullPage: true}); await L.closeOptions();
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {reloads, ordinaryTrips: 1, shortageScenarios: 3, viewports: [320, 360, 390, 1280], checks: ['old-save switches', 'saved options', 'normal arrival fuel/repair charges', 'fuel priority and partial services', 'saved shortage warnings', 'no charge on acknowledgement or reload', 'disable options', 'export/import and new-game preference retention', 'no overflow/errors/network'], errors, networkRequests: network.length};
  fs.writeFileSync(root + '/tests/out/arrival-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
