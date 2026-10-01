/**
 * The widget. Everything below runs inside the host's sandboxed iframe.
 *
 * Two connections meet here and neither knows about the other:
 *
 *   host  ⟷  App (@modelcontextprotocol/ext-apps)  — tools, model context, files
 *   DOM   ⟷  DocxEditor (@docx-editor.dev/react)   — the document itself
 *
 * The user-facing shape follows Claude's MCP App design guidelines, which put
 * document editing in FULLSCREEN and cap inline apps at auto-fit height with no
 * nested scrolling (on mobile, vertical pan gestures inside an inline app go to
 * the conversation, not the app). So:
 *
 *   inline      → a summary card beside a live page-1 thumbnail. The thumbnail
 *                 IS the editor, CSS-scaled down — agent edits appear in it as
 *                 they land.
 *   fullscreen  → the same editor, full-bleed, toolbar and review rail.
 *
 * One mount, both modes: the editor holds the document, its tracked changes and
 * its undo history, so it is never unmounted on collapse — only restyled.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react';
import type {
  App,
  McpUiDisplayMode,
  McpUiHostContext,
  McpUiTheme,
} from '@modelcontextprotocol/ext-apps';
import { DocxEditor, type DocxEditorRef } from '@docx-editor.dev/react';
import { reviewModule } from '@docx-editor.dev/pro';
import { DocxEditorReview } from '@docx-editor.dev/pro/react';
import { useDocxEditor } from '@docx-editor.dev/react';
import type { DocxEditorInstance } from '@docx-editor.dev/core/editor';
// First: points the engine's text shaper at its binary before any editor exists.
import { provideApp } from './assets.js';
import { message } from './file-sync-support.js';
import { InlineCard, InlineSkeleton, type CardState } from './InlineCard.js';
import { createSupersession } from './supersession.js';
import { ReviewPaneController } from './ReviewPaneController.js';
import { downloadDocx } from './download.js';
import { FileOpenError, FileSync, type FileActions } from './FileSync.js';
import { FileEntrypointInput, attachOpenAIExtensions } from './host-file.js';
import { DOCUMENT_META } from '../shared/catalog.js';
import { adoptFile, applyHostContext } from './widget-helpers.js';
import { loadRequest, type LoadedDoc, type OpenRequest } from './load-document.js';
import '@docx-editor.dev/core/styles/editor.css';
import './styles.css';

/** Injected by the build from package.json. */
declare const __APP_VERSION__: string;
const APP_INFO = { name: 'docx-editor', version: __APP_VERSION__ };

/** Module registration is construction-time, so this array must be stable. */
const PRO_MODULES = [reviewModule()];

/** One election per widget instance (module scope: one widget per iframe). */
const supersession = createSupersession(crypto.randomUUID());

