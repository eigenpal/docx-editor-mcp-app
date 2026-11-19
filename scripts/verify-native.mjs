import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = hash(await readFile(join(root, 'native/atomic-swap.c')));
for (const target of ['darwin', 'linux-x64', 'linux-arm64']) {
  const path = join(root, 'dist/native', `atomic-swap-${target}.node`);
  const metadata = JSON.parse(await readFile(`${path}.json`, 'utf8'));
  assert.equal(metadata.source, source, `${target}: source changed after compilation`);
  assert.equal(
    metadata.binary,
    hash(await readFile(path)),
    `${target}: binary changed after compilation`
  );
}
console.log('verify-native: all release modules match the source and recorded hashes');
