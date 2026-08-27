/**
 * The tool catalog. One file, imported by both halves of the app.
 *
 * `@docx-editor.dev/editor-api` ships no tool schemas on purpose: which
 * operations a model may reach, and how they are described to it, is a decision
 * about the model's interface and belongs to the app that owns the model. This
 * is that decision, kept in one place so the MCP server (which advertises
 * `open_document`) and the widget (which registers and runs the rest) cannot
 * drift apart.
 *
 * The catalog is also the allowlist. A model that decides to do something this
 * file does not name has nothing to call, rather than merely being told not to.
 */

import { z } from 'zod';

/**
 * Paragraphs are addressed by `uniqueLocalId`, the editor-api object model's own
 * handle. It is issued by the runtime, so every paragraph has one, whether or
 * not the OOXML carried an id for it.
 */
const paragraphId = z
  .string()
  .describe("The paragraph's id, exactly as returned by read_document or find_text.");

const searchPhrase = z
  .string()
  .describe(
    'A short, VERBATIM phrase from that paragraph to anchor to. It must appear in the paragraph exactly, including case and punctuation. Keep it under 10 words so it stays unique.'
  );

/** Opens the editor. The only tool the MCP server itself answers. */
export const OpenDocumentInput = z.object({
  url: z
    .string()
    .optional()
    .describe(
      'HTTPS URL of a .docx file to open, reachable without credentials. When the server runs locally (Claude Desktop), an absolute file path also works. Omit to open an empty document.'
    ),
  name: z
    .string()
    .optional()
    .describe('File name to show in the editor title bar, for example "contract.docx".'),
});

export const ReadDocumentInput = z.object({
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Paragraph index to start from. Defaults to 0.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(400)
    .optional()
    .describe('How many paragraphs to return. Defaults to 200, the maximum is 400.'),
});

export const FindTextInput = z.object({
  query: z.string().describe('The text to search for.'),
  matchCase: z.boolean().optional().describe('Case-sensitive search. Defaults to false.'),
});

export const EditTextInput = z.object({
  paragraphId,
  search: searchPhrase,
  replacement: z
    .string()
    .describe('The text to put in its place. Pass an empty string to delete the phrase.'),
  tracked: z
    .boolean()
    .optional()
    .describe(
      'Propose the edit as a Word tracked change instead of applying it outright. Defaults to true, so a person reviews every change.'
    ),
});

export const AddCommentInput = z.object({
  paragraphId,
  search: searchPhrase,
  comment: z.string().describe('The comment text. Keep it under 40 words.'),
});

export const ReplyCommentInput = z.object({
  commentId: z.string().describe("The comment's id, exactly as returned by read_comments."),
  reply: z.string().describe('The reply text.'),
});

export const ResolveCommentInput = z.object({
  commentId: z.string().describe("The comment's id, exactly as returned by read_comments."),
});

export const ExportDocumentInput = z.object({
  name: z
    .string()
    .optional()
    .describe('File name to save as. Defaults to the name the document was opened with.'),
});

/**
 * Tools the WIDGET registers and runs, against the editor the reader is looking
 * at. The host proxies each model call into the iframe; nothing here touches the
 * server, and no document bytes leave the browser.
 */
export const APP_TOOLS = {
  read_document: {
    title: 'Read document',
    description:
      'Read the open document as an ordered list of paragraphs, each with its id and text. Call this once before editing. Empty paragraphs are omitted.',
    inputSchema: ReadDocumentInput,
  },
  find_text: {
    title: 'Find text',
    description:
      'Find occurrences of a phrase in the open document. Returns each match with the id of the paragraph holding it.',
    inputSchema: FindTextInput,
  },
  edit_text: {
    title: 'Edit text',
    description:
      'Replace a verbatim phrase inside one paragraph. By default the edit lands as a Word tracked change, so the reader accepts or rejects it.',
    inputSchema: EditTextInput,
  },
  add_comment: {
    title: 'Add comment',
    description:
      'Leave a Word comment anchored to a phrase inside a paragraph. The comment points at the offending words rather than the whole block, and it survives the save into Word.',
    inputSchema: AddCommentInput,
  },
  read_comments: {
    title: 'Read comments',
    description:
      'List the comments on the document, with id, text, author, resolved state and the text each one is anchored to. The reader leaves comments in the editor; call this when they mention feedback, or before revising, to see what they asked for.',
    inputSchema: z.object({}),
  },
  reply_comment: {
    title: 'Reply to comment',
    description:
      "Reply to an existing comment thread. Reply to the reader's comment when you act on it, so the thread records what was done and why.",
    inputSchema: ReplyCommentInput,
  },
  resolve_comment: {
    title: 'Resolve comment',
    description:
      'Mark a comment thread resolved. Resolve only after the requested change has actually landed in the document — never to tidy away feedback you did not act on.',
    inputSchema: ResolveCommentInput,
  },
  read_changes: {
    title: 'Read pending changes',
    description:
      "List the pending tracked changes (suggestions), each with id, author, kind and the text it covers. Changes by other authors are the reader's own edits — read them before revising, and treat a suggestion of yours that no longer appears as accepted or rejected by the reader.",
    inputSchema: z.object({}),
  },
  export_document: {
    title: 'Export document',
    description:
      'Save the open document, with every edit and comment, as a .docx file the reader can download.',
    inputSchema: ExportDocumentInput,
  },
} as const;

export type AppToolName = keyof typeof APP_TOOLS;

/**
 * Tools whose success changes the document. The widget bumps its revision
 * counter after one of these lands, which refreshes the inline card's counts
 * and the model-context push.
 */
export const MUTATING_TOOLS: ReadonlySet<string> = new Set([
  'edit_text',
  'add_comment',
  'reply_comment',
  'resolve_comment',
]);

/** Chat-log labels. The raw tool name is a poor thing to show a reader. */
const TOOL_LABELS: Record<string, string> = {
  open_document: 'Opening the document',
  read_document: 'Reading the document',
  find_text: 'Searching the document',
  edit_text: 'Suggesting an edit',
  add_comment: 'Leaving a comment',
  read_comments: 'Reading comments',
  reply_comment: 'Replying to a comment',
  resolve_comment: 'Resolving a comment',
  read_changes: 'Reading pending changes',
  export_document: 'Exporting the document',
};

export function getToolDisplayName(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ');
}
