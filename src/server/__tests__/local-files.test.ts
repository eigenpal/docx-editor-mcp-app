/**
 * The local-path boundary for the stdio (Claude Desktop) mode. A wrong answer
 * here is a local file-disclosure route, so the refusals matter as much as the
 * accept.
 */

import { describe, expect, it } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { looksLikeLocalPath, registerLocalFile } from '../local-files.js';

const ORIGIN = 'http://localhost:3017';

describe('looksLikeLocalPath', () => {
  it('recognizes absolute and home-relative paths', () => {
    expect(looksLikeLocalPath('/tmp/a.docx')).toBe(true);
    expect(looksLikeLocalPath('~/a.docx')).toBe(true);
  });
  it('leaves URLs alone', () => {
    expect(looksLikeLocalPath('https://example.com/a.docx')).toBe(false);
    expect(looksLikeLocalPath('a.docx')).toBe(false);
  });
});

describe('registerLocalFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'docx-local-'));

  it('accepts an existing .docx and answers a tokened URL', () => {
    const path = join(dir, 'report.docx');
    writeFileSync(path, 'stub');
    const result = registerLocalFile(path, ORIGIN);
    if ('message' in result) throw new Error(result.message);
    expect(result.name).toBe('report.docx');
    expect(result.url).toMatch(new RegExp(`^${ORIGIN}/local/[0-9a-f-]{36}$`));
  });

  it('refuses a file that is not .docx', () => {
    const path = join(dir, 'notes.txt');
    writeFileSync(path, 'stub');
    expect(registerLocalFile(path, ORIGIN)).toMatchObject({
      message: expect.stringContaining('not a .docx'),
    });
  });

  it('refuses a missing file and a relative path', () => {
    expect(registerLocalFile(join(dir, 'missing.docx'), ORIGIN)).toMatchObject({
      message: expect.stringContaining('does not exist'),
    });
    expect(registerLocalFile('report.docx', ORIGIN)).toMatchObject({
      message: expect.stringContaining('not an absolute path'),
    });
  });

  it('issues a fresh token per registration', () => {
    const path = join(dir, 'twice.docx');
    writeFileSync(path, 'stub');
    const a = registerLocalFile(path, ORIGIN);
    const b = registerLocalFile(path, ORIGIN);
    if ('message' in a || 'message' in b) throw new Error('unexpected refusal');
    expect(a.url).not.toBe(b.url);
  });
});
