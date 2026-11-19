import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, 'dist/native');
await mkdir(directory, { recursive: true });
if (process.env.DOCX_EDITOR_NATIVE_PREBUILT === '1') {
  await import('./verify-native.mjs');
} else if (!['darwin', 'linux'].includes(process.platform)) {
  console.log('Atomic swaps are unavailable on this system. Local saves refuse replacement.');
} else {
  const target = process.platform === 'darwin' ? 'darwin' : `linux-${process.arch}`;
  const output = join(directory, `atomic-swap-${target}.node`);
  const source = join(root, 'native/atomic-swap.c');
  const flags =
    process.platform === 'darwin'
      ? [
          '-bundle',
          '-undefined',
          'dynamic_lookup',
          '-arch',
          'arm64',
          '-arch',
          'x86_64',
          '-mmacosx-version-min=11.0',
        ]
      : ['-shared', '-fPIC'];
  execFileSync(
    process.env.CC ?? 'cc',
    [
      '-O2',
      '-Wall',
      '-Wextra',
      '-Werror',
      ...flags,
      '-I',
      join(root, 'node_modules/node-api-headers/include'),
      source,
      '-o',
      `${output}.tmp`,
    ],
    { stdio: 'inherit' }
  );
  await rename(`${output}.tmp`, output);
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  await writeFile(
    `${output}.json`,
    JSON.stringify({
      source: hash(await readFile(source)),
      binary: hash(await readFile(output)),
    }) + '\n'
  );
  console.log(`built dist/native/atomic-swap-${target}.node`);
}
