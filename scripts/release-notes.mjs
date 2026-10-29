// `node scripts/release-notes.mjs <version>`: print the GitHub release notes.
//
// The notes are the CHANGELOG.md section for <version>, followed by the
// version-independent install, update, and license text in
// docs/release-notes.md. Fails when CHANGELOG.md has no such section, so a
// release never ships without notes.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
const start = changelog.indexOf(`\n## ${version}\n`);
if (!version || start === -1) throw new Error(`CHANGELOG.md has no "## ${version}" section.`);
const body = changelog.slice(start + `\n## ${version}\n`.length);
const end = body.indexOf('\n## ');
const changes = (end === -1 ? body : body.slice(0, end)).trim();
const footer = await readFile(join(root, 'docs/release-notes.md'), 'utf8');
process.stdout.write(`## Changes\n\n${changes}\n\n${footer.trim()}\n`);
