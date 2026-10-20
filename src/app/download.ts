/**
 * The host's download flow for a `.docx`, for hosts that offer one.
 */

import type { App } from '@modelcontextprotocol/ext-apps';
import { bytesToBase64 } from './host-file.js';

/** Hands a `.docx` to the reader through the host's download flow. */
export async function downloadDocx(
  app: App,
  bytes: Uint8Array,
  fileName: string
): Promise<boolean> {
  const result = await app.downloadFile({
    contents: [
      {
        type: 'resource',
        resource: {
          uri: `file:///${fileName}`,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          blob: bytesToBase64(bytes),
        },
      },
    ],
  });
  return result.isError !== true;
}
