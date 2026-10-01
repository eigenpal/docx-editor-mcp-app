/**
 * The npm package's command line. `setup claude` edits a real config file, so
 * it runs against a temporary HOME.
 */

import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dir, '../cli.ts');

function run(args: string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync(['bun', CLI, ...args], { env: { ...process.env, ...env } });
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
}

describe('docx-editor-mcp-app', () => {
  it('prints the package version', () => {
    const { code, out } = run(['--version']);
    expect(code).toBe(0);
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('refuses an unknown command with the usage text', () => {
    const { code, err } = run(['nope']);
    expect(code).toBe(1);
    expect(err).toContain('Usage: docx-editor-mcp-app');
  });

  it('merges a Claude Desktop entry and keeps other servers', () => {
    if (process.platform !== 'darwin') return;
    const home = mkdtempSync(join(tmpdir(), 'docx-cli-'));
    const dir = join(home, 'Library/Application Support/Claude');
    mkdirSync(dir, { recursive: true });
    const config = join(dir, 'claude_desktop_config.json');
    writeFileSync(config, JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
    const { code } = run(['setup', 'claude'], { HOME: home });
    expect(code).toBe(0);
    const written = JSON.parse(readFileSync(config, 'utf8'));
    expect(Object.keys(written.mcpServers)).toEqual(['other', 'docx-editor']);
    expect(written.mcpServers['docx-editor'].args.at(-1)).toBe('stdio');
    expect(readFileSync(`${config}.bak`, 'utf8')).toContain('"other"');
  });
});

describe('release metadata', () => {
  it('keeps the plugin manifest at the package version', () => {
    const root = join(import.meta.dir, '../../..');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const plugin = JSON.parse(readFileSync(join(root, '.codex-plugin/plugin.json'), 'utf8'));
    expect(plugin.version).toBe(pkg.version);
  });
});
