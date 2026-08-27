/**
 * The widget. Everything below runs inside the host's sandboxed iframe.
 *
 * Two connections meet here and neither knows about the other:
 *
 *   host  ⟷  App (@modelcontextprotocol/ext-apps)  — tools, model context, files
 *   DOM   ⟷  DocxEditor (@docx-editor.dev/react)   — the document itself
 *
 * `ToolHost` is the wire between them: it registers the catalog with the host
 * and runs each call against the live editor through `executor.ts`.
 *
 * The document bytes never reach the MCP server. Loading pulls them through the
 * server's `/fetch` proxy only because a sandboxed iframe may fetch nothing the
 * resource's CSP did not name; from that point on every read, edit, comment and
 * export happens in this frame.
 */

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useApp, useHostStyleVariables } from '@modelcontextprotocol/ext-apps/react';
import type { App } from '@modelcontextprotocol/ext-apps';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { DocxEditor, type DocxEditorRef, useDocxEditor } from '@docx-editor.dev/react';
import { reviewModule } from '@docx-editor.dev/pro';
import { DocxEditorReview, useReviewOf } from '@docx-editor.dev/pro/react';
import { setHarfBuzzWasmUrl } from '@docx-editor.dev/core/layout';
import type { DocxEditorInstance } from '@docx-editor.dev/core/editor';
import type { DocxEditorRuntime } from '@docx-editor.dev/editor-api/browser';
import { APP_TOOLS } from '../shared/catalog.js';
import { createRuntime, readParagraphs, runTool, type ExecutorDeps } from './executor.js';
import '@docx-editor.dev/core/styles/editor.css';
import './styles.css';

/**
 * Rewritten by the server when it serves this resource, because the origin is
 * deployment configuration and this bundle is built once.
 */
const ASSET_ORIGIN = '__PUBLIC_ORIGIN__';

/**
 * esbuild does not rewrite `new URL('harfbuzz.wasm', import.meta.url)`, so the
 * engine's WASM loader has nothing to fetch unless it is told where to look.
 * Without it the shaper falls back and pagination drifts away from Word — a
 * silent fidelity loss, which is the only kind worth wiring up front.
 */
setHarfBuzzWasmUrl(`${ASSET_ORIGIN}/harfbuzz.wasm`);

const AUTHOR = 'Claude';
const APP_INFO = { name: 'docx-editor', version: '0.1.0' };

/** Module registration is construction-time, so this array must be stable. */
const PRO_MODULES = [reviewModule()];

interface OpenRequest {
  url: string | null;
  name: string;
}

