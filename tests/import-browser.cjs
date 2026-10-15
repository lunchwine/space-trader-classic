// Import Save: overwrite warning while in a game, and the Import Save button in the New Commander dialog.
const {launch, root, assert, E} = require('./browser-helper.cjs');
(async () => {
  const L = await launch(), {page, browser, errors, state, screen} = L;
  const file = (name, s) => ({name, mimeType: 'application/json', buffer: Buffer.from(E.serialize(s))});
  const other = E.newGame(777, 0); other.commanderName = 'Imported'; other.credits = 4242; other.ui = {tab: 'info', selected: null};
  // From the title screen: Start -> New Commander dialog -> Import Save loads straight away (no warning).
  await screen('title'); await page.locator('[data-start-commander]').click(); await screen('newCommander');
  assert.equal(await page.locator('.modal-host [data-import-commander]').textContent(), 'Import Save');
  const pick = page.waitForEvent('filechooser'); await page.locator('.modal-host [data-import-commander]').click(); await (await pick).setFiles(file('a.json', other));
  await page.waitForFunction(() => Trial.state.credits === 4242); await screen('info'); assert.equal(await page.locator('.modal-host').count(), 0);
  // In a game: Game > Import Save asks first. NO keeps the game; YES opens the file chooser and overwrites.
  await L.gameMenu('import'); assert.equal(await L.modalTitle(), 'Import Save'); assert.match(await page.locator('.modal-host').textContent(), /overwrite your current game/);
  await L.no(); assert.equal((await state()).credits, 4242);
  const third = E.newGame(888, 0); third.credits = 5151; third.ui = {tab: 'info', selected: null};
  const chooser = page.waitForEvent('filechooser'); await L.gameMenu('import'); await L.yes(); const fc = await chooser; await fc.setFiles(file('b.json', third));
  await page.waitForFunction(() => Trial.state.credits === 5151); await screen('info');
  // New Game dialog opened from a running game also offers the import button.
  await L.gameMenu('new'); await L.yes(); await screen('newCommander'); await page.locator('#save-file').setInputFiles(file('a.json', other)); await page.waitForFunction(() => Trial.state.credits === 4242); await screen('info');
  assert.deepEqual(errors, []); console.log('import ok'); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
