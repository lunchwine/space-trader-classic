// Ambassador Jarek passenger mission through the v20 System Info "Special" dialogs.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch(), {page, browser, errors, network, state, screen} = L;
  let reloads = 0, encounters = 0;
  const reload = async () => { await L.reload(); reloads++; };
  const open = async () => { await L.command('info'); await page.locator('[data-open-port-event]').click(); await screen('passenger'); };
  const answer = a => page.locator(`.modal-host [data-jarek="${a}"]`).click();
  const stepThrough = async () => { for (let i = 0; i < 12; i++) { const ok = page.locator('.modal-host [data-seq-ok],.modal-host [data-arrest],.modal-host [data-recovery],.modal-host [data-acknowledge]').first(); if (!await ok.count()) return; await ok.click(); } };
  const special = () => page.locator('[data-open-port-event]').isVisible();
  await L.loadFile(root + '/tests/fixtures/Space_Trader_Jarek_Test_Save.json'); const initial = await state();
  assert.equal(initial.systems[initial.current].name, 'Capelle'); assert.equal(initial.systems[E.jarekQuest(initial).target].name, 'Devidia');
  // Offer: Not now changes nothing; accepting takes one crew quarter without cost, wages or randomness.
  await L.command('info'); assert.equal(await special(), true); await page.locator('[data-open-port-event]').click(); await screen('passenger'); await reload();
  await answer('no'); assert.deepEqual(await state(), {...initial, ui: (await state()).ui});
  await open(); await answer('yes'); let s = await state();
  assert.equal(s.jarekStatus, 1); assert.equal(E.occupiedQuarters(s), 2); assert.equal(s.credits, initial.credits); assert.equal(s.rng, initial.rng); await reload();
  await page.screenshot({path: root + '/tests/out/jarek-boarded-phone.png', fullPage: true}); await answer('continue');
  await L.command('personnel'); assert.match(await page.locator('#screen').textContent(), /Jarek|quarters/i); assert.equal(E.mercenaryMoney(await state()), 0); assert.equal(E.effectiveSkill(s.ship, 'trader', s.difficulty, s), 6);
  // Real Capelle–Devidia journey; arrival opens System Info.
  await L.warpTo(E.jarekQuest(await state()).target); await reload();
  const log = await L.travel({untilArrival: 'stop'}); encounters += log.filter(l => /^encounter/.test(l)).length;
  assert.equal((await state()).jarekStatus, 1); await L.seqOK(); await screen('info'); await reload();
  // Delivery: the haggling computer reward, once.
  await page.locator('[data-open-port-event]').click(); await screen('passenger'); await reload(); const before = await state();
  await answer('continue'); s = await state();
  assert.equal(s.jarekStatus, 2); assert.equal(E.occupiedQuarters(s), 1); assert.equal(E.effectiveSkill(s.ship, 'trader', s.difficulty, s), 7); assert.equal(s.ship.skills.trader, 5);
  assert.equal(s.credits, before.credits); assert.equal(s.rng, before.rng); assert.deepEqual(s.prices.sell, before.prices.sell); assert.ok(Object.entries(s.prices.buy).some(([id, p]) => p < before.prices.buy[id]));
  await reload(); await page.screenshot({path: root + '/tests/out/jarek-reward-phone.png', fullPage: true}); if (await page.locator('.modal-host [data-jarek="continue"]').count()) await answer('continue'); await screen('info');
  assert.equal(await special(), false); await L.command('personnel'); assert.match(await page.locator('#screen').textContent(), /Cash/);
  // Full quarters and a bad police record both block the offer without side effects.
  s = E.copy(initial); s.ship = E.makeShip('GNAT'); s.ui = {tab: 'info', selected: null}; await L.load(s);
  await page.locator('[data-open-port-event]').click(); const full = await state();
  await answer('yes'); await screen('error'); assert.deepEqual({...await state(), ui: 0}, {...full, ui: 0}); await page.locator('[data-close-error]').click(); await answer('no');
  s = E.copy(initial); s.policeScore = -6; s.ui = {tab: 'info', selected: null}; await L.load(s); assert.equal(await special(), false);
  // Prison and rescue return Jarek safely and close the mission.
  for (const kind of ['arrest', 'recovery']) {
    s = E.copy(initial); E.openJarek(s); E.respondJarek(s, 'yes'); E.respondJarek(s, 'continue'); s.trip = {target: E.jarekQuest(s).target, clicks: 5, raided: false};
    if (kind === 'arrest') s.pending = {kind, step: 'sentence', fine: 100, days: 30}; else { s.ship.hull = 0; s.escapePod = true; s.pending = {kind, step: 'activated'}; }
    s.ui = {tab: 'chart', selected: null}; await L.load(s); await screen(kind); await stepThrough(); await reload();
    assert.equal((await state()).jarekStatus, 0); assert.equal(await special(), false);
  }
  for (const width of [320, 360, 390, 1280]) { await page.setViewportSize({width, height: 800}); await L.noOverflow(); await L.command('personnel'); await L.noOverflow(); await L.command('info'); }
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {completedMission: true, jumps: 1, encounters, reloads, viewports: [320, 360, 390, 1280], checks: ['offer/cancel/accept', 'passenger quarters with no wages or skills', 'real Capelle–Devidia journey', 'delivery reward and price drop once', 'full-quarter and police-record guards', 'prison and rescue close the mission', 'reload at checkpoints', 'no horizontal overflow, page errors or network'], errors, networkRequests: network.length};
  fs.writeFileSync(root + '/tests/out/jarek-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
