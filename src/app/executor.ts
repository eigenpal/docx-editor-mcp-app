/**
 * Document operations the model can reach, run against the editor the reader is
 * looking at.
 *
 * `@docx-editor.dev/editor-api/browser` borrows an editor the host already
 * created. `run(context => ...)` is the Office.js batch shape: queue loads,
 * `sync()`, read what came back.
 *
 * Comment and tracked-change operations live in `executor-review.ts`; the
 * dispatch table at the bottom is typed `Record<AppToolName, …>`, so a tool
 * added to `src/shared/catalog.ts` without an executor fails `bun run
 * typecheck` rather than failing at the model's first call.
 */

import { DocxEditor as EditorApi } from '@docx-editor.dev/editor-api/browser';
import type { DocxEditorRuntime } from '@docx-editor.dev/editor-api/browser';
import type { DocxEditorInstance } from '@docx-editor.dev/core/editor';
import type { ReviewItemView } from '@docx-editor.dev/pro/react';
import type { AppToolName } from '../shared/catalog.js';
import {
  addComment,
  readChanges,
  readComments,
  replyComment,
  resolveComment,
} from './executor-review.js';

/** What a tool call answers. `text` reaches the model verbatim. */
export interface ToolOutcome {
  ok: boolean;
  text: string;
  data?: Record<string, unknown>;
}

export const ok = (text: string, data?: Record<string, unknown>): ToolOutcome => ({
  ok: true,
  text,
  data,
});
export const fail = (text: string): ToolOutcome => ({ ok: false, text });

/** Comments on the current selection. Supplied by pro's `useReviewOf` at the call site. */
export type CommentOnSelection = (text: string, author?: string) => boolean;

export interface ExecutorDeps {
  runtime: DocxEditorRuntime;
  editor: DocxEditorInstance;
  commentOnSelection: CommentOnSelection;
  /** The live review items (pro's `useReviewOf(editor).items`), for read_changes. */
  getReviewItems: () => readonly ReviewItemView[];
  /** Serializes the current document. `DocxEditorRef.save()`. */
  save: () => Promise<ArrayBuffer | null>;
  /** Hands a file to the reader through the host. */
  download: (bytes: Uint8Array, fileName: string) => Promise<void>;
  /** Author attributed to comments and tracked changes. */
  author: string;
  /** The name the document was opened with. */
  documentName: string;
}

export interface ParagraphRecord {
  id: string;
  text: string;
}

/**
 * Creates the editor-api runtime for an editor the host already has open.
 *
 * Takes a `DocxEditorInstance` (what `useDocxEditor()` answers), not the
 * narrower `Editor` that `<DocxEditor onReady>` hands over. `createBrowser`
 * needs the instance.
 *
 * `revisionTextView: 'original'` matches Word's Original review view, so
 * `read_document` sees the text as it stands before the pending tracked
 * changes rather than a mix of both; `read_changes` reports the deltas.
 */
export function createRuntime(editor: DocxEditorInstance, author: string): DocxEditorRuntime {
  return EditorApi.createBrowser(editor, { author, revisionTextView: 'original' });
}

export async function readParagraphs(runtime: DocxEditorRuntime): Promise<ParagraphRecord[]> {
  return runtime.run(async (context) => {
    const paragraphs = context.document.body.paragraphs;
    // TWO PHASES, and the first is not optional. `text` and `uniqueLocalId` are
    // properties of a Paragraph, not of the collection, so asking the collection
    // for them throws InvalidArgument ("document.body.paragraphs.text").
    // Materialise the collection, then load each item.
    paragraphs.load();
    await context.sync();

    for (const paragraph of paragraphs.items) {
      paragraph.load(['text', 'uniqueLocalId']);
    }
    await context.sync();

    return paragraphs.items
      .map((p) => ({ id: p.uniqueLocalId, text: p.text.trim() }))
      .filter((p) => p.text.length > 0);
  });
}

/**
 * Locate a phrase and say which paragraph each hit sits in.
 *
 * Two syncs, and they cannot be collapsed into one: the search has to answer
 * before there are ranges whose owning paragraph can be asked for. Searching the
 * whole body rather than one paragraph is deliberate too, because `Paragraph`
 * has no `search` (only `Body` and `Range` do), so the owner is filtered after.
 */
