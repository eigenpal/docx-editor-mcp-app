/**
 * The token store: what may open, and what a save may overwrite. A wrong
 * answer here is a file-disclosure or file-clobbering bug, so the refusals
 * matter as much as the accepts.
 */

import { describe, expect, it } from 'bun:test';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatLimit, MAX_CONTENT_BYTES } from '../../shared/limits.js';
import { decodeBytes, openPath, read, version, write } from '../documents.js';

const dir = mkdtempSync(join(tmpdir(), 'docx-documents-'));
const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

function file(name: string, bytes: Uint8Array = DOCX): string {
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}
function token(opened: ReturnType<typeof openPath>): string {
  if ('message' in opened) throw new Error(opened.message);
  return opened.token;
}

describe('openPath', () => {
  it('opens an absolute .docx path and reads it fresh', async () => {
    const path = file('a.docx');
    const t = token(openPath(path));
    writeFileSync(path, Buffer.concat([DOCX, Buffer.from([9])]));
    expect((await read(t))?.at(-1)).toBe(9);
  });

  it('refuses relative paths, missing files, other types, and oversized files', () => {
    expect(openPath('a.docx')).toHaveProperty('message');
    expect(openPath(join(dir, 'missing.docx'))).toHaveProperty('message');
    expect(openPath(file('notes.txt'))).toHaveProperty('message');
    expect(openPath(file('huge.docx', Buffer.alloc(MAX_CONTENT_BYTES + 1)))).toHaveProperty(
      'message'
    );
  });

  it('refuses a .docx symlink to a file that is not a .docx', () => {
    const link = join(dir, 'evil.docx');
    symlinkSync(file('secret.txt'), link);
    expect(openPath(link)).toHaveProperty('message');
  });

  it('gives a file it never opened no access through a token for another file', async () => {
    const [, signature] = token(openPath(file('opened.docx'))).split('.');
    const forged = `${Buffer.from(file('other.docx')).toString('base64url')}.${signature}`;
    expect(await read(forged)).toBeNull();
    expect(await version(forged)).toBeNull();
    expect((await write(forged, DOCX, null)).outcome).toBe('refused');
  });
});

describe('decodeBytes', () => {
  it('accepts .docx bytes and refuses anything else', () => {
    expect(decodeBytes(DOCX.toString('base64'))).toEqual(DOCX);
    expect(decodeBytes(Buffer.from('hello').toString('base64'))).toHaveProperty('message');
  });
});

describe('write', () => {
  it('saves only over the version the preview last saw', async () => {
    const t = token(openPath(file('b.docx')));
    const before = (await version(t))!;
    await new Promise((resolve) => setTimeout(resolve, 5)); // a new modification time
    const saved = await write(t, DOCX, before.etag);
    if (saved.outcome !== 'saved') throw new Error(saved.outcome);
    expect(saved.etag).not.toBe(before.etag);
    expect((await write(t, DOCX, before.etag)).outcome).toBe('conflict');
  });

  it('keeps a private file private, and refuses non-.docx and oversized bytes', async () => {
    const path = file('private.docx');
    chmodSync(path, 0o600);
    const t = token(openPath(path));
    expect((await write(t, DOCX, null)).outcome).toBe('saved');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect((await write(t, Buffer.from('hello'), null)).outcome).toBe('refused');
    const huge = Buffer.alloc(MAX_CONTENT_BYTES + 1);
    DOCX.copy(huge);
    expect(await write(t, huge, null)).toEqual({
      outcome: 'too-large',
      maxBytes: MAX_CONTENT_BYTES,
    });
    expect(readFileSync(path)).toEqual(DOCX);
  });

  it('reports a read-only file as such and never replaces it', async () => {
    const path = file('readonly.docx');
    chmodSync(path, 0o444);
    const t = token(openPath(path));
    expect(await version(t)).toMatchObject({ writable: false });
    expect((await write(t, DOCX, null)).outcome).toBe('refused');
  });
});

describe('formatLimit', () => {
  it('reads as megabytes or bytes', () => {
    expect(formatLimit(7 * 1024 * 1024)).toBe('7 MB');
    expect(formatLimit(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatLimit(10)).toBe('10 bytes');
  });
});
