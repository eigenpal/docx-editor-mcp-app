import { afterEach, expect, it, spyOn } from 'bun:test';
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentEtag } from '../file-version.js';
import { openPath, version, write } from '../documents.js';

const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const MINE = Buffer.concat([DOCX, Buffer.from('mine')]);
const OTHER = Buffer.concat([DOCX, Buffer.from('else')]);
const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'docx-save-race-'));
  directories.push(dir);
  const path = join(dir, 'a.docx');
  writeFileSync(path, DOCX);
  const opened = openPath(path);
  if ('message' in opened) throw new Error(opened.message);
  return { dir, path, token: opened.token };
}

it('preserves an edit between the last version check and the move', async () => {
  const { path, token } = setup();
  const realRename = fs.rename;
  const rename = spyOn(fs, 'rename').mockImplementationOnce(async (from, to) => {
    writeFileSync(path, OTHER);
    await realRename(from, to);
  });
  try {
    const result = await write(token, MINE, contentEtag(DOCX));
    expect(result).toMatchObject({ outcome: 'conflict', etag: contentEtag(OTHER) });
    if (result.outcome !== 'conflict' || !result.recoveryPath) throw new Error('No recovery file');
    expect(readFileSync(result.recoveryPath)).toEqual(OTHER);
    expect(readFileSync(path)).toEqual(OTHER);
  } finally {
    rename.mockRestore();
  }
});

it('never overwrites a file created in the installation gap', async () => {
  const { path, token } = setup();
  const realLink = fs.link;
  const link = spyOn(fs, 'link').mockImplementationOnce(async (from, to) => {
    writeFileSync(path, OTHER);
    await realLink(from, to);
  });
  try {
    const result = await write(token, MINE, contentEtag(DOCX));
    expect(result).toMatchObject({ outcome: 'conflict', etag: contentEtag(OTHER) });
    if (result.outcome !== 'conflict' || !result.recoveryPath) throw new Error('No recovery file');
    expect(readFileSync(result.recoveryPath)).toEqual(DOCX);
    expect(readFileSync(path)).toEqual(OTHER);
  } finally {
    link.mockRestore();
  }
});

it('detects a same-size edit after installation with the saved modification time', async () => {
  const { path, token } = setup();
  const realLink = fs.link;
  const link = spyOn(fs, 'link').mockImplementationOnce(async (from, to) => {
    await realLink(from, to);
    const { atime, mtime } = statSync(path);
    writeFileSync(path, OTHER);
    utimesSync(path, atime, mtime);
  });
  try {
    const result = await write(token, MINE, contentEtag(DOCX));
    expect(result).toMatchObject({ outcome: 'conflict', etag: contentEtag(OTHER) });
    expect(readFileSync(path)).toEqual(OTHER);
  } finally {
    link.mockRestore();
  }
});

it('returns the hash of saved bytes and rejects a later edit on the next save', async () => {
  const { dir, path, token } = setup();
  const result = await write(token, MINE, contentEtag(DOCX));
  expect(result).toEqual({ outcome: 'saved', etag: contentEtag(MINE) });
  const recovery = readdirSync(dir).find((name) => name.startsWith('.docx-recovery-'))!;
  expect(readFileSync(join(dir, recovery, 'a.docx'))).toEqual(DOCX);
  expect(statSync(join(dir, recovery)).mode & 0o777).toBe(0o700);
  writeFileSync(path, OTHER);
  expect(await write(token, MINE, contentEtag(MINE))).toEqual({
    outcome: 'conflict',
    etag: contentEtag(OTHER),
  });
  expect(await version(token)).toMatchObject({ etag: contentEtag(OTHER) });
});

it('restores the previous file when installation fails', async () => {
  const { path, token } = setup();
  const link = spyOn(fs, 'link').mockRejectedValueOnce(new Error('Installation failed'));
  try {
    await expect(write(token, MINE, contentEtag(DOCX))).rejects.toThrow(
      'previous file is preserved'
    );
    expect(readFileSync(path)).toEqual(DOCX);
  } finally {
    link.mockRestore();
  }
});

it('preserves and reports an edit through the displaced file handle during installation', async () => {
  const { dir, path, token } = setup();
  const descriptor = openSync(path, 'r+');
  const realLink = fs.link;
  const link = spyOn(fs, 'link').mockImplementationOnce(async (from, to) => {
    await realLink(from, to);
    writeSync(descriptor, OTHER, 0, OTHER.length, 0);
  });
  try {
    const result = await write(token, MINE, contentEtag(DOCX));
    expect(result).toMatchObject({ outcome: 'conflict', etag: contentEtag(MINE) });
    const recovery = readdirSync(dir).find((name) => name.startsWith('.docx-recovery-'))!;
    expect(readFileSync(join(dir, recovery, 'a.docx'))).toEqual(OTHER);
    expect(readFileSync(path)).toEqual(MINE);
  } finally {
    closeSync(descriptor);
    link.mockRestore();
  }
});

it('restores a copy when the file system refuses hard links', async () => {
  const { path, token } = setup();
  const link = spyOn(fs, 'link').mockRejectedValue(
    Object.assign(new Error('No links'), { code: 'ENOTSUP' })
  );
  try {
    await expect(write(token, MINE, contentEtag(DOCX))).rejects.toThrow(
      'previous file is preserved'
    );
    expect(readFileSync(path)).toEqual(DOCX);
  } finally {
    link.mockRestore();
  }
});
