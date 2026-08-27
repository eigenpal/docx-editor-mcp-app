/**
 * Builds the widget into ONE self-contained HTML file.
 *
 * One file because an MCP App resource is one `text/html;profile=mcp-app`
 * document: the host renders exactly what `resources/read` returns, in a
 * sandboxed iframe, under a CSP that names only the domains the resource
 * declared. A `<script src>` to anywhere else does not load.
 *
 * The one thing that stays out of the bundle is `harfbuzz.wasm` — a few hundred
 * kilobytes of binary that would have to be base64'd, and which the engine wants
 * to fetch anyway. `src/app/main.tsx` points the loader at this server's copy.
 */

import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'dist/app/editor.html');

const result = await build({
  entryPoints: [join(root, 'src/app/main.tsx')],
  bundle: true,
  // Nothing is written (`write: false`), but esbuild still refuses a CSS import
  // without somewhere to have put it — the CSS is a second output file, and it
  // needs a name before it can be one.
  outdir: join(root, 'dist/app'),
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  minify: process.env.NODE_ENV !== 'development',
  sourcemap: false,
  jsx: 'automatic',
  // esbuild resolves `.js` specifiers in TS sources back to the `.ts` file,
  // which is what `verbatimModuleSyntax` + NodeNext-style imports produce.
  resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.css', '.json'],
  loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl' },
  define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production') },
  write: false,
  metafile: true,
});

const js = result.outputFiles.find((file) => file.path.endsWith('.js'));
const css = result.outputFiles.find((file) => file.path.endsWith('.css'));
if (!js) throw new Error('esbuild produced no JavaScript output');

const shell = await readFile(join(root, 'src/app/index.html'), 'utf8');

// A replacement FUNCTION, not a string: `$&` and `$'` are substitution patterns
// in a replacement string, and a bundle is full of both.
const html = shell
  .replace('/* __STYLES__ */', () => css?.text ?? '')
  .replace('/* __SCRIPT__ */', () => js.text);

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, html, 'utf8');

const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`built dist/app/editor.html (${kb} KB)`);

if (!html.includes('__PUBLIC_ORIGIN__')) {
  throw new Error(
    'the bundle has no __PUBLIC_ORIGIN__ placeholder left, so the server cannot point ' +
      'the widget at its own origin. Minification folded it away — check src/app/main.tsx.'
  );
}
