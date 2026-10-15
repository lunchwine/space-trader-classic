// Ship Yard, Buy Ship, Buy/Sell Equipment through the v20 (original 1.3.5) screens and dialogs.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch(), {page, browser, errors, network, state, screen} = L;
  let reloads = 0;
  const reload = async () => { await L.reload(); reloads++; };
  const confirm = async () => { await page.locator('.modal-host [data-purchase="yes"]').click(); if (await page.locator('.modal-host [data-seq-ok]').count()) await L.seqOK(); };
  const buyEq = (id, category) => page.locator(`[data-equipment-buy="${id}"][data-category="${category}"]`).click();
  await L.loadFile(root + '/tests/fixtures/Space_Trader_Shipyard_Test_Save.json');
  await L.command('yard'); await screen('yard'); await page.locator('[data-tab=ships]').click(); await screen('ships');
  assert.equal(await page.locator('[data-ship-info]').count(), 10);
  const before = await state();
  // Buy Firefly: NO leaves everything unchanged, YES trades in the Gnat.
  await page.locator('[data-yard-ship=FIREFLY]').click(); await screen('purchase'); assert.equal(await L.modalTitle(), 'Buy New Ship'); await reload();
  await page.locator('.modal-host [data-purchase="no"]').click(); assert.equal((await state()).credits, before.credits); assert.equal((await state()).ship.type, 'GNAT');
  const download = page.waitForEvent('download'); await L.gameMenu('export'); const d = await download, savePath = root + '/tests/out/yard-browser-save.json'; await d.saveAs(savePath);
  const saved = await state(); await L.gameMenu('new'); await L.yes(); await L.newCommander(); await L.loadFile(savePath); assert.deepEqual(await state(), saved); reloads++;
  await L.command('yard'); await page.locator('[data-tab=ships]').click(); await page.locator('[data-yard-ship=FIREFLY]').click(); const quote = (await state()).pending.quote;
  await confirm();
  assert.equal((await state()).credits, before.credits - quote.price); assert.equal((await state()).ship.type, 'FIREFLY'); assert.deepEqual((await state()).ship.weapons, []); assert.equal((await state()).ship.fuel, 17);
  // Equipment: weapon, shield, extra cargo bays.
  await L.command('buyeq'); await screen('equipment');
  await buyEq('BEAM', 'weapons'); await confirm(); assert.deepEqual((await state()).ship.weapons, ['BEAM']);
  await buyEq('PULSE', 'weapons'); await screen('box'); await L.no(); assert.deepEqual((await state()).ship.weapons, ['BEAM']);
  await buyEq('ENERGY', 'shields'); await confirm(); assert.deepEqual((await state()).ship.shieldStrength, [0]);
  await buyEq('EXTRABAYS', 'gadgets'); await confirm(); assert.equal(await page.locator('#cargo').textContent(), '0 / 25');
  // Cargo in the extra bays blocks selling them.
  await L.command('selleq'); await reload(); let s = await state(); s.ship.cargo.WATER = 21; s.costBasis.WATER = 693; s.ui = {tab: 'equipment', equipmentMode: 'sell', selected: null}; await L.load(s);
  await page.locator('[data-equipment-sell][data-category="gadgets"]').click(); await screen('box'); await L.no(); assert.deepEqual((await state()).ship.gadgets, ['EXTRABAYS']);
  await L.command('sell'); await page.locator('[data-sell="WATER"]').click(); await L.command('selleq');
  await page.locator('[data-equipment-sell][data-category="gadgets"]').click(); const sale = (await state()).pending.quote; await reload(); await confirm();
  assert.equal(E.cargoCapacity(await state()), 20); assert.equal(sale.price, 1875);
  await L.command('buyeq'); await buyEq('NAVIGATINGSYSTEM', 'gadgets'); await confirm(); assert.equal(E.effectiveSkill((await state()).ship, 'pilot', 0), 9);
  // The upgraded ship travels; shields charge on departure.
  s = await state(); const target = s.systems.find(x => x.id !== s.current && E.distance(x, s.systems[s.current]) <= 17);
  await L.warpTo(target.id); assert.equal((await state()).ship.shieldStrength[0], 100);
  await L.travel({untilArrival: 'stop'}); assert.equal((await state()).ship.fuel, 17); await reload(); await L.seqOK(); await screen('info');
  // Fight with the purchased beam laser and shield through the combat controls.
  const docked = await state(); s = E.copy(docked); s.trip = {target: s.current === 0 ? 1 : 0, clicks: 9, raided: false};
  s.encounter = {kind: 'PIRATE', state: 'ATTACK', round: 0, opponent: E.makeShip('GNAT', {pilot: 3, fighter: 3, trader: 3, engineer: 3})}; s.encounter.opponent.hull = 20; s.ui = {tab: 'chart', selected: null}; await L.load(s); let rounds = 0;
  while ((await state()).encounter) { assert.ok(rounds++ < 30); const expected = await state(); E.combat(expected, 'attack'); await page.locator('[data-combat="attack"]').click(); const actual = await state(); delete actual.ui; delete expected.ui; assert.deepEqual(actual, expected); }
  assert.equal((await state()).pending.kind, 'result'); assert.equal((await state()).ended, false); assert.ok(rounds > 0); await reload(); await L.load(docked);
  for (const width of [320, 360, 390, 1280]) { await page.setViewportSize({width, height: 800}); await L.command('yard'); await L.noOverflow(); await L.command('buyeq'); await L.noOverflow(); await L.command('selleq'); await L.noOverflow(); await L.command('yard'); await page.locator('[data-tab=ships]').click(); await L.noOverflow(); }
  await page.setViewportSize({width: 360, height: 568}); await L.command('yard'); await page.screenshot({path: root + '/tests/out/yard-phone.png', fullPage: true}); await L.command('buyeq'); await page.screenshot({path: root + '/tests/out/equipment-phone.png', fullPage: true});
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {reloads, shipTrades: 1, equipmentPurchases: 4, equipmentSales: 1, upgradedShipTrips: 1, combatRounds: rounds, viewports: [320, 360, 390, 1280], checks: ['ten ship types', 'Buy New Ship NO/YES', 'quote export/import', 'unarmed replacement with full fuel/hull', 'weapon/shield/gadget slots and Not Enough Slots', 'extra cargo capacity and sale guard', 'gadget skill effect', 'shield charging and upgraded travel', 'purchased equipment in combat', 'no overflow/errors/network'], errors, networkRequests: network.length};
  fs.writeFileSync(root + '/tests/out/yard-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
