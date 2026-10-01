/**
 * Which body paragraphs changed between two versions of one file.
 *
 * The engine's refresh controller replaces the document and keeps the reader's
 * scroll position, but it does not compare files: a plain replacement carries
 * no change locations, so nothing would be highlighted. A coding agent that
 * regenerates the `.docx` on disk sends exactly that, so the widget derives the
 * locations itself.
 *
 * Paragraphs are read with the same store walk the controller resolves
 * `paragraphIndex` against (body order, table and content-control paragraphs
 * included), and the text with `paragraphTextOf`. Both sides of the comparison
 * therefore agree with the controller's `text-mismatch` check by construction.
 */

import {
  paragraphTextOf,
  readOoxmlPackage,
  storyParagraphs,
  storyRootsOf,
} from '@docx-editor.dev/core/store';
import type { RefreshChangeInput } from '@docx-editor.dev/react';

/** Above this many cells the LCS table costs more than it is worth. */
const MAX_LCS_CELLS = 4_000_000;
/** Highlights past this many stop helping the reader find anything. */
const MAX_CHANGES = 200;
const SNIPPET_LENGTH = 80;

/**
 * One change for the refresh controller, plus the widget's own summary of it.
 * The summary stays in the widget: the published controller input has no
 * description field, so pass `toRefreshInputs(changes)` to `applyUpdate`.
 */
export interface ParagraphChange extends RefreshChangeInput {
  readonly description: string;
}

export function toRefreshInputs(changes: readonly ParagraphChange[]): RefreshChangeInput[] {
  return changes.map(({ description: _description, ...input }) => input);
}

/** Body paragraph texts in document order, or `null` for an unreadable package. */
export function bodyParagraphTexts(bytes: ArrayBuffer | Uint8Array): string[] | null {
  const result = readOoxmlPackage(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  if (!result.ok) return null;
  const part = result.package.parts.get(result.package.mainDocumentPart);
  if (!part) return null;
  const texts: string[] = [];
  for (const story of storyRootsOf(part)) {
    for (const paragraph of storyParagraphs(story.root)) {
      if (paragraph.kind === 'textValue') continue;
      texts.push(paragraphTextOf(part, paragraph.id) ?? '');
    }
  }
  return texts;
}

type Edit = { kind: 'keep' } | { kind: 'remove' } | { kind: 'add'; index: number };

/**
 * Change inputs for the paragraphs of `after` that differ from `before`.
 *
 * An addition next to a removal reads as an edit of that paragraph. Removals
 * with no surviving paragraph become one `deleted` summary per run, which the
 * controller keeps in the change list without a highlight.
 */
export function diffParagraphs(
  before: readonly string[],
  after: readonly string[]
): ParagraphChange[] {
  const edits = editScript(before, after);
  const changes: ParagraphChange[] = [];
  let omitted = 0;
  const push = (change: ParagraphChange) => {
    if (changes.length < MAX_CHANGES) changes.push(change);
    else omitted += 1;
  };

  for (let i = 0; i < edits.length;) {
    if (edits[i]!.kind === 'keep') {
      i += 1;
      continue;
    }
    let removed = 0;
    const added: number[] = [];
    for (; i < edits.length && edits[i]!.kind !== 'keep'; i += 1) {
      const edit = edits[i]!;
      if (edit.kind === 'add') added.push(edit.index);
      else removed += 1;
    }
    for (const [n, index] of added.entries()) {
      const text = after[index]!;
      const verb = n < removed ? 'Changed' : 'Added';
      // An empty paragraph has no nonempty range to highlight; list it only.
      push({
        id: `paragraph-${index}`,
        description: `${verb} paragraph ${index + 1}${text ? `: ${snippet(text)}` : ' (empty)'}`,
        ...(text
          ? { location: { paragraphIndex: index, start: 0, end: text.length, text } }
          : { unavailableReason: 'unavailable' as const }),
      });
    }
    if (removed > added.length) {
      const count = removed - added.length;
      push({
        id: `removed-${changes.length}-${count}`,
        description: `Removed ${count} paragraph${count === 1 ? '' : 's'}`,
        unavailableReason: 'deleted',
      });
    }
  }
  if (omitted > 0) {
    changes.push({ id: 'omitted', description: `${omitted} more changes are not listed` });
  }
  return changes;
}

/** A minimal edit script: common prefix and suffix, then an LCS over the middle. */
function editScript(before: readonly string[], after: readonly string[]): Edit[] {
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1;
  }
  // Interned: the LCS compares integers, not strings that a hostile file can
  // make long and nearly identical.
  const ids = new Map<string, number>();
  const intern = (text: string) => {
    let id = ids.get(text);
    if (id === undefined) ids.set(text, (id = ids.size));
    return id;
  };
  const a = before.slice(head, before.length - tail).map(intern);
  const b = after.slice(head, after.length - tail).map(intern);
  const keep = (n: number): Edit[] => Array.from({ length: n }, () => ({ kind: 'keep' }));
  return [...keep(head), ...middleScript(a, b, head), ...keep(tail)];
}

function middleScript(a: readonly number[], b: readonly number[], offset: number): Edit[] {
  const add = (j: number): Edit => ({ kind: 'add', index: offset + j });
  if (a.length * b.length > MAX_LCS_CELLS) {
    // Too large to align: report the whole region as rewritten.
    return [...a.map((): Edit => ({ kind: 'remove' })), ...b.map((_, j) => add(j))];
  }
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1]! + 1
          : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    }
  }
  const script: Edit[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      script.push({ kind: 'keep' });
      i += 1;
      j += 1;
    } else if (
      j < b.length &&
      (i === a.length || lcs[i * width + j + 1]! >= lcs[(i + 1) * width + j]!)
    ) {
      script.push(add(j));
      j += 1;
    } else {
      script.push({ kind: 'remove' });
      i += 1;
    }
  }
  return script;
}

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > SNIPPET_LENGTH ? `${flat.slice(0, SNIPPET_LENGTH - 1)}…` : flat;
}
