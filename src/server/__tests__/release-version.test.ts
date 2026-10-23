import { describe, expect, it } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'docx release '));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, '.codex-plugin'));
    copyFileSync(
      join(import.meta.dir, '../../../scripts/release-version.mjs'),
      join(root, 'scripts/release-version.mjs')
    );
    for (const file of ['package.json', '.codex-plugin/plugin.json']) {
      writeFileSync(join(root, file), '{\n  "name": "docx-editor",\n  "version": "0.1.1"\n}\n');
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('release version command', () => {
  it('updates both manifests from a path with spaces', () => {
    fixture((root) => {
      const result = Bun.spawnSync(['bun', join(root, 'scripts/release-version.mjs'), '0.1.2']);
      expect(result.exitCode).toBe(0);
      for (const file of ['package.json', '.codex-plugin/plugin.json']) {
        expect(JSON.parse(readFileSync(join(root, file), 'utf8')).version).toBe('0.1.2');
      }
    });
  });

  it('refuses reused, lower, and invalid versions without changing files', () => {
    fixture((root) => {
      for (const version of ['0.1.1', '0.1.0', 'latest', '01.2.3', '0.2.0-beta']) {
        const result = Bun.spawnSync(['bun', join(root, 'scripts/release-version.mjs'), version]);
        expect(result.exitCode).not.toBe(0);
        for (const file of ['package.json', '.codex-plugin/plugin.json']) {
          expect(JSON.parse(readFileSync(join(root, file), 'utf8')).version).toBe('0.1.1');
        }
      }
    });
  });
});
