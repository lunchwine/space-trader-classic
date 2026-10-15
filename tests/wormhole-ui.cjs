// Wormhole entrances on the Short Range and Galactic Charts, driven through the real v20 UI in Chromium.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch(), {page, browser, errors, state, screen} = L;
  let checks = 0; const check = (a, b) => { assert.deepEqual(a, b); checks++; };
  const base = () => { const s = E.newGame(2000, 0); s.credits = 10000; s.ship.fuel = 0; return s; };
  const tap = async selector => { const b = await page.locator(selector).boundingBox(); assert.ok(b, selector); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
  const entrances = base().wormholes;
  // Standing at an entrance, the hole opens Target System for its exit at zero fuel; the warp costs only the 50 cr. fee.
  for (const width of [320, 360, 412, 640]) for (const entry of entrances) {
    await page.setViewportSize({width, height: 800});
    const s = base(); s.current = entry; s.ui = {tab: 'chart', chartMode: 'local', selected: null}; await L.load(s); await L.command('warp');
    await tap(`.native-chart g[data-map-hole="${entry}"]`); const exit = E.wormholeTarget(s, entry);
    check((await state()).ui.selected, exit); await screen('departure'); check(/Wormhole/.test(await page.locator('#screen').textContent()), true); check((await state()).ship.fuel, 0); check((await state()).credits, 10000);
    await L.reload(); check((await state()).ui.selected, exit);
    await page.locator('.warp-button').click(); check((await state()).ship.fuel, 0); check((await state()).credits, 9950); check((await state()).days, 1); check((await state()).trip?.target ?? (await state()).current, exit);
  }
  // Galactic Chart: the hole draws a link to its exit and shows its name; the system dot stays independent.
  await page.setViewportSize({width: 360, height: 568});
  for (const entry of entrances) {
    const s = base(); s.current = entry; s.ui = {tab: 'chart', chartMode: 'galaxy', selected: null, mapFocus: entry}; await L.load(s); await L.command('chart');
    await tap(`.galaxy-map g[data-map-hole="${entry}"]`); check(await page.locator(`[data-wormhole-link="${entry}"]`).count(), 1);
    assert.match(await page.locator('#screen').textContent(), new RegExp('to ' + s.systems[E.wormholeTarget(s, entry)].name)); checks++;
    check((await state()).ui.selected ?? null, null);
  }
  // An entrance that is not the current system cannot be used: the original Wormhole Unreachable dialog.
  const s = base(), entry = s.wormholes[0]; s.current = s.systems.find(x => x.id !== entry && Math.abs(x.x - s.systems[entry].x) <= 20 && Math.abs(x.y - s.systems[entry].y) <= 20).id;
  s.ui = {tab: 'chart', chartMode: 'local', selected: null}; await L.load(s); await L.command('warp'); await tap(`.native-chart g[data-map-hole="${entry}"]`);
  check(await L.modalTitle(), 'Wormhole Unreachable'); assert.match(await page.locator('.modal-host').textContent(), new RegExp('only accessible from ' + s.systems[entry].name)); checks++;
  check((await state()).credits, 10000); check((await state()).ship.fuel, 0);
  assert.deepEqual(errors, []);
  const result = {checks, entrances: entrances.length, widths: [320, 360, 412, 640], zeroFuelTrips: entrances.length * 4, remoteEntranceBlocked: true, failures: 0, environment: 'headless Chromium through the v20 interface'};
  fs.writeFileSync(root + '/tests/out/wormhole-ui-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
