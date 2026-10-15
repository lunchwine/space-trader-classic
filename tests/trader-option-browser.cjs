// "Ignore: Traders" option (original Options dialog): toggle, reload, export/import and new-commander retention.
const {launch, root, assert} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch(), {page, browser, errors, network} = L;
  const box = () => page.locator('.modal-host [data-arrival-option="ignoreTraders"]');
  await L.screen('title');
  await L.options(); await L.screen('options'); assert.equal(await L.modalTitle(), 'Options');
  // Original label: the third checkbox in the "Always ignore when it is safe:" row.
  assert.equal((await page.locator('.modal-host .opt-label').first().textContent()).trim(), 'Always ignore when it is safe:');
  assert.equal((await box().locator('xpath=..').textContent()).trim(), 'Traders');
  assert.equal(await page.getByRole('checkbox', {name: 'Traders', exact: true}).count(), 1);
  assert.equal(await box().isChecked(), false); await box().check(); assert.equal(await page.evaluate(() => Trial.state.options.ignoreTraders), true);
  await page.reload(); await L.options(); assert.equal(await box().isChecked(), true);
  const save = await page.evaluate(() => Trial.engine.serialize(Trial.state));
  await box().uncheck(); assert.equal(await page.evaluate(() => Trial.state.options.ignoreTraders), false);
  await L.closeOptions(); await L.screen('title');
  await page.locator('#save-file').setInputFiles({name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(save)});
  await page.waitForFunction(() => Trial.state.options.ignoreTraders === true);
  await L.options(); assert.equal(await box().isChecked(), true); await L.closeOptions();
  // New Game keeps the option (the original keeps preferences across new commanders).
  await L.gameMenu('new'); await L.newCommander(); await L.screen('info');
  assert.equal(await page.evaluate(() => Trial.state.options.ignoreTraders), true);
  await L.options(); assert.equal(await box().isChecked(), true); await L.closeOptions();
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {toggle: true, reload: true, exportImport: true, newCommanderPreference: true, errors};
  fs.writeFileSync(root + '/tests/out/trader-option-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
