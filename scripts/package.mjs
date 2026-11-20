import { mkdir, readFile, readdir, lstat, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
const files = ['manifest.json', 'LICENSE'];
for (const dir of ['src', 'icons']) {
  for (const name of (await readdir(resolve(root, dir))).sort()) {
    const file = `${dir}/${name}`;
    if (!(await lstat(resolve(root, file))).isFile()) throw new Error(`Unexpected non-file: ${file}`);
    if (!(dir === 'src' ? /\.(js|html|css)$/ : /\.png$/).test(name)) throw new Error(`Unexpected runtime asset: ${file}`);
    files.push(file);
  }
}
await mkdir(resolve(root, 'dist'), { recursive: true });
const zip = resolve(root, `dist/tra-cuu-phat-nguoi-${manifest.version}.zip`);
await rm(zip, { force: true });
const result = spawnSync('zip', ['-X', '-q', zip, ...files], { cwd: root, encoding: 'utf8' });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr || 'zip failed');
process.stdout.write(`Packaged ${files.length} runtime/license files: ${zip}\n`);
