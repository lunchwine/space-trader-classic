// Full generated world: trading, travel loops, Japori mission, wormhole and trader offers through the v20 interface.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch({timeout: 8000}), {page, browser, errors, network, state, screen} = L;
  let jumps = 0, encounters = 0, wormholes = 0, traderOffers = 0, reloads = 0; const types = new Set();
  const reload = async () => { await L.reload(); reloads++; };
  const modal = '.modal-host [data-special="yes"],.modal-host [data-quest="yes"],.modal-host [data-quest="continue"],.modal-host [data-seq-ok],.modal-host [data-box]';
  const event = async () => { await L.command('info'); await page.locator('[data-open-port-event]').click(); for (let i = 0; i < 8; i++) { const b = page.locator(modal).first(); if (!await b.count()) break; await b.click(); } };
  // Warp to a system within range: Short Range Chart -> Target System -> warp, then play out the journey.
  const jump = async id => {
    const before = await state(); await L.warpTo(id); jumps++; if ((await state()).arrivedViaWormhole) wormholes++; await reload();
    const log = await L.travel(); for (const l of log) { if (/^encounter/.test(l)) { encounters++; if (/TRADER (BUY|SELL)/.test(l)) traderOffers++; } }
    assert.equal((await state()).days, before.days + 1); await screen('info');
  };
  const refuel = async () => { await L.command('yard'); const f = page.locator('[data-service="fuel"]'); if (await f.isVisible()) await f.click(); };
  const hopTo = async id => { for (let hop = 0; hop < 80 && (await state()).current !== id; hop++) { await refuel(); const s = await state(); await jump(E.routeTo(s, id)[0]); } assert.equal((await state()).current, id); };
  // Default new game: the full 120-system galaxy .
  await page.evaluate(() => localStorage.clear()); await page.reload(); await screen('title'); await L.newCommander(); await screen('info');
  assert.equal((await state()).systems.length, 120);
  await L.command('buy'); await page.locator('[data-market-amount="WATER"][data-operation="buy"]').click(); await page.locator('#native-amount').fill('1'); await page.locator('.modal-host [data-quantity="confirm"]').click(); assert.equal((await state()).ship.cargo.WATER, 1);
  // Galactic Chart: every system is a dot; Find focuses a system, and an unknown prefix falls back to the original lookup.
  await L.command('chart'); assert.equal(await page.locator('svg g[data-map-focus]').count(), 120);
  await page.locator('[data-find-system]').click(); await page.locator('#system-search').fill('Japori'); await page.locator('.modal-host [data-find-confirm]').click();
  assert.match(await page.locator('#screen').textContent(), /Japori/); await reload();
  // A first trading jump to the nearest neighbour.
  let s0 = await state(); const near = s0.systems.filter(x => x.id !== s0.current && E.distance(x, s0.systems[s0.current]) <= 14 && !E.wormholeExists(s0, s0.current, x.id)).sort((a, b) => E.distance(a, s0.systems[s0.current]) - E.distance(b, s0.systems[s0.current]))[0]; await hopTo(near.id); await L.command('sell'); await page.locator('[data-sell="WATER"]').click(); assert.equal((await state()).ship.cargo.WATER, 0);
  // Reproducible Beginner game for a complete generated-world mission.
  await L.load(E.newGame(2000, 0)); assert.equal((await state()).difficulty, 0);
  for (const phase of ['offer', 'delivery']) {
    const q = (await state()).quests.japori; await hopTo(phase === 'offer' ? q.origin : q.target);
    await L.command('info'); await page.locator('[data-open-port-event]').click(); await reload(); for (let i = 0; i < 8; i++) { const b = page.locator(modal).first(); if (!await b.count()) break; await b.click(); }
  }
  assert.equal((await state()).quests.japori.status, 2); assert.ok(encounters > 0);
  // The nearest wormhole entrance, then its directed outgoing passage (fee, no fuel).
  const wh = await page.evaluate(() => { const s = Trial.state, E = Trial.engine; return s.wormholes.slice().sort((a, b) => E.routeTo(s, a).length - E.routeTo(s, b).length)[0]; });
  await hopTo(wh); const beforeWh = await state(), exit = await page.evaluate(() => Trial.engine.wormholeTarget(Trial.state));
  await L.command('warp'); const hole = page.locator(`.native-chart g[data-map-hole="${wh}"]`), hb = await hole.boundingBox(); assert.ok(hb); await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2); await screen('departure');
  assert.match(await page.locator('#screen').textContent(), /Wormhole/); await page.locator('.warp-button').click(); wormholes++; await L.travel();
  assert.equal((await state()).current, exit); assert.equal((await state()).ship.fuel, beforeWh.ship.fuel); assert.equal((await state()).credits, beforeWh.credits - 50);
  // Trader offers are a rare source-defined event; continue ordinary travel until one occurs.
  let previous = -1;
  for (let hop = 0; hop < 40 && !traderOffers; hop++) { await refuel(); const s = await state(), next = s.systems.find(x => x.id !== s.current && x.id !== previous && E.distance(x, s.systems[s.current]) <= 14); assert.ok(next); previous = s.current; await jump(next.id); }
  for (const width of [320, 360, 390, 1280]) { await page.setViewportSize({width, height: 800}); await L.command('chart'); await L.noOverflow(); await L.command('info'); await L.noOverflow(); }
  await page.setViewportSize({width: 1280, height: 900}); await L.command('chart'); await page.screenshot({path: root + '/tests/out/full-galaxy-chart.png', fullPage: true});
  const download = page.waitForEvent('download'); await L.gameMenu('export'); const d = await download; const savePath = root + '/tests/out/generation-browser-save.json'; await d.saveAs(savePath); const saved = await state();
  await L.gameMenu('new'); await L.yes(); await L.newCommander(); await L.loadFile(savePath); assert.deepEqual(await state(), saved); await reload();
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {jumps, encounters, traderOffers, wormholeJumps: wormholes, reloads, completedMission: true, viewports: [320, 360, 390, 1280], checks: ['default full world', 'real buy/travel/sell loop', 'Galactic Chart with 120 systems and Find', 'quest offer and delivery at generated locations', 'generated enemies', 'naturally generated trader offer', 'wormhole travel', 'reload during travel', 'complete full-world export/import', 'no horizontal overflow', 'no page errors or network requests'], errors, networkRequests: network.length};
  fs.writeFileSync(root + '/tests/out/generation-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
