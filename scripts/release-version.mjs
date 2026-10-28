// `bun run release:version <version>`: move the plugin to an editor release.
//
// The plugin version IS the editor version (lockstep with the docx-editor
// unified release), so this pins core, pro, and react to <version>, sets the
// package and manifest versions to it, and turns `## Unreleased` in
// CHANGELOG.md into the release heading. `sync-release.yml` runs it for each
// upstream release; a person can run it by hand with the same result.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDITOR = ['core', 'pro', 'react'].map((name) => `@docx-editor.dev/${name}`);
const MANIFESTS = ['package.json', '.codex-plugin/plugin.json'];

const requested = process.argv[2];
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(requested ?? '')) {
  throw new Error('Use bun run release:version <major.minor.patch>.');
}
const compare = (a, b) => {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
};

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
// Equal is a rerun of the same release: finish whatever is missing, change nothing else.
if (compare(requested, pkg.version) < 0) {
  throw new Error(`The plugin is at ${pkg.version}. Versions only go up.`);
}

// Check the changelog before writing anything, so a refusal changes no file.
const changelogPath = join(root, 'CHANGELOG.md');
const changelog = await readFile(changelogPath, 'utf8');
const hasRelease = changelog.includes(`\n## ${requested}\n`);
const hasUnreleased = /\n## Unreleased\n/.test(changelog);
if (hasRelease && hasUnreleased) {
  throw new Error(`CHANGELOG.md has both ## ${requested} and ## Unreleased. Merge them by hand.`);
}
let changelogNext = null;
if (!hasRelease) {
  const editorLine = `- Update the editor packages to \`${requested}\`.`;
  changelogNext = hasUnreleased
    ? changelog.replace(/\n## Unreleased\n+/, `\n## ${requested}\n\n${editorLine}\n`)
    : changelog.replace(/^# Changelog\n/, `# Changelog\n\n## ${requested}\n\n${editorLine}\n`);
  if (changelogNext === changelog) throw new Error('CHANGELOG.md has no "# Changelog" heading.');
}

if (EDITOR.some((name) => pkg.devDependencies[name] !== requested)) {
  execFileSync(
    'bun',
    ['add', '--dev', '--exact', ...EDITOR.map((name) => `${name}@${requested}`)],
    { cwd: root, stdio: 'inherit' }
  );
}

// Preserve manifest formatting and change only the top-level version.
for (const path of MANIFESTS) {
  const text = await readFile(join(root, path), 'utf8');
  const current = JSON.parse(text).version;
  if (current !== requested) {
    await writeFile(
      join(root, path),
      text.replace(`"version": "${current}"`, `"version": "${requested}"`)
    );
  }
}

if (changelogNext) await writeFile(changelogPath, changelogNext);

console.log(`Plugin and editor at ${requested}.`);
