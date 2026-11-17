import { expect, it, spyOn } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_CONTENT_BYTES } from '../../shared/limits.js';
import { openPath, read } from '../documents.js';

it('refuses oversized bytes even when stat reports a small file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'docx-read-race-'));
  const path = join(dir, 'growing.docx');
  writeFileSync(path, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const opened = openPath(path);
  if ('message' in opened) throw new Error(opened.message);
  const readFile = spyOn(fs, 'readFile').mockResolvedValueOnce(Buffer.alloc(MAX_CONTENT_BYTES + 1));
  try {
    expect(await read(opened.token)).toEqual({
      message: 'The file is larger than the 7 MiB limit.',
    });
  } finally {
    readFile.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
});
