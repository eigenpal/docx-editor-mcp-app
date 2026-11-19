/**
 * The four defects that the plugin directory review found in this server.
 * Each test holds the rule that the finding broke.
 *
 * They run as the review ran them: through the MCP protocol, against the
 * local server, with another program that changes the file at a chosen
 * moment. The wider suites grew from these: `document-save-race.test.ts`
 * (every step, not one), `document-save-faults.test.ts`,
 * `document-save-pairs.test.ts`, and `document-save-stress.test.ts`.
 */

import { afterEach, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { MAX_CONTENT_BYTES } from '../../shared/limits.js';
import { contentEtag } from '../file-version.js';
import { createMcpServer } from '../mcp.js';
import {
  MINE,
  ORIGINAL,
  OTHER,
  THIRD,
  cleanUp,
  doc,
  intercept,
  leftovers,
  release,
  setup,
} from './save-steps.js';

afterEach(cleanUp);
setDefaultTimeout(60_000);

/** The MCP TypeScript SDK client closes a stdio connection on a larger message. */
const HOST_MESSAGE_LIMIT = 10 * 1024 * 1024;

async function open(path: string) {
  const server = createMcpServer({
    local: true,
    ui: { uri: 'ui://docx-editor/editor.html?v=test', html: '<!doctype html>' },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'review', version: '0' });
  await client.connect(clientSide);
  const opened = await client.callTool({ name: 'open_document', arguments: { path } });
  const uri = opened._meta!['docx-editor/resource'] as string;
  const token = uri.slice('docx-local://'.length);
  type Saved = { outcome: string; etag?: string; recoveryPath?: string; maxBytes?: number };
  return {
    client,
    uri,
    opened,
    save: async (bytes: Uint8Array, ifMatch: unknown) => {
      const result = await client.callTool({
        name: 'write_local_file',
        arguments: { token, blob: Buffer.from(bytes).toString('base64'), ifMatch },
      });
      return { isError: result.isError === true, ...(result.structuredContent as Saved) };
    },
    version: async () => {
      const result = await client.callTool({ name: 'local_file_version', arguments: { token } });
      return (result.structuredContent as { etag: string }).etag;
    },
  };
}

function sized(bytes: number): Buffer {
  const file = Buffer.alloc(bytes);
  doc('').copy(file);
  return file;
}

describe('finding 1: a document whose base64 passes the 10 MiB message limit of the host', () => {
  it('sends a file at the size limit in one message under the host limit', async () => {
    const { path } = setup('at-limit.docx', sized(MAX_CONTENT_BYTES));
    const { client, uri } = await open(path);
    const read = await client.readResource({ uri });
    // The whole JSON-RPC result, as it crosses stdio.
    const message = JSON.stringify({ jsonrpc: '2.0', id: 1, result: read });
    expect(message.length).toBeLessThan(HOST_MESSAGE_LIMIT);
    expect(Buffer.from((read.contents[0] as { blob: string }).blob, 'base64')).toHaveLength(
      MAX_CONTENT_BYTES
    );
  });

  it('refuses to send, show, or save one byte over the limit, and stays connected', async () => {
    const { path } = setup('over-limit.docx', sized(MAX_CONTENT_BYTES + 1));
    const { client, uri, save } = await open(path);
    await expect(client.readResource({ uri })).rejects.toThrow('larger than the 7 MiB limit');
    const bytes = await client.callTool({
      name: 'open_document',
      arguments: { content_base64: sized(MAX_CONTENT_BYTES + 1).toString('base64') },
    });
    expect(bytes.isError).toBe(true);
    expect(await save(sized(MAX_CONTENT_BYTES + 1), 'any')).toMatchObject({
      outcome: 'too-large',
      maxBytes: MAX_CONTENT_BYTES,
    });
    // The 12 MiB document of the review: refused the same way.
    expect((await save(sized(12 * 1024 * 1024), 'any')).outcome).toBe('too-large');
    expect(readFileSync(path)).toHaveLength(MAX_CONTENT_BYTES + 1);
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);
  });

  it('refuses a file that grows past the limit after it opened', async () => {
    const { path } = setup('grows.docx', sized(1024));
    const { client, uri } = await open(path);
    expect((await client.readResource({ uri })).contents).toHaveLength(1);
    writeFileSync(path, sized(MAX_CONTENT_BYTES + 1));
    await expect(client.readResource({ uri })).rejects.toThrow('larger than the 7 MiB limit');
  });
});

