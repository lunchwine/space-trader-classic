// Renders the SVG masters in art/ to every PNG icon (Android legacy mipmaps, PWA, fastlane).
// Usage: node scripts/render_icons.cjs   (uses the repo's Playwright Chromium, see tests/browser-helper.cjs)
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {chromium} = require(root + '/node_modules/playwright');

const BG = '#244A00';
const fg = fs.readFileSync(root + '/art/icon-foreground.svg', 'utf8');
const inner = fg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1].replace(/<!--[\s\S]*?-->/g, '');
// Rounded-square (or full-bleed when radius is 0) icon; artwork scaled about the centre.
const svg = (px, radius, scale) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 108 108">
<clipPath id="shape"><rect width="108" height="108" rx="${radius}"/></clipPath>
<g clip-path="url(#shape)"><rect width="108" height="108" fill="${BG}"/>
<g transform="translate(54 54) scale(${scale}) translate(-54 -54)">${inner}</g></g></svg>`;

const R = 'android/app/src/main/res/';
const jobs = [];
for (const [d, px] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]])
  jobs.push([R + `mipmap-${d}/ic_launcher.png`, px, 24, 1.3]);
jobs.push(['pwa/icons/icon-192.png', 192, 24, 1.3], ['pwa/icons/icon-512.png', 512, 24, 1.3],
  ['pwa/icons/icon-maskable-512.png', 512, 0, 1.15],  // full bleed; artwork well inside the central 80%
  ['fastlane/metadata/android/en-US/images/icon.png', 512, 24, 1.3]);

(async () => {
  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage();
  for (const [file, px, radius, scale] of jobs) {
    await page.setViewportSize({width: px, height: px});
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg(px, radius, scale)}`);
    const out = path.join(root, file);
    fs.mkdirSync(path.dirname(out), {recursive: true});
    await page.screenshot({path: out, omitBackground: true, clip: {x: 0, y: 0, width: px, height: px}});
    console.log('wrote', file);
  }
  await browser.close();
})();
