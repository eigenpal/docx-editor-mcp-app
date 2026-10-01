/**
 * Harness emulation of the OpenAI file extension entrypoint (dev-only).
 *
 * ChatGPT and Codex desktop serve `resources/read`, `resources/subscribe` and
 * `openai/resources/write` for an opened file themselves, and notify the app
 * with `notifications/resources/updated` when the file changes. This module
 * answers those requests from an in-memory file, so the widget's file viewer
 * runs here exactly as it would in the host. "Agent edits file" rewrites the
 * file the way a coding agent regenerating a .docx would.
 */

import type { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SAMPLE_DOCX as SAMPLE } from './sample.js';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';

const URI = 'host-resource://harness/sample.docx';

const WriteRequestSchema = z.object({
  method: z.literal('openai/resources/write'),
  params: z.object({ uri: z.string(), blob: z.string(), ifMatch: z.string().optional() }),
});

let bytes: Uint8Array | null = null;
let version = 0;
let subscribed = false;
let edits = 0;

const etag = () => `v${version}`;

function toBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i += 0x8000)
    binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export function installHostFile(
  bridge: AppBridge,
  client: Client,
  log: (line: string) => void
): void {
  const notifyChanged = () => {
    if (!subscribed) return log('file changed, but the app is not subscribed');
    void (bridge as unknown as { notification(n: object): Promise<void> }).notification({
      method: 'notifications/resources/updated',
      params: { uri: URI },
    });
    log(`notifications/resources/updated (${etag()})`);
  };

  // The host serves its own file; every other resource is the server's.
  bridge.onreadresource = async (params) => {
    if (params.uri !== URI) return client.readResource(params);
    if (!bytes) throw new Error('no file is open');
    log(`resources/read ${URI} (${etag()}, ${bytes.length} bytes)`);
    return {
      contents: [
        {
          uri: URI,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          blob: toBase64(bytes),
          _meta: { 'openai/resource': { etag: etag(), writable: true } },
        },
      ],
    };
  };
  bridge.setRequestHandler(SubscribeRequestSchema, async ({ params }) => {
    subscribed = params.uri === URI;
    log(`resources/subscribe ${params.uri}`);
    return {};
  });
  bridge.setRequestHandler(UnsubscribeRequestSchema, async ({ params }) => {
    if (params.uri === URI) subscribed = false;
    log(`resources/unsubscribe ${params.uri}`);
    return {};
  });
  (bridge as unknown as { setRequestHandler: AppBridge['setRequestHandler'] }).setRequestHandler(
    WriteRequestSchema as never,
    (async ({ params }: z.infer<typeof WriteRequestSchema>) => {
      if (params.ifMatch && params.ifMatch !== etag()) {
        log(`openai/resources/write conflict (${params.ifMatch} ≠ ${etag()})`);
        return { outcome: 'conflict', etag: etag() };
      }
      bytes = fromBase64(params.blob);
      version += 1;
      log(`openai/resources/write saved (${etag()}, ${bytes.length} bytes)`);
      // A real host reports the save as a change too; the widget must skip it.
      notifyChanged();
      return { outcome: 'saved', etag: etag() };
    }) as never
  );

  const button = (id: string) => document.getElementById(id) as HTMLButtonElement;

  button('openfile').onclick = async () => {
    const response = await fetch(SAMPLE);
    if (!response.ok) return log(`could not fetch the sample (${response.status})`);
    bytes = new Uint8Array(await response.arrayBuffer());
    version = 1;
    // The host shows a file viewer in its side panel, sized by the host, not
    // by the app's reported height. Emulate that with the full-frame layout.
    document.body.dataset.mode = 'fullscreen';
    (document.getElementById('frame') as HTMLIFrameElement).style.height = '';
    const args = { file: { name: 'sample.docx', resourceUri: URI } };
    await bridge.sendToolInput({ arguments: args });
    await bridge.sendToolResult({
      content: [{ type: 'text', text: 'Showing sample.docx.' }],
      structuredContent: { ...args, seq: 1, createdAt: Date.now() },
    });
    log('file entrypoint opened sample.docx');
  };

  button('agentedit').onclick = () => {
    if (!bytes) return log('open the file first');
    bytes = agentRewrite(bytes, (edits += 1));
    version += 1;
    notifyChanged();
  };

  button('torn').onclick = () => {
    if (!bytes) return log('open the file first');
    // A read in the middle of a non-atomic write: half a zip, then the full file.
    const complete = agentRewrite(bytes, (edits += 1));
    bytes = complete.subarray(0, complete.length >> 1);
    version += 1;
    notifyChanged();
    setTimeout(() => {
      bytes = complete;
      version += 1;
      log('torn write completed');
    }, 400);
  };
}

/** What a coding agent regenerating the file does: edit one paragraph, append one. */
function agentRewrite(input: Uint8Array, n: number): Uint8Array {
  const files = unzipSync(input);
  let xml = strFromU8(files['word/document.xml']!);
  let replaced = false;
  xml = xml.replace(
    /(<w:t(?: [^>]*)?>)([^<]{12,})(<\/w:t>)/,
    (_m, open: string, text: string, close: string) => {
      replaced = true;
      return `${open}[Edit ${n}] ${text}${close}`;
    }
  );
  const added = `<w:p><w:r><w:t xml:space="preserve">Paragraph ${n} added by the agent.</w:t></w:r></w:p>`;
  const at = xml.lastIndexOf('<w:sectPr');
  xml =
    at === -1
      ? xml.replace('</w:body>', `${added}</w:body>`)
      : xml.slice(0, at) + added + xml.slice(at);
  files['word/document.xml'] = strToU8(xml);
  if (!replaced) console.warn('harness: no long text run to edit');
  return zipSync(files);
}
