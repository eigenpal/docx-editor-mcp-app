/**
 * A document request, and where its bytes come from. All three arrive over
 * MCP, so the widget never fetches from the network:
 *
 *   file      The host opened a .docx through the file entrypoint; the host
 *             serves it (`host-file.ts`).
 *   resource  `open_document` opened a path (local mode); this server serves
 *             it as `docx-local://<token>` (`local-file.ts`).
 *   bytes     `open_document` got `content_base64`; the bytes came in the tool
 *             result, and there is no file to follow.
 */

import type { App } from '@modelcontextprotocol/ext-apps';
import { base64ToBytes, readHostFile, type HostFileVersion, type OpenedFile } from './host-file.js';
import { readLocalFile } from './local-file.js';

export type OpenRequest = { name: string } & (
  | { file: OpenedFile; resource?: never; base64?: never }
  | { resource: string; file?: never; base64?: never }
  | { base64: string; file?: never; resource?: never }
);

export interface LoadedDoc {
  request: OpenRequest;
  /** The version the editor opened, with its etag and whether it can be saved. */
  opened: HostFileVersion;
}

export async function loadRequest(app: App, request: OpenRequest): Promise<LoadedDoc> {
  // Decoded here, not in the notification handler, so bad bytes show the error card.
  const opened =
    request.base64 !== undefined
      ? { bytes: base64ToBytes(request.base64), etag: null, writable: false }
      : request.file
        ? await readHostFile(app, request.file.resourceUri)
        : await readLocalFile(app, request.resource);
  return { request, opened };
}