async function locatePhrase(
  runtime: DocxEditorRuntime,
  phrase: string,
  matchCase: boolean
): Promise<Array<{ paragraphId: string; text: string }>> {
  return runtime.run(async (context) => {
    const hits = context.document.body.search(phrase, { matchCase });
    hits.load();
    await context.sync();

    if (hits.items.length === 0) return [];

    // `hit.paragraphs.getFirst()` does NOT survive here: it mints a promised
    // object whose path is already released, and the run dies with
    // InvalidObjectPath. Materialising each range's paragraph collection works.
    for (const hit of hits.items) hit.load('text');
    const ownerLists = hits.items.map((hit) => hit.paragraphs);
    for (const list of ownerLists) list.load();
    await context.sync();

    const owners = ownerLists.map((list) => list.items[0]);
    for (const owner of owners) owner?.load('uniqueLocalId');
    await context.sync();

    return hits.items.map((hit, index) => ({
      paragraphId: owners[index]?.uniqueLocalId ?? '',
      text: hit.text,
    }));
  });
}

/**
 * Resolve one phrase inside one paragraph to exactly one range AND select it —
 * in ONE batch. Locating in one `run()` and selecting in a second re-searches
 * the document, and an edit landing between the two syncs (the reader typing)
 * can shift the hit list so the index selects a different occurrence. Inside a
 * single run the located range object stays live and is the range selected.
 *
 * Case-sensitive on purpose: the model is told to copy the phrase verbatim out
 * of `read_document`, and a case-insensitive match would silently anchor to a
 * different occurrence than the one it meant. Every refusal names what to do
 * differently, because the model is the one that has to fix it.
 */
export async function selectExactPhrase(
  runtime: DocxEditorRuntime,
  paragraphId: string,
  search: string,
  location: 'Select' | 'End'
): Promise<{ text: string } | ToolOutcome> {
  return runtime.run(async (context) => {
    const hits = context.document.body.search(search, { matchCase: true });
    hits.load();
    await context.sync();

    if (hits.items.length === 0) {
      return fail(
        `The phrase "${search}" was not found. Copy it verbatim from read_document and try again.`
      );
    }

    for (const hit of hits.items) hit.load('text');
    const ownerLists = hits.items.map((hit) => hit.paragraphs);
    for (const list of ownerLists) list.load();
    await context.sync();

    const owners = ownerLists.map((list) => list.items[0]);
    for (const owner of owners) owner?.load('uniqueLocalId');
    await context.sync();

    const inParagraph = hits.items.filter(
      (_, index) => owners[index]?.uniqueLocalId === paragraphId
    );
    if (inParagraph.length === 0) {
      return fail(
        `The phrase "${search}" does not occur in paragraph ${paragraphId}. It was found in ${hits.items.length} other place(s). Use a phrase from that paragraph.`
      );
    }
    if (inParagraph.length > 1) {
      return fail(
        `The phrase "${search}" occurs ${inParagraph.length} times in that paragraph, so the anchor would be ambiguous. Use a longer, more distinctive phrase.`
      );
    }

    const target = inParagraph[0];
    target.select(location);
    await context.sync();
    return { text: target.text };
  });
}

export const isOutcome = (value: unknown): value is ToolOutcome =>
  typeof value === 'object' && value !== null && 'ok' in value;

/**
 * How much of the document one `read_document` may hand the model.
 *
 * A tool result stays in the message history, so it is re-sent on EVERY later
 * turn. Handing over a whole long document means uploading and re-billing it
 * once per step, which is most of what makes an agent feel slow.
 *
 * Truncation is reported to the model rather than hidden, so it can page or
 * search for what it needs instead of assuming it has seen everything.
 */
const DEFAULT_LIMIT = 200;
const MAX_CHARS = 24_000;

export async function readDocument(
  deps: ExecutorDeps,
  input: { offset?: number; limit?: number }
): Promise<ToolOutcome> {
  const all = await readParagraphs(deps.runtime);
  if (all.length === 0) return ok('The document is empty.');

  const offset = Math.min(input.offset ?? 0, all.length);
  const limit = input.limit ?? DEFAULT_LIMIT;

  const slice: ParagraphRecord[] = [];
  let budget = MAX_CHARS;
  for (const paragraph of all.slice(offset)) {
    if (slice.length >= limit) break;
    if (budget - paragraph.text.length < 0) {
      // The FIRST paragraph of a slice is included even over budget (truncated)
      // — otherwise a paragraph longer than the whole budget would come back as
      // an empty slice whose note says to retry the same offset, for ever.
      if (slice.length === 0) {
        slice.push({
          id: paragraph.id,
          text: `${paragraph.text.slice(0, MAX_CHARS)}… [truncated: paragraph is ${paragraph.text.length} characters]`,
        });
      }
      break;
    }
    budget -= paragraph.text.length;
    slice.push(paragraph);
  }

  const end = offset + slice.length;
  if (offset === 0 && end === all.length) {
    return ok(JSON.stringify({ paragraphs: slice }), {
      paragraphs: slice,
      total: all.length,
    });
  }
  // Directive, not apologetic: worded as a limit to explain, the model spends
  // its whole turn explaining the limit.
  return ok(
    JSON.stringify({
      paragraphs: slice,
      total: all.length,
      note: `This slice is what you have to work with: paragraphs ${offset + 1}-${end} of ${all.length}. Act on it now rather than describing the limit. Call read_document with offset ${end} for the next slice, or find_text for a specific phrase.`,
    }),
    { paragraphs: slice, total: all.length, offset }
  );
}

