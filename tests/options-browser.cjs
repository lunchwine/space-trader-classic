// Options "Prev. screen with back button", "Animate encounters" and "Extra shortcuts in footer" (all off by default),
// following MainActivity.onBackPressed/setCurrentScreenType, GameState.animateAttack/animateEnterExit and footer_shortcuts.
const {launch, root, assert, E} = require('./browser-helper.cjs');
const fs = require('node:fs');
(async () => {
  const L = await launch(), {page, browser, errors, network, state, screen} = L;
  const option = name => page.locator(`.modal-host [data-game-option="${name}"]`);
  const setOption = async (name, on) => { await L.options(); await L.screen('options'); if (on) await option(name).check(); else await option(name).uncheck(); await L.closeOptions(); };
  const depth = () => page.evaluate(() => [history.length, history.state?.stDepth]);
  const stack = async () => ((await state()).ui.backStack || []).map(x => x.type);
  const back = async () => { await page.goBack(); await page.waitForTimeout(50); };

  // Defaults: encounterAnim and extraShortcuts unchecked as in the original; recallScreens is on by default in this port.
  await L.screen('title'); await L.options();
  assert.equal(await option('recallScreens').isChecked(), true, 'recallScreens');
  for (const name of ['encounterAnim', 'extraShortcuts']) assert.equal(await option(name).isChecked(), false, name);
  await L.closeOptions(); await L.newCommander(); await screen('info');

  // 1. Prev. screen with back button.
  // Off: screens are still tracked (the original keeps mBackStack regardless) but no history entries are added,
  // so the back button keeps its default (leave the page / original Exit prompt).
  await setOption('recallScreens', false);
  const [len0] = await depth();
  await L.command('buy'); await screen('buy'); await L.command('sell'); await screen('sell');
  assert.deepEqual(await stack(), ['BUY', 'INFO']); assert.deepEqual(await depth(), [len0, 0]);
  // On: one history entry per stacked screen; back pops docked screens in reverse order.
  await setOption('recallScreens', true); assert.equal((await state()).options.recallScreens, true);
  assert.deepEqual(await depth(), [len0 + 2, 2]);
  await L.command('bank'); await screen('bank'); await L.command('chart'); await screen('chart');
  assert.deepEqual(await stack(), ['BANK', 'SELL', 'BUY', 'INFO']); assert.deepEqual((await depth())[1], 4);
  // Same screen again: no push (type == prevType).
  await L.command('chart'); assert.deepEqual(await stack(), ['BANK', 'SELL', 'BUY', 'INFO']);
  // The stack is saved with the game (MainActivity.saveState "backstack_i") and survives a reload.
  await page.reload(); await screen('chart'); assert.deepEqual(await stack(), ['BANK', 'SELL', 'BUY', 'INFO']);
  await back(); await screen('bank'); await back(); await screen('sell');
  // Back while the action-mode menu is open only closes the menu (finishMenuActionMode).
  await L.openMenu(); assert.equal(await page.locator('#menu-bar').isVisible(), true);
  // The APK closes the open dropdown first, then the bar (two presses).
  await back(); assert.equal(await page.locator('#menu-bar').isVisible(), true); assert.equal(await page.locator('[data-menu-item]').count(), 0);
  await back(); assert.equal(await page.locator('#menu-bar').isVisible(), false); await screen('sell'); assert.deepEqual(await stack(), ['BUY', 'INFO']);
  // Back with a dialog open dismisses the dialog only (Android's DialogFragment takes the key); screen and stack are unchanged.
  { const before = await stack(); await L.options(); assert.equal(await page.locator('.modal-host').isVisible(), true);
    await back(); assert.equal(await page.locator('.modal-host .native-options').count(), 0); await screen('sell'); assert.deepEqual(await stack(), before); }
  await L.openMenu(); await page.locator('#menu-bar [data-menu-close]').click(); assert.deepEqual((await depth())[1], 2); // re-synced on the next user action
  await back(); await screen('buy'); await back(); await screen('info'); assert.deepEqual(await stack(), []); assert.equal((await depth())[1], 0);
  // Target System / Average Price List are docked screens too.
  const s0 = await state(), here = s0.systems[s0.current];
  const near = s0.systems.filter(x => x.id !== s0.current && Math.hypot(x.x - here.x, x.y - here.y) <= s0.ship.fuel).sort((a, b) => Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(b.x - here.x, b.y - here.y))[0];
  await L.target(near.id); assert.deepEqual(await stack(), ['WARP', 'INFO']);
  await page.locator('[data-target-prices]').first().click(); assert.deepEqual(await stack(), ['TARGET', 'WARP', 'INFO']);
  await back(); await screen('departure'); assert.equal((await state()).ui.selected, near.id);
  // Travelling (Encounter screen / arrival on System Info) clears the stack and the extra history entries.
  await page.locator('.warp-button').click(); await L.travel(); await screen('info');
  await page.waitForTimeout(100); assert.deepEqual(await stack(), []); assert.equal((await depth())[1], 0);
  // Off again: entries are rewound and back does nothing to the screens.
  await L.command('buy'); await L.command('sell'); assert.equal((await depth())[1], 2);
  await setOption('recallScreens', false); await page.waitForTimeout(100); assert.equal((await depth())[1], 0); assert.deepEqual(await stack(), ['BUY', 'INFO']);

  // 3. Extra shortcuts in footer: B S Y E Q P K I C G W, equal width, on docked screens only.
  assert.equal(await page.locator('#footer-shortcuts').isVisible(), false);
  await setOption('extraShortcuts', true); await screen('sell');
  assert.equal(await page.locator('#footer-shortcuts').isVisible(), true);
  assert.deepEqual(await page.locator('#footer-shortcuts button').allTextContents(), ['B', 'S', 'Y', 'E', 'Q', 'P', 'K', 'I', 'C', 'G', 'W']);
  const boxes = await page.locator('#footer-shortcuts button').evaluateAll(b => b.map(x => x.getBoundingClientRect()).map(r => [Math.round(r.width), Math.round(r.bottom)]));
  assert.ok(boxes.every(([w, bottom]) => Math.abs(w - boxes[0][0]) <= 1 && bottom === 568), JSON.stringify(boxes));
  assert.equal(await page.locator('#footer-shortcuts button').first().evaluate(b => getComputedStyle(b).fontFamily.includes('monospace')), true);
  for (const [key, name] of [['K', 'bank'], ['Q', 'equipment'], ['G', 'chart'], ['I', 'info']]) { await page.locator('#footer-shortcuts button', {hasText: key}).click(); await screen(name); }
  await L.noOverflow();
  // Long press (500 ms) on a footer button shows the screen's full title as a toast (ShortcutButton.onLongClick) and does not click.
  { const b = page.locator('#footer-shortcuts [data-command=info]'), bb = await b.boundingBox(), here = await L.screenName();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(700);
    assert.equal(await page.locator('#st-toast').textContent(), 'System Info'); assert.equal(await page.locator('#st-toast').evaluate(e => getComputedStyle(e).opacity), '1');
    await page.mouse.up(); await page.waitForTimeout(100); assert.equal(await L.screenName(), here); }
  // Footer shortcuts push onto the back stack like any other screen change.
  assert.deepEqual((await stack()).slice(0, 3), ['CHART', 'SELLEQ', 'BANK']);
  await page.screenshot({path: root + '/tests/out/options-footer-phone.png'});
  // Hidden on non-docked screens (encounter) and when the option is off.
  const fixture = (kind = 'PIRATE', phase = 'ATTACK', options = {}) => {
    const s = E.newGame(2000, 0); s.trip = {target: 10, clicks: 11, raided: false, inspected: false};
    s.encounter = {kind, state: phase, round: 0, opponent: E.makeShip('GNAT', {pilot: 3, fighter: 3, trader: 3, engineer: 3})};
    s.options = {...s.options, ...options}; s.ui = {tab: 'chart', selected: null}; return s;
  };
  await L.load(fixture('PIRATE', 'ATTACK', {extraShortcuts: true})); await screen('encounter');
  assert.equal(await page.locator('#footer-shortcuts').isVisible(), false);
  await L.load(fixture('PIRATE', 'ATTACK', {extraShortcuts: false})); await page.waitForTimeout(700);
  assert.equal(await page.locator('#footer-shortcuts').isVisible(), false);

  // 2. Animate encounters.
  const sprite = who => page.locator(`.encounter-ships .ship-sprite${who === 'opponent' ? '.opponent' : ':not(.opponent)'}`);
  const anim = async who => (await sprite(who).getAttribute('class')).split(' ').filter(c => c.startsWith('st-'));
  // Off: no animation classes.
  assert.deepEqual(await anim('player'), []); assert.deepEqual(await anim('opponent'), []);
  await page.locator('[data-combat="attack"]').click(); assert.deepEqual(await anim('player'), []); assert.deepEqual(await anim('opponent'), []);
  // On: the opponent flies in from the right (600ms); the commander stays.
  await L.load(fixture('PIRATE', 'ATTACK', {encounterAnim: true})); await screen('encounter');
  assert.deepEqual(await anim('opponent'), ['st-enter-right']); assert.deepEqual(await anim('player'), []);
  assert.equal(await sprite('opponent').evaluate(e => getComputedStyle(e).animationName), 'st-enter-right');
  await page.waitForTimeout(700); assert.deepEqual(await anim('opponent'), []);
  // A round: the pirate fires at the commander (hit or miss shake), the commander at the pirate.
  const results = [];
  for (let i = 0; i < 8 && (await state()).encounter; i++) {
    const before = await state(), pts = sh => sh.hull + sh.shieldStrength.reduce((a, b) => a + (b || 0), 0);
    await page.locator('[data-combat="attack"]').click();
    const after = await state(), e = after.encounter;
    const opp = e ? e.opponent : null, oppHit = opp ? pts(opp) < pts(before.encounter.opponent) : null, shipHit = pts(after.ship) < pts(before.ship);
    const pa = await anim('player'), oa = await anim('opponent');
    // GNAT pirates only change from ATTACK after the round, so the state before the click is the firing state.
    if (before.encounter.state === 'ATTACK') assert.equal(pa.includes(shipHit ? (after.ship.hull <= 0 ? 'st-destroyed-player' : 'st-hit-player') : 'st-miss-player'), true, JSON.stringify(pa));
    else assert.deepEqual(pa.filter(c => /^st-(hit|miss|destroyed)/.test(c)), []);
    assert.equal(pa.includes('st-flash-player'), shipHit);
    if (opp) { assert.equal(oa.includes(oppHit ? 'st-hit-opponent' : 'st-miss-opponent'), true, JSON.stringify(oa)); assert.equal(oa.includes('st-flash-opponent'), oppHit); }
    else assert.ok(oa.includes('st-destroyed-opponent') || oa.includes('st-exit-right'), JSON.stringify(oa));
    if (oa.includes('st-flash-opponent')) assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('st-flood-opponent')).animationName), 'st-flash');
    results.push({shipHit, opponentHit: oppHit, player: pa, opponent: oa});
    await page.waitForTimeout(600);
    if (!(await state()).encounter) break;
  }
  // Fleeing on Beginner always escapes: the commander's ship flies off to the left and stays away...
  await L.load(fixture('PIRATE', 'ATTACK', {encounterAnim: true})); await page.waitForTimeout(700);
  await page.locator('[data-combat="flee"]').click(); await screen('result'); assert.equal(await L.modalTitle(), 'Escaped');
  assert.ok((await anim('player')).includes('st-exit-left'));
  await page.waitForTimeout(500); assert.ok((await anim('player')).includes('st-hidden'));
  // ...and flies back in at the next encounter, together with the new opponent.
  await L.load(fixture('POLICE', 'INSPECTION', {encounterAnim: true}));
  assert.deepEqual(await anim('player'), ['st-enter-left']); assert.deepEqual(await anim('opponent'), ['st-enter-right']);
  await page.waitForTimeout(700); assert.deepEqual(await anim('player'), []); assert.deepEqual(await anim('opponent'), []);
  await page.screenshot({path: root + '/tests/out/options-encounter-phone.png'});

  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  const result = {recallScreens: true, extraShortcuts: true, encounterAnim: results, errors};
  fs.writeFileSync(root + '/tests/out/options-browser-summary.json', JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result)); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
