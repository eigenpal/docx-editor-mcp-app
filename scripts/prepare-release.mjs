/** Gather release metadata and checksums after the package verification commands pass. */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist/local-packages');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const built = JSON.parse(await readFile(join(root, 'dist/app/build.json'), 'utf8'));
if (pkg.version !== built.version) throw new Error('The package and built versions differ.');
const metadata = {
  version: pkg.version,
  tag: `v${pkg.version}`,
  engine: built.engine,
  sourceLicense: 'MIT',
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
