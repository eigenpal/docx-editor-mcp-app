/** Start the ChatGPT package on Windows through `launch-desktop-mcp.exe`, from a path with spaces. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

assert.equal(process.platform, 'win32', 'Run this test on Windows.');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const archive = join(root, `dist/local-packages/docx-editor-chatgpt-${pkg.version}.zip`);
const temp = await mkdtemp(join(tmpdir(), 'docx windows launcher '));
const stage = join(temp, 'plugin root');
// Node.js needs SystemRoot; Codex passes only the variables a plugin lists, plus a few like this one.
const base = { SystemRoot: process.env.SystemRoot, DOCX_EDITOR_STATE_DIR: join(temp, 'state') };

try {
  for (const [path, bytes] of Object.entries(unzipSync(await readFile(archive)))) {
    await mkdir(dirname(join(stage, path)), { recursive: true });
    await writeFile(join(stage, path), bytes);
  }
  const config = JSON.parse(await readFile(join(stage, 'mcp.json'), 'utf8')).mcpServers[
    'docx-editor'
  ];
  const cwd = config.cwd.replaceAll('${PLUGIN_ROOT}', stage);
  // A file that is not Node.js must not end the search.
  const broken = join(temp, 'broken node.exe');
  await writeFile(broken, 'not a program');

  const cases = [
    ['the host variable', { CODEX_MCP_NODE_PATH: process.execPath }],
    [
      'PATH after a broken candidate',
      { CODEX_MCP_NODE_PATH: broken, PATH: dirname(process.execPath) },
    ],
  ];
  for (const [label, env] of cases) {
    const client = new Client({ name: 'windows-launcher-smoke', version: '1' });
    try {
      // The relative command resolves against `cwd` with PATHEXT, as Codex's `which_in` does.
      await client.connect(
        new StdioClientTransport({
          command: config.command,
          args: config.args,
          cwd,
          env: { ...base, ...env },
          stderr: 'inherit',
        })
      );
      assert.equal(client.getServerVersion().version, pkg.version);
      const { tools } = await client.listTools();
      assert.ok(tools.some((tool) => tool.name === 'open_document'));
    } finally {
      await client.close();
    }
    console.log(`smoke-windows-launcher: ${label} ok`);
  }

  // With no Node.js, the host log must say why.
  const missing = spawnSync(join(stage, 'scripts', 'launch-desktop-mcp.exe'), [], {
    cwd,
    env: { ...base, CODEX_MCP_NODE_PATH: broken, PATH: join(temp, 'empty') },
    encoding: 'utf8',
    input: '',
  });
  assert.equal(missing.status, 127, missing.stderr);
  assert.match(missing.stderr, /could not find Node\.js 22 or later/);
  console.log('smoke-windows-launcher: missing Node.js ok');
} finally {
  await rm(temp, { recursive: true, force: true });
}
