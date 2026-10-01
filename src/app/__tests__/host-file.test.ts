/**
 * The host file client over the OpenAI SDK, against a stub App: base64 in both
 * directions, version metadata, and the refusal of a text representation.
 */

import { describe, expect, it } from 'bun:test';
import type { App } from '@modelcontextprotocol/ext-apps';
import { attachOpenAIExtensions, readHostFile, writeHostFile } from '../host-file.js';
import { adoptFile } from '../widget-helpers.js';

function stubApp(content: Record<string, unknown>, requests: unknown[] = []): App {
  const app = {
    getHostCapabilities: () => ({ experimental: { 'openai/resource': {} } }),
    getHostContext: () => undefined,
    addEventListener: () => undefined,
    connect: async () => undefined,
    readServerResource: async () => ({ contents: [content] }),
    request: async (request: unknown) => {
      requests.push(request);
      return { outcome: 'saved', etag: 'v2' };
    },
    setNotificationHandler: () => undefined,
  } as unknown as App;
  attachOpenAIExtensions(app);
  return app;
}

describe('readHostFile', () => {
  it('decodes the blob and reads the version metadata', async () => {
    const app = stubApp({
      uri: 'host-resource://a',
      blob: btoa('PK\u0003\u0004'),
      _meta: { 'openai/resource': { etag: 'v1', writable: true } },
    });
    const file = await readHostFile(app, 'host-resource://a');
    expect(Array.from(file.bytes)).toEqual([0x50, 0x4b, 3, 4]);
    expect(file.etag).toBe('v1');
    expect(file.writable).toBe(true);
  });

  it('refuses a text representation instead of corrupting the bytes', async () => {
    const app = stubApp({ uri: 'host-resource://a', text: 'PK' });
    await expect(readHostFile(app, 'host-resource://a')).rejects.toThrow('as text');
  });

  it('treats missing metadata as unversioned and read-only', async () => {
    const app = stubApp({ uri: 'host-resource://a', blob: btoa('x') });
    const file = await readHostFile(app, 'host-resource://a');
    expect(file.etag).toBeNull();
    expect(file.writable).toBe(false);
  });
});

describe('writeHostFile', () => {
  it('sends base64 and the version check', async () => {
    const requests: unknown[] = [];
    const app = stubApp({}, requests);
    const big = new Uint8Array(100_000).map((_, i) => i % 251);
    const result = await writeHostFile(app, 'host-resource://a', big, 'v1');
    expect(result).toEqual({ outcome: 'saved', etag: 'v2' });
    const params = (requests[0] as { params: { blob: string; ifMatch?: string } }).params;
    expect(params.ifMatch).toBe('v1');
    expect(Uint8Array.from(atob(params.blob), (c) => c.charCodeAt(0))).toEqual(big);
  });
});

describe('adoptFile', () => {
  it('keeps one request when the host announces the same file twice', () => {
    const file = { name: 'a.docx', resourceUri: 'host-resource://a' };
    const first = adoptFile(null, file);
    expect(adoptFile(first, { ...file })).toBe(first);
    expect(adoptFile(first, { ...file, resourceUri: 'host-resource://b' })).not.toBe(first);
  });
});
