// Hiring and firing mercenaries (Personnel Roster) through the v20 (original 1.3.5) screens.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch(), {page, browser, errors, network, state, screen} = L;
  let reloads = 0;
  const reload = async () => { await L.reload(); reloads++; };
  const stepThrough = async () => { for (let i = 0; i < 12; i++) { const ok = page.locator('.modal-host [data-seq-ok],.modal-host [data-arrest],.modal-host [data-acknowledge]').first(); if (!await ok.count()) return; await ok.click(); } };
  await L.loadFile(root + '/tests/fixtures/Space_Trader_Crew_Test_Save.json'); await screen('crew');
  const before = await state(), wage = 72;
  assert.match(await page.locator('#screen').textContent(), /Alyssa[\s\S]*72 cr\. daily[\s\S]*Pilot: 6[\s\S]*Trader: 9/);
  assert.equal(await page.locator('[data-crew-hire]').count(), 1);
  // Hiring has no upfront fee and no confirmation (as in the original); skills and price effects apply immediately.
  await page.locator('[data-crew-hire="1"]').click(); await screen('crew'); assert.equal((await state()).credits, before.credits);
  assert.equal(E.effectiveSkill((await state()).ship, 'trader', 0), 10); assert.equal((await state()).ship.hiredCrew[0].name, 'Alyssa'); assert.equal(await page.locator('[data-crew-hire]').count(), 0);
  await reload(); assert.equal((await state()).ship.hiredCrew.length, 1);
  // Reserve-money option is saved.
  await L.options(); const reserve = page.locator('.modal-host [data-reserve-money]'); await reserve.uncheck(); assert.equal((await state()).reserveMoney, false); await reserve.check(); await L.closeOptions(); await reload(); assert.equal((await state()).reserveMoney, true);
  // Real chart/departure/encounter controls charge exactly one wage payment.
  let s = await state(); const target = s.systems.find(t => t.id !== s.current && E.distance(t, s.systems[s.current]) <= 15 && !E.wormholeExists(s, s.current, t.id));
  await L.target(target.id); assert.match(await page.locator('#screen').textContent(), /72/);
  const cash = (await state()).credits; await page.locator('.warp-button').click(); s = await state(); assert.equal(s.credits, cash - wage - (s.pending?.services?.cost || 0)); await reload();
  await L.travel({untilArrival: 'stop'}); await screen('arrival'); await reload(); assert.equal((await state()).log.filter(l => l.text.startsWith('Paid ')).length, 1);
  assert.ok((await state()).log.some(l => /Paid 72 credits in crew wages/.test(l.text))); await L.seqOK(); await screen('info');
  // Fire: the roster goes back to the original skills; wages stop.
  await L.command('personnel'); assert.equal((await state()).ship.hiredCrew.length, 1);
  const crewDecision = a => page.locator(`.modal-host [data-crew-decision="${a}"]`).click();
  await page.locator('[data-crew-dismiss="1"]').click(); await reload(); await crewDecision('no'); assert.equal((await state()).ship.hiredCrew.length, 1);
  await page.locator('[data-crew-dismiss="1"]').click(); await crewDecision('yes');
  assert.equal((await state()).ship.hiredCrew.length, 0); assert.equal(E.effectiveSkill((await state()).ship, 'trader', 0), 6); assert.equal(E.mercenaryMoney(await state()), 0); await reload();
  // A ship with one crew quarter shows the original No Free Quarters dialog.
  s = E.copy(before); s.ship = E.makeShip('GNAT'); s.ui = {tab: 'crew', selected: null}; await L.load(s);
  assert.match(await page.locator('#screen').textContent(), /No quarters available/);
  await page.locator('[data-crew-hire]').click(); assert.equal(await L.modalTitle(), 'No Free Quarters'); await L.no(); assert.ok(!(await state()).ship.hiredCrew?.length);
  // Reserved wages are kept when buying cargo with the Max button.
  s = E.copy(before); E.openCrew(s, 'hire', 1); E.respondCrew(s, true); E.respondCrew(s, true); s.credits = wage + 1000; s.reserveMoney = true; s.ui = {tab: 'buy', selected: null}; await L.load(s);
  await page.locator('[data-buy]').first().click(); assert.ok((await state()).credits >= wage);
  // Prison: the crew leave and wages stop.
  s = await state(); s.credits = 100000; s.trip = {target: target.id, clicks: 5, raided: false}; s.pending = {kind: 'arrest', step: 'sentence', fine: 100, days: 30}; s.ui = {tab: 'chart', selected: null}; await L.load(s);
  await stepThrough(); await reload(); assert.equal((await state()).ship.hiredCrew.length, 0); assert.equal(E.mercenaryMoney(await state()), 0);
  await L.load(before);
  for (const width of [320, 360, 390, 1280]) { await page.setViewportSize({width, height: 800}); await screen('crew'); await L.noOverflow(); await L.command('bank'); await L.noOverflow(); await L.command('personnel'); }
  await page.setViewportSize({width: 360, height: 568}); await page.screenshot({path: root + '/tests/out/crew-phone.png', fullPage: true});
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {reloads, hires: 1, departures: 1, dismissals: 1, viewports: [320, 360, 390, 1280], checks: ['Personnel Roster hire without fee or prompt', 'improved skills and prices', 'departure costs and one wage log', 'roster persistence through travel', 'fire and skill loss', 'reserve option and cargo-spending limit', 'No Free Quarters dialog', 'prison crew loss', 'no overflow/errors/network'], errors, networkRequests: network.length};
  fs.writeFileSync(root + '/tests/out/crew-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
