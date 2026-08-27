/**
 * The wire between the host connection and the live editor.
 *
 * `ToolHost` registers the catalog with the host and runs each call against the
 * editor through `executor.ts`. It renders nothing; it is a component rather
 * than a hook so it can mount only once the editor instance exists — a tool
 * registered against a null editor would answer, wrongly, that the document is
 * empty.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { App } from '@modelcontextprotocol/ext-apps';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { useReviewOf } from '@docx-editor.dev/pro/react';
import type { DocxEditorInstance } from '@docx-editor.dev/core/editor';
import type { DocxEditorRuntime } from '@docx-editor.dev/editor-api/browser';
import { APP_TOOLS, MUTATING_TOOLS, type AppToolName } from '../shared/catalog.js';
import { createRuntime, readParagraphs, runTool, type ExecutorDeps } from './executor.js';

export const AUTHOR = 'Claude';

export interface DocStats {
  paragraphs: number;
  words: number;
}

/**
 * One activity store for the widget (module-level is correct: the widget hosts
 * exactly one editor). `ToolHost.run()` writes it; the card and the fullscreen
 * status pill only subscribe. Stats are computed HERE, by the runtime that just
 * mutated — a second reader runtime on the same borrowed editor would race this
 * one mid-agent-loop and double the O(document) work per edit.
 */
interface Activity {
  running: AppToolName | null;
  revision: number;
  stats: DocStats | null;
}

let activity: Activity = { running: null, revision: 0, stats: null };
const listeners = new Set<() => void>();

function setActivity(patch: Partial<Activity>): void {
  activity = { ...activity, ...patch };
  for (const listener of listeners) listener();
}

export function useActivity(): Activity {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => activity
  );
}

function statsOf(paragraphs: Array<{ text: string }>): DocStats {
  return {
    paragraphs: paragraphs.length,
    words: paragraphs.reduce((sum, p) => sum + p.text.split(/\s+/).filter(Boolean).length, 0),
  };
}

/** Hands a `.docx` to the reader through the host's download flow. */
export async function downloadDocx(app: App, bytes: Uint8Array, fileName: string): Promise<void> {
  await app.downloadFile({
    contents: [
      {
        type: 'resource',
        resource: {
          uri: `file:///${fileName}`,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          blob: toBase64(bytes),
        },
      },
    ],
  });
}

/** How much document text rides along in the model-context push (see below). */
const CONTEXT_EXCERPT_CHARS = 1_500;

/**
 * Unresolved-comment counts for the context push, from editor-api — the same
 * source `read_comments` answers from, so the summary and the tool agree on
 * who wrote what. (The review rail's comment items carry a display author
 * that does not reliably match the comment record's `authorName`.)
 */
async function readCommentSummary(
  runtime: DocxEditorRuntime,
  agentAuthor: string
): Promise<{ unresolved: number; byReader: number }> {
  return runtime.run(async (context) => {
    const collection = context.document.comments;
    collection.load();
    await context.sync();
    for (const comment of collection.items) comment.load(['authorName', 'resolved']);
    await context.sync();
    const unresolved = collection.items.filter((comment) => !comment.resolved);
    return {
      unresolved: unresolved.length,
      byReader: unresolved.filter((comment) => comment.authorName !== agentAuthor).length,
    };
  });
}

