/**
 * The review half of the catalog: comments and pending tracked changes.
 *
 * This is what makes the loop bidirectional. The reader comments and edits in
 * the editor; the model reads both back, replies, revises, and resolves. Two
 * data paths, each chosen for what it is good at:
 *
 *  - Comments go through editor-api (`context.document.comments`), because
 *    reply and resolve are editor-api writes and read ids must match write ids.
 *  - Pending tracked changes come from pro's review items — the same data the
 *    review rail renders — because editor-api has no revisions collection, and
 *    the rail's derivation already carries author, kind and covered text.
 *
 * One exception, and it is not incidental: editor-api can read, reply to and
 * resolve comments but cannot CREATE one. So `add_comment` selects the phrase
 * through editor-api and lands the comment through pro's review API, which
 * comments on the current selection. Both halves drive the same editor.
 */

import { fail, isOutcome, ok, selectExactPhrase } from './executor.js';
import type { ExecutorDeps, ToolOutcome } from './executor.js';

export async function addComment(
  deps: ExecutorDeps,
  input: { paragraphId: string; search: string; comment: string }
): Promise<ToolOutcome> {
  const { paragraphId, search, comment } = input;
  if (!paragraphId || !search || !comment) {
    return fail('paragraphId, search and comment are all required.');
  }

  const anchor = await selectExactPhrase(deps.runtime, paragraphId, search, 'Select');
  if (isOutcome(anchor)) return anchor;

  // The selection is now on the phrase, so pro's review API anchors the comment
  // to it. It REPORTS rather than throws: a document open for viewing refuses
  // every comment, and the model needs to hear that.
  const landed = deps.commentOnSelection(comment, deps.author);
  if (!landed) return fail('The editor refused the comment. The document may be read-only.');
  return ok(`Commented on "${anchor.text}".`);
}

interface CommentEntry {
  id: string;
  text: string;
  author: string;
  resolved: boolean;
}

export async function readComments(deps: ExecutorDeps): Promise<ToolOutcome> {
  const comments = await deps.runtime.run(async (context) => {
    const collection = context.document.comments;
    // Two-phase, as everywhere else: these are Comment properties, not
    // properties of the collection.
    collection.load();
    await context.sync();
    for (const c of collection.items) c.load(['id', 'text', 'authorName', 'resolved']);
    await context.sync();
    return collection.items.map((c): CommentEntry => ({
      id: c.id,
      text: c.text,
      author: c.authorName,
      resolved: c.resolved,
    }));
  });
  if (comments.length === 0) return ok('The document has no comments.');
  const unresolved = comments.filter((c) => !c.resolved).length;
  return ok(JSON.stringify({ comments, unresolved }), { comments, unresolved });
}

export async function replyComment(
  deps: ExecutorDeps,
  input: { commentId: string; reply: string }
): Promise<ToolOutcome> {
  const { commentId, reply } = input;
  if (!commentId || !reply) return fail('commentId and reply are both required.');
  const done = await deps.runtime.run(async (context) => {
    const collection = context.document.comments;
    collection.load();
    await context.sync();
    for (const c of collection.items) c.load('id');
    await context.sync();
    const match = collection.items.find((c) => c.id === commentId);
    if (!match) return false;
    match.reply(reply);
    await context.sync();
    return true;
  });
  return done
    ? ok('Replied.')
    : fail(`No comment with id ${commentId}. Copy the id from read_comments.`);
}

export async function resolveComment(
  deps: ExecutorDeps,
  input: { commentId: string }
): Promise<ToolOutcome> {
  const { commentId } = input;
  if (!commentId) return fail('commentId is required.');
  const done = await deps.runtime.run(async (context) => {
    const collection = context.document.comments;
    collection.load();
    await context.sync();
    for (const c of collection.items) c.load('id');
    await context.sync();
    const match = collection.items.find((c) => c.id === commentId);
    if (!match) return false;
    match.resolved = true;
    await context.sync();
    return true;
  });
  return done
    ? ok('Resolved.')
    : fail(`No comment with id ${commentId}. Copy the id from read_comments.`);
}

/**
 * Pending tracked changes, from the same derivation the review rail renders.
 *
 * `kind` and the covered text let the model describe a change; `author` is what
 * makes the loop legible — a change whose author is not the agent is the
 * READER'S edit, and a suggestion of the agent's that no longer appears was
 * accepted or rejected by the reader.
 */
export async function readChanges(deps: ExecutorDeps): Promise<ToolOutcome> {
  const changes = deps
    .getReviewItems()
    .filter((item) => item.kind === 'revision')
    .map((item) => ({
      id: item.id,
      author: item.author,
      kind: item.revisionKind,
      text: item.text,
      ...(item.replacedText !== undefined && { replaces: item.replacedText }),
      ...(item.date !== undefined && { date: item.date }),
    }));
  if (changes.length === 0) {
    return ok('The document has no pending tracked changes.');
  }
  const byAgent = changes.filter((change) => change.author === deps.author).length;
  return ok(JSON.stringify({ changes, total: changes.length, byAgent }), {
    changes,
    total: changes.length,
    byAgent,
  });
}
