/**
 * Bundles the server into `dist/cli.js`: one ESM file with every runtime
 * dependency inlined. The npm package then installs nothing at `npx` time,
 * and a Codex plugin copy needs no
 * `node_modules` (Codex copies the whole plugin folder into its cache).
 */

import { build } from 'esbuild';
import { chmod, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(root, 'dist/cli.js');

const result = await build({
  entryPoints: [join(root, 'src/server/cli.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  metafile: true,
  banner: { js: '#!/usr/bin/env node' },
});
await chmod(outfile, 0o755);
// Read by scripts/build-notices.mjs: every package inlined into the server.
await writeFile(join(root, 'dist/metafile-cli.json'), JSON.stringify(result.metafile), 'utf8');
console.log('built dist/cli.js');
