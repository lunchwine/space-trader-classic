// Retirement, high scores, rare encounters and the Moon ending through the v20 (original 1.3.5) dialogs.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const F = E.finishingRules, C = E.campaignRules;
const fs = require('node:fs');
(async () => {
  const L = await launch(), {page, browser, errors, network, state, screen, click} = L;
  let reloads = 0, views = 0;
  const reload = async () => { await L.reload(); reloads++; };
  const fits = async () => { for (const width of [320, 360, 390, 620, 1280]) { await page.setViewportSize({width, height: 800}); await L.noOverflow(); views++; } await page.setViewportSize({width: 360, height: 568}); };
  const modal = '.modal-host [data-special="yes"],.modal-host [data-seq-ok],.modal-host [data-box]';
  const event = async () => { await L.command('info'); await page.locator('[data-open-port-event]').click(); await screen('special'); await reload(); for (let i = 0; i < 8; i++) { const b = page.locator(modal).first(); if (!await b.count()) break; await b.click(); } };
  const scores = () => page.evaluate(() => JSON.parse(localStorage.getItem('space-trader-high-scores-v1')));
  await L.load(E.newFixtureGame(1, 0)); await screen('buy'); await fits();
  await page.screenshot({path: root + '/tests/out/finishing-market-phone.png', fullPage: true});
  // Retirement: NO cancels; YES shows Final Score, then High Scores, then the title screen.
  await L.gameMenu('retire'); assert.equal(await L.modalTitle(), 'Retire'); await L.no(); assert.equal((await state()).ended, false);
  await L.gameMenu('retire'); await L.yes(); assert.equal((await state()).finalResult.status, 'RETIRED'); assert.equal(await L.modalTitle(), 'Final Score');
  await L.boxButton(0); await screen('scores'); assert.match(await page.locator('.modal-host').textContent(), /Retired in 0 days/); await page.locator('.modal-host [data-close-overlay]').click(); await screen('title');
  // High scores persist across new games.
  await L.gameMenu('new'); await L.newCommander(); await screen('info'); assert.equal((await state()).ended, false);
  await L.gameMenu('scores'); assert.match(await page.locator('.modal-host').textContent(), /Retired/); await page.locator('.modal-host [data-close-overlay]').click();
  // Rare encounters from the offered spot checks, including all three captains and both bottles.
  for (const id of ['CAPTAINAHAB', 'CAPTAINCONRAD', 'CAPTAINHUIE', 'BOTTLEGOOD', 'BOTTLEOLD', 'MARIECELESTE']) {
    const s = E.newGame(2000, 2); s.days = 15; s.practice = true; s.ship = E.makeShip('WASP'); s.ship.weapons = ['MILITARY']; s.ship.shields = ['REFLECTIVE']; s.ship.shieldStrength = [200]; s.trip = {target: 10, clicks: 1, raided: false};
    F.start(s, id, new E.JavaRandom(1)); s.ui = {tab: 'chart', selected: null}; await L.load(s); await screen('encounter'); await reload();
    const act = F.trades[id] ? 'meet' : id.startsWith('BOTTLE') ? 'drink' : 'board';
    await page.locator(`[data-combat="${act}"]`).click(); await screen('rareDecision'); await reload(); await page.locator('[data-rare="yes"]').click();
    if (id === 'MARIECELESTE') {
      await page.locator('[data-cargo-pick="NARCOTICS"][data-cargo-all]').click(); await page.locator('[data-plunder-done]').click(); assert.equal((await state()).encounter.postMarie, true);
      await page.locator('[data-combat="submit"]').click(); await screen('result'); assert.equal(await L.modalTitle(), 'Contraband Removed'); await reload(); assert.equal((await state()).ship.cargo.NARCOTICS, 0);
    } else { await screen('result'); await reload(); if (id === 'CAPTAINAHAB') { assert.match(await page.locator('.modal-host').textContent(), /abilities have improved/); await page.screenshot({path: root + '/tests/out/finishing-captain-phone.png', fullPage: true}); } }
  }
  // Moon bought from the generated seller; winning retirement at Utopia.
  let s = E.newGame(); s.credits = 600000; s.current = C.find(s, 'MOONFORSALE'); s.ui = {tab: 'info', selected: null}; await L.load(s);
  await event(); assert.equal((await state()).moonBought, true); await reload();
  s = await state(); s.current = s.destinations.utopia; s.ui = {tab: 'info', selected: null}; await L.load(s); await event();
  assert.equal((await state()).finalResult.status, 'MOON'); assert.equal((await state()).finalResult.practice, false); await fits(); await reload();
  for (let i = 0; i < 6 && await page.locator('.modal-host [data-seq-ok],.modal-host [data-box]').count(); i++) await page.locator('.modal-host [data-seq-ok],.modal-host [data-box]').last().click();
  await page.screenshot({path: root + '/tests/out/finishing-moon-phone.png', fullPage: true});
  const list = await scores(); assert.ok(list.some(r => r.status === 'MOON')); assert.equal(new Set(list.map(r => r.id)).size, list.length);
  // Existing exported saves remain compatible; practice runs are not ranked.
  await L.load(E.deserialize(fs.readFileSync(root + '/tests/fixtures/Space_Trader_Moon_Spot_Check.json', 'utf8'))); await event(); assert.equal((await state()).finalResult.practice, true);
  assert.ok(!(await scores()).some(r => r.name === 'Moon retirement practice'));
  await L.load(E.deserialize(fs.readFileSync(root + '/tests/fixtures/Space_Trader_Wild_Spot_Check.json', 'utf8'))); await L.command('personnel'); assert.match(await page.locator('#screen').textContent(), /Wild's quarters/); await fits();
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {reloads, viewportChecks: views, rareFlows: 6, errors, networkRequests: network.length, checks: ['retirement cancel/confirm with Final Score and High Scores', 'saved high scores across new games', 'all captain and bottle decisions', 'Marie boarding/customs', 'moon purchase and winning ending', 'existing saves', 'no overflow at 320/360/390/620/1280']};
  fs.writeFileSync(root + '/tests/out/finishing-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
