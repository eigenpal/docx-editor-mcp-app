/**
 * Builds the local verification harness into `public/__harness/` (gitignored):
 * the host page + AppBridge bundle, and the widget shell with its placeholders
 * substituted for localhost the way `ui-resource.ts` would for a deployment.
 * Dev-only; `bun run build` never runs this.
 */

import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/__harness');
const origin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';

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
await writeFile(
  join(out, 'frame.html'),
  shell.replaceAll('__PUBLIC_ORIGIN__', origin).replace('<link', `${hook}<link`),
  'utf8'
);
const hostHtml = await readFile(join(root, 'src/harness/host.html'), 'utf8');
// Cache-bust the frame per build: an earlier immutable header may have pinned
// the old copy in the browser for a year, and a query change routes around it.
await writeFile(
  join(out, 'host.html'),
  hostHtml.replaceAll('HARNESS_BUILD', String(Math.trunc(performance.now() * 1000) % 1e9)),
  'utf8'
);

console.log('harness at', `${origin}/__harness/host.html`);
