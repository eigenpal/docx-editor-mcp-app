import { describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture(run: (root: string, git: (...args: string[]) => string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'docx release metadata '));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'dist/app'), { recursive: true });
    mkdirSync(join(root, 'dist/local-packages'), { recursive: true });
    copyFileSync(
      join(import.meta.dir, '../../../scripts/prepare-release.mjs'),
      join(root, 'scripts/prepare-release.mjs')
    );
    writeFileSync(join(root, '.gitignore'), 'dist/\n');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '2.38.0' }));
    writeFileSync(
      join(root, 'dist/app/build.json'),
      JSON.stringify({
        version: '2.38.0',
        engine: { core: '2.38.0', pro: '2.38.0', react: '2.38.0' },
      })
    );
    for (const name of [
      'docx-editor-chatgpt-2.38.0.zip',
      'docx-editor-codex-2.38.0.zip',
      'docx-editor-claude-2.38.0.mcpb',
      'docx-editor.dev-mcp-app-2.38.0.tgz',
      'verification.json',
      'upgrade-verification.json',
      'tools-list.json',
    ]) {
      writeFileSync(join(root, 'dist/local-packages', name), 'test artifact');
    }
    git('init', '-q');
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'Initial');
    run(root, git);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function prepare(root: string) {
  const result = Bun.spawnSync(['node', join(root, 'scripts/prepare-release.mjs')]);
  expect(result.exitCode).toBe(0);
  return JSON.parse(readFileSync(join(root, 'dist/local-packages/release.json'), 'utf8'));
}

describe('review package provenance', () => {
  it('records an untagged commit without inventing a version tag', () => {
    fixture((root, git) => {
      expect(prepare(root)).toMatchObject({
        sourceCommit: git('rev-parse', 'HEAD'),
        sourceDirty: false,
        tag: null,
      });
    });
  });

  it('records a matching tag and source commit', () => {
    fixture((root, git) => {
      git(
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        'tag',
        '-a',
        'v2.38.0',
        '-m',
        'Release'
      );
      expect(prepare(root)).toMatchObject({
        sourceCommit: git('rev-parse', 'HEAD'),
        sourceDirty: false,
        tag: 'v2.38.0',
      });
    });
  });

  it('does not claim an older version tag for a newer commit', () => {
    fixture((root, git) => {
      git('tag', 'v2.38.0');
      writeFileSync(join(root, 'fix.txt'), 'New fix');
      git('add', '.');
      git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'Fix');
      expect(prepare(root)).toMatchObject({
        sourceCommit: git('rev-parse', 'HEAD'),
        sourceDirty: false,
        tag: null,
      });
    });
  });

  it('marks uncommitted changes and omits the matching tag', () => {
    fixture((root, git) => {
      git('tag', 'v2.38.0');
      writeFileSync(join(root, 'package.json'), '{"version":"2.38.0","description":"Uncommitted"}');
      expect(prepare(root)).toMatchObject({ sourceDirty: true, tag: null });
    });
  });
});