function Widget() {
  const [request, setRequest] = useState<OpenRequest | null>(null);
  const [fetched, setFetched] = useState<Uint8Array | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editor, setEditor] = useState<DocxEditorInstance | null>(null);
  const editorRef = useRef<DocxEditorRef>(null);

  // Registered before `connect()` resolves. `toolresult` is a one-shot event:
  // a handler added after the handshake can miss the notification that carried
  // the reader's file, and the widget then renders an empty editor for ever.
  const onAppCreated = useCallback((app: App) => {
    app.addEventListener('toolresult', (params) => {
      const structured = (params.result as { structuredContent?: unknown } | undefined)
        ?.structuredContent as OpenRequest | undefined;
      if (!structured) return;
      setRequest({ url: structured.url ?? null, name: structured.name ?? 'Untitled.docx' });
    });
  }, []);

  const { app, isConnected, error } = useApp({
    appInfo: APP_INFO,
    capabilities: {
      // The host may call the tools this widget registers. That is the whole
      // execution model: `src/server/mcp.ts` advertises only `open_document`.
      tools: { listChanged: true },
      availableDisplayModes: ['inline', 'fullscreen'],
    },
    onAppCreated,
  });

  // Paints the widget chrome in the host's own theme and accent colours. The
  // document canvas is NOT themed — it stays Word-faithful, on paper white.
  useHostStyleVariables(app);

  // Fetch the file the tool named. Through the server's proxy, not directly:
  // the iframe's CSP names only this deployment's origin (see `mcp.ts`).
  useEffect(() => {
    const url = request?.url;
    if (!url) return;
    let cancelled = false;
    void (async () => {
      setLoadError(null);
      try {
        const response = await fetch(`${ASSET_ORIGIN}/fetch?url=${encodeURIComponent(url)}`);
        if (!response.ok) throw new Error(`the source returned HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!cancelled) setFetched(bytes);
      } catch (cause) {
        if (!cancelled) {
          setLoadError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request]);

  const onEditor = useCallback((next: DocxEditorInstance | null) => setEditor(next), []);

  // Derived, not stored. `open_document` with no URL means an empty document,
  // which is a fact about the request rather than something to fetch — putting
  // it in state would mean an effect writing state React can already work out.
  const document = request === null ? null : request.url === null ? 'blank' : fetched;

  if (error) return <Notice title="Could not connect to the host" detail={error.message} />;
  if (!isConnected) return <Notice title="Connecting…" />;
  if (loadError) return <Notice title="Could not open the document" detail={loadError} />;
  if (!document) return <Notice title="Waiting for a document…" />;

  return (
    <div className="widget">
      <DocxEditor
        ref={editorRef}
        document={document}
        author={AUTHOR}
        modules={PRO_MODULES}
        title={request?.name.replace(/\.docx$/i, '') ?? 'Document'}
        mode="edit"
      >
        <DocxEditorReview />
        <EditorBridge onEditor={onEditor} />
      </DocxEditor>
      {app && editor && (
        <ToolHost
          app={app}
          editor={editor}
          save={() => editorRef.current?.save() ?? Promise.resolve(null)}
          documentName={request?.name ?? 'document.docx'}
        />
      )}
    </div>
  );
}

/**
 * Lifts the live editor INSTANCE out of the editor's own tree.
 *
 * `useDocxEditor()` reads the editor off React context, so it only answers from
 * inside `<DocxEditor>`. `ToolHost` renders beside it and needs that instance.
 *
 * `<DocxEditor onReady>` is not a substitute: it hands over the narrower
 * `Editor` facade, and editor-api's `createBrowser` does not accept it.
 */
function EditorBridge({ onEditor }: { onEditor: (editor: DocxEditorInstance | null) => void }) {
  const editor = useDocxEditor();
  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);
  return null;
}

/**
 * Registers the catalog with the host and runs each call against the editor.
 *
 * Renders nothing. It is a component rather than a hook in `Widget` because it
 * must mount only once the editor instance exists — a tool registered against a
 * null editor would answer, wrongly, that the document is empty.
 */
function ToolHost({
  app,
  editor,
  save,
  documentName,
}: {
  app: App;
  editor: DocxEditorInstance;
  save: () => Promise<ArrayBuffer | null>;
  documentName: string;
}) {
  const review = useReviewOf(editor);
  const [runtime, setRuntime] = useState<DocxEditorRuntime | null>(null);

  useEffect(() => {
    // An effect rather than a `useMemo`: the runtime borrows the editor instance
    // and must be disposed with it, and a memo leaks one under StrictMode's
    // double render. This runs once per document, not per keystroke, so the
    // cascading render the rule guards against is one render per file opened.
    const next = createRuntime(editor, AUTHOR);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setRuntime(next);
    return () => {
      next.dispose();
      setRuntime(null);
    };
  }, [editor]);

  const download = useCallback(
    async (bytes: Uint8Array, fileName: string) => {
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
    },
    [app]
  );

  const deps: ExecutorDeps | null = useMemo(
    () =>
      runtime
        ? {
            runtime,
            editor,
            commentOnSelection: review.comment,
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
      try {
        const outcome = await runTool(current, name, args);
        return outcome.ok
          ? { content: [{ type: 'text', text: outcome.text }] }
          : toolError(outcome.text);
      } catch (cause) {
        // Surface the refusal to the model rather than killing the turn.
        // editor-api errors carry a code and a message that name what was
        // refused, which is usually enough for the model to retry differently.
        return toolError(cause instanceof Error ? cause.message : String(cause));
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

    void app.sendToolListChanged();
    return () => {
      for (const tool of registered) tool.remove();
    };
  }, [app]);

  // Push the document into the conversation once it is open, and after each
  // edit. A host that does not call app-registered tools still gets a model that
  // can READ the document; one that does gets a model that never has to.
  useEffect(() => {
    if (!runtime) return;
    let cancelled = false;
    void (async () => {
      try {
        const paragraphs = await readParagraphs(runtime);
        if (cancelled) return;
        await app.updateModelContext({
          content: [
            {
              type: 'text',
              text: `${documentName} is open in the editor: ${paragraphs.length} non-empty paragraph(s). Call read_document for the text.`,
            },
          ],
          structuredContent: { documentName, paragraphCount: paragraphs.length },
        });
      } catch {
        // Advisory context. A host that refuses it is not an error worth showing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, runtime, documentName]);

  return null;
}

function toolError(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function Notice({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="notice">
      <p className="notice-title">{title}</p>
      {detail && <p className="notice-detail">{detail}</p>}
    </div>
  );
}

/** Chunked: `String.fromCharCode(...bytes)` blows the argument limit on a real .docx. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const container = window.document.getElementById('root');
if (!container) throw new Error('#root is missing from the widget shell');
createRoot(container).render(
  <StrictMode>
    <Widget />
  </StrictMode>
);
