/**
 * A file `open_document` opened from disk in local mode, as a `SyncFile`.
 *
 * Same contract as the host's opened files (`host-file.ts`), served by this
 * app's own server: the bytes and version come from the `docx-local://`
 * resource, writes go through `write_local_file`, and changes are noticed by
 * polling `local_file_version`. Hosts do not forward resource subscriptions
 * from an app to its server reliably, so polling is the portable choice; the
 * check is a `stat`, not a read.
 */

import type { App } from '@modelcontextprotocol/ext-apps';
import { LOCAL_FILE_VERSION, WRITE_LOCAL_FILE } from '../shared/catalog.js';
import { MAX_CONTENT_BYTES } from '../shared/limits.js';
import type { SyncFile } from './file-sync-session.js';
import {
  base64ToBytes,
  bytesToBase64,
  type HostFileVersion,
  type HostFileWriteResult,
} from './host-file.js';

const POLL_MS = 1000;
const LOCAL_SCHEME = 'docx-local://';

export function isLocalResource(uri: string): boolean {
  return uri.startsWith(LOCAL_SCHEME);
}

export async function readLocalFile(app: App, uri: string): Promise<HostFileVersion> {
  const result = await app.readServerResource({ uri });
  const content = result.contents[0];
  if (!content || !('blob' in content)) throw new Error('the server sent no document');
  const meta = (content._meta?.['openai/resource'] ?? {}) as { etag?: string; writable?: boolean };
  return {
    bytes: base64ToBytes(content.blob),
    etag: meta.etag || null,
    writable: meta.writable === true,
  };
}

export function localSyncFile(app: App, uri: string): SyncFile {
  const token = uri.slice(LOCAL_SCHEME.length);
  return {
    read: () => readLocalFile(app, uri),
    async write(bytes, ifMatch): Promise<HostFileWriteResult> {
      // Checked here, not only on the server: an oversized message would end
      // the stdio server before its handler could refuse it.
      if (bytes.byteLength > MAX_CONTENT_BYTES) {
        return { outcome: 'too-large', maxBytes: MAX_CONTENT_BYTES };
      }
      const result = await app.callServerTool({
        name: WRITE_LOCAL_FILE.name,
        arguments: { token, blob: bytesToBase64(bytes), ifMatch },
      });
      const outcome = result.structuredContent as
        HostFileWriteResult | { outcome: 'refused'; message: string } | undefined;
      if (!outcome || outcome.outcome === 'refused') {
        throw new Error(outcome?.message ?? 'The server did not save the file.');
      }
      return outcome;
    },
    async watch(onChange) {
      let last: string | null = null;
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = async () => {
        try {
          const result = await app.callServerTool({
            name: LOCAL_FILE_VERSION.name,
            arguments: { token },
          });
          const etag = (result.structuredContent as { etag?: string } | undefined)?.etag;
          if (etag) {
            if (last !== null && etag !== last) onChange();
            last = etag;
          }
        } catch {
          // A missed poll is retried on the next tick.
        }
        if (!stopped) timer = setTimeout(() => void tick(), POLL_MS);
      };
      void tick();
      return () => {
        stopped = true;
        clearTimeout(timer);
      };
    },
  };
}
