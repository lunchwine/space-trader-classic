// Campaign quests (port events, deliveries, rewards) through the v20 (original 1.3.5) System Info "Special" dialogs.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const F = require('./campaign-fixtures.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch(), {page, browser, errors, network, state, screen} = L;
  let reloads = 0, rounds = 0, events = 0;
  const reload = async () => { await L.reload(); reloads++; };
  const modal = '.modal-host [data-special="yes"],.modal-host [data-seq-ok],.modal-host [data-box]';
  // Open the port event from System Info and accept it; further dialogs of the sequence are acknowledged.
  const event = async () => {
    await L.command('info'); await page.locator('[data-open-port-event]').click(); await screen('special'); await reload();
    for (let i = 0; i < 8; i++) { const b = page.locator(modal).first(); if (!await b.count()) break; await b.click(); }
    events++; await screen('info');
  };
  const choose = s => { const e = s.encounter; return e.kind === 'SCARAB' ? 'attack' : e.kind === 'POLICE' && e.state === 'INSPECTION' ? 'submit' : ['IGNORE', 'FLEE', 'SURRENDER', 'BUY', 'SELL'].includes(e.state) ? 'continue' : 'flee'; };
  const P = F.practices();
  // Skill Increase: "Not now" changes nothing; accepting costs money and adds three skill points.
  await L.load(P.port); await L.command('info'); await page.locator('[data-open-port-event]').click(); await page.locator('.modal-host [data-special="no"]').click(); await screen('info');
  const unchanged = await state(); assert.equal(unchanged.credits, 10000); assert.equal(unchanged.pending, null);
  await event(); let s = await state(); assert.equal(s.credits, 7000); assert.equal(Object.values(s.ship.skills).reduce((a, b) => a + b, 0), 13);
  assert.equal(await page.locator('[data-open-port-event]').isVisible(), false);
  // Wild Gets Out: the quarters are freed and Zeethibal can be hired without wages.
  await L.load(P.wild); await L.command('personnel'); await screen('crew'); assert.match(await page.locator('#screen').textContent(), /Wild's quarters/);
  await event(); assert.equal((await state()).wildStatus, 2);
  await L.command('personnel'); await page.locator('[data-crew-hire]').click(); await reload(); assert.equal(E.mercenaryMoney(await state()), 0);
  // Scarab: real wormhole combat and reinforcement, then the hull upgrade events.
  await L.load(P.scarab); await screen('encounter'); await reload();
  while ((await state()).trip) { s = await state(); assert.ok(rounds++ < 300); if (s.encounter && !s.pending) await page.locator(`[data-combat="${choose(s)}"]`).click(); else await L.travel({choose, untilArrival: 'stop'}); }
  await screen('arrival'); await L.seqOK(); await event(); await event(); s = await state(); assert.equal(s.scarabStatus, 3); assert.equal(E.hullMaximum(s), 250); await reload();
  // Source journeys reach every other delivery; the dialogs claim the rewards.
  for (const key of ['artifact', 'monster', 'dragonfly', 'invasion', 'experiment', 'reactor']) {
    s = F.event(F.fresh(key));
    if (key === 'dragonfly') { for (const id of ['baratas', 'melina', 'regulas']) F.event(F.go(s, s.destinations[id])); F.go(s, s.destinations.zalkon); } else F.go(s, s.campaigns[key].target);
    s.ui = {tab: 'info', selected: null}; await L.load(s); await event();
    if (['dragonfly', 'invasion', 'reactor'].includes(key)) { s = await state(); if (key === 'dragonfly') { s.ship.shields.pop(); s.ship.shieldStrength.pop(); } if (key === 'reactor') s.ship.weapons.pop(); await L.load(s); await event(); }
    assert.equal((await state()).campaigns[key].outcome, 'complete');
  }
  // Free equipment stays blocked until there is a slot; the offer is preserved.
  s = F.event(F.fresh('dragonfly')); s.current = s.destinations.zalkon; s.dragonflyStatus = 5; s.campaigns.dragonfly.outcome = 'reward'; s.systems[s.current].special = 'INSTALLLIGHTNINGSHIELD'; s.ui = {tab: 'info', selected: null}; await L.load(s);
  await L.command('info'); await page.locator('[data-open-port-event]').click(); await reload();
  assert.equal(await page.locator('.modal-host [data-special="yes"]').isEnabled(), false); await page.locator('.modal-host [data-special="no"]').click(); await screen('info');
  // Special equipment transfer: the original lists the unique items with their fees and the choice persists.
  s = F.fresh('monster'); s.systems[s.current].tech = 7; s.ui = {tab: 'ship', selected: null}; await L.load(s);
  await L.command('yard'); await page.locator('[data-tab=ships]').click(); await page.locator('[data-yard-ship="GRASSHOPPER"]').click(); await screen('purchase');
  const base = (await state()).pending.quote.price;
  for (const id of ['LIGHTNING', 'FUELCOMPACTOR', 'MORGAN']) await page.locator(`[data-transfer="${id}"]`).check();
  assert.equal((await state()).pending.quote.price, base + 83333); await reload();
  await page.locator('.modal-host [data-purchase="yes"]').click(); while (await page.locator('.modal-host [data-seq-ok]').count()) await L.seqOK();
  assert.deepEqual((await state()).ship.weapons, ['MORGAN']);
  // The experiment reward is a one-use Singularity jump from the Galactic Chart "J" button (needs a tracked system).
  s = F.event(F.fresh('experiment')); F.go(s, s.campaigns.experiment.target); F.event(s); s.ui = {tab: 'chart', chartMode: 'galaxy', selected: null}; await L.load(s); assert.equal((await state()).canSuperWarp, true);
  await L.command('chart'); await page.locator('[data-jump]').click(); assert.equal(await L.modalTitle(), 'No System Selected'); await L.no();
  const dest = s.systems.find(x => x.id !== s.current).id; await page.locator('[data-find-system]').click(); await page.locator('#system-search').fill(s.systems[dest].name); await page.locator('#find-track').check(); await page.locator('.modal-host [data-find-confirm]').click();
  await page.locator('[data-jump]').click(); assert.match(await L.modalTitle(), /Singularity/i); await L.no(); assert.equal((await state()).canSuperWarp, true);
  const beforeJump = await state(); await page.locator('[data-jump]').click(); await L.yes(); const afterJump = await state();
  assert.equal(afterJump.canSuperWarp, false); assert.equal(afterJump.credits, beforeJump.credits); await reload();
  for (const width of [320, 360, 390, 1280]) { await page.setViewportSize({width, height: 800}); await L.noOverflow(); }
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {events, combatActions: rounds, reloads, missions: 8, viewports: [320, 360, 390, 1280], checks: ['port event not now/accept/reload', 'Wild quarters and free Zeethibal hiring', 'Scarab wormhole combat and hull events', 'all remaining delivery/reward events', 'blocked reward slots', 'special equipment transfer fees', 'one-use singularity jump from the Galactic Chart', 'no page errors, overflow or network requests'], errors, networkRequests: network.length};
  fs.writeFileSync(root + '/tests/out/campaign-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(result); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
