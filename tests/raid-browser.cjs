// Surrendering to pirates (cargo raid / payment demand) through the v20 (original 1.3.5) dialogs.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch(), {page, browser, errors, network, state, screen} = L;
  let reloads = 0, encounters = 0;
  const reload = async () => { await L.reload(); reloads++; };
  const combat = m => page.locator(`[data-combat="${m}"]`).click();
  const decision = a => page.locator(`.modal-host [data-decision="${a}"]`).click();
  const load = async s => { s.ui = {tab: 'chart', selected: null}; await L.load(s); };
  const finish = async () => { const log = await L.travel(); encounters += log.filter(l => /^encounter (?!PIRATE)/.test(l)).length; assert.equal(log.filter(l => /^encounter PIRATE/.test(l)).length, 0); await screen('info'); };
  await L.loadFile(root + '/tests/fixtures/Space_Trader_Pirate_Raid_Test_Save.json'); await screen('encounter'); const initial = await state();
  // Surrendering to pirates is immediate in the original: the Looting dialog, no confirmation and no combat damage.
  await combat('surrender'); await screen('result'); assert.equal(await L.modalTitle(), 'Looting'); assert.equal((await state()).pending.raid.cargoLost, 3); let s = await state();
  assert.equal(s.trip.raided, true); assert.equal(E.filled(s.ship), 9); assert.equal(s.ship.cargo.WATER, 5); assert.equal(s.ship.cargo.FURS, 2); assert.equal(s.ship.cargo.FOOD, 2);
  assert.equal(s.costBasis.WATER, 250); assert.equal(s.costBasis.FURS, 200); assert.equal(s.credits, initial.credits); assert.equal(s.ship.hull, initial.ship.hull); assert.equal(s.ship.fuel, initial.ship.fuel); assert.equal(s.policeScore, initial.policeScore);
  await reload(); await page.screenshot({path: root + '/tests/out/raid-phone.png', fullPage: true});
  await finish(); assert.equal(E.filled((await state()).ship), 9);
  // Empty-hold blackmail: part of the demand comes from cash and the shortfall is added to debt.
  await L.loadFile(root + '/tests/fixtures/Space_Trader_Pirate_Payment_Test_Save.json'); await screen('encounter'); const empty = await state();
  await combat('surrender'); await screen('result'); assert.equal(await L.modalTitle(), 'Pirates Find No Cargo'); assert.equal((await state()).pending.raid.payment, 500);
  s = await state(); assert.equal(s.credits, 0); assert.equal(s.debt, 400); assert.equal(s.rng, empty.rng); await reload(); await page.screenshot({path: root + '/tests/out/pirate-payment-phone.png', fullPage: true});
  await finish(); assert.equal((await state()).debt, 400);
  // Fully funded demand, a pirate with no room and protected special cargo.
  s = E.copy(empty); s.credits = 1000; await load(s); await combat('surrender'); assert.equal((await state()).credits, 500); assert.equal((await state()).debt, 0);
  s = E.copy(initial); s.encounter.opponent.cargo.WATER = 15; await load(s); await combat('surrender'); assert.equal(E.filled((await state()).ship), 12); assert.equal((await state()).pending.raid.cargoLost, 0); assert.equal((await state()).credits, 5000); await reload();
  s = E.copy(initial); s.quests.japori.status = 1; await load(s); await combat('surrender'); assert.equal((await state()).quests.japori.status, 1); assert.equal(E.cargoCapacity(await state()), 20);
  // Surrender is only offered where the original offers it.
  s = E.copy(initial); s.policeScore = -71; await load(s); assert.equal(await page.locator('[data-combat="surrender"]').isEnabled(), true);
  s.encounter.kind = 'POLICE'; await load(s); assert.equal(await page.locator('[data-combat="surrender"]').count(), 1);
  for (const name of ['FLEE', 'IGNORE', 'SURRENDER']) { s = E.copy(initial); s.encounter.state = name; await load(s); assert.equal(await page.locator('[data-combat="surrender"]').count(), 0); }
  for (const width of [320, 360, 390, 1280]) { await page.setViewportSize({width, height: 800}); await L.noOverflow(); }
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {reloads, postRaidEncounters: encounters, completedJourneys: 2, cargoRaids: 3, paymentDemands: 2, viewports: [320, 360, 390, 1280], checks: ['immediate surrender to pirates', 'partial theft and proportional cost basis', 'one saved result and no combat damage', 'post-raid journeys without pirates', 'empty hold demand and debt', 'fully funded demand', 'no-space pirate', 'protected antidote', 'surrender guards', 'no overflow/errors/network'], errors, networkRequests: network.length};
  fs.writeFileSync(root + '/tests/out/raid-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
