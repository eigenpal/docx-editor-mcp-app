import { describe, expect, it } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_CONTENT_BYTES } from '../../shared/limits.js';
import { createMcpServer } from '../mcp.js';

async function withClient(local: boolean, run: (client: Client) => Promise<void>) {
  const server = createMcpServer({
    local,
    ui: { uri: 'ui://docx-editor/contract.html', html: '<!doctype html>' },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'tool-contract-test', version: '1' });
  try {
    await client.connect(clientSide);
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

describe('advertised tool contracts', () => {
  it('advertises a conditional save with a required etag in tools/list', async () => {
    await withClient(true, async (client) => {
      const { tools } = await client.listTools();
      const write = tools.find((t) => t.name === 'write_local_file')!;
      expect(write.description).toContain('only if the file is unchanged');
      expect(write.description).toContain('There is no unconditional save.');
      expect(write.description).not.toContain('null');
      expect(write.inputSchema.required).toContain('ifMatch');
      const schema = write.inputSchema.properties?.ifMatch as {
        description: string;
        type: string;
        minLength: number;
      };
      expect(schema).toMatchObject({ type: 'string', minLength: 1 });
      expect(schema.description).toContain('Required.');
      expect(write.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      });
      expect(write._meta).toMatchObject({ ui: { visibility: ['app'] } });
      const version = tools.find((t) => t.name === 'local_file_version')!;
      expect(version.description).toContain('etag and write permission');
      const open = tools.find((t) => t.name === 'open_document')!;
      const bytes = open.inputSchema.properties?.content_base64 as { description: string };
      expect(bytes.description).toContain('A path that opens here takes priority');
    });
  });

  it('exposes only the preview and file entrypoint in hosted mode', async () => {
    await withClient(false, async (client) => {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(['open_document', 'view_docx_file']);
      for (const tool of tools) {
        expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
      }
      const open = tools.find((t) => t.name === 'open_document')!;
      expect(open.description).toContain('does not follow or save back to a file');
      expect(open.description).toContain('Show it again after each edit');
      expect(open.description).not.toContain('path');
      expect(open.inputSchema.properties).not.toHaveProperty('path');
      const bytes = open.inputSchema.properties?.content_base64 as { description: string };
      expect(bytes.description).toContain(`${MAX_CONTENT_BYTES} bytes (7 MiB)`);
      expect(bytes.description).not.toContain('path');
    });
  });

  it('refuses a stale version, a missing etag, and null, and saves over a seen version', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'docx-contract-'));
    const path = join(dir, 'contract.docx');
    const initial = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const external = Buffer.concat([initial, Buffer.from('external')]);
    const replacement = Buffer.concat([initial, Buffer.from('replacement')]);
    writeFileSync(path, initial);
    try {
      await withClient(true, async (client) => {
        const opened = await client.callTool({ name: 'open_document', arguments: { path } });
        const resourceUri = opened._meta!['docx-editor/resource'] as string;
        const token = resourceUri.slice('docx-local://'.length);
        const version = await client.callTool({ name: 'local_file_version', arguments: { token } });
        const { etag } = version.structuredContent as { etag: string };
        expect(version.structuredContent).toMatchObject({ writable: true });
        writeFileSync(path, external);
        const blob = replacement.toString('base64');
        const save = (ifMatch: unknown) =>
          client.callTool({ name: 'write_local_file', arguments: { token, blob, ifMatch } });
        const conflict = await save(etag);
        expect(conflict.structuredContent).toMatchObject({ outcome: 'conflict' });
        expect(readFileSync(path)).toEqual(external);
        const missing = await client.callTool({
          name: 'write_local_file',
          arguments: { token, blob },
        });
        expect(missing.isError).toBe(true);
        for (const invalid of [null, '', 42]) expect((await save(invalid)).isError).toBe(true);
        expect(readFileSync(path)).toEqual(external);
        // "Keep my version": the etag of the newer file the reader chose to replace.
        const newer = (conflict.structuredContent as { etag: string }).etag;
        const overwritten = await save(newer);
        expect(overwritten.structuredContent).toMatchObject({ outcome: 'saved' });
        expect(readFileSync(path)).toEqual(replacement);
        const latest = await client.callTool({ name: 'local_file_version', arguments: { token } });
        const saved = (overwritten.structuredContent as { etag: string }).etag;
        expect(saved).toBe((latest.structuredContent as { etag: string }).etag);
        const tooLarge = await client.callTool({
          name: 'write_local_file',
          arguments: {
            token,
            blob: Buffer.alloc(MAX_CONTENT_BYTES + 1).toString('base64'),
            ifMatch: saved,
          },
        });
        expect(tooLarge.structuredContent).toEqual({
          outcome: 'too-large',
          maxBytes: MAX_CONTENT_BYTES,
        });
        expect(readFileSync(path)).toEqual(replacement);
        rmSync(path);
        const gone = await client.callTool({ name: 'local_file_version', arguments: { token } });
        expect(gone).toMatchObject({
          isError: true,
          content: [{ text: 'The file no longer exists at its path.' }],
        });
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
