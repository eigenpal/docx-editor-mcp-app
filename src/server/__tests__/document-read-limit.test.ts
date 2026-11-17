import { expect, it, spyOn } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_CONTENT_BYTES } from '../../shared/limits.js';
import { openPath, read } from '../documents.js';

// Its own file: the spy replaces a module export for every test in the file.
it('refuses oversized bytes even when the size check saw a small file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'docx-read-race-'));
  const path = join(dir, 'growing.docx');
  writeFileSync(path, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const opened = openPath(path);
  if ('message' in opened) throw new Error(opened.message);
  const small = await fs.lstat(path, { bigint: true });
  // The file grows between the size check and the read.
  writeFileSync(path, Buffer.alloc(MAX_CONTENT_BYTES + 1));
  const lstat = spyOn(fs, 'lstat').mockResolvedValueOnce(small as never);
  try {
    expect(await read(opened.token)).toEqual({
      message: 'The file is larger than the 7 MiB limit.',
    });
  } finally {
    lstat.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
});
