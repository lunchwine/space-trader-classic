// Bank, escape pod and insurance through the v20 (original 1.3.5) screens and dialogs.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch(), {page, browser, errors, network, state, screen, click} = L;
  let reloads = 0;
  const reload = async () => { await L.reload(); reloads++; };
  const dismiss = () => page.locator('.modal-host [data-seq-ok],.modal-host [data-box],.modal-host [data-close-error]').first().click();
  const budget = op => page.locator(`[data-bank-budget=${op}]`).click();
  const maximum = op => page.locator(`.modal-host [data-bank-action=${op}][data-maximum]`).click();
  const amount = async (op, n) => { await budget(op); await page.locator('#native-amount').fill(String(n)); await page.locator(`.modal-host [data-bank-action=${op}]:not([data-maximum])`).click(); };
  const pod = a => page.locator(`.modal-host [data-bank-decision="${a}"]`).click();
  const stepThrough = async () => { for (let i = 0; i < 12; i++) { const ok = page.locator('.modal-host [data-seq-ok],.modal-host [data-arrest],.modal-host [data-acknowledge]').first(); if (!await ok.count()) return; await ok.click(); } };
  await L.loadFile(root + '/tests/fixtures/Space_Trader_Bank_Test_Save.json'); await screen('bank'); const initial = await state();
  // Insurance needs an escape pod: the original shows the No Escape Pod dialog.
  await page.locator('[data-bank-action=insure]').click(); assert.equal(await L.modalTitle(), 'No Escape Pod'); await L.no(); assert.equal((await state()).insurance, undefined);
  // An existing debt blocks equipment purchases (original error dialog); repayment unlocks them.
  await L.command('buyeq'); await page.locator('[data-equipment-buy]').first().click(); await screen('error'); assert.match(await page.locator('.modal-host').textContent(), /Repay your debt before buying equipment/); await dismiss();
  await L.command('bank'); await budget('repay'); assert.equal(await L.modalTitle(), 'Pay Back'); await page.locator('.modal-host [data-close-overlay]').click(); assert.equal((await state()).debt, 600);
  await budget('repay'); await maximum('repay'); await reload(); assert.equal((await state()).debt, 0); assert.equal((await state()).credits, 8400);
  await L.command('buyeq'); await page.locator('[data-equipment-buy]').first().click(); await screen('box'); assert.equal(await L.modalTitle(), 'Not Enough Slots'); await L.no();
  // Borrow and repay through the original amount dialogs.
  await L.command('bank'); await amount('borrow', 500); assert.equal((await state()).debt, 500); assert.equal((await state()).credits, 8900);
  await budget('repay'); await maximum('repay'); assert.equal((await state()).debt, 0);
  // Escape pod: NO changes nothing, YES buys it.
  await L.command('yard'); await page.locator('[data-bank-action=buyPod]').click(); await pod('no'); assert.equal((await state()).escapePod, undefined);
  await page.locator('[data-bank-action=buyPod]').click(); await reload(); await pod('yes'); assert.equal((await state()).escapePod, true); assert.equal((await state()).credits, 6400);
  // Insurance is bought without a prompt; the premium is charged on departure and the no-claim bonus grows.
  await L.command('bank'); await page.locator('[data-bank-action=insure]').click(); assert.equal((await state()).insurance, true); assert.equal(E.insuranceMoney(await state()), 22);
  const download = page.waitForEvent('download'); await L.gameMenu('export'); await (await download).saveAs(root + '/tests/out/bank-browser-save.json');
  const saved = await state(); await L.gameMenu('new'); await L.yes(); await L.newCommander(); await L.loadFile(root + '/tests/out/bank-browser-save.json'); assert.deepEqual(await state(), saved); reloads++;
  const s0 = await state(), target = s0.systems.find(t => t.id !== s0.current && E.distance(t, s0.systems[s0.current]) <= 14 && !E.wormholeExists(s0, s0.current, t.id));
  await L.target(target.id); assert.match(await page.locator('#screen').textContent(), /22/);
  const cash = (await state()).credits; await page.locator('.warp-button').click(); let s = await state();
  assert.equal(s.credits, cash - 22 - (s.pending?.services?.cost || 0)); assert.equal(s.noClaim, 1); await reload();
  await L.travel({untilArrival: 'stop'}); await L.seqOK(); await screen('info');
  assert.equal(E.insuranceMoney(await state()), 21);
  await L.command('bank'); const insure = () => page.locator('[data-bank-action=cancelInsurance]').click();
  await insure(); await reload(); await pod('no'); assert.equal((await state()).insurance, true);
  await insure(); await pod('yes'); assert.equal((await state()).insurance, false); assert.equal((await state()).noClaim, 0);
  // Actual destruction through combat with pod and insurance: three original dialogs, one payout.
  await L.loadFile(root + '/tests/fixtures/Space_Trader_Insurance_Test_Save.json'); await screen('encounter'); const endangered = await state();
  await page.locator('[data-combat="attack"]').click(); await screen('recovery'); assert.equal((await state()).pending.step, 'activated'); assert.equal(await L.modalTitle(), 'Escape Pod Activated'); await reload(); assert.equal((await state()).ended, false);
  await L.seqOK(); await screen('recovery'); s = await state();
  assert.equal(await L.modalTitle(), 'Insurance'); assert.equal(s.pending.payout, 8882); assert.equal(s.credits, 9382); assert.equal(s.days, endangered.days + 3); assert.equal(s.ship.type, 'FLEA'); await reload();
  await L.seqOK(); assert.equal(await L.modalTitle(), 'Flea Built'); await L.seqOK(); await screen('info');
  assert.equal((await state()).escapePod, false); assert.equal((await state()).insurance, false); assert.deepEqual((await state()).ship.weapons, []);
  // The same loss without insurance survives; the rescue-fee shortfall becomes debt.
  s = E.copy(endangered); s.insurance = false; s.noClaim = 0; s.credits = 100; await L.load(s);
  await page.locator('[data-combat="attack"]').click(); await stepThrough(); await screen('info'); s = await state(); assert.equal(s.credits, 0); assert.equal(s.debt, 400);
  // Ordinary prison cancels a policy but keeps the pod if the ship is retained.
  s = E.copy(initial); s.escapePod = s.insurance = true; s.noClaim = 30; s.trip = {target: target.id, clicks: 5, raided: false}; s.pending = {kind: 'arrest', step: 'sentence', fine: 100, days: 30}; s.ui = {tab: 'chart', selected: null};
  await L.load(s); await stepThrough(); await reload();
  assert.equal((await state()).insurance, false); assert.equal((await state()).escapePod, true);
  // Screens fit phone and desktop widths.
  await L.load(initial);
  for (const width of [320, 360, 390, 1280]) { await page.setViewportSize({width, height: 800}); await screen('bank'); await L.noOverflow(); await budget('repay'); await L.noOverflow(); await page.locator('.modal-host [data-close-overlay]').click(); await L.command('yard'); await L.noOverflow(); await L.command('bank'); }
  await page.setViewportSize({width: 360, height: 568}); await page.screenshot({path: root + '/tests/out/bank-phone.png', fullPage: true});
  await L.loadFile(root + '/tests/fixtures/Space_Trader_Insurance_Test_Save.json'); await page.locator('[data-combat="attack"]').click(); await page.screenshot({path: root + '/tests/out/recovery-phone.png', fullPage: true});
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {reloads, loanTransactions: 3, podPurchases: 1, insuredJourneys: 1, insuredRecoveries: 1, uninsuredRecoveries: 1, prisonPolicyCancellations: 1, viewports: [320, 360, 390, 1280], checks: ['No Escape Pod dialog', 'debt blocks equipment; repayment unlocks it', 'borrow/repay', 'pod purchase NO/YES', 'insurance premium and no-claim bonus on a journey', 'stop insurance resets no-claim', 'export/import', 'actual destruction through combat with insurance payout', 'uninsured survival and rescue debt', 'prison policy cancellation', 'no overflow/errors/network'], errors, networkRequests: network.length};
  fs.writeFileSync(root + '/tests/out/bank-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