function Widget() {
  const [request, setRequest] = useState<OpenRequest | null>(null);
  const [loaded, setLoaded] = useState<LoadedDoc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<DocxEditorInstance | null>(null);
  const [mode, setMode] = useState<McpUiDisplayMode>('inline');
  const [hostTheme, setHostTheme] = useState<McpUiTheme | null>(null);
  const [fullscreenDenied, setFullscreenDenied] = useState(false);
  const [superseded, setSuperseded] = useState(supersession.superseded);
  useEffect(() => supersession.subscribe(() => setSuperseded(supersession.superseded)), []);
  const [handshakeContext, setHandshakeContext] = useState<McpUiHostContext | null>(null);
  const editorRef = useRef<DocxEditorRef>(null);

  // Registered before `connect()` resolves. `toolresult` is a one-shot event:
  // a handler added after the handshake can miss the notification that carried
  // the reader's file, and the widget then renders an empty card for ever.
  // Set while FileSync owns an opened file: Save writes the file, not a download.
  const fileActions = useRef<FileActions | null>(null);
  const onFileActions = useCallback((actions: FileActions | null) => {
    fileActions.current = actions;
  }, []);

  const onAppCreated = useCallback((app: App) => {
    // Before connect: the extensions read host capabilities from the handshake.
    attachOpenAIExtensions(app);
    provideApp(app);
    // The host opened a file through the file entrypoint (ChatGPT and Codex
    // desktop). The arguments name the host's resource for it; see host-file.ts.
    app.addEventListener('toolinput', (params) => {
      const input = FileEntrypointInput.safeParse(params.arguments);
      if (!input.success) return;
      // Save the open file before a new request can unmount its editor.
      fileActions.current?.flush();
      setRequest((current) => adoptFile(current, input.data.file));
    });
    // The notification's params ARE the CallToolResult (the spec wraps
    // nothing), so structuredContent sits directly on them.
    app.addEventListener('toolresult', (params) => {
      const structured = params.structuredContent as
        { name?: string; resourceUri?: string; createdAt?: number; seq?: number } | undefined;
      if (!structured) return;
      fileActions.current?.flush();
      const opened = FileEntrypointInput.safeParse(structured);
      if (opened.success) {
        // A file viewer stays out of the election: it shows the user's file
        // in its own panel and must not stand down for a chat editor.
        setRequest((current) => adoptFile(current, opened.data.file));
        return;
      }
      const name = structured.name ?? 'document.docx';
      const base64 = params._meta?.[DOCUMENT_META];
      if (typeof base64 === 'string') setRequest({ name, base64 });
      else if (structured.resourceUri) setRequest({ name, resource: structured.resourceUri });
      else return;
      // The server-minted election key: the newest open_document wins, and
      // every older widget instance in the conversation stands down.
      if (Number.isFinite(structured.createdAt)) {
        supersession.adoptKey({ createdAt: structured.createdAt!, seq: structured.seq });
      }
    });
    // The notification payload is a PARTIAL context; the SDK merges it into
    // getHostContext(), so re-read the merged view rather than the params.
    app.addEventListener('hostcontextchanged', () => {
      applyHostContext(app);
      const context = app.getHostContext();
      if (context?.displayMode) setMode(context.displayMode);
      if (context?.theme) setHostTheme(context.theme);
    });
  }, []);

  const { app, isConnected, error } = useApp({
    appInfo: APP_INFO,
    capabilities: {
      // No app tools: agents edit the .docx with their own document skills,
      // and this widget previews the file and follows its changes.
      availableDisplayModes: ['inline', 'fullscreen'],
    },
    onAppCreated,
  });

  // Tokens, theme and the host's font faces. The widget declares no CSP
  // domains, so a host whose fonts live on another origin falls back to the
  // system font; the document canvas never uses them. The hook applies
  // later `hostcontextchanged` styles on its own, but the INITIAL ones arrive
  // in the handshake result, which only the second argument reaches — without
  // it the widget renders in its fallback palette until the host happens to
  // change something.
  useHostStyles(app, handshakeContext);

  // The handshake snapshot: insets, touch, and the mode the host started in.
  // A one-shot sync from the host's initialize result — it runs once per
  // connection, so the extra render it costs is one, at boot.
  useEffect(() => {
    if (!app || !isConnected) return;
    applyHostContext(app);
    const context = app.getHostContext();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot handshake sync, see above
    if (context?.displayMode) setMode(context.displayMode);
    if (context?.theme) setHostTheme(context.theme);
    if (context?.availableDisplayModes && !context.availableDisplayModes.includes('fullscreen')) {
      setFullscreenDenied(true);
    }
    setHandshakeContext(context ?? null);
  }, [app, isConnected]);

  // The fetch effect below reaches the CURRENT app and mode through refs: its
  // deps are the request identity, and stale closures over either would revert
  // the wrong mode on failure.
  const appRef = useRef(app);
  const modeRef = useRef(mode);
  useEffect(() => {
    appRef.current = app;
    modeRef.current = mode;
  }, [app, mode]);

  // Load the document the request names; see `load-document.ts`.
  useEffect(() => {
    const host = appRef.current;
    if (!request || !host) return;
    let cancelled = false;
    void (async () => {
      setLoadError(null);
      try {
        const doc = await loadRequest(host, request);
        if (!cancelled) setLoaded(doc);
      } catch (cause) {
        if (cancelled) return;
        setLoadError(message(cause));
        // An error card marooned in fullscreen looks broken; come back to the
        // card before showing it.
        if (modeRef.current === 'fullscreen') {
          void appRef.current?.requestDisplayMode({ mode: 'inline' }).catch(() => undefined);
          setMode('inline');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // `isConnected`: a file request can arrive before the handshake finishes.
  }, [request, attempt, isConnected]);

  const onEditor = useCallback((next: DocxEditorInstance | null) => setEditor(next), []);

  const openEditor = useCallback(async () => {
    if (!app) return;
    try {
      // Render from the mode the host REPORTS, not the one that was asked for:
      // a host may decline, and a widget that assumed fullscreen would hide its
      // card over an editor that never appeared.
      const { mode: granted } = await app.requestDisplayMode({ mode: 'fullscreen' });
      setMode(granted);
      if (granted !== 'fullscreen') setFullscreenDenied(true);
    } catch {
      setFullscreenDenied(true);
    }
  }, [app]);

  const save = useCallback(() => editorRef.current?.save() ?? Promise.resolve(null), []);
  const documentName = request?.name ?? 'document.docx';
  // The document shown is only ever the one the CURRENT request produced.
  const current = loaded && loaded.request === request ? loaded : null;
  // A file follows the disk: one the host opened, or one `open_document` opened
  // by path (it has a version). Bytes passed in a call have no file to follow.
  const syncedFile = useMemo(
    () =>
      request?.file ??
      (request?.resource && current?.opened.etag
        ? { name: documentName, resourceUri: request.resource }
        : null),
    [request, current, documentName]
  );
  const title = useMemo(() => documentName.replace(/\.docx$/i, ''), [documentName]);
  const document = current?.opened.bytes ?? null;
  // A file opened by the host shows in the host's side panel: the editor IS
  // the surface there, so it takes the fullscreen arrangement without a card.
  const isFileView = request?.file !== undefined;
  const isFullscreen = mode === 'fullscreen' || isFileView;

  if (error) {
    return <ErrorCard title="Could not connect to the host" detail={error.message} />;
  }
  if (!isConnected || !request || (!document && !loadError)) return <InlineSkeleton />;

  if (isFileView && loadError) {
    return <FileOpenError reason={loadError} retry={() => setAttempt((n) => n + 1)} />;
  }

  const cardState: CardState = loadError
    ? { phase: 'error', reason: loadError, retry: () => setAttempt((n) => n + 1) }
    : { phase: 'ready' };

  return (
    <div
      className="widget"
      data-mode={isFullscreen ? 'fullscreen' : 'inline'}
      data-superseded={superseded || undefined}
    >
      {document !== null && (
        <div className="thumb">
          {/* `inert` while inline: visibility alone leaves a tabbable
              contenteditable document behind the card. */}
          <div className="stage" inert={!isFullscreen}>
            <DocxEditor
              ref={editorRef}
              document={document}
              modules={PRO_MODULES}
              title={title}
              // A file the host opened read-only can never be saved; do not
              // invite edits that would be lost.
              mode={isFileView && current?.opened.writable === false ? 'view' : 'edit'}
              // The thumbnail is a picture of the PAGE; the card beside it is
              // the chrome. Toolbar and title bar appear only in fullscreen.
              chrome={isFullscreen}
              // The editor chrome follows the HOST'S theme, not the OS's: a
              // light toolbar in a dark host makes the host's own overlaid
              // composer read as a broken box on top of it. The engine's dark
              // mode restyles chrome and canvas at render time only; a saved
              // file is unchanged.
              colorMode={hostTheme ?? 'system'}
              onSave={() => {
                if (!app) return;
                void (async () => {
                  // An opened file saves in place; a read-only one downloads.
                  if (await fileActions.current?.save()) return;
                  const bytes = await save();
                  if (bytes) await downloadDocx(app, new Uint8Array(bytes), documentName);
                })();
              }}
              menu={{ reportIssue: false }}
            >
              <DocxEditorReview />
              <EditorBridge onEditor={onEditor} />
              {/* A superseded preview stops syncing: one live preview per file. */}
              {app && syncedFile && current && !superseded && (
                <FileSync
                  app={app}
                  file={syncedFile}
                  opened={current.opened}
                  onActions={onFileActions}
                />
              )}
            </DocxEditor>
            <ReviewPaneController editor={editor} />
          </div>
        </div>
      )}
      {app && !isFileView && (
        <InlineCard
          app={app}
          editor={editor}
          documentName={documentName}
          state={cardState}
          fullscreenUnavailable={fullscreenDenied}
          superseded={superseded}
          onOpenEditor={() => void openEditor()}
          save={save}
          live={syncedFile !== null}
        />
      )}
    </div>
  );
}

/**
 * Lifts the live editor INSTANCE out of the editor's own tree.
 *
 * `useDocxEditor()` reads the editor off React context, so it only answers from
 * inside `<DocxEditor>`. The card and `ReviewPaneController` render beside it and need that
 * instance. `<DocxEditor onReady>` is not a substitute: it hands over the
 * narrower `Editor` facade, and editor-api's `createBrowser` does not accept it.
 */
function EditorBridge({ onEditor }: { onEditor: (editor: DocxEditorInstance | null) => void }) {
  const editor = useDocxEditor();
  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);
  return null;
}

function ErrorCard({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="card-main" data-tone="danger">
      <p className="card-error">
        <strong>{title}</strong>
        {detail ? ` — ${detail}` : ''}
      </p>
    </div>
  );
}

const container = window.document.getElementById('root');
if (!container) throw new Error('#root is missing from the widget shell');
// No <StrictMode>: its dev-only double-mount closes the SDK's first App mid
// handshake, and a host answers `ui/initialize` once — the remount's second
// handshake hangs and the widget runs on a half-closed transport. Production
// React compiles StrictMode away, so wrapping it would guard nothing there
// while breaking every dev-bundle run here.
createRoot(container).render(<Widget />);
