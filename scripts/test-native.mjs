import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.platform === 'darwin' ? 'darwin' : `linux-${process.arch}`;
const module = { exports: {} };
process.dlopen(module, join(root, 'dist/native', `atomic-swap-${target}.node`));
const dir = await mkdtemp(join(tmpdir(), 'docx atomic swap '));
const left = join(dir, '文書 original.docx');
const right = join(dir, 'recovery.docx');
let worker;
try {
  await writeFile(left, 'original');
  await writeFile(right, 'replacement');
  const state = new Int32Array(new SharedArrayBuffer(4));
  worker = new Worker(
    `
    const { parentPort, workerData } = require('node:worker_threads');
    const { readFileSync } = require('node:fs');
    const state = new Int32Array(workerData.state);
    let reads = 0;
    // Report readiness after the first read, before the writer starts swapping.
    do {
      const bytes = readFileSync(workerData.path, 'utf8');
      if (bytes !== 'original' && bytes !== 'replacement') throw new Error('Partial file');
      if (++reads === 1) parentPort.postMessage('ready');
    } while (!Atomics.load(state, 0));
    parentPort.postMessage(reads);
  `,
    { eval: true, workerData: { path: left, state: state.buffer } }
  );
  const exited = once(worker, 'exit');
  assert.deepEqual(await once(worker, 'message'), ['ready']);
  const finished = once(worker, 'message');
  for (let count = 0; count < 5000; count++) module.exports.swap(left, right);
  Atomics.store(state, 0, 1);
  const [reads] = await finished;
  assert.ok(reads > 1, 'The reader must run during the swaps.');
  assert.deepEqual(await exited, [0]);
  assert.equal(await readFile(left, 'utf8'), 'original');
  assert.equal(await readFile(right, 'utf8'), 'replacement');
  assert.throws(() => module.exports.swap(left, join(dir, 'missing.docx')));
  assert.equal(await readFile(left, 'utf8'), 'original');
  assert.throws(() => module.exports.swap(left, '\0'));
  console.log(`test-native: ${target}: 5000 swaps, ${reads} reads, no missing or partial file`);
} finally {
  await worker?.terminate();
  await rm(dir, { recursive: true, force: true });
}
