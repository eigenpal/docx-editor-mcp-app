/**
 * Smoke test of the built package over stdio, the path desktop hosts use:
 * start `dist/cli.js stdio`, list the tools, read the inline widget and the
 * wasm resource, open a file, and save through the message a preview
 * autosave sends: a document under the cap saves, and a 12 MB one gets a
 * `too-large` answer. The SDK's default 10 MB message limit once made a save
 * that size end the server.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (message) => {
  console.error(`smoke-stdio: ${message}`);
  process.exit(1);
};

const client = new Client({ name: 'smoke', version: '0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [join(root, 'dist/cli.js'), 'stdio'],
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

const dir = mkdtempSync(join(tmpdir(), 'smoke-'));
const path = join(dir, 'big.docx');
const doc = (size) => {
  const bytes = Buffer.alloc(size);
  bytes.set([0x50, 0x4b, 0x03, 0x04]);
  return bytes;
};
writeFileSync(path, doc(64));
const opened = await client.callTool({ name: 'open_document', arguments: { path } });
const token = opened.structuredContent?.resourceUri?.split('//')[1];
if (!token) fail('open_document did not open the file');
const save = (bytes, ifMatch) =>
  client.callTool({
    name: 'write_local_file',
    arguments: { token, blob: bytes.toString('base64'), ifMatch },
  });
const saved = await save(doc(6 * 1024 * 1024), null);
if (saved.structuredContent?.outcome !== 'saved')
  fail(`6 MB save: ${JSON.stringify(saved.structuredContent)}`);
const tooLarge = await save(doc(12 * 1024 * 1024), saved.structuredContent.etag);
if (tooLarge.structuredContent?.outcome !== 'too-large')
  fail(`12 MB save: ${JSON.stringify(tooLarge.structuredContent)}`);

// A file over the cap is refused at open, so no save of it can ever exceed
// the transport's message limit.
const huge = join(dir, 'huge.docx');
writeFileSync(huge, Buffer.alloc(16 * 1024 * 1024));
const refused = await client.callTool({ name: 'open_document', arguments: { path: huge } });
if (!refused.isError) fail('a file over the size cap opened');
await client.listTools(); // still connected

await client.close();
console.log('smoke-stdio: ok');
