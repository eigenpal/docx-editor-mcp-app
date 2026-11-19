/**
 * The hosted server (`http`), on a real port. It serves
 * people who are not on this computer, so it must have no way to the disk:
 * no path, no file tools, no file resources, and no page outside `/mcp`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_CONTENT_BYTES, MAX_MESSAGE_BYTES } from '../../shared/limits.js';
import { startHttp } from '../http.js';

const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ui = { uri: 'ui://docx-editor/editor.html?v=test', html: '<!doctype html>' };
let base = '';
let server: Server | undefined;

beforeAll(async () => {
  delete process.env.DOCX_HARNESS;
  // Port 0: the system picks a free one.
  server = startHttp(0, ui);
  await new Promise((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server?.closeAllConnections();
  server?.close();
});

async function connect() {
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  return client;
}

describe('the hosted server', () => {
  it('offers no tool and no resource that reaches the disk', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(['open_document', 'view_docx_file']);
    const open = tools.find((tool) => tool.name === 'open_document')!;
    expect(Object.keys(open.inputSchema.properties ?? {}).sort()).toEqual([
      'content_base64',
      'name',
    ]);
    expect(JSON.stringify(tools)).not.toContain('path');
    const templates = await client.listResourceTemplates();
    expect(JSON.stringify(templates)).not.toContain('docx-local');
  });

  it('ignores a path, and reads no file for any tool or resource', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'docx-http-'));
    const path = join(dir, 'real.docx');
    writeFileSync(path, DOCX);
    const client = await connect();
    const byPath = await client.callTool({ name: 'open_document', arguments: { path } });
    expect(byPath.isError).toBe(true);
    expect(JSON.stringify(byPath)).not.toContain('docx-local');
    for (const name of ['write_local_file', 'local_file_version']) {
      const call = await client
        .callTool({ name, arguments: { token: 'a.b', blob: 'UEsDBA==', ifMatch: 'x' } })
        .then(
          (result) => result.isError === true,
          () => true
        );
      expect(call).toBe(true);
    }
    const token = `${Buffer.from(path).toString('base64url')}.${'A'.repeat(43)}`;
    await expect(client.readResource({ uri: `docx-local://${token}` })).rejects.toThrow();
  });

  it('returns bytes up to the cap to the widget, and refuses one byte more', async () => {
    const client = await connect();
    const atCap = Buffer.alloc(MAX_CONTENT_BYTES);
    DOCX.copy(atCap);
    const shown = await client.callTool({
      name: 'open_document',
      arguments: { content_base64: atCap.toString('base64') },
    });
    expect(shown.isError).toBeFalsy();
    expect((shown._meta!['docx-editor/document'] as string).length).toBe(
      Math.ceil(MAX_CONTENT_BYTES / 3) * 4
    );
    // The model gets a line of text, never the bytes back.
    expect(JSON.stringify([shown.content, shown.structuredContent]).length).toBeLessThan(500);
    const over = Buffer.alloc(MAX_CONTENT_BYTES + 1);
    DOCX.copy(over);
    const refused = await client.callTool({
      name: 'open_document',
      arguments: { content_base64: over.toString('base64') },
    });
    expect(refused.isError).toBe(true);
  });

  it('answers only POST on /mcp, with a limit on the body', async () => {
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
    expect((await fetch(`${base}/mcp`, { method: 'DELETE' })).status).toBe(405);
    const post = (body: string) =>
      fetch(`${base}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body,
      }).then(
        (response) => response.status,
        () => 413 // the server may close the connection before the upload ends
      );
    expect(await post('{not json')).toBe(400);
    expect(await post(' '.repeat(MAX_MESSAGE_BYTES + 1024))).toBe(413);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it('serves no file: not the harness, and no path outside it', async () => {
    for (const path of [
      '/__harness/host.html',
      '/__harness/../package.json',
      '/__harness/..%2f..%2fpackage.json',
      '/package.json',
      '/.well-known/openai-apps-challenge',
      '/',
    ]) {
      const response = await fetch(`${base}${path}`);
      expect(response.status, path).toBe(404);
    }
  });
});
