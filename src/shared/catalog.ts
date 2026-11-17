/**
 * The tool catalog: every tool this app exposes, in one file both halves
 * import, so the server and the widget cannot drift apart.
 *
 * The catalog is also the allowlist. The model gets one tool, `open_document`.
 * It edits a .docx with its own document skills, never through this app; the
 * widget previews the file and follows its changes. The other tools here are
 * plumbing that the host or the widget calls (`visibility: ['app']`).
 */

import { z } from 'zod';
import { formatLimit, MAX_CONTENT_BYTES } from './limits.js';

const contentBase64 = (local: boolean) =>
  z
    .string()
    .optional()
    .describe(
      `Base64 of the .docx bytes. Maximum decoded size: ${MAX_CONTENT_BYTES} bytes (${formatLimit(MAX_CONTENT_BYTES)}). ` +
        'This preview does not follow or save back to a file.' +
        (local ? ' A path that opens here takes priority over these bytes.' : '')
    );

/** Shows a .docx in the preview. The only tool the model sees. */
export const OpenDocumentInput = z.object({
  path: z
    .string()
    .optional()
    .describe(
      "Absolute path of a .docx on the user's computer. The preview follows the file: " +
        "it updates when the file changes and saves the reader's edits to it."
    ),
  content_base64: contentBase64(true),
  name: z.string().optional().describe('File name to show, for example "contract.docx".'),
});

/** Hosted mode reads no disk, so its model never sees a `path` to try. */
export const HostedOpenDocumentInput = OpenDocumentInput.omit({ path: true }).extend({
  content_base64: contentBase64(false),
});

/** The `open_document` result `_meta` key carrying bytes passed as `content_base64`. */
export const DOCUMENT_META = 'docx-editor/document';

/**
 * The `open_document` result `_meta` key carrying the real path of a file
 * opened by path. A host with a file viewer opens the file there itself.
 */
export const PATH_META = 'docx-editor/path';

/**
 * The file viewer entrypoint. The HOST calls it when the user opens a .docx in
 * ChatGPT or Codex desktop. Its input is the OpenAI SDK's
 * `OpenAIFileEntrypointInputSchema`.
 */
export const VIEW_DOCX_FILE = {
  name: 'view_docx_file',
  title: 'DOCX Editor',
  description:
    'Shows a .docx file the user opened, page by page. The view updates when ' +
    "the file changes. The user's own edits in the viewer save through the host.",
} as const;

/** A file `open_document` opened: the encoded path, a dot, and its 32-byte signature. */
const LocalToken = z
  .string()
  .max(16_384)
  .regex(/^[\w-]+\.[\w-]{43}$/)
  .describe('The signed token after docx-local:// in the open_document result resourceUri.');

/**
 * Local mode's file sync, called by the WIDGET: the preview watches the file
 * `open_document` opened and saves the reader's own edits back to it.
 */
export const LOCAL_FILE_VERSION = {
  name: 'local_file_version',
  description: 'Return the current etag and write permission for a document opened from disk.',
  input: z.object({ token: LocalToken }),
} as const;

export const WRITE_LOCAL_FILE = {
  name: 'write_local_file',
  description:
    "Save the preview's document over its opened file, only if the file is unchanged. " +
    'ifMatch must be the etag of the version the save replaces; ' +
    'a different current version returns conflict and the file is not changed. ' +
    'There is no unconditional save. Size and write-permission checks still apply.',
  input: z.object({
    token: LocalToken,
    blob: z
      .string()
      .min(1)
      .describe(
        `Base64 of the .docx bytes. Maximum decoded size: ${MAX_CONTENT_BYTES} bytes (${formatLimit(MAX_CONTENT_BYTES)}).`
      ),
    ifMatch: z
      .string()
      .min(1)
      .describe(
        'The etag from local_file_version, or from a conflict result, of the version this save replaces. Required.'
      ),
  }),
} as const;
