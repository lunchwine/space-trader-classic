// Regenerates the F-Droid phone screenshots in fastlane/metadata/android/en-US/images/phoneScreenshots/.
// Requires `npm install` and `npx playwright install chromium`; run `node scripts/screenshots.cjs`.
// Uses the built index.html (run scripts/build.py first if src/ changed). Light theme, 360x640 at 3x = 1080x1920.
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const {chromium} = require(root + '/node_modules/playwright');
const E = require(root + '/src/engine.js');
const {tools} = require(root + '/tests/browser-helper.cjs');
const out = root + '/fastlane/metadata/android/en-US/images/phoneScreenshots';

(async () => {
  fs.mkdirSync(out, {recursive: true});
  const browser = await chromium.launch({headless: true});
  const context = await browser.newContext({viewport: {width: 360, height: 640}, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'light', reducedMotion: 'reduce'});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + root + '/index.html');
  const L = tools(page);
  const shot = async name => { await page.mouse.move(0, 0); await page.waitForTimeout(300); await page.screenshot({path: `${out}/${name}.png`}); console.log('wrote', name); };

  // A docked Grasshopper with some cargo, so the market and cargo screens have content.
  const base = JSON.parse(fs.readFileSync(root + '/tests/fixtures/Space_Trader_Crew_Test_Save.json', 'utf8'));
  base.ship.cargo.WATER = 8; base.ship.cargo.FURS = 5; base.ship.cargo.ORE = 4;
  base.costBasis = {...base.costBasis, WATER: 8 * 40, FURS: 5 * 260, ORE: 4 * 420};
  base.ui = {tab: 'buy', selected: null};
  await L.load(base);
  await L.command('info'); await L.screen('info'); await shot('1');
  await L.command('buy'); await shot('2');
  await L.command('chart'); await shot('3');

  // Ship encounter: a pirate attack in mid-flight.
  const docked = await L.state(), s = E.copy(docked), dest = s.current === 0 ? 1 : 0;
  s.trip = {target: dest, clicks: 9, raided: false};
  s.encounter = {kind: 'PIRATE', state: 'ATTACK', round: 0, opponent: E.makeShip('GRASSHOPPER', {pilot: 5, fighter: 5, trader: 5, engineer: 5})};
  s.ui = {tab: 'chart', selected: null};
  await L.load(s); await shot('4');

  await L.load(docked);
  await L.command('warp'); await shot('5');
  await L.command('buyeq'); await L.screen('equipment'); await shot('6');
  await L.command('status'); await shot('7');

  if (errors.length) throw Error(errors.join('\n'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
