/** Package only release files, so local documents and development files cannot enter an archive. */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { chatgptManifests, claudeManifest } from './local-package-manifests.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist/local-packages');
const target = process.argv[2] ?? 'all';
if (!['all', 'chatgpt', 'claude'].includes(target)) throw new Error('Use all, chatgpt, or claude.');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));
const pkg = await readJson('package.json');
const legacy = await readJson('.codex-plugin/plugin.json');
if (pkg.version !== legacy.version) throw new Error('Package and plugin versions must match.');
const built = await readJson('dist/app/build.json');
if (built.version !== pkg.version)
  throw new Error('Build the editor again after changing the plugin version.');
for (const [name, version] of Object.entries(built.engine)) {
  if (pkg.devDependencies[`@docx-editor.dev/${name}`] !== version) {
    throw new Error('Build the editor again with the declared exact engine versions.');
  }
}
const review = await readJson('docs/submission/review.json');
if (review.positive.length !== 5 || review.negative.length !== 3) {
  throw new Error('Review cases need five positive and three negative cases.');
}
const demo = process.env.DEMO_URL;
if (demo && new URL(demo).protocol !== 'https:') throw new Error('DEMO_URL must use HTTPS.');

const payload = [
  'dist/cli.js',
  'dist/app/editor.html',
  'dist/app/editor.hash',
  'dist/app/build.json',
  'dist/app/harfbuzz.wasm',
  'assets/icon.png',
  'assets/icon.svg',
  'assets/icon-dark.svg',
  'assets/logo.png',
  'assets/logo-dark.png',
  'LICENSE',
  'LICENSE-PLUGIN.md',
  'THIRD_PARTY_NOTICES.md',
  'docs/releases.md',
  'docs/submission/privacy.md',
  'docs/submission/terms.md',
];
// Missing build files must fail before an existing package is replaced.
await Promise.all(payload.map((path) => readFile(join(root, path))));
await mkdir(out, { recursive: true });
for (const host of target === 'all' ? ['chatgpt', 'claude'] : [target]) {
  const stage = join(out, host);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  for (const path of payload) {
    await mkdir(dirname(join(stage, path)), { recursive: true });
    await cp(join(root, path), join(stage, path));
  }
  // The server finds its assets through package.json; runtime dependencies are already bundled.
  await writeFile(
    join(stage, 'package.json'),
    json({
      name: pkg.name,
      version: pkg.version,
      type: 'module',
      license: pkg.license,
      engines: pkg.engines,
    })
  );
  const manifests =
    host === 'chatgpt'
      ? chatgptManifests(legacy, review, demo)
      : { 'manifest.json': claudeManifest(legacy, pkg) };
  for (const [path, value] of Object.entries(manifests)) {
    await writeFile(join(stage, path), json(value));
  }
  if (host === 'chatgpt')
    await cp(join(root, 'skills'), join(stage, 'skills'), { recursive: true });
  await cp(join(root, `docs/submission/${host}-install.md`), join(stage, 'README.md'));
  const files = {};
  const collect = async (dir) => {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (entry.isFile())
        files[relative(stage, path).split('\\').join('/')] = await readFile(path);
      else throw new Error(`Unsupported archive entry: ${path}`);
    }
  };
  await collect(stage);
  const extension = host === 'chatgpt' ? 'zip' : 'mcpb';
  const name = `docx-editor-${host}-${pkg.version}.${extension}`;
  const archive = zipSync(files, { level: 9 });
  await writeFile(join(out, name), archive);
  const hash = createHash('sha256').update(archive).digest('hex');
  await writeFile(join(out, `${name}.sha256`), `${hash}  ${name}\n`);
  console.log(`built ${relative(root, join(out, name))} (${archive.length} bytes)`);
}
if (!demo && target !== 'claude')
  console.log('ChatGPT review: add a demo recording before submission.');
