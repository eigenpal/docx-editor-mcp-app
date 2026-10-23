import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const out = join(root, 'dist/local-packages');
const source = unzipSync(await readFile(join(out, `docx-editor-chatgpt-${pkg.version}.zip`)));
const prefix = `docx-editor-test-${pkg.version}/`;
const files = Object.fromEntries(
  Object.entries(source).map(([path, bytes]) => [`${prefix}plugin/${path}`, bytes])
);
const marketplace = {
  name: 'eigenpal-test',
  interface: { displayName: 'Eigenpal test packages' },
  plugins: [
    {
      name: 'docx-editor',
      source: { source: 'local', path: './plugin' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
      category: 'Productivity',
    },
  ],
};
files[`${prefix}.agents/plugins/marketplace.json`] = strToU8(
  `${JSON.stringify(marketplace, null, 2)}\n`
);
files[`${prefix}README.md`] = await readFile(join(root, 'docs/submission/colleague-test.md'));
for (const name of ['proposal.docx', 'contract.docx']) {
  files[`${prefix}examples/${name}`] = await readFile(join(root, 'docs/submission/fixtures', name));
}
const name = `docx-editor-colleague-test-${pkg.version}.zip`;
await mkdir(out, { recursive: true });
const bytes = zipSync(files, { level: 9 });
await writeFile(join(out, name), bytes);
await writeFile(
  join(out, `${name}.sha256`),
  `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`
);
console.log(`Built dist/local-packages/${name}`);
