/** Verify an explicit marketplace upgrade in an isolated profile without changing the user's install. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(join(tmpdir(), 'docx-upgrade-'));
const profile = join(temp, 'profile');
const market = join(temp, 'marketplace');
const expected = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const binary = process.env.CODEX_CLI_BIN ?? 'codex';
const env = { ...process.env, CODEX_HOME: profile, DOCX_EDITOR_UPDATE_CHECK: '0' };
const run = (...args) =>
  execFileSync(binary, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const setVersion = async (version) => {
  for (const path of ['package.json', 'plugin.json', '.codex-plugin/plugin.json']) {
    const target = join(market, 'plugin', path);
    const data = JSON.parse(await readFile(target, 'utf8'));
    data.version = version;
    await writeFile(target, JSON.stringify(data));
  }
};
try {
  await mkdir(profile);
  await cp(join(root, 'dist/marketplace'), market, { recursive: true });
  await setVersion('0.9.9');
  run('plugin', 'marketplace', 'add', market);
  const old = JSON.parse(run('plugin', 'add', 'docx-editor@docx-editor', '--json'));
  assert.equal(old.version, '0.9.9');
  await setVersion(expected);
  const installed = JSON.parse(run('plugin', 'add', 'docx-editor@docx-editor', '--json'));
  assert.equal(installed.version, expected);
  assert.notEqual(installed.installedPath, old.installedPath);
  const entries = JSON.parse(run('mcp', 'list', '--json'));
  const entry = entries.find((item) => item.name === 'docx-editor');
  assert.ok(entry?.enabled);
  const args = entry.transport.args;
  assert.ok(args[0].startsWith(installed.installedPath));
  const client = new Client({ name: 'upgrade-test', version: '1' });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args,
        cwd: entry.transport.cwd,
        env: { PATH: dirname(process.execPath), DOCX_EDITOR_UPDATE_CHECK: '0' },
        stderr: 'pipe',
      })
    );
    assert.equal(client.getServerVersion().version, expected);
  } finally {
    await client.close();
  }
  await writeFile(
    join(root, 'dist/local-packages/upgrade-verification.json'),
    JSON.stringify(
      {
        previous: '0.9.9',
        current: expected,
        method: 'explicit marketplace reinstall',
        cli: run('--version').trim(),
        isolatedProfile: true,
        serverVerified: true,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`smoke-upgrade: 0.9.9 -> ${expected}; installed server verified`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
