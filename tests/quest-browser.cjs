// Japori Disease mission end to end through the v20 System Info "Special" dialogs.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch({timeout: 8000}), {page, browser, errors, network, state, screen} = L;
  let reloads = 0, encounters = 0;
  const reload = async () => { await L.reload(); reloads++; };
  const quest = a => page.locator(`.modal-host [data-quest="${a}"]`).click();
  const open = async () => { await L.command('info'); await page.locator('[data-open-port-event]').click(); await screen('quest'); };
  const buyWater = async n => { await L.command('buy'); await page.locator('[data-market-amount="WATER"][data-operation="buy"]').click(); await page.locator('#native-amount').fill(String(n)); await page.locator('.modal-host [data-quantity="confirm"]').click(); };
  await page.evaluate(() => localStorage.setItem('space-trader-port-experiment-v1', Trial.engine.serialize(Trial.engine.newFixtureGame()))); await page.reload();
  await open(); await reload(); assert.equal((await state()).pending.step, 'offer'); assert.equal(await L.modalTitle(), 'Japori Disease');
  await quest('no'); assert.equal((await state()).quests.japori.status, 0);
  // Not enough free bays: the engine refuses and nothing changes.
  await buyWater(6); await open(); const rngBefore = (await state()).rng;
  await quest('yes'); await screen('box'); assert.equal(await L.modalTitle(), 'Cargo Bays Full'); assert.equal((await state()).quests.japori.status, 0); assert.equal((await state()).rng, rngBefore); await L.no(); await screen('quest'); await quest('no'); await screen('info');
 await L.command('sell'); await page.locator('[data-market-amount="WATER"][data-operation="sell"]').click(); await page.locator('#native-amount').fill('1'); await page.locator('.modal-host [data-quantity="confirm"]').click();
  await open(); await quest('yes'); await screen('quest'); assert.equal((await state()).pending.step, 'loaded'); assert.equal(await page.locator('#cargo').textContent(), '5 / 5');
  assert.equal((await state()).ship.cargo.MEDICINE, 0); await reload(); await page.screenshot({path: root + '/tests/out/phone-quest-loaded.png', fullPage: true});
  await quest('continue'); await screen('info');
  // Portable save and a full five-bay trading limit.
  const download = page.waitForEvent('download'); await L.gameMenu('export'); await (await download).saveAs(root + '/tests/out/quest-browser-save.json'); const saved = await state();
  await L.gameMenu('new'); await L.yes(); await L.newCommander(); await L.loadFile(root + '/tests/out/quest-browser-save.json'); assert.deepEqual(await state(), saved);
  await L.command('buy'); await page.locator('[data-buy="WATER"]').click(); await screen('box'); assert.equal((await state()).ship.cargo.WATER, 5, 'a sixth bay of cargo cannot be loaded'); await L.no();
  // Four real journeys with encounters.
  for (const target of [1, 2, 3, 7]) {
    const f = page.locator('[data-service="fuel"]'); await L.command('yard'); if (await f.isVisible()) await f.click(); const r = page.locator('[data-service="repair"]'); if (await r.isVisible()) await r.click();
    await L.target(target); await reload(); await page.locator('.warp-button').click();
    const log = await L.travel({untilArrival: 'stop'}); encounters += log.filter(l => /^encounter/.test(l)).length;
    assert.equal((await state()).quests.japori.status, 1); assert.equal((await state()).ship.cargo.WATER, 5); await screen('arrival'); await reload(); await L.seqOK(); await screen('info');
  }
  assert.ok(encounters > 0); assert.equal((await state()).days, 4); assert.equal((await state()).current, 7);
  // Delivery at Japori: antidote delivered, two skill points, no cash, bays restored.
  await page.locator('[data-open-port-event]').click(); await screen('quest'); await reload(); assert.equal((await state()).pending.step, 'delivery');
  await page.screenshot({path: root + '/tests/out/phone-quest-delivery.png', fullPage: true});
  const credits = (await state()).credits; await quest('yes').catch(() => quest('continue')); await screen('quest');
  assert.equal((await state()).pending.step, 'reward'); assert.equal((await state()).credits, credits); assert.equal((await state()).quests.japori.status, 2); assert.equal(await page.locator('#cargo').textContent(), '5 / 15');
  assert.equal(Object.values((await state()).quests.japori.reward).reduce((a, b) => a + b), 2); await reload();
  await page.screenshot({path: root + '/tests/out/phone-quest-reward.png', fullPage: true}); await quest('continue'); await screen('info');
  assert.equal(await page.locator('[data-open-port-event]').isVisible(), false);
  await buyWater(1); assert.equal((await state()).ship.cargo.WATER, 6);
  for (const width of [320, 360, 390, 1280]) { await page.setViewportSize({width, height: 800}); await L.noOverflow(); }
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {completedMission: true, jumps: 4, encounters, reloads, viewports: [320, 360, 390, 1280], passed: ['offer/decline/reopen', 'capacity failure without mutation', 'load antidote as reserved bays', 'no sale as medicine', 'portable save after loading', 'five-bay trading limit', 'four real journeys', 'reload during offer/loading/travel/arrival/delivery/reward', 'destination delivery event', 'two skill points', 'no cash reward', 'cargo capacity restored', 'no repeat delivery or reward', 'post-quest trading', 'no horizontal overflow', 'zero browser exceptions/network'], errors, networkRequests: network.length};
  fs.writeFileSync(root + '/tests/out/quest-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result, null, 2)); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