describe('finding 2: `ifMatch: null` skipped the version check', () => {
  it('refuses every save that does not name a version, and changes nothing', async () => {
    const { path } = setup();
    const { save } = await open(path);
    for (const ifMatch of [null, undefined, '', 0, false, {}, []]) {
      const result = await save(MINE, ifMatch);
      expect(result.isError, JSON.stringify(ifMatch)).toBe(true);
      expect(readFileSync(path)).toEqual(ORIGINAL);
    }
  });

  it('refuses a version that is not the one on disk, and names the one that is', async () => {
    const { path } = setup();
    const { save, version } = await open(path);
    for (const stale of [contentEtag(MINE), 'x', '*', 'null', 'undefined', `${await version()} `]) {
      expect(await save(MINE, stale)).toMatchObject({
        outcome: 'conflict',
        etag: contentEtag(ORIGINAL),
      });
      expect(readFileSync(path)).toEqual(ORIGINAL);
    }
  });

  it('describes the tool as the code behaves', async () => {
    const { path } = setup();
    const { client } = await open(path);
    const tool = (await client.listTools()).tools.find((t) => t.name === 'write_local_file')!;
    expect(tool.description).toContain('There is no unconditional save.');
    expect(tool.inputSchema.required).toContain('ifMatch');
    expect(JSON.stringify(tool.inputSchema.properties!.ifMatch)).not.toContain('null');
    expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });
});

describe('finding 3: an edit after the last version check, before the file was replaced', () => {
  it('keeps the edit and reports a conflict, for an edit at the last moment', async () => {
    const { dir, path } = setup();
    const { save } = await open(path);
    let moves = 0;
    // The move is the first call that changes the document: the last moment.
    intercept(
      (step, _count, args) => step === 'renameSync' && args[0] === path && ++moves === 1,
      () => writeFileSync(path, OTHER)
    );
    const result = await save(MINE, contentEtag(ORIGINAL));
    release();
    expect(moves).toBeGreaterThan(0);
    expect(result).toMatchObject({ outcome: 'conflict', etag: contentEtag(OTHER) });
    expect(readFileSync(path)).toEqual(OTHER);
    expect(leftovers(dir)).toEqual([]);
  });

  it('keeps the edit at every other moment of the save too', async () => {
    for (let at = 1; at <= 40; at++) {
      const { path } = setup();
      const { save } = await open(path);
      const calls = intercept(
        (_step, count) => count === at,
        () => writeFileSync(path, OTHER)
      );
      const result = await save(MINE, contentEtag(ORIGINAL));
      release();
      if (calls() < at) break;
      const where = `edit before call ${at}: ${JSON.stringify(result)}`;
      expect(readFileSync(path).equals(OTHER), where).toBe(true);
      if (result.outcome === 'saved') expect(result.etag, where).toBe(contentEtag(MINE));
      else expect(result, where).toMatchObject({ outcome: 'conflict', etag: contentEtag(OTHER) });
    }
  });
});

describe('finding 4: an edit right after the save was returned as the saved version', () => {
  it('returns the version of the bytes written, so the next save sees the edit', async () => {
    const { path } = setup();
    const { save, version } = await open(path);
    const saved = await save(MINE, contentEtag(ORIGINAL));
    expect(saved).toMatchObject({ outcome: 'saved', etag: contentEtag(MINE) });
    // The same size, and the modification time of the saved file put back.
    const { atime, mtime, size } = statSync(path);
    writeFileSync(path, OTHER);
    utimesSync(path, atime, mtime);
    expect(statSync(path).size).toBe(size);
    expect(statSync(path).mtimeMs).toBe(mtime.getTime());
    // The version changed although size and time did not.
    expect(await version()).toBe(contentEtag(OTHER));
    expect(await save(THIRD, saved.etag)).toMatchObject({
      outcome: 'conflict',
      etag: contentEtag(OTHER),
    });
    expect(readFileSync(path)).toEqual(OTHER);
  });

  it('reports the edit when it lands inside the save, before the save returns', async () => {
    const { path } = setup();
    const { save } = await open(path);
    let linked = false;
    // Right after the new file is in place: the next call of the save.
    intercept(
      (step) => {
        const act = linked;
        if (step === 'linkSync') linked = true;
        if (act) linked = false;
        return act;
      },
      () => {
        const { atime, mtime } = statSync(path);
        writeFileSync(path, OTHER);
        utimesSync(path, atime, mtime);
      }
    );
    const result = await save(MINE, contentEtag(ORIGINAL));
    release();
    expect(result).toMatchObject({ outcome: 'conflict', etag: contentEtag(OTHER) });
    expect(readFileSync(path)).toEqual(OTHER);
    expect(await save(THIRD, contentEtag(MINE))).toMatchObject({ outcome: 'conflict' });
    expect(readFileSync(path)).toEqual(OTHER);
  });
});
