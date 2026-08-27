/**
 * Copies the engine's HarfBuzz binary into `public/`.
 *
 * It is COPIED, never committed. The loader verifies the binary against the
 * engine it was built with and refuses a mismatch, so a checked-in copy would
 * turn every `@docx-editor.dev/core` bump into a silent fidelity regression
 * until someone noticed the pagination.
 */

import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const wasm = require.resolve('@docx-editor.dev/core/harfbuzz.wasm');
const destination = join(root, 'public/harfbuzz.wasm');

await mkdir(dirname(destination), { recursive: true });
await copyFile(wasm, destination);

console.log(`copied ${wasm} → public/harfbuzz.wasm`);
