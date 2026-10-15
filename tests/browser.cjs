// Core trading/travel loop through the v20 (original 1.3.5) interface.
const {launch, root, assert} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch(), {page, browser, errors, network} = L, {state, screen} = L;
  const locked = async () => { assert.equal(await page.locator('#game-tabs').isVisible(), false); assert.equal(await page.locator('.modal-host .market,.modal-host .chart,.modal-host [data-service],#screen > .panel .market').count(), 0); };
  const amount = async (selector, n) => { await page.locator(selector).click(); await page.locator('#native-amount').fill(String(n)); await page.locator('.modal-host [data-quantity="confirm"]').click(); };
  // The title screen is shown when there is no saved game.
  await screen('title');
  await page.evaluate(() => localStorage.setItem('space-trader-port-experiment-v1', Trial.engine.serialize(Trial.engine.newFixtureGame())));
  await page.reload();
  await screen('buy'); assert.equal(await page.locator('#screen-title').textContent(), 'Buy Cargo'); assert.equal((await state()).credits, 1000);
  assert.match(await page.locator('.market-footer').textContent(), /Cash: 1000 cr\./);
  assert.equal(await page.locator('.market tbody tr').count(), 10); assert.equal(await page.locator('[data-sell]').count(), 0);
  await L.noOverflow();
  await page.screenshot({path: root + '/tests/out/phone-buy.png', fullPage: true});
  // Buy one Water through the original amount dialog (None / All / OK).
  await amount('[data-market-amount="WATER"][data-operation="buy"]', 1); assert.equal((await state()).credits, 963); assert.equal((await state()).ship.cargo.WATER, 1);
  await L.reload(); await screen('buy');
  await page.locator('#game-tabs [data-command="sell"]').click(); await screen('sell'); assert.equal(await page.locator('[data-buy]').count(), 0);
  await L.reload(); await screen('sell');
  // Short Range Chart -> Target System; cancelling does not advance the day.
  await L.target(1); assert.equal((await state()).days, 0); assert.equal(await page.locator('#screen-title').textContent(), 'Target System');
  await L.reload(); await screen('departure');
  await page.locator('[data-cancel-departure]').click(); await screen('chart'); assert.equal((await state()).days, 0);
  await L.tapSystem(1); await screen('departure'); await page.locator('.warp-button').click();
  await screen('encounter'); await locked(); await L.reload(); await screen('encounter');
  await page.screenshot({path: root + '/tests/out/phone-encounter.png', fullPage: true});
  let resultCount = 0;
  for (let i = 0; i < 200 && (await state()).trip; i++) {
    const s = await state(); assert.equal(s.ended, false);
    if (s.encounter && !s.pending) await page.locator('[data-combat="flee"]').click();
    else if (s.pending?.kind === 'result') {
      resultCount++; await screen('result'); await locked(); const before = await state();
      await L.reload(); await screen('result'); assert.equal((await state()).rng, before.rng);
      if (resultCount === 1) await page.screenshot({path: root + '/tests/out/phone-result.png', fullPage: true});
      await L.seqOK();
    } else throw Error('Travel stalled');
  }
  // The original shows the Arrival dialog over System Info; docked commands stay inactive until OK.
  assert.ok(resultCount > 0); await screen('arrival'); await page.keyboard.press('b'); await page.evaluate(() => document.querySelector('#game-tabs [data-command="buy"]').click()); await screen('arrival'); assert.equal(await page.locator('#menu-bar').isVisible(), false);
  await L.reload(); await screen('arrival');
  assert.equal(await L.modalTitle(), 'Arrival');
  assert.equal((await state()).current, 1); assert.equal((await state()).days, 1);
  await page.screenshot({path: root + '/tests/out/phone-arrival.png', fullPage: true});
  // The original arrival OK opens System Info.
  await L.seqOK(); await screen('info');
  await L.command('sell'); await screen('sell');
  await page.getByRole('button', {name: 'Sell all Water', exact: true}).click(); assert.equal((await state()).ship.cargo.WATER, 0);
  await page.locator('#game-tabs [data-command="yard"]').click(); await screen('yard'); await page.locator('[data-service="fuel"]').click(); assert.equal((await state()).ship.fuel, 14);
  await L.reload(); await screen('yard');
  // Export / Import Save (Game menu), New Game, and a rejected import.
  const downloadPromise = page.waitForEvent('download'); await L.gameMenu('export');
  const download = await downloadPromise; assert.equal(download.suggestedFilename(), 'space-trader-save.json'); await download.saveAs(root + '/tests/out/browser-save.json');
  const saved = await state();
  assert.deepEqual(JSON.parse(fs.readFileSync(root + '/tests/out/browser-save.json', 'utf8')), saved);
  await L.gameMenu('new'); assert.equal(await L.modalTitle(), 'New Game'); await L.yes(); await screen('newCommander');
  await L.newCommander(); await screen('info'); assert.notEqual((await state()).seed, saved.seed);
  await L.loadFile(root + '/tests/out/browser-save.json'); await screen('yard'); assert.deepEqual(await state(), saved);
  await page.locator('#save-file').setInputFiles({name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":7}')});
  await page.getByRole('alert').waitFor(); await screen('error'); assert.deepEqual(await state(), saved);
  await page.locator('[data-close-error]').click(); await screen('yard');
  // A second trip: buy -> Target System -> warp -> encounters/results -> arrival -> sell, entirely through the controls.
  await L.command('buy'); await amount('[data-market-amount="WATER"][data-operation="buy"]', 1);
  await L.warpTo(0);
  for (let i = 0; i < 200 && (await state()).trip; i++) {
    if ((await state()).encounter && !(await state()).pending) await page.locator('[data-combat="flee"]').click(); else await L.seqOK();
  }
  await screen('arrival'); await L.seqOK(); await screen('info'); assert.equal((await state()).current, 0);
  await L.command('sell'); await page.getByRole('button', {name: 'Sell all Water', exact: true}).click(); assert.equal((await state()).ship.cargo.WATER, 0);
  // Letting a surrendered pirate go is silent in the original: the journey simply continues.
  let fixture = await page.evaluate(() => { const E = Trial.engine; for (let seed = 0; seed < 100; seed++) { const s = E.newFixtureGame(seed, 0); E.beginTravel(s, 1); if (!s.encounter) continue; s.encounter.state = 'SURRENDER'; s.ui = {tab: 'chart', selected: null}; return s; } throw Error('No release fixture'); });
  await L.load(fixture); await screen('encounter');
  assert.deepEqual(await page.locator('.combat-actions button').allTextContents(), ['Attack', 'Ignore', 'Plunder']);
  await page.locator('[data-combat="continue"]').click(); assert.equal((await state()).encounter, null); assert.notEqual((await state()).pending?.kind, 'result'); assert.equal((await state()).pirateKills, 0); await L.reload();
  // Destroying a pirate: Bounty dialog and kill count.
  fixture = await page.evaluate(() => { const E = Trial.engine; for (let seed = 0; seed < 100; seed++) { const s = E.newFixtureGame(seed, 2); E.beginTravel(s, 1); if (!s.encounter) continue; s.encounter.opponent.hull = 1; const probe = E.copy(s); E.combat(probe, 'attack'); if (probe.pirateKills === 1) { s.ui = {tab: 'chart', selected: null}; return s; } } throw Error('No victory fixture'); });
  await L.load(fixture); const beforeVictory = (await state()).credits; await page.locator('[data-combat="attack"]').click(); await screen('result');
  assert.equal((await state()).pending.title, 'Bounty'); assert.equal(await L.modalTitle(), 'Bounty'); assert.equal((await state()).pirateKills, 1); assert.ok((await state()).credits > beforeVictory); await L.reload();
  // Destruction without an escape pod ends the game: You Lose, Final Score, then the title screen.
  fixture = await page.evaluate(() => { const E = Trial.engine; for (let seed = 0; seed < 100; seed++) { const s = E.newFixtureGame(seed, 4); E.beginTravel(s, 1); if (!s.encounter) continue; s.ship.hull = 1; s.encounter.state = 'ATTACK'; const probe = E.copy(s); E.combat(probe, 'attack'); if (probe.ended) { s.ui = {tab: 'chart', selected: null}; return s; } } throw Error('No death fixture'); });
  await L.load(fixture); await page.locator('[data-combat="attack"]').click(); assert.equal((await state()).ended, true);
  assert.equal(await L.modalTitle(), 'You Lose'); assert.equal(await page.locator('.modal-host [data-acknowledge],.modal-host [data-seq-ok]').count(), 0); await L.reload();
  assert.equal((await state()).ended, true); await screen('ended');
  await L.load(saved);
  await page.setViewportSize({width: 1280, height: 900}); await L.command('chart'); await screen('chart'); assert.equal(await page.locator('#screen-title').textContent(), 'Galactic Chart');
  await page.screenshot({path: root + '/tests/out/desktop-chart.png', fullPage: true}); await L.noOverflow();
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {phone: '360 × 568', desktop: '1280 × 900', passed: ['title screen without a save', 'separate Buy and Sell screens', 'original amount dialog purchase', 'Target System review and cancel without advancing day', 'exclusive encounter/result/arrival screens', 'no docked actions during travel', 'reload at each saved checkpoint', 'result dialogs acknowledged with OK', 'arrival OK opens System Info', 'two complete trading/travel loops', 'sell cargo', 'refueling', 'active screen persistence', 'Game menu export/import round trip', 'New Game confirm and new commander', 'bad import leaves current save intact', 'silent release of surrendered pirate', 'bounty dialog and kill', 'terminal You Lose dialog and reload', 'no phone/desktop overflow', 'zero browser exceptions', 'zero network requests'], errors, networkRequests: network.length};
  fs.writeFileSync(root + '/tests/out/browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result, null, 2)); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
