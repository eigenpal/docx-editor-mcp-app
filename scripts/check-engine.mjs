import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['core', 'pro', 'react'].map((name) => `@docx-editor.dev/${name}`);
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const latest = names
  .map((name) =>
    execFileSync(
      npm,
      ['view', name, 'dist-tags.latest', '--json', '--fetch-retries=0', '--fetch-timeout=15000'],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 20000,
      }
    ).trim()
  )
  .map((value) => JSON.parse(value));
if (latest.some((version) => version !== latest[0])) {
  throw new Error(
    `Editor releases do not match: ${JSON.stringify(latest)}. Check upstream before updating.`
  );
}
let current = true;
for (const [index, name] of names.entries()) {
  const installed = JSON.parse(
    await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8')
  ).version;
  console.log(
    `${name}: declared ${pkg.devDependencies[name]}, installed ${installed}, latest ${latest[index]}`
  );
  if (pkg.devDependencies[name] !== latest[index] || installed !== latest[index]) current = false;
}
if (process.argv.includes('--update')) {
  execFileSync(
    'bun',
    ['add', '--dev', '--exact', ...names.map((name, i) => `${name}@${latest[i]}`)],
    {
      cwd: root,
      stdio: 'inherit',
    }
  );
} else if (!current) {
  console.error('Run bun run engine:update, then run the release checks.');
  process.exitCode = 1;
}
