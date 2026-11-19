import { readFile, readdir, access } from 'node:fs/promises';
import { SourceTextModule } from 'node:vm';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual([...manifest.permissions].sort(), ['alarms', 'notifications', 'storage']);
assert.deepEqual(manifest.host_permissions, ['https://vnetraffic.org/*'], 'Only the lookup source needs host access');
assert.deepEqual(manifest.content_scripts[0].matches, ['https://vnetraffic.org/tra-cuu-phat-nguoi-vnetraffic/']);
assert.equal(manifest.content_scripts[0].all_frames, false);
for (const file of manifest.content_scripts.flatMap(entry => entry.js)) await access(resolve(root, file));
for (const file of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page, ...Object.values(manifest.icons)]) await access(resolve(root, file));
const files = (await Promise.all(['src', 'scripts', 'tests'].map(async directory => (await readdir(resolve(root, directory))).map(file => `${directory}/${file}`)))).flat();
let checked = 0;
for (const file of files.filter(file => /\.(m?js)$/.test(file))) {
  const text = await readFile(resolve(root, file), 'utf8');
  new SourceTextModule(text, { identifier: file });
  if (file.startsWith('src/')) {
    assert.ok(!/\b(?:eval|new Function)\s*\(/.test(text), `${file}: dynamic code execution`);
    assert.ok(!/\.innerHTML\s*=/.test(text), `${file}: unsafe HTML assignment`);
    assert.ok(!/console\.log\s*\(/.test(text), `${file}: personal-data logging`);
  }
  checked++;
}
for (const file of ['src/app.html', 'src/popup.html']) {
  const html = await readFile(resolve(root, file), 'utf8');
  assert.ok(/<html lang="vi">/.test(html));
  assert.ok(!/\son\w+=/.test(html), `${file}: inline event handler`);
  assert.ok(!/<script(?![^>]*src=)[^>]*>\s*\S/.test(html), `${file}: inline script`);
}
process.stdout.write(`PASS: manifest, resource paths, ${checked} JavaScript syntax checks, HTML/CSP and source-safety checks.\n`);
