import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const script = join(import.meta.dir, '../../../scripts/release-notes.mjs');
const notes = (version: string) => Bun.spawnSync(['node', script, version]);

describe('release notes', () => {
  it('starts with the CHANGELOG section for the version, then the install text', () => {
    const result = notes('1.0.1');
    expect(result.exitCode).toBe(0);
    const text = result.stdout.toString();
    expect(text).toStartWith('## Changes\n\n- ');
    expect(text).not.toContain('## 1.0.0');
    expect(text).toContain('## Install');
    expect(text).not.toMatch(/docx-editor \d+\.\d+\.\d+/);
  });

  it('fails for a version without a CHANGELOG section', () => {
    expect(notes('99.0.0').exitCode).not.toBe(0);
  });
});
