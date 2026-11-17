import { expect, it, mock } from 'bun:test';
import type { App } from '@modelcontextprotocol/ext-apps';
import { localSyncFile } from '../local-file.js';

const DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

it('never sends a save without the etag of the version it replaces', async () => {
  const callServerTool = mock(async () => ({
    content: [],
    structuredContent: { outcome: 'saved', etag: 'next' },
  }));
  const file = localSyncFile({ callServerTool } as unknown as App, 'docx-local://a.b');
  await expect(file.write(DOCX, null)).rejects.toThrow('Reload the file');
  expect(callServerTool).not.toHaveBeenCalled();
  expect(await file.write(DOCX, 'seen')).toEqual({ outcome: 'saved', etag: 'next' });
  expect(callServerTool).toHaveBeenCalledTimes(1);
});
