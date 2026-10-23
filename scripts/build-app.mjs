/**
 * Builds the widget into `dist/app/`:
 *
 *   editor.html     The whole widget: src/app/index.html with the CSS and
 *                   JavaScript inlined. Desktop hosts' iframe CSP allows no
 *                   network origin of ours, so the widget fetches nothing.
 *   editor.hash     A content hash; the server puts it in the resource URI, so
 *                   hosts that cache resources by URI never serve a stale build.
 *   harfbuzz.wasm   The engine's text shaper, served as an MCP resource. The
 *                   copy must come from the installed engine: its loader
 *                   refuses a binary from a different build.
 */

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist/app');

const result = await build({
  entryPoints: [join(root, 'src/app/main.tsx')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  minify: process.env.NODE_ENV !== 'development',
  jsx: 'automatic',
  loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl' },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    __APP_VERSION__: JSON.stringify(require('../package.json').version),
  },
  outdir: out,
  write: false,
  metafile: true,
});

const text = (ext) => result.outputFiles.find((file) => file.path.endsWith(ext))?.text ?? '';
// A literal `</script` or `</style` inside the bundle would end the element early.
const js = text('.js').replace(/<\/script/gi, '<\\/script');
const css = text('.css').replace(/<\/style/gi, '<\\/style');
if (!js) throw new Error('esbuild produced no JavaScript');

const shell = await readFile(join(root, 'src/app/index.html'), 'utf8');
if (!shell.includes('/*__APP_CSS__*/') || !shell.includes('/*__APP_JS__*/')) {
  throw new Error('src/app/index.html lost its __APP_CSS__ or __APP_JS__ marker');
}
// Replacement FUNCTIONS: `$&` and `$'` are patterns in a replacement string.
const html = shell.replace('/*__APP_CSS__*/', () => css).replace('/*__APP_JS__*/', () => js);

// From scratch: the package ships all of dist/app, so nothing stale may remain.
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await writeFile(join(out, 'editor.html'), html);
await writeFile(
  join(out, 'editor.hash'),
  createHash('sha256').update(html).digest('hex').slice(0, 12)
);
await copyFile(require.resolve('@docx-editor.dev/core/harfbuzz.wasm'), join(out, 'harfbuzz.wasm'));
// Read by scripts/build-notices.mjs: every package inlined into the widget.
await writeFile(join(root, 'dist/metafile-app.json'), JSON.stringify(result.metafile));
const engine = {};
for (const name of ['core', 'pro', 'react']) {
  const path = join(root, 'node_modules/@docx-editor.dev', name, 'package.json');
  engine[name] = JSON.parse(await readFile(path, 'utf8')).version;
}
if (new Set(Object.values(engine)).size !== 1)
  throw new Error('Editor package versions must match.');
await writeFile(
  join(out, 'build.json'),
  `${JSON.stringify({ version: require('../package.json').version, engine }, null, 2)}\n`
);
console.log(`built dist/app/editor.html (${Math.round(html.length / 1024)} KB)`);
