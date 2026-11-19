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
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as atomic from '../atomic-swap.js';
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

it('preserves the exact edit that arrives between the last check and the atomic swap', async () => {
  const { path, token } = setup();
  const realSwap = atomic.swapFiles;
  const swap = spyOn(atomic, 'swapFiles').mockImplementationOnce((left, right) => {
    writeFileSync(path, OTHER);
    realSwap(left, right);
  });
  try {
    const result = await write(token, MINE, contentEtag(DOCX));
    expect(result).toMatchObject({ outcome: 'conflict', etag: contentEtag(MINE) });
    if (result.outcome !== 'conflict' || !result.recoveryPath) throw new Error('No recovery file');
    expect(readFileSync(result.recoveryPath)).toEqual(OTHER);
    expect(readFileSync(path)).toEqual(MINE);
  } finally {
    swap.mockRestore();
  }
});

it('detects a same-size edit after the swap with the saved modification time', async () => {
  const { path, token } = setup();
  const realSwap = atomic.swapFiles;
  const swap = spyOn(atomic, 'swapFiles').mockImplementationOnce((left, right) => {
    realSwap(left, right);
    const { atime, mtime } = statSync(path);
    writeFileSync(path, OTHER);
    utimesSync(path, atime, mtime);
  });
  try {
    const result = await write(token, MINE, contentEtag(DOCX));
    expect(result).toMatchObject({ outcome: 'conflict', etag: contentEtag(OTHER) });
    expect(readFileSync(path)).toEqual(OTHER);
  } finally {
    swap.mockRestore();
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

it('keeps the original path and both files when atomic swaps are unsupported', async () => {
  const { dir, path, token } = setup();
  const swap = spyOn(atomic, 'swapFiles').mockImplementationOnce(() => {
    throw new Error('Atomic swaps are unsupported');
  });
  try {
    await expect(write(token, MINE, contentEtag(DOCX))).rejects.toThrow('recovery file remains');
    expect(readFileSync(path)).toEqual(DOCX);
    const recovery = readdirSync(dir).find((name) => name.startsWith('.docx-recovery-'))!;
    expect(readFileSync(join(dir, recovery, 'a.docx'))).toEqual(MINE);
  } finally {
    swap.mockRestore();
  }
});

it('preserves and reports an edit through the displaced file handle during the swap', async () => {
  const { dir, path, token } = setup();
  const descriptor = openSync(path, 'r+');
  const realSwap = atomic.swapFiles;
  const swap = spyOn(atomic, 'swapFiles').mockImplementationOnce((left, right) => {
    realSwap(left, right);
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
    swap.mockRestore();
  }
});

it('retains the displaced file after an uncertain native result', async () => {
  const { dir, path, token } = setup();
  const realSwap = atomic.swapFiles;
  const swap = spyOn(atomic, 'swapFiles').mockImplementationOnce((left, right) => {
    realSwap(left, right);
    throw new Error('Uncertain result');
  });
  try {
    await expect(write(token, MINE, contentEtag(DOCX))).rejects.toThrow('recovery file remains');
    const recovery = readdirSync(dir).find((name) => name.startsWith('.docx-recovery-'))!;
    expect(readFileSync(join(dir, recovery, 'a.docx'))).toEqual(DOCX);
    expect(readFileSync(path)).toEqual(MINE);
  } finally {
    swap.mockRestore();
  }
});
