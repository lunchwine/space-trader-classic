// Touch pinch-zoom and long-press tracking on the Galactic Chart, and preferences kept by New Game.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch({viewport: {width: 360, height: 740}, hasTouch: true, isMobile: true}), {page, browser, errors, state, screen} = L;
  let s = E.newGame(2000, 0); s.options = {zoomGalaxy: true, trackLongPress: true}; s.reserveMoney = true; s.leaveEmpty = 2; s.ui = {tab: 'chart', chartMode: 'galaxy', selected: null};
  await L.load(s); await page.waitForFunction(() => Trial.state.options?.trackLongPress); await screen('chart');
  const cdp = await page.context().newCDPSession(page), box = await page.locator('.galaxy-map').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: points.map(([id, x, y]) => ({id, x, y, radiusX: 1, radiusY: 1, force: 1}))});
  // Long press on a system asks to track it (original Track System? dialog); YES tracks it.
  const dot = page.locator(`.galaxy-map g[data-map-focus="${s.current}"]`), r = await dot.boundingBox();
  await touch('touchStart', [[0, r.x + r.width / 2, r.y + r.height / 2]]); await page.locator('.modal-host').waitFor(); await touch('touchEnd', []);
  assert.equal(await L.modalTitle(), 'Track System?'); await L.yes(); assert.equal((await state()).ui.tracked, s.current);
  // Pinch outwards: the viewBox narrows (zoomed in).
  const width0 = Number((await page.locator('.galaxy-map').getAttribute('viewBox')).split(' ')[2]);
  await touch('touchStart', [[0, cx - 40, cy], [1, cx + 40, cy]]); await touch('touchMove', [[0, cx - 60, cy], [1, cx + 60, cy]]); await touch('touchEnd', []);
  assert.ok(Number((await page.locator('.galaxy-map').getAttribute('viewBox')).split(' ')[2]) < width0);
  // New Game keeps the spending preferences and options.
  await L.gameMenu('new'); await L.yes(); await L.newCommander();
  const out = await state(); assert.equal(out.reserveMoney, true); assert.equal(out.leaveEmpty, 2); assert.equal(out.options.trackLongPress, true);
  assert.deepEqual(errors, []);
  const result = {actualTouchPinch: true, actualTouchLongPress: true, newCommanderSpendingPreferences: true};
  fs.writeFileSync(root + '/tests/out/advanced-controls-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
