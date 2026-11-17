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
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
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
async function etag(t: string): Promise<string> {
  const current = await version(t);
  if (!current || 'message' in current) throw new Error('not versioned');
  return current.etag;
}

describe('openPath', () => {
  it('opens an absolute .docx path and reads it fresh', async () => {
    const path = file('a.docx');
    const t = token(openPath(path));
    writeFileSync(path, Buffer.concat([DOCX, Buffer.from([9])]));
    expect((await read(t)) as Buffer).toHaveProperty('length', DOCX.length + 1);
  });

  it('refuses relative paths, missing files, and other types', () => {
    expect(openPath('a.docx')).toHaveProperty('message');
    expect(openPath(join(dir, 'missing.docx'))).toHaveProperty('message');
    expect(openPath(file('notes.txt'))).toHaveProperty('message');
  });

  it('opens an oversized file for the host viewer, but never reads it', async () => {
    const path = file('huge.docx', Buffer.alloc(MAX_CONTENT_BYTES + 1));
    const opened = openPath(path);
    expect(opened).toMatchObject({ path: realpathSync(path), size: MAX_CONTENT_BYTES + 1 });
    expect(await read(token(opened))).toHaveProperty('message');
  });

  it('refuses to read a file that grew past the limit after it opened', async () => {
    const path = file('grows.docx');
    const t = token(openPath(path));
    writeFileSync(path, Buffer.alloc(MAX_CONTENT_BYTES + 1));
    expect(await read(t)).toHaveProperty('message');
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
    expect((await write(forged, DOCX, 'any')).outcome).toBe('refused');
  });

  it('never reads, versions, or writes through a symlink swapped in after the open', async () => {
    const path = file('swapped.docx');
    const t = token(openPath(path));
    const before = await etag(t);
    const secret = file('swapped-secret.txt', Buffer.from('secret'));
    rmSync(path);
    symlinkSync(secret, path);
    expect(await read(t)).toHaveProperty('message');
    expect(await version(t)).toHaveProperty('message');
    expect((await write(t, DOCX, before)).outcome).toBe('refused');
    expect(readFileSync(secret, 'utf8')).toBe('secret');
  });

  it('says that a deleted file is gone, and does not throw', async () => {
    const path = file('deleted.docx');
    const t = token(openPath(path));
    const before = await etag(t);
    rmSync(path);
    expect(await read(t)).toEqual({ message: 'The file no longer exists at its path.' });
    expect(await version(t)).toEqual({ message: 'The file no longer exists at its path.' });
    expect(await write(t, DOCX, before)).toEqual({
      outcome: 'refused',
      message: 'The file no longer exists at its path.',
    });
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
    const before = await etag(t);
    const saved = await write(t, DOCX, before);
    if (saved.outcome !== 'saved') throw new Error(saved.outcome);
    expect(saved.etag).not.toBe(before);
    expect(saved.etag).toBe(await etag(t));
    expect((await write(t, DOCX, before)).outcome).toBe('conflict');
  });

  it('has no unconditional save', async () => {
    const path = file('unconditional.docx');
    const t = token(openPath(path));
    expect((await write(t, Buffer.concat([DOCX, DOCX]), '')).outcome).toBe('refused');
    expect(readFileSync(path)).toEqual(DOCX);
  });

  it('notices a same-size edit that restores the old modification time', async () => {
    const path = file('restored-time.docx', Buffer.concat([DOCX, Buffer.from('AAAA')]));
    const t = token(openPath(path));
    const before = await etag(t);
    const { atime, mtime } = statSync(path);
    writeFileSync(path, Buffer.concat([DOCX, Buffer.from('BBBB')]));
    utimesSync(path, atime, mtime); // as `cp -p`, `rsync -t`, and sync clients do
    expect(await etag(t)).not.toBe(before);
    expect((await write(t, Buffer.concat([DOCX, Buffer.from('MINE')]), before)).outcome).toBe(
      'conflict'
    );
    expect(readFileSync(path, 'latin1').endsWith('BBBB')).toBe(true);
  });

  it('keeps a private file private, and refuses non-.docx and oversized bytes', async () => {
    const path = file('private.docx');
    chmodSync(path, 0o600);
    const t = token(openPath(path));
    expect((await write(t, DOCX, await etag(t))).outcome).toBe('saved');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect((await write(t, Buffer.from('hello'), await etag(t))).outcome).toBe('refused');
    const huge = Buffer.alloc(MAX_CONTENT_BYTES + 1);
    DOCX.copy(huge);
    expect(await write(t, huge, await etag(t))).toEqual({
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
    expect((await write(t, DOCX, await etag(t))).outcome).toBe('refused');
  });
});

describe('formatLimit', () => {
  it('reads as megabytes or bytes', () => {
    expect(formatLimit(7 * 1024 * 1024)).toBe('7 MiB');
    expect(formatLimit(1.5 * 1024 * 1024)).toBe('1.5 MiB');
    expect(formatLimit(10)).toBe('10 bytes');
  });
});
