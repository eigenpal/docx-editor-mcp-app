import { describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** What scripts/build-app.mjs writes: the build's own source commit. */
function built(root: string, commit: string, dirty = false) {
  writeFileSync(
    join(root, 'dist/app/build.json'),
    JSON.stringify({
      version: '2.38.0',
      engine: { core: '2.38.0', pro: '2.38.0', react: '2.38.0' },
      source: { commit, dirty },
    })
  );
}

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
    built(root, git('rev-parse', 'HEAD'));
    run(root, git);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function run(root: string, env: Record<string, string> = {}) {
  return Bun.spawnSync(['node', join(root, 'scripts/prepare-release.mjs')], {
    env: { ...process.env, RELEASE_ALLOW_DIRTY: '', ...env },
  });
}

function prepare(root: string, env: Record<string, string> = {}) {
  const result = run(root, env);
  expect(result.stderr.toString()).toBe('');
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
      built(root, git('rev-parse', 'HEAD'));
      expect(prepare(root)).toMatchObject({
        sourceCommit: git('rev-parse', 'HEAD'),
        sourceDirty: false,
        tag: null,
      });
    });
  });

  it('refuses packages built from another commit', () => {
    fixture((root, git) => {
      writeFileSync(join(root, 'fix.txt'), 'New fix');
      git('add', '.');
      git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'Fix');
      const result = run(root);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain('Build again.');
    });
  });

  it('refuses packages built without a source commit', () => {
    fixture((root) => {
      writeFileSync(
        join(root, 'dist/app/build.json'),
        JSON.stringify({ version: '2.38.0', engine: {} })
      );
      expect(run(root).exitCode).not.toBe(0);
    });
  });

  it('refuses uncommitted changes, at build time or now', () => {
    fixture((root, git) => {
      git('tag', 'v2.38.0');
      built(root, git('rev-parse', 'HEAD'), true);
      expect(run(root).stderr.toString()).toContain('uncommitted changes');
      built(root, git('rev-parse', 'HEAD'));
      writeFileSync(join(root, 'package.json'), '{"version":"2.38.0","description":"Uncommitted"}');
      const result = run(root);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain('uncommitted changes');
    });
  });

  it('marks an allowed local build with uncommitted changes and omits the tag', () => {
    fixture((root, git) => {
      git('tag', 'v2.38.0');
      writeFileSync(join(root, 'package.json'), '{"version":"2.38.0","description":"Uncommitted"}');
      expect(prepare(root, { RELEASE_ALLOW_DIRTY: '1' })).toMatchObject({
        sourceDirty: true,
        tag: null,
      });
    });
  });
});
