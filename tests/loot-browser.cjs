// Plunder, jettison, dumping cargo and salvage canisters through the v20 (original 1.3.5) dialogs.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch(), {page, browser, errors, network, state, screen} = L;
  let reloads = 0, encounters = 0;
  const reload = async () => { await L.reload(); reloads++; };
  const load = async s => { s.ui = {tab: 'sell', selected: null}; await L.load(s); };
  const fits = async () => { for (const width of [320, 360, 390, 1280]) { await page.setViewportSize({width, height: 800}); await L.noOverflow(); } await page.setViewportSize({width: 360, height: 568}); };
  const combat = m => page.locator(`[data-combat="${m}"]`).click();
  const take = (good, all) => page.locator(`.modal-host [data-cargo-pick="${good}"]${all ? '[data-cargo-all]' : ':not([data-cargo-all])'}`).click();
  // Jettison one unit (or all) of a good from the disposal list; the first litter warning asks for confirmation.
  const discard = async (good, n, confirm = true) => {
    await take(good, n === 'all'); if (n !== 'all') { await page.locator('#native-amount').fill(String(n)); await page.locator('.modal-host [data-cargo-amount="ok"]').click(); }
    if (confirm && await page.locator('.modal-host [data-disposal="yes"]').count()) await page.locator('.modal-host [data-disposal="yes"]').click();
  };
  await L.loadFile(root + '/tests/fixtures/Space_Trader_Plunder_Test_Save.json'); await screen('encounter'); const initial = await state();
  // Plunder: one police-record penalty; the full hold blocks the transfer.
  await combat('plunder'); await screen('plunder'); assert.equal((await state()).policeScore, -1); await reload(); await fits();
  await take('ROBOTS', true); assert.equal(await L.modalTitle(), 'No Empty Bays'); assert.equal((await state()).ship.cargo.ROBOTS, 0); await L.no(); await screen('plunder'); await page.screenshot({path: root + '/tests/out/plunder-phone.png', fullPage: true});
  // Dump opens Jettison: the litter warning can be refused, then accepted; the parent plunder resumes without a new penalty.
  await page.locator('[data-disposal-open]').first().click(); await screen('disposal'); await fits();
  await take('WATER'); await page.locator('#native-amount').fill('1'); await page.locator('.modal-host [data-cargo-amount="ok"]').click(); assert.equal(await L.modalTitle(), 'Space Littering'); assert.equal((await state()).pending.warning, true); await reload();
  await page.locator('.modal-host [data-disposal="no"]').click(); assert.equal((await state()).ship.cargo.WATER, initial.ship.cargo.WATER); assert.equal((await state()).litterWarning, true);
  await discard('WATER', 1); await reload(); assert.equal((await state()).ship.cargo.WATER, initial.ship.cargo.WATER - 1);
  while (await page.locator('.modal-host [data-seq-ok]').count()) await L.seqOK();
  if (await page.locator('.modal-host [data-disposal="close"]').count()) await page.locator('.modal-host [data-disposal="close"]').click();
  await screen('plunder'); assert.equal((await state()).policeScore, -1);
  await take('ROBOTS', true); assert.equal((await state()).ship.cargo.ROBOTS, 1); assert.equal((await state()).encounter.opponent.cargo.ROBOTS, 1); assert.equal((await state()).costBasis.ROBOTS, 0); await reload();
  await page.locator('.modal-host [data-plunder-done]').click(); assert.equal((await state()).encounter, null); await reload();
  // The journey finishes with the new actions isolated from dock screens.
  const log = await L.travel(); encounters += log.filter(l => /^encounter/.test(l)).length; await screen('info');
  // Dock dumping of an unsellable good costs 5 cr. per unit on Beginner; None changes nothing.
  let s = E.newFixtureGame(1, 0); s.ship.cargo.WATER = 10; s.costBasis.WATER = 300; s.prices.sell.WATER = 0; await load(s); await screen('sell');
  port = await state(); await page.locator('[data-dump-good="WATER"]').click(); await screen('quantity'); await page.locator('#native-amount').fill('1');
  await page.locator('.modal-host [data-quantity="cancel"]').click(); assert.equal((await state()).credits, port.credits);
  await page.locator('[data-dump-good="WATER"]').click(); await page.locator('#native-amount').fill('1'); await page.locator('.modal-host [data-quantity="confirm"]').click(); assert.equal((await state()).credits, port.credits - 5); assert.equal((await state()).ship.cargo.WATER, 9);
  // Underfunded dump all: only what the cash pays for is dumped and cash stays non-negative.
  s = await state(); s.difficulty = 4; s.credits = 27; s.ship.cargo.WATER = 10; s.costBasis.WATER = 101; s.prices.sell.WATER = 0; s.reserveMoney = false; await load(s);
  await page.locator('[data-dump-good="WATER"]').click(); await page.locator('.modal-host [data-quantity="all"]').click(); const dumped = await state();
  assert.ok(dumped.credits >= 0); assert.ok(dumped.ship.cargo.WATER < 10); assert.equal(dumped.ship.cargo.WATER, 9); assert.equal(dumped.credits, 2); assert.equal(dumped.costBasis.WATER, 90);
  // Combat-generated canister with a full hold: Make Room opens Jettison, then the canister is picked up.
  await L.loadFile(root + '/tests/fixtures/Space_Trader_Salvage_Test_Save.json'); await screen('encounter'); await combat('attack'); await screen('result'); assert.equal((await state()).pending.loot, 'ORE'); const fight = await state(); await reload();
  await L.seqOK(); await screen('scoop'); assert.equal(await L.modalTitle(), 'No Room To Scoop'); await fits(); await page.screenshot({path: root + '/tests/out/scoop-phone.png', fullPage: true});
  await page.locator('.modal-host [data-disposal-open]').click(); await screen('disposal'); await discard('WATER', 1); while (await page.locator('.modal-host [data-seq-ok]').count()) await L.seqOK();
  if (await page.locator('.modal-host [data-disposal="close"]').count()) await page.locator('.modal-host [data-disposal="close"]').click();
  await screen('scoop'); assert.equal((await state()).pending.good, 'ORE'); await reload();
  await page.locator('.modal-host [data-scoop="pick"]').click(); assert.equal((await state()).ship.cargo.ORE, 1); assert.equal((await state()).costBasis.ORE, 0); assert.equal((await state()).credits, fight.credits); await reload();
  // Leaving a canister, and the police-record penalty for caught littering.
  await L.loadFile(root + '/tests/fixtures/Space_Trader_Salvage_Test_Save.json'); await combat('attack'); await L.seqOK(); await page.locator('.modal-host [data-scoop="leave"]').click(); assert.equal((await state()).ship.cargo.ORE, 0);
  s = E.copy(initial); s.difficulty = 4; s.policeScore = 10; s.rng = new E.JavaRandom(2).toJSON(); while (new E.JavaRandom(s.rng, true).get(10) >= 5) s.rng = new E.JavaRandom(Number(s.rng) % 1000 + 1).toJSON();
  await load(s); await combat('plunder'); await page.locator('[data-disposal-open]').first().click(); await discard('WATER', 1);
  assert.equal((await state()).litterWarning, true); assert.equal((await state()).policeScore, -5); await fits(); await page.screenshot({path: root + '/tests/out/jettison-phone.png', fullPage: true});
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {reloads, encounters, plunderTransfers: 1, fullHoldSalvages: 1, dockDisposals: 2, jettisonTransfers: 3, viewports: [320, 360, 390, 1280], checks: ['saved plunder and one penalty', 'full hold No Empty Bays', 'jettison warning refuse/accept', 'resume parent without reroll', 'travel arrival and dock dumping', 'underfunded dump-all', 'combat-generated canister and bounty', 'Make Room, pick and leave controls', 'caught litter police record', 'no overflow/errors/network'], errors, networkRequests: network.length};
  fs.writeFileSync(root + '/tests/out/loot-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
