// Convert assets/*.png to assets/*.webp (quality 0.9) with Chromium's encoder. Dev tool only; the build itself needs no dependencies.
// Usage: node scripts/to_webp.cjs   (needs Playwright's Chromium: npx playwright install chromium)
const {chromium} = require('playwright'), fs = require('node:fs'), path = require('node:path');
(async () => {
  const dir = path.join(__dirname, '../assets'), b = await chromium.launch(), p = await b.newPage();
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort()) {
    const src = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
    const url = await p.evaluate(async src => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/webp', 0.9);
    }, src);
    if (!url.startsWith('data:image/webp')) throw Error('WebP encoding unavailable for ' + f);
    const out = path.join(dir, f.replace(/\.png$/, '.webp')), data = Buffer.from(url.split(',')[1], 'base64');
    fs.writeFileSync(out, data);
    console.log(f.padEnd(28), String(fs.statSync(path.join(dir, f)).size).padStart(8), '→', String(data.length).padStart(8));
  }
  await b.close();
})();
