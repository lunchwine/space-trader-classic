// Police and trader encounters through the v20 (original 1.3.5) dialogs.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch({viewport: {width: 360, height: 568}}), {page, browser, errors, network, state, screen, click} = L;
  let reloads = 0;
  const reload = async () => { await L.reload(); reloads++; };
  const fixture = (kind = 'POLICE', phase = 'INSPECTION', credits = 1000) => {
    const s = E.newGame(2000, 0); s.credits = credits; s.trip = {target: 10, clicks: 11, raided: false, inspected: kind === 'POLICE'};
    s.encounter = {kind, state: phase, round: 0, opponent: E.makeShip('GNAT', {pilot: 3, fighter: 3, trader: 3, engineer: 3})};
    s.systems[10].government = 'ANARCHY'; s.ui = {tab: 'chart', selected: null}; return s;
  };
  const combat = m => page.locator(`[data-combat="${m}"]`).click();
  const decision = a => page.locator(`.modal-host [data-decision="${a}"]`).click();
  const locked = async () => assert.equal(await page.locator('#game-tabs').isVisible(), false);
  // Legal inspection: Submit gives the Nothing Found dialog.
  await L.load(fixture()); await screen('encounter'); await locked(); await reload();
  assert.deepEqual(await page.locator('.combat-actions button').allTextContents(), ['Attack', 'Flee', 'Submit', 'Bribe']);
  await combat('submit'); await screen('result'); assert.equal(await L.modalTitle(), 'Nothing Found'); assert.equal((await state()).policeScore, 1); await reload(); await L.seqOK();
  // Illegal goods: NO returns to the encounter, YES confiscates and fines.
  let s = fixture(); s.ship.cargo.FIREARMS = 2; s.ship.cargo.NARCOTICS = 1; s.costBasis.FIREARMS = 900; s.costBasis.NARCOTICS = 3000; await L.load(s);
  await combat('submit'); await screen('decision'); assert.equal(await L.modalTitle(), 'You Have Illegal Goods'); await reload();
  await decision('no'); await screen('encounter'); assert.equal((await state()).ship.cargo.NARCOTICS, 1);
  await combat('submit'); await decision('yes'); await screen('result'); assert.equal((await state()).ship.cargo.NARCOTICS, 0); assert.equal((await state()).policeScore, -1); await reload();
  // Bribe: pays the quoted amount, keeps the cargo and the journey continues silently (as in the original); FORGET IT changes nothing.
  s = fixture(); s.ship.cargo.FIREARMS = 1; await L.load(s); const price = E.encounterRules.bribe(s);
  await combat('bribe'); await decision('no'); await screen('encounter'); assert.equal((await state()).credits, 1000);
  await combat('bribe'); await reload(); await decision('yes'); assert.equal((await state()).credits, 1000 - price); assert.equal((await state()).ship.cargo.FIREARMS, 1); assert.equal((await state()).pending, null);
  // Not enough money for the bribe: the original asks twice (no contraband, then the price) and ends with Not Enough Cash.
  await L.load(fixture('POLICE', 'INSPECTION', 0)); await combat('bribe'); await decision('yes'); await decision('yes');
  await screen('notice'); assert.equal(await L.modalTitle(), 'Not Enough Cash'); assert.equal((await state()).credits, 0); await L.seqOK(); await screen('encounter');
  await combat('flee'); await decision('yes'); await screen('result'); assert.equal(await L.modalTitle(), 'Escaped'); assert.equal((await state()).policeScore, -5);
  // Trader offers: quoted buy and sell through the original Trade Offer dialog.
  for (const operation of ['buy', 'sell']) {
    s = fixture('TRADER', operation === 'buy' ? 'SELL' : 'BUY'); s.ship.cargo.WATER = operation === 'buy' ? 0 : 5; s.costBasis.WATER = operation === 'buy' ? 0 : 165; s.encounter.opponent.cargo.WATER = operation === 'buy' ? 12 : 0; await L.load(s);
    assert.deepEqual(await page.locator('.combat-actions button').allTextContents(), ['Attack', 'Ignore', 'Trade']);
    await combat('trade'); await screen('orbit'); assert.equal(await L.modalTitle(), 'Trade Offer'); await reload();
    const offer = await state(), quote = offer.pending.price; assert.equal(offer.pending.good, 'WATER');
    if (operation === 'buy') { await page.locator('#orbit-amount').fill('2'); await page.locator('.modal-host [data-orbit="quantity"]').click(); assert.equal((await state()).ship.cargo.WATER, 2); assert.equal((await state()).credits, 1000 - quote * 2); }
    else { await page.locator('.modal-host [data-orbit="maximum"]').click(); assert.equal((await state()).ship.cargo.WATER, 0); assert.equal((await state()).credits, 1000 + quote * 5); }
    assert.equal((await state()).encounter, null); await reload();
  }
  // Declining an offer (NONE) costs nothing.
  s = fixture('TRADER', 'SELL'); s.encounter.opponent.cargo.WATER = 12; await L.load(s); await combat('trade'); await page.locator('.modal-host [data-orbit="none"]').click(); assert.equal((await state()).credits, 1000);
  // Police surrender: confirmation, sentence, forced Flea; the antidote is delivered by the police without reward.
  s = fixture('POLICE', 'ATTACK', 0); s.policeScore = -30; s.debt = 100; s.quests.japori.status = 1; await L.load(s);
  await combat('surrender'); await screen('decision'); await reload(); await decision('yes');
  for (let i = 0; i < 12 && !(await state()).arrested && (await state()).trip; i++) { const ok = page.locator('.modal-host [data-seq-ok],.modal-host [data-arrest],.modal-host [data-acknowledge]').first(); if (!await ok.count()) break; await ok.click(); }
  const after = await state(); assert.equal(after.ship.type, 'FLEA'); assert.equal(after.quests.japori.resolvedByPolice, true); assert.equal(after.quests.japori.reward, null); await reload();
  // Every encounter screen fits phone and desktop widths.
  for (const width of [320, 360, 390, 1280]) {
    await page.setViewportSize({width, height: 800});
    for (const [kind, phase] of [['POLICE', 'INSPECTION'], ['POLICE', 'ATTACK'], ['TRADER', 'SELL']]) { const t = fixture(kind, phase); if (kind === 'TRADER') t.encounter.opponent.cargo.WATER = 12; await L.load(t); await L.noOverflow(); }
  }
  await page.setViewportSize({width: 360, height: 568}); await L.load(fixture()); await page.screenshot({path: root + '/tests/out/police-phone.png', fullPage: true});
  s = fixture('TRADER', 'SELL'); s.encounter.opponent.cargo.WATER = 12; await L.load(s); await combat('trade'); await page.screenshot({path: root + '/tests/out/trader-offer-phone.png', fullPage: true});
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const summary = {reloads, viewports: [320, 360, 390, 1280], passed: ['legal inspection', 'contraband confirm/cancel/confiscation', 'bribe payment, cancel and insufficient money', 'inspection refusal', 'quoted buy and sell', 'offer decline', 'police surrender and release', 'antidote delivered by police without reward', 'no overflow/errors/network'], errors, networkRequests: network.length};
  fs.writeFileSync(root + '/tests/out/encounter-browser-summary.json', JSON.stringify(summary, null, 2) + '\n'); console.log(summary); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
