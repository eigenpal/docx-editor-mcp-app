/**
 * A save that lands right after our rename must not pass for our own: its
 * etag would let the next autosave overwrite it without a conflict.
 */

import { expect, it, spyOn } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPath, version, write } from '../documents.js';

const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

// Its own file: the spy replaces a module export for every test in the file.
it('reports a save that lands right after the rename as a conflict', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'docx-save-race-'));
  const path = join(dir, 'a.docx');
  writeFileSync(path, DOCX);
  const opened = openPath(path);
  if ('message' in opened) throw new Error(opened.message);
  const before = (await version(opened.token)) as { etag: string };
  const realRename = fs.rename;
  const rename = spyOn(fs, 'rename').mockImplementationOnce(async (from, to) => {
    await realRename(from, to);
    writeFileSync(path, Buffer.concat([DOCX, Buffer.from('agent')])); // another program saves
  });
  try {
    const result = await write(
      opened.token,
      Buffer.concat([DOCX, Buffer.from('mine')]),
      before.etag
    );
    const now = (await version(opened.token)) as { etag: string };
    expect(result).toEqual({ outcome: 'conflict', etag: now.etag });
  } finally {
    rename.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
});
