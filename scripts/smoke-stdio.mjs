/**
 * Smoke test of the built package over stdio, the path desktop hosts use:
 * start `dist/cli.js stdio`, list the tools, read the inline widget and the
 * wasm resource, open a file, and save through the message a preview
 * autosave sends: a save without an etag is refused, a document under the cap
 * saves, and a 12 MiB one gets a `too-large` answer. The SDK's default 10 MiB message limit once made a save
 * that size end the server.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'smoke-'));
const fail = (message) => {
  console.error(`smoke-stdio: ${message}`);
  process.exit(1);
};

const client = new Client({ name: 'smoke', version: '0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [join(root, 'dist/cli.js'), 'stdio'],
    env: { DOCX_EDITOR_STATE_DIR: join(dir, 'state') },
    stderr: 'ignore',
  })
);

const { tools } = await client.listTools();
const visible = tools.filter((t) => !t._meta?.ui?.visibility?.every((v) => v === 'app'));
if (visible.map((t) => t.name).join() !== 'open_document')
  fail(`model sees ${visible.map((t) => t.name)}`);

const ui = await client.readResource({ uri: tools[0]._meta.ui.resourceUri });
if (/<(script|link)[^>]+(src|href)=/.test(ui.contents[0].text))
  fail('the widget loads an external asset');
const wasm = await client.readResource({ uri: 'docx-asset://harfbuzz.wasm' });
if (Buffer.from(wasm.contents[0].blob, 'base64').length < 100_000) fail('harfbuzz.wasm is missing');

const path = join(dir, 'big.docx');
const doc = (size) => {
  const bytes = Buffer.alloc(size);
  bytes.set([0x50, 0x4b, 0x03, 0x04]);
  return bytes;
};
writeFileSync(path, doc(64));
const opened = await client.callTool({ name: 'open_document', arguments: { path } });
const token = opened._meta?.['docx-editor/resource']?.split('//')[1];
if (JSON.stringify([opened.content, opened.structuredContent]).includes('docx-local'))
  fail('the model sees the token that saves the file');
if (!token) fail('open_document did not open the file');
const save = (bytes, ifMatch) =>
  client.callTool({
    name: 'write_local_file',
    arguments: { token, blob: bytes.toString('base64'), ifMatch },
  });
// Every save names the version it replaces; there is no unconditional save.
const unconditional = await save(doc(128), null);
if (!unconditional.isError) fail('a save without an etag was accepted');
const current = await client.callTool({ name: 'local_file_version', arguments: { token } });
const saved = await save(doc(6 * 1024 * 1024), current.structuredContent?.etag);
if (saved.structuredContent?.outcome !== 'saved')
  fail(`6 MiB save: ${JSON.stringify(saved.structuredContent)}`);
const tooLarge = await save(doc(12 * 1024 * 1024), saved.structuredContent.etag);
if (tooLarge.structuredContent?.outcome !== 'too-large')
  fail(`12 MiB save: ${JSON.stringify(tooLarge.structuredContent)}`);

// A file over the cap opens, for a host's own file viewer, but this server
// never sends it: the read is refused before its base64 could exceed the
// host's message limit and end the connection.
const huge = join(dir, 'huge.docx');
const hugeBytes = Buffer.alloc(16 * 1024 * 1024);
hugeBytes.set([0x50, 0x4b, 0x03, 0x04]);
writeFileSync(huge, hugeBytes);
const large = await client.callTool({ name: 'open_document', arguments: { path: huge } });
const hugeUri = large._meta?.['docx-editor/resource'];
if (large.isError || !hugeUri) fail('a large file did not open for the host viewer');
if (large._meta?.['docx-editor/path'] === undefined) fail('a large file gave no path');
const hugeRead = await client.readResource({ uri: hugeUri }).then(
  () => 'read',
  () => 'refused'
);
if (hugeRead !== 'refused') fail('the server sent a file over the size cap');
await client.listTools(); // still connected

await client.close();
console.log('smoke-stdio: ok');
