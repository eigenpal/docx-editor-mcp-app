/**
 * Writes THIRD_PARTY_NOTICES.md: the license of every package the two bundles
 * inline (`dist/cli.js` and the widget). MIT, BSD, Apache-2.0 and ISC all
 * require the notice to travel with the copy, and the npm package ships the
 * bundles without node_modules, so this file is how it does.
 *
 * The inputs come from the esbuild metafiles, so only code that was actually
 * bundled is listed. A bundled package with no license text fails the build.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const metafiles = ['dist/metafile-cli.json', 'dist/metafile-app.json'];

/** `node_modules/<name>` or `node_modules/@scope/<name>`, innermost wins. */
function packageRoot(input) {
  const parts = input.split('/');
  const at = parts.lastIndexOf('node_modules');
  if (at === -1) return null;
  const width = parts[at + 1]?.startsWith('@') ? 3 : 2;
  return parts.slice(0, at + width).join('/');
}

const roots = new Set();
for (const file of metafiles) {
  const meta = JSON.parse(readFileSync(join(root, file), 'utf8'));
  for (const input of Object.keys(meta.inputs)) {
    const pkg = packageRoot(input);
    if (pkg) roots.add(pkg);
  }
}

const entries = [];
for (const dir of [...roots].sort()) {
  const pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
  const licenseFile = readdirSync(join(root, dir)).find((name) =>
    /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(name)
  );
  const text = licenseFile ? readFileSync(join(root, dir, licenseFile), 'utf8').trim() : null;
  const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type;
  if (!text && !license) throw new Error(`${pkg.name} is bundled but declares no license`);
  // EigenPal's own packages ship here under the plugin license, not their SDK terms.
  if (pkg.name.startsWith('@docx-editor.dev/')) {
    entries.push({
      name: pkg.name,
      version: pkg.version,
      license: 'LICENSE-PLUGIN.md',
      text: null,
    });
    continue;
  }
  entries.push({ name: pkg.name, version: pkg.version, license: license ?? 'see text', text });
}

// One package can appear at several versions; keep each name@version once.
const seen = new Set();
const unique = entries.filter(
  (e) => !seen.has(`${e.name}@${e.version}`) && seen.add(`${e.name}@${e.version}`)
);

const body = unique
  .map(
    (e) =>
      `## ${e.name}@${e.version}\n\nLicense: ${e.license}\n\n` +
      (e.text ? '```text\n' + e.text.replace(/```/g, "'''") + '\n```\n' : '')
  )
  .join('\n');
writeFileSync(
  join(root, 'THIRD_PARTY_NOTICES.md'),
  `# Third-party notices\n\nThis package bundles the following packages. Their licenses follow. EigenPal packages (\`@docx-editor.dev/*\`) are licensed for use in this plugin under LICENSE-PLUGIN.md.\n\n${body}`,
  'utf8'
);
if (!existsSync(join(root, 'THIRD_PARTY_NOTICES.md'))) throw new Error('notices not written');
console.log(`wrote THIRD_PARTY_NOTICES.md (${unique.length} packages)`);
