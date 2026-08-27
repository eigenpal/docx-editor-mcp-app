/**
 * `write_document`: the authoring half of the catalog.
 *
 * Without it, "write an NDA into this document" has no path through the
 * editor. The model then drafts the file in its own sandbox and tries to open
 * a path that does not exist on the reader's machine. This tool writes the
 * body of the OPEN document, in one atomic operation, so drafting happens
 * where the reader is looking.
 *
 * The write goes through the engine's automation protocol
 * (`replaceStoryBlocks`), the same path the docx-editor write-agent example
 * uses: one transaction, then styles per paragraph through editor-api.
 */

import { createBrowserAutomationHost } from '@docx-editor.dev/core/editor';
import type { AutomationBatchResponse, AutomationHandle } from '@docx-editor.dev/core/automation';
import { fail, ok, readParagraphs } from './executor.js';
import type { ExecutorDeps, ToolOutcome } from './executor.js';

export interface WriteBlock {
  text: string;
  style?: 'Title' | 'Subtitle' | 'Heading 1' | 'Heading 2' | 'Quote' | 'Normal';
}

function handleAt(response: AutomationBatchResponse, index: number): AutomationHandle {
  const result = response.results[index];
  if (result?.status !== 'ok' || result.value.kind !== 'handle') {
    const detail = result?.status === 'error' ? `${result.error.code}: ${result.error.detail}` : '';
    throw new Error(`automation handle ${index} was unavailable${detail ? `: ${detail}` : ''}`);
  }
  return result.value.handle;
}

export async function writeDocument(
  deps: ExecutorDeps,
  input: { paragraphs: WriteBlock[]; overwrite?: boolean }
): Promise<ToolOutcome> {
  const blocks = input.paragraphs;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return fail('paragraphs is required: an array of { text, style? }.');
  }

  // Replacing a document the reader already has content in must be a stated
  // decision, not a side effect of a drafting call.
  if (!input.overwrite) {
    const existing = await readParagraphs(deps.runtime);
    if (existing.length > 0) {
      return fail(
        `The document already has ${existing.length} paragraph(s). write_document replaces the whole body. Pass overwrite: true to confirm, or use edit_text for changes.`
      );
    }
  }

  const host = createBrowserAutomationHost(deps.editor);
  const document = handleAt(host.execute({ operations: [{ op: 'getDocument' }] }), 0);
  const body = handleAt(host.execute({ operations: [{ op: 'getBody', document }] }), 0);
  const replacement = host.execute({
    operations: [{ op: 'replaceStoryBlocks', body, paragraphs: blocks.map((block) => block.text) }],
  });
  const result = replacement.results[0];
  if (result?.status !== 'ok' || result.value.kind !== 'applied') {
    const detail =
      result?.status === 'error'
        ? `${result.error.code}: ${result.error.detail}`
        : 'the operation returned no applied result';
    return fail(`The editor refused the write: ${detail}`);
  }

  // Styles through editor-api, then ids so the model can edit what it wrote.
  const paragraphs = await deps.runtime.run(async (context) => {
    const collection = context.document.body.paragraphs;
    collection.load();
    await context.sync();
    collection.items.forEach((paragraph, index) => {
      paragraph.style = blocks[index]?.style ?? 'Normal';
    });
    await context.sync();
    collection.items.forEach((paragraph) => paragraph.load('uniqueLocalId'));
    await context.sync();
    return collection.items.map((paragraph, index) => ({
      id: paragraph.uniqueLocalId,
      text: blocks[index]?.text ?? '',
    }));
  });

  return ok(
    `Wrote ${blocks.length} paragraph(s) into the document. The reader sees it in the editor; edit further with edit_text.`,
    { paragraphs }
  );
}
