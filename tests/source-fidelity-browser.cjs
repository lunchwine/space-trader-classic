// Source-fidelity checks against the original screens: equipment tables, Status/Ship/Cargo, Ship Yard dialogs,
// Target System pages, Options persistence, automatic newspaper and interruptible continuous attack.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch({viewport: {width: 360, height: 740}, timeout: 6000}), {page, browser, errors, state, screen} = L;
  let widthChecks = 0;
  const fits = async () => { for (const width of [320, 360, 412, 640, 1280]) { await page.setViewportSize({width, height: 800}); await L.noOverflow(); widthChecks++; } await page.setViewportSize({width: 360, height: 740}); };
  const confirm = async () => { await page.locator('.modal-host [data-purchase="yes"]').click(); while (await page.locator('.modal-host [data-seq-ok]').count()) await L.seqOK(); };
  let s = E.newGame(2000, 0); s.credits = 500000; s.ship = E.makeShip('WASP'); s.ship.hull = 110; s.ship.fuel = 10; s.current = s.mercenaries[1].system; s.systems[s.current].tech = 7; s.ui = {tab: 'equipment', selected: null};
  await L.load(s); await L.command('buyeq'); await screen('equipment');
  assert.equal(await page.locator('#screen tbody tr, #screen .row-equipment, #screen [data-equipment-buy]').count() >= 5, true); await fits(); await page.screenshot({path: root + '/tests/out/v20-equipment.png'});
  const before = await state(); await page.locator('[data-equipment-buy="BEAM"][data-category="weapons"]').click(); assert.equal(await page.locator('.modal-underlay').count() + await page.locator('.modal-host').count() > 0, true); await confirm();
  assert.ok((await state()).ship.weapons.includes('BEAM')); assert.ok((await state()).credits < before.credits);
  await L.command('selleq'); await page.locator('[data-equipment-sell][data-category="weapons"]').last().click(); await confirm(); assert.equal((await state()).ship.weapons.includes('BEAM'), false);
  // Personnel: hire and fire.
  await L.command('personnel'); const hire = page.locator('[data-crew-hire]'); assert.equal(await hire.count(), 1); const id = await hire.getAttribute('data-crew-hire'); await hire.click(); assert.equal((await state()).ship.hiredCrew.length, 1); await fits();
  await page.locator(`[data-crew-dismiss="${id}"]`).click(); await page.locator('.modal-host [data-crew-decision="yes"]').click(); assert.equal((await state()).ship.hiredCrew.length, 0);
  // Commander Status, Current Ship and Special Cargo.
  await L.command('status'); assert.match(await page.locator('#screen').textContent(), /Harmless/); await fits(); await page.screenshot({path: root + '/tests/out/v20-status.png'});
  await page.locator('#screen [data-tab="ship"]').click(); await screen('ship'); assert.equal(await page.locator('.native-ship .bar').count(), 0); await fits(); await page.screenshot({path: root + '/tests/out/v20-ship.png'});
  await L.command('status'); await page.locator('#screen [data-tab="cargo"]').click(); await screen('cargo'); assert.match(await page.locator('#screen').textContent(), /No special items|no special/i); await fits();
  // Ship Yard: fuel budget dialog (OK buys at most the amount), ship list and the Ship Information dialog.
  await L.command('yard'); await page.locator('[data-yard-budget="fuel"]').click(); await page.locator('#native-amount').fill('20').catch(async () => page.locator('.modal-host input').first().fill('20')); await page.locator('.modal-host [data-pay-yard]:not([data-maximum])').click(); assert.equal((await state()).ship.fuel, 11);
  await page.locator('[data-tab=ships]').click(); assert.equal(await page.locator('[data-ship-info]').count(), 10); await fits(); await page.screenshot({path: root + '/tests/out/v20-ship-sale.png'});
  await page.locator('[data-ship-info="FIREFLY"]').click(); await screen('shipInfo'); assert.match(await page.locator('.modal-host').textContent(), /Crew Quarters/); await fits();
  await page.locator('.modal-host button', {hasText: /ship for sale list/i}).click().catch(() => {});
  // Target System pages, Average Price List and the price-difference toggle (no random numbers are used).
  await L.command('bank'); await fits(); s = await state();
  const target = s.systems.find(x => x.id !== s.current && E.travelCost(s, x.id).fuel <= s.ship.fuel); await L.target(target.id); assert.equal(await page.locator('#screen-title').textContent(), 'Target System');
  await page.locator('[data-target-prices]').click(); const rng = (await state()).rng; assert.match(await page.locator('#screen').textContent(), /Bays/);
  const diff = page.locator('[data-price-differences]'); if (await diff.count()) { await diff.first().click(); assert.equal((await state()).rng, rng); } await fits(); await page.screenshot({path: root + '/tests/out/v20-average-prices.png'});
  await page.locator('[data-cancel-departure]').click().catch(() => {}); await screen('chart');
  // Every preference in Options is saved and survives a reload.
  await L.options(); for (const key of ['ignorePolice', 'ignorePirates', 'ignoreOrbitTrade', 'alwaysInfo', 'attackFleeing', 'autoNews', 'zoomGalaxy', 'showTrackedRange', 'trackAutoOff', 'trackLongPress', 'remindLoans', 'sharePreferences', 'identifyStartup']) {
    const c = page.locator(`.modal-host [data-game-option="${key}"]`); await c.setChecked(!await c.isChecked()); assert.equal((await state()).options[key], await c.isChecked(), key);
  }
  await page.locator('#leave-empty').fill('2'); await page.locator('#leave-empty').blur(); assert.equal((await state()).leaveEmpty, 2); await L.closeOptions();
  const saved = await state(); await page.reload(); assert.deepEqual(await state(), saved);
  // Automatic newspaper: paid once on actual arrival; reading it again is free.
  s = E.newGame(2000, 0, {autoFuel: true}); s.credits = 10000; s.options = {autoNews: true}; s.trip = {target: 10, clicks: 0}; s.pending = {kind: 'result', title: 'Passed', text: 'Passed'}; E.acknowledge(s); s.ui = {tab: 'info', selected: null}; await L.load(s);
  while (await page.locator('.modal-host [data-seq-ok]').count()) await L.seqOK();
  assert.equal(await page.locator('.newspaper').count(), 1); assert.equal((await state()).credits, 9999); await page.locator('.modal-host [data-close-overlay]').click();
  await page.locator('[data-news]').click(); assert.equal((await state()).credits, 9999); await page.locator('.modal-host [data-close-overlay]').click();
  // A delivered artifact quest shows its source headline in the newspaper.
  s = E.newGame(2000, 0); s.credits = 10000; s.current = E.campaignRules.find(s, 'ALIENARTIFACT'); E.campaignRules.open(s); E.campaignRules.respond(s, true); E.campaignRules.respond(s, true); s.current = s.campaigns.artifact.target; E.campaignRules.open(s); E.campaignRules.respond(s, true); E.campaignRules.respond(s, true); s.ui = {tab: 'info', selected: null}; await L.load(s);
  await page.locator('[data-news]').click(); await page.locator('.modal-host [data-read-news]').click(); assert.match(await page.locator('.newspaper').textContent(), /Artifact/); await page.screenshot({path: root + '/tests/out/v20-mission-newspaper.png'}); await page.locator('.modal-host [data-close-overlay]').click();
  // Continuous attack runs by itself and can be interrupted; the paused state is saved.
  s = E.newGame(2000, 0); s.ship.weapons = ['PULSE']; s.options = {continuousAttack: true}; s.trip = {target: 10, clicks: 10}; s.encounter = {kind: 'PIRATE', state: 'ATTACK', round: 0, opponent: E.makeShip('GRASSHOPPER')}; s.encounter.opponent.weapons = []; s.ui = {tab: 'chart', selected: null}; await L.load(s);
  await page.locator('[data-combat="attack"]').click(); await page.waitForFunction(() => Trial.state.encounter?.round >= 3); await page.locator('[data-stop-combat]').click();
  await L.reload(); assert.equal(await page.locator('[data-stop-combat]').count(), 0);
  assert.deepEqual(errors, []);
  const result = {widthChecks, equipmentTransactions: 2, crewTransactions: 2, targetPrices: true, preferences: 13, automaticPaperOnce: true, missionNewspaper: true, interruptibleCombat: true, errors};
  fs.writeFileSync(root + '/tests/out/source-fidelity-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
