// Runs every test in this folder (files ending in .cjs except the shared helpers) and reports failures.
const {spawnSync} = require('node:child_process'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), helpers = new Set(['browser-helper.cjs', 'campaign-fixtures.cjs', 'run-all.cjs']);
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.cjs') && !helpers.has(f)).sort();
const failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join('tests', f)], {cwd: root, encoding: 'utf8'});
  console.log((r.status === 0 ? 'ok   ' : 'FAIL ') + f);
  if (r.status !== 0) { failed.push(f); console.log((r.stdout + r.stderr).split('\n').slice(-15).join('\n')); }
}
console.log(`${files.length - failed.length}/${files.length} passed`);
process.exit(failed.length ? 1 : 0);
