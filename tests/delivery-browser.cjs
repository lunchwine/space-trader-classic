// Spot-check saves: Captain Ahab training and the Utopia moon retirement through the v20 dialogs.
const {launch, root, assert} = require('./browser-helper.cjs');
(async () => {
  const L = await launch({viewport: {width: 390, height: 844}}), {page, browser, errors, state, screen} = L;
  assert.equal(await page.locator('#screen').getAttribute('data-screen'), 'title');
  await L.loadFile(root + '/tests/fixtures/Space_Trader_Captain_Spot_Check.json'); await screen('encounter'); assert.match(await page.locator('#screen').textContent(), /Captain Ahab/);
  await page.locator('[data-combat="meet"]').click(); await screen('rareDecision'); assert.match(await page.locator('.modal-host').textContent(), /reflective shield/);
  await page.locator('[data-rare="yes"]').click(); assert.equal((await state()).ship.skills.pilot, 7); assert.equal((await state()).ship.shields.includes('REFLECTIVE'), false); await L.reload(); assert.equal((await state()).ship.skills.pilot, 7);
  await L.loadFile(root + '/tests/fixtures/Space_Trader_Moon_Spot_Check.json'); const s = await state(); assert.ok(s.moonBought && s.current === s.destinations.utopia);
  await L.command('info'); await page.locator('[data-open-port-event]').click(); await screen('special'); assert.match(await page.locator('.modal-host').textContent(), /moon|Retirement/i);
  await page.locator('.modal-host [data-special="yes"]').click(); assert.equal((await state()).finalResult.status, 'MOON'); await L.reload(); assert.equal((await state()).finalResult.status, 'MOON');
  for (const width of [320, 390, 1280]) { await page.setViewportSize({width, height: 844}); await L.noOverflow(); }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({checks: ['captain import and training', 'captain reload', 'Utopia port event and retirement', 'ending reload', 'no errors or overflow'], passed: true})); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