export function ToolHost({
  app,
  editor,
  save,
  documentName,
  docRevision,
}: {
  app: App;
  editor: DocxEditorInstance;
  save: () => Promise<ArrayBuffer | null>;
  documentName: string;
  /** Bumped by `<DocxEditor onChange>` (debounced) — covers the reader's own typing. */
  docRevision: number;
}) {
  const review = useReviewOf(editor);
  const [runtime, setRuntime] = useState<DocxEditorRuntime | null>(null);

  useEffect(() => {
    // An effect rather than a `useMemo`: the runtime borrows the editor
    // instance and must be DISPOSED with it, and a memo has no cleanup. This
    // runs once per document, not per keystroke, so the cascading render the
    // lint rule guards against is one render per file opened.
    const next = createRuntime(editor, AUTHOR);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setRuntime(next);
    return () => {
      next.dispose();
      setRuntime(null);
    };
  }, [editor]);

  const download = useCallback(
    (bytes: Uint8Array, fileName: string) => downloadDocx(app, bytes, fileName),
    [app]
  );

  const deps: ExecutorDeps | null = useMemo(
    () =>
      runtime
        ? {
            runtime,
            editor,
            commentOnSelection: review.comment,
            getReviewItems: () => review.items,
            save,
            download,
            author: AUTHOR,
            documentName,
          }
        : null,
    [runtime, editor, review, save, download, documentName]
  );

  // The registered handlers are captured once, so they reach the CURRENT deps
  // through a ref rather than through the closure.
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  }, [deps]);

  useEffect(() => {
    const run = async (name: string, args: Record<string, unknown>): Promise<CallToolResult> => {
      const current = depsRef.current;
      if (!current) return toolError('The editor is still loading. Try again in a moment.');
      setActivity({ running: name as AppToolName });
      try {
        const outcome = await runTool(current, name, args);
        if (outcome.ok && MUTATING_TOOLS.has(name)) {
          // Refresh stats with the runtime that just mutated, then bump the
          // revision so the card re-renders its counts.
          const paragraphs = await readParagraphs(current.runtime).catch(() => null);
          setActivity({
            revision: activity.revision + 1,
            ...(paragraphs && { stats: statsOf(paragraphs) }),
          });
        }
        return outcome.ok
          ? {
              content: [{ type: 'text', text: outcome.text }],
              // ChatGPT in particular keys widget updates off structuredContent;
              // the executors build it, so hand it over rather than dropping it.
              ...(outcome.data && { structuredContent: outcome.data }),
            }
          : toolError(outcome.text);
      } catch (cause) {
        // Surface the refusal to the model rather than killing the turn.
        // editor-api errors carry a code and a message that name what was
        // refused, which is usually enough for the model to retry differently.
        return toolError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setActivity({ running: null });
      }
    };

    const registered = Object.entries(APP_TOOLS).map(([name, config]) =>
      app.registerTool(
        name,
        {
          title: config.title,
          description: config.description,
          inputSchema: config.inputSchema,
        },
        (args: unknown) => run(name, (args ?? {}) as Record<string, unknown>)
      )
    );
    // No explicit sendToolListChanged: the SDK notifies once initialized, and
    // calling host-bound methods before the handshake will throw in a future
    // SDK release.

    return () => {
      for (const tool of registered) tool.remove();
    };
  }, [app]);

  // Push the document into the conversation on load and on every (debounced)
  // document change — the agent's tools AND the reader's own typing and
  // comments. Two audiences at once: a host that does not call app-registered
  // tools gets actual document text (advice like "call read_document" is advice
  // such a host cannot follow), and a host that does gets the counts that tell
  // the model the reader left something to read.
  const reviewRef = useRef(review);
  useEffect(() => {
    reviewRef.current = review;
  }, [review]);
  const anyRevision = useActivity().revision + docRevision;

  useEffect(() => {
    if (!runtime) return;
    let cancelled = false;
    void (async () => {
      try {
        const paragraphs = await readParagraphs(runtime);
        if (cancelled) return;
        setActivity({ stats: statsOf(paragraphs) });

        const suggestions = reviewRef.current.items.filter((item) => item.kind === 'revision');
        const readerSuggestions = suggestions.filter((item) => item.author !== AUTHOR).length;
        const comments = await readCommentSummary(runtime, AUTHOR);
        if (cancelled) return;

        const summary =
          `${documentName} is open in the editor: ${paragraphs.length} non-empty paragraph(s); ` +
          `${comments.unresolved} unresolved comment(s) (${comments.byReader} by the reader); ` +
          `${suggestions.length} pending suggestion(s) (${readerSuggestions} by the reader). ` +
          `Call read_document for the text, read_comments and read_changes for the review state.`;

        let excerpt = '';
        for (const paragraph of paragraphs) {
          if (excerpt.length + paragraph.text.length > CONTEXT_EXCERPT_CHARS) break;
          excerpt += `${paragraph.text}\n`;
        }

        await app.updateModelContext({
          content: [{ type: 'text', text: `${summary}\n\nOpening excerpt:\n${excerpt}` }],
          structuredContent: {
            documentName,
            paragraphCount: paragraphs.length,
            unresolvedComments: comments.unresolved,
            pendingSuggestions: suggestions.length,
          },
        });
      } catch {
        // Advisory context. A host that refuses it is not an error worth showing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, runtime, documentName, anyRevision]);

  return null;
}

function toolError(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** Chunked: `String.fromCharCode(...bytes)` blows the argument limit on a real .docx. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
