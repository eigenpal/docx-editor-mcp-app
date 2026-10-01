/**
 * What hosts see: one model-facing tool, the file viewer entrypoint in the
 * spec's exact shape, and documents served as resources.
 */

import { describe, expect, it } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMcpServer } from '../mcp.js';

const ui = { uri: 'ui://docx-editor/editor.html?v=test', html: '<!doctype html>' };
const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04]).toString('base64');

async function connect(local = false) {
  const server = createMcpServer({ local, ui });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  return client;
}

describe('tools', () => {
  it('shows the model open_document only; the rest is app plumbing', async () => {
    const { tools } = await (await connect(true)).listTools();
    const appOnly = (t: (typeof tools)[number]) =>
      (t._meta?.ui as { visibility?: string[] } | undefined)?.visibility?.includes('app');
    const visible = tools.filter((t) => !appOnly(t));
    expect(visible.map((t) => t.name)).toEqual(['open_document']);
  });

  it('registers the .docx file entrypoint', async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.find((t) => t.name === 'view_docx_file')?._meta).toMatchObject({
      'openai/ui': { entrypoints: [{ type: 'file', extensions: ['.docx'] }] },
    });
  });

  it('carries the docx-editor icon for light and dark hosts', async () => {
    const icons = (await connect()).getServerVersion()?.icons ?? [];
    expect(icons.map((icon) => icon.theme)).toEqual(['light', 'dark']);
  });
});

describe('open_document', () => {
  it('hands bytes to the widget in _meta, keeping no state', async () => {
    const result = await (
      await connect()
    ).callTool({
      name: 'open_document',
      arguments: { content_base64: DOCX, name: 'a.docx' },
    });
    expect(result.structuredContent).toMatchObject({ name: 'a.docx' });
    expect(result._meta).toEqual({ 'docx-editor/document': DOCX });
  });

  it('re-encodes lenient base64 to the canonical form the widget decodes', async () => {
    const urlSafe = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xfb, 0xff]).toString('base64url');
    const result = await (
      await connect()
    ).callTool({ name: 'open_document', arguments: { content_base64: `${urlSafe}\n` } });
    expect(result._meta).toEqual({ 'docx-editor/document': 'UEsDBPv/' });
  });

  it('prefers a path over bytes in local mode, so the preview follows the file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'docx-mcp-'));
    const path = join(dir, 'c.docx');
    writeFileSync(path, Buffer.from(DOCX, 'base64'));
    const result = await (
      await connect(true)
    ).callTool({ name: 'open_document', arguments: { path, content_base64: DOCX } });
    expect(result.structuredContent).toHaveProperty('resourceUri');
    expect(result._meta).toBeUndefined();
  });

  it('falls back to bytes when a local path does not open', async () => {
    const result = await (
      await connect(true)
    ).callTool({
      name: 'open_document',
      arguments: { path: '/sandbox/missing.docx', content_base64: DOCX },
    });
    expect(result.isError).toBeFalsy();
    expect(result._meta).toEqual({ 'docx-editor/document': DOCX });
    expect(result.structuredContent).toMatchObject({ name: 'missing.docx' });
    expect(JSON.stringify(result.content)).toContain('does not follow the file');
  });

  it('serves a file opened by path as a versioned docx-local resource', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'docx-mcp-'));
    const path = join(dir, 'b.docx');
    writeFileSync(path, Buffer.from(DOCX, 'base64'));
    const client = await connect(true);
    const result = await client.callTool({ name: 'open_document', arguments: { path } });
    const { resourceUri } = result.structuredContent as { resourceUri: string };
    const content = (await client.readResource({ uri: resourceUri })).contents[0]!;
    expect(content).toMatchObject({ blob: DOCX, _meta: { 'openai/resource': { writable: true } } });
  });

  it('offers path only in local mode', async () => {
    const schema = async (local: boolean) =>
      (await (await connect(local)).listTools()).tools.find((t) => t.name === 'open_document')
        ?.inputSchema.properties;
    expect(await schema(true)).toHaveProperty('path');
    expect(await schema(false)).not.toHaveProperty('path');
  });

  it('refuses paths outside local mode', async () => {
    const result = await (
      await connect()
    ).callTool({
      name: 'open_document',
      arguments: { path: '/etc/hosts' },
    });
    expect(result.isError).toBe(true);
  });
});
