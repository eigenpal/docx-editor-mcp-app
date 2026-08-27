/**
 * Builds the widget: two content-hashed static assets plus a small HTML shell.
 *
 * The shell is what the MCP server serves as the `ui://` resource; the
 * JavaScript and CSS are fetched from the deployment's own origin, which the
 * resource's CSP names. Splitting them buys three things at once:
 *
 *   - first paint is the shell's inline skeleton, not a multi-megabyte parse;
 *   - the hashed asset names make the server's immutable `/assets` caching
 *     correct, on our origin and in ChatGPT's aggressive resource cache alike;
 *   - the engine (the heavy part) is cached by the browser across
 *     conversations, while the shell stays small enough to re-serve every time.
 *
 * `harfbuzz.wasm` is copied beside them under an engine-versioned name — the
 * loader refuses a binary from a different engine build, so an immutable cache
 * must never serve last deployment's copy against this deployment's engine.
 */

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'public/assets');
const outFile = join(root, 'dist/app/editor.html');

const engineVersion = require('@docx-editor.dev/core/package.json').version;

const sharedOptions = {
  bundle: true,
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
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    __DOCX_ENGINE_VERSION__: JSON.stringify(engineVersion),
  },
  outdir: assetsDir,
  write: false,
  metafile: true,
};

const result = await build({
  ...sharedOptions,
  entryPoints: [join(root, 'src/app/main.tsx')],
});

// The standalone preview page (`/preview.html`) shares the engine but not the
// MCP wiring; it is what `bun run preview <file>` opens from a terminal.
const previewResult = await build({
  ...sharedOptions,
  entryPoints: [join(root, 'src/preview/main.tsx')],
});

const js = result.outputFiles.find((file) => file.path.endsWith('.js'));
const css = result.outputFiles.find((file) => file.path.endsWith('.css'));
if (!js) throw new Error('esbuild produced no JavaScript output');
const previewJs = previewResult.outputFiles.find((file) => file.path.endsWith('.js'));
const previewCss = previewResult.outputFiles.find((file) => file.path.endsWith('.css'));
if (!previewJs) throw new Error('esbuild produced no preview JavaScript output');

// One hash across both assets: the CSS's class names have to match the JS that
// sets them, so they version together or the cache can pair a stale one.
const hash = createHash('sha256')
  .update(js.text)
  .update(css?.text ?? '')
  .digest('hex')
  .slice(0, 12);
const jsFile = `editor-${hash}.js`;
const cssFile = `editor-${hash}.css`;
const previewHash = createHash('sha256')
  .update(previewJs.text)
  .update(previewCss?.text ?? '')
  .digest('hex')
  .slice(0, 12);
const previewJsFile = `preview-${previewHash}.js`;
const previewCssFile = `preview-${previewHash}.css`;
const wasmFile = `harfbuzz-${engineVersion}.wasm`;

// Rebuilt from scratch so a redeploy does not accumulate every hash it ever
// served. The immutable cache upstream is why removal is safe: a client that
// still wants an old hash has it cached.
await rm(assetsDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });
await writeFile(join(assetsDir, jsFile), js.text, 'utf8');
if (css) await writeFile(join(assetsDir, cssFile), css.text, 'utf8');
await writeFile(join(assetsDir, previewJsFile), previewJs.text, 'utf8');
if (previewCss) await writeFile(join(assetsDir, previewCssFile), previewCss.text, 'utf8');
await copyFile(require.resolve('@docx-editor.dev/core/harfbuzz.wasm'), join(assetsDir, wasmFile));

const previewShell = await readFile(join(root, 'src/preview/index.html'), 'utf8');
await writeFile(
  join(root, 'public/preview.html'),
  previewShell
    .replace('__PREVIEW_JS__', () => previewJsFile)
    .replace('__PREVIEW_CSS__', () => (previewCss ? previewCssFile : '')),
  'utf8'
);

const shell = await readFile(join(root, 'src/app/index.html'), 'utf8');
// Replacement FUNCTIONS, not strings: `$&` and `$'` are substitution patterns
// in a replacement string.
const html = shell
  .replace('__JS_FILE__', () => jsFile)
  .replace('__CSS_FILE__', () => (css ? cssFile : ''));

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, html, 'utf8');

const emitted = await readdir(assetsDir);
console.log(
  `built dist/app/editor.html (${Math.round(Buffer.byteLength(html) / 1024)} KB) + public/assets/{${emitted.join(', ')}}`
);

if (!html.includes('__PUBLIC_ORIGIN__')) {
  throw new Error(
    'the shell has no __PUBLIC_ORIGIN__ placeholder left, so the server cannot point ' +
      'the widget at its own origin. Check src/app/index.html.'
  );
}
if (/__JS_FILE__|__CSS_FILE__/.test(html)) {
  throw new Error('an asset placeholder survived substitution; check src/app/index.html.');
}