export async function findText(
  deps: ExecutorDeps,
  input: { query: string; matchCase?: boolean }
): Promise<ToolOutcome> {
  if (!input.query) return fail('query is required.');
  const hits = await locatePhrase(deps.runtime, input.query, Boolean(input.matchCase));
  if (hits.length === 0) return ok(`No match for "${input.query}".`);
  return ok(JSON.stringify(hits), { hits });
}

export async function editText(
  deps: ExecutorDeps,
  input: { paragraphId: string; search: string; replacement: string; tracked?: boolean }
): Promise<ToolOutcome> {
  const { paragraphId, search, replacement } = input;
  if (!paragraphId || !search) return fail('paragraphId and search are both required.');

  const anchor = await selectExactPhrase(deps.runtime, paragraphId, search, 'Select');
  if (isOutcome(anchor)) return anchor;

  // Tracked by default. An agent editing someone's contract in place, with no
  // record of what it touched, is the failure mode this product exists to avoid.
  //
  // `exec` answers with an ExecResult — a refusal VALUE carrying a code and a
  // reason, not an exception. Both reach the model: the reason is usually
  // enough for a retry that can work.
  const tracked = input.tracked ?? true;
  const deleting = replacement.length === 0;

  const command = tracked
    ? deleting
      ? { type: 'proposeDeletion' as const, author: deps.author }
      : { type: 'proposeReplacement' as const, replaceWith: replacement, author: deps.author }
    : deleting
      ? { type: 'deleteText' as const }
      : { type: 'replaceText' as const, text: replacement };

  const result = deps.editor.exec(command);
  if (!result.ok) {
    return fail(`The editor refused the edit (${result.code}): ${result.reason}`);
  }
  if (!result.changed) {
    return fail(`The edit changed nothing. "${search}" may already read that way.`);
  }
  if (!tracked) {
    return deleting
      ? ok(`Deleted "${search}".`)
      : ok(`Replaced "${search}" with "${replacement}".`);
  }
  return deleting
    ? ok(`Proposed deleting "${search}". The reader accepts or rejects it.`)
    : ok(`Proposed replacing "${search}" with "${replacement}". The reader accepts or rejects it.`);
}

export async function exportDocument(
  deps: ExecutorDeps,
  input: { name?: string }
): Promise<ToolOutcome> {
  const buffer = await deps.save();
  if (!buffer) return fail('No document is open.');

  const name = ensureDocxExtension(input.name ?? deps.documentName);
  await deps.download(new Uint8Array(buffer), name);
  return ok(`Saved ${name} (${Math.round(buffer.byteLength / 1024)} KB).`);
}

function ensureDocxExtension(name: string): string {
  return /\.docx$/i.test(name) ? name : `${name}.docx`;
}

/**
 * The dispatch table, typed `Record<AppToolName, …>` so the COMPILER is the
 * drift guard: adding a tool to `src/shared/catalog.ts` without writing its
 * executor fails `bun run typecheck`.
 *
 * Each handler takes `unknown` args. The host validates them against the schema
 * the tool registered, so what arrives is already the shape the catalog names;
 * the casts below say so once, here, instead of at nine call sites.
 */
const HANDLERS: Record<
  AppToolName,
  (deps: ExecutorDeps, args: Record<string, unknown>) => Promise<ToolOutcome>
> = {
  read_document: (deps, args) => readDocument(deps, args as { offset?: number; limit?: number }),
  find_text: (deps, args) => findText(deps, args as { query: string; matchCase?: boolean }),
  edit_text: (deps, args) =>
    editText(
      deps,
      args as { paragraphId: string; search: string; replacement: string; tracked?: boolean }
    ),
  add_comment: (deps, args) =>
    addComment(deps, args as { paragraphId: string; search: string; comment: string }),
  read_comments: (deps) => readComments(deps),
  reply_comment: (deps, args) => replyComment(deps, args as { commentId: string; reply: string }),
  resolve_comment: (deps, args) => resolveComment(deps, args as { commentId: string }),
  read_changes: (deps) => readChanges(deps),
  export_document: (deps, args) => exportDocument(deps, args as { name?: string }),
};

export function runTool(
  deps: ExecutorDeps,
  name: string,
  args: Record<string, unknown>
): Promise<ToolOutcome> {
  const handler = HANDLERS[name as AppToolName];
  if (!handler) return Promise.resolve(fail(`Unknown tool: ${name}`));
  return handler(deps, args);
}
