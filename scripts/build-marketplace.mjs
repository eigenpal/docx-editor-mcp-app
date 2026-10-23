/** Package the built plugin for Git marketplace installation without development files. */
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const out = join(root, 'dist/marketplace');
await rm(out, { recursive: true, force: true });
await mkdir(join(out, '.agents/plugins'), { recursive: true });
await cp(join(root, 'dist/local-packages/chatgpt'), join(out, 'plugin'), { recursive: true });
await mkdir(join(out, 'plugin/.codex-plugin'), { recursive: true });
await cp(join(root, '.codex-plugin/plugin.json'), join(out, 'plugin/.codex-plugin/plugin.json'));
await writeFile(
  join(out, 'plugin/.mcp.json'),
  JSON.stringify(
    {
      mcpServers: {
        'docx-editor': {
          command: 'node',
          args: ['${PLUGIN_ROOT}/dist/cli.js', 'stdio'],
          cwd: '${PLUGIN_ROOT}',
        },
      },
    },
    null,
    2
  ) + '\n'
);
await writeFile(
  join(out, '.agents/plugins/marketplace.json'),
  JSON.stringify(
    {
      name: 'docx-editor',
      interface: { displayName: 'docx-editor' },
      plugins: [
        {
          name: 'docx-editor',
          source: { source: 'local', path: './plugin' },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Productivity',
        },
      ],
    },
    null,
    2
  ) + '\n'
);
const files = {};
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path);
    else files[relative(out, path).split('\\').join('/')] = await readFile(path);
  }
}
await collect(out);
const name = `docx-editor-codex-${pkg.version}.zip`;
const archive = zipSync(files, { level: 9 });
const path = join(root, 'dist/local-packages', name);
await writeFile(path, archive);
await writeFile(
  path + '.sha256',
  `${createHash('sha256').update(archive).digest('hex')}  ${name}\n`
);
console.log(`built dist/local-packages/${name}`);
