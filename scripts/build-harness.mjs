/**
 * Builds the local verification harness into `public/__harness/` (gitignored):
 * the host page and its AppBridge bundle, and the built widget with an early
 * error hook. Dev-only; `bun run dev` serves it at `/__harness/`.
 */

import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/__harness');

await mkdir(out, { recursive: true });

await build({
  entryPoints: [join(root, 'src/harness/host.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: join(out, 'host.js'),
});

const shell = await readFile(join(root, 'dist/app/editor.html'), 'utf8');
// Early error hook, harness only: module-script failures happen before any
// listener the host page could attach, so the frame records its own.
const hook =
  '<script>window.__errs=[];addEventListener("unhandledrejection",e=>__errs.push("rej: "+((e.reason&&(e.reason.stack||e.reason.message))||e.reason)));addEventListener("error",e=>__errs.push("err: "+e.message+" @ "+e.filename+":"+e.lineno),true);</script>';
await writeFile(join(out, 'frame.html'), shell.replace('<head>', `<head>${hook}`), 'utf8');
const hostHtml = await readFile(join(root, 'src/harness/host.html'), 'utf8');
// Cache-bust the frame per build, so the browser never shows an old widget.
await writeFile(
  join(out, 'host.html'),
  hostHtml.replaceAll('HARNESS_BUILD', String(Math.trunc(performance.now() * 1000) % 1e9)),
  'utf8'
);

console.log('harness at http://localhost:3000/__harness/host.html (with bun run dev)');
