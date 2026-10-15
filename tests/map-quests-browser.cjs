// Quests list, newspaper headline, Galactic Chart Find and tracking through the v20 (original 1.3.5) screens.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch({viewport: {width: 360, height: 568}, hasTouch: true, isMobile: true}), {page, browser, errors, state, screen} = L;
  const modal = '.modal-host [data-special="yes"],.modal-host [data-seq-ok]';
  const quests = async () => { await L.command('status'); await page.locator('#screen [data-tab=quests]').click(); await screen('quests'); return page.locator('#screen').textContent(); };
  const tapFocus = async id => { const b = await page.locator(`.native-chart g[data-map-focus="${id}"]`).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
  // The Quests list shows only open assignments; a port event stays offered until accepted.
  let s = E.newGame(2000, 0, {autoFuel: true, autoRepair: true}); s.current = s.systems.find(x => x.special === null).id; s.ui = {tab: 'status', selected: null}; await L.load(s);
  assert.match(await quests(), /There are no open quests/);
  s.current = E.campaignRules.find(s, 'ALIENARTIFACT'); s.ui = {tab: 'info', selected: null}; await L.load(s);
  await page.locator('[data-open-port-event]').click(); for (let i = 0; i < 6; i++) { const b = page.locator(modal).first(); if (!await b.count()) break; await b.click(); }
  assert.match(await quests(), /Deliver the alien artifact to professor Berger/); assert.doesNotMatch(await page.locator('#screen').textContent(), /Dragonfly|Jarek|Japori/);
  s = await state(); s.current = s.campaigns.artifact.target; E.campaignRules.open(s); E.campaignRules.respond(s, true); E.campaignRules.respond(s, true); s.ui = {tab: 'status', selected: null}; await L.load(s);
  assert.match(await quests(), /There are no open quests/);
  // The exact escaped Android headline displays a single percent sign.
  s = E.newGame(2000, 0); s.credits = 10000; s.ui = {tab: 'info', selected: null}; for (const sys of s.systems) { sys.status = 'UNEVENTFUL'; sys.special = null; } s.systems[s.current].government = 'THEOCRACY';
  let temple = false, editions = 0;
  for (let day = 0; day < 24 && !temple; day++) {
    s.days = day; await L.load(s); await page.locator('[data-news]').click(); await page.locator('.modal-host [data-read-news]').click();
    const text = await page.locator('.newspaper').textContent(); assert.equal(text.includes('%%'), false);
    if (text.includes('Temple Restoration Fund')) { assert.match(text, /Temple Restoration Fund at 81%\./); temple = true; }
    await page.locator('.modal-host [data-close-overlay]').click(); editions++;
  }
  assert.ok(temple, 'The reported temple headline was reproduced');
  // Find from the Galactic Chart selects and tracks the system; the tracking mark persists across reloads.
  s = E.newGame(2000, 0, {autoFuel: true, autoRepair: true}); s.credits = 500000; s.ui = {tab: 'chart', chartMode: 'galaxy', selected: null}; await L.load(s);
  const far = s.systems.filter(x => E.routeTo(s, x.id)?.length > 3).sort((a, b) => E.distance(s.systems[s.current], b) - E.distance(s.systems[s.current], a))[0]; assert.ok(far);
  await L.command('chart'); await page.locator('[data-find-system]').click(); await page.locator('#system-search').fill(far.name); await page.locator('#find-track').check(); await page.locator('.modal-host [data-find-confirm]').click();
  assert.equal(await page.locator('.galaxy-map').count(), 1); assert.equal(await page.locator(`[data-map-selection="${far.id}"]`).count(), 1); assert.equal(await page.locator(`[data-map-tracked="${far.id}"]`).count(), 1); assert.equal((await state()).ui.tracked, far.id);
  await page.reload(); assert.equal((await state()).ui.tracked, far.id);
  // Tapping another system focuses it; tapping it again asks whether to switch tracking (NO keeps the old one, YES switches).
  const other = s.systems.find(x => x.id !== s.current && x.id !== far.id);
  await tapFocus(other.id); assert.equal((await state()).ui.mapFocus, other.id); assert.equal(await page.locator(`[data-map-selection="${other.id}"]`).count(), 1);
  await tapFocus(other.id); assert.equal(await L.modalTitle(), 'Track System?'); await L.no(); assert.equal((await state()).ui.tracked, far.id);
  await tapFocus(other.id); await L.yes(); assert.equal((await state()).ui.tracked, other.id);
  await tapFocus(other.id); assert.equal(await L.modalTitle(), 'Track System?'); await L.yes(); assert.equal((await state()).ui.tracked, undefined);
  // Find without "Track this system" only focuses the system.
  await page.locator('[data-find-system]').click(); await page.locator('#system-search').fill(far.name); await page.locator('#find-track').uncheck(); await page.locator('.modal-host [data-find-confirm]').click();
  assert.equal((await state()).ui.mapFocus, far.id); assert.equal((await state()).ui.tracked, undefined);
  for (const width of [320, 360, 412, 640, 1280]) { await page.setViewportSize({width, height: 800}); await L.noOverflow(); }
  assert.deepEqual(errors, []);
  const result = {newspaperEditions: editions, exactTempleHeadline: true, questVisibility: 'only open assignments and current-port events', findTracking: true, mapTouchSelection: true, widths: [320, 360, 412, 640, 1280], errors};
  fs.writeFileSync(root + '/tests/out/map-quests-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
