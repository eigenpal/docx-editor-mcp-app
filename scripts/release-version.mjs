import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const paths = ['package.json', '.codex-plugin/plugin.json'];
const files = await Promise.all(paths.map((path) => readFile(join(root, path), 'utf8')));
const pkg = JSON.parse(files[0]);
const requested = process.argv[2];
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(requested ?? '')) {
  throw new Error('Use bun run release:version <major.minor.patch>.');
}
const compare = (a, b) => {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
};
if (compare(requested, pkg.version) <= 0)
  throw new Error('Use a version above the current version.');
// Preserve manifest formatting and change only the top-level version.
for (const [index, path] of paths.entries()) {
  const current = JSON.parse(files[index]).version;
  const next = files[index].replace(`"version": "${current}"`, `"version": "${requested}"`);
  await writeFile(join(root, path), next);
}
console.log(
  `Version ${pkg.version} -> ${requested}. Update CHANGELOG.md, then run bun install --lockfile-only.`
);
