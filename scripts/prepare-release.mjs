/** Gather release metadata and checksums after the package verification commands pass. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist/local-packages');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const built = JSON.parse(await readFile(join(root, 'dist/app/build.json'), 'utf8'));
if (pkg.version !== built.version) throw new Error('The package and built versions differ.');
const git = (...args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const sourceCommit = git('rev-parse', 'HEAD');
const sourceDirty = git('status', '--porcelain') !== '';
// The packages were built before this step: they must come from this commit.
if (built.source?.commit !== sourceCommit) {
  throw new Error(
    `The build came from ${built.source?.commit ?? 'no commit'}, not ${sourceCommit}. Build again.`
  );
}
// A shared package must match a commit that others can check out.
const allowDirty = process.env.RELEASE_ALLOW_DIRTY === '1';
if ((sourceDirty || built.source.dirty) && !allowDirty) {
  throw new Error(
    'The source has uncommitted changes. Commit them and build again, ' +
      'or set RELEASE_ALLOW_DIRTY=1 for a local package that you will not share.'
  );
}
const dirty = sourceDirty || built.source.dirty;
let tag = null;
try {
  // A version number alone cannot identify an untagged review build.
  if (!dirty && git('rev-parse', `v${pkg.version}^{commit}`) === sourceCommit) {
    tag = `v${pkg.version}`;
  }
} catch {
  // A review branch need not have a release tag yet.
}
const metadata = {
  version: pkg.version,
  sourceCommit,
  sourceDirty: dirty,
  tag,
  engine: built.engine,
  sourceLicense: 'Apache-2.0',
  bundledProLicense: 'LICENSE-PLUGIN.md',
  updates: 'host-managed with an in-app release notice fallback',
};
await writeFile(join(out, 'release.json'), JSON.stringify(metadata, null, 2) + '\n');
const files = [
  `docx-editor-chatgpt-${pkg.version}.zip`,
  `docx-editor-codex-${pkg.version}.zip`,
  `docx-editor-claude-${pkg.version}.mcpb`,
  `docx-editor.dev-mcp-app-${pkg.version}.tgz`,
  'verification.json',
  'upgrade-verification.json',
  'release.json',
  'tools-list.json',
];
const sums = [];
for (const name of files) {
  const hash = createHash('sha256')
    .update(await readFile(join(out, name)))
    .digest('hex');
  sums.push(`${hash}  ${name}`);
}
await writeFile(join(out, 'SHA256SUMS'), sums.join('\n') + '\n');
const releaseDir = join(root, 'dist/releases', pkg.version);
await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });
for (const name of [...files, 'SHA256SUMS']) await cp(join(out, name), join(releaseDir, name));
console.log(`prepared dist/releases/${pkg.version}: ${files.length} files and checksums`);
