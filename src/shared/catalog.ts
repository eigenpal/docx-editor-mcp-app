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

/** Shows a .docx in the preview. The only tool the model sees. */
export const OpenDocumentInput = z.object({
  path: z
    .string()
    .optional()
    .describe(
      "Absolute path of a .docx on the user's computer. The preview follows the file: " +
        "it updates when the file changes and saves the reader's edits to it."
    ),
  content_base64: z
    .string()
    .optional()
    .describe('Base64 of the .docx bytes, for a file with no path here (a code sandbox).'),
  name: z.string().optional().describe('File name to show, for example "contract.docx".'),
});

/** The `open_document` result `_meta` key carrying bytes passed as `content_base64`. */
export const DOCUMENT_META = 'docx-editor/document';

/**
 * The file viewer entrypoint. The HOST calls it when the user opens a .docx in
 * ChatGPT or Codex desktop. Its input is the OpenAI SDK's
 * `OpenAIFileEntrypointInputSchema`.
 */
export const VIEW_DOCX_FILE = {
  name: 'view_docx_file',
  title: '.docx viewer',
  description:
    'Shows a .docx file the user opened, with Word-faithful pages. The view updates when ' +
    "the file changes. The user's own edits in the viewer save through the host.",
} as const;

/**
 * Local mode's file sync, called by the WIDGET: the preview watches the file
 * `open_document` opened and saves the reader's own edits back to it.
 */
export const LOCAL_FILE_VERSION = {
  name: 'local_file_version',
  description: 'Returns the version token of a document the preview opened from disk.',
  input: z.object({ token: z.string().uuid() }),
} as const;

export const WRITE_LOCAL_FILE = {
  name: 'write_local_file',
  description: "Saves the preview's document over the file it opened, if the file is unchanged.",
  input: z.object({
    token: z.string().uuid(),
    blob: z.string().min(1).describe('Base64 of the .docx bytes.'),
    ifMatch: z.string().nullable(),
  }),
} as const;
