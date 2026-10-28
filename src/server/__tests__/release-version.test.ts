import { describe, expect, it } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDITOR = ['core', 'pro', 'react'].map((name) => `@docx-editor.dev/${name}`);

// The editor packages are already pinned to `editor`, so the command never
// reaches `bun add` and needs no network.
function fixture(
  { editor, changelog }: { editor: string; changelog: string },
  run: (root: string) => void
) {
  const root = mkdtempSync(join(tmpdir(), 'docx release '));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, '.codex-plugin'));
    copyFileSync(
      join(import.meta.dir, '../../../scripts/release-version.mjs'),
      join(root, 'scripts/release-version.mjs')
    );
    const devDependencies = Object.fromEntries(EDITOR.map((name) => [name, editor]));
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'docx-editor', version: '0.1.1', devDependencies }, null, 2) + '\n'
    );
    writeFileSync(
      join(root, '.codex-plugin/plugin.json'),
      '{\n  "name": "docx-editor",\n  "version": "0.1.1"\n}\n'
    );
    writeFileSync(join(root, 'CHANGELOG.md'), changelog);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const release = (root: string, version: string) =>
  Bun.spawnSync(['bun', join(root, 'scripts/release-version.mjs'), version]);
const versions = (root: string) =>
  ['package.json', '.codex-plugin/plugin.json'].map(
    (file) => JSON.parse(readFileSync(join(root, file), 'utf8')).version
  );

describe('release version command', () => {
  it('sets the editor version on both manifests from a path with spaces', () => {
    fixture({ editor: '0.1.2', changelog: '# Changelog\n\n## 0.1.1\n\n- Old.\n' }, (root) => {
      expect(release(root, '0.1.2').exitCode).toBe(0);
      expect(versions(root)).toEqual(['0.1.2', '0.1.2']);
      expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(
        '# Changelog\n\n## 0.1.2\n\n- Update the editor packages to `0.1.2`.\n\n## 0.1.1\n\n- Old.\n'
      );
    });
  });

  it('turns Unreleased into the release heading, once', () => {
    const changelog = '# Changelog\n\n## Unreleased\n\n- Fix a thing.\n\n## 0.1.1\n\n- Old.\n';
    fixture({ editor: '0.1.2', changelog }, (root) => {
      expect(release(root, '0.1.2').exitCode).toBe(0);
      expect(release(root, '0.1.2').exitCode).toBe(0);
      expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(
        '# Changelog\n\n## 0.1.2\n\n- Update the editor packages to `0.1.2`.\n- Fix a thing.\n\n## 0.1.1\n\n- Old.\n'
      );
    });
  });

  it('refuses lower and invalid versions without changing files', () => {
    fixture({ editor: '0.1.1', changelog: '# Changelog\n' }, (root) => {
      for (const version of ['0.1.0', 'latest', '01.2.3', '0.2.0-beta']) {
        expect(release(root, version).exitCode).not.toBe(0);
        expect(versions(root)).toEqual(['0.1.1', '0.1.1']);
      }
    });
  });
});
