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
import { setHarfBuzzWasmUrl } from '@docx-editor.dev/core/layout';
import { useDocxEditor } from '@docx-editor.dev/react';
import type { DocxEditorInstance } from '@docx-editor.dev/core/editor';
import { InlineCard, InlineSkeleton, type CardState } from './InlineCard.js';
import { createSupersession } from './supersession.js';
import { AgentStatus } from './AgentStatus.js';
import { ReviewPaneController } from './ReviewPaneController.js';
import { AUTHOR, ToolHost, downloadDocx } from './ToolHost.js';
import '@docx-editor.dev/core/styles/editor.css';
import './styles.css';

/**
 * This bundle is a static asset served from the deployment's own origin, so the
 * origin needs no baking in: the script knows where it was loaded from. (The
 * HTML shell the MCP server serves as the resource is the one artifact carrying
 * a substituted `__PUBLIC_ORIGIN__`.) If a host ever rehosts the assets through
 * a proxy of its own, this follows them there — which is the behavior we want.
 */
const ASSET_ORIGIN = new URL(import.meta.url).origin;

/** Injected by the build; pins the wasm URL to the engine it was built with. */
declare const __DOCX_ENGINE_VERSION__: string;

/**
 * esbuild does not rewrite `new URL('harfbuzz.wasm', import.meta.url)`, so the
 * engine's WASM loader has nothing to fetch unless it is told where to look.
 * Without it the shaper falls back and pagination drifts away from Word — a
 * silent fidelity loss. The engine version is in the FILENAME because the
 * server caches `/assets` as immutable, and the loader refuses a binary from a
 * different engine build.
 */
setHarfBuzzWasmUrl(`${ASSET_ORIGIN}/assets/harfbuzz-${__DOCX_ENGINE_VERSION__}.wasm`);

const APP_INFO = { name: 'docx-editor', version: '0.1.0' };

/** Module registration is construction-time, so this array must be stable. */
const PRO_MODULES = [reviewModule()];

interface OpenRequest {
  url: string | null;
  name: string;
}

/** One election per widget instance (module scope: one widget per iframe). */
const supersession = createSupersession(crypto.randomUUID());

/** Bytes paired with the request that produced them, so a second
 * `open_document` can never show the previous file under the new title. */
interface LoadedDoc {
  request: OpenRequest;
  bytes: Uint8Array | 'blank';
}

/**
 * The host's layout hints, as CSS variables. Insets are written only when the
 * context actually carries them: `hostcontextchanged` sends PARTIAL contexts,
 * and a theme-only change must not wipe real insets back to zero.
 */
function applyHostContext(app: App): void {
  const context = app.getHostContext();
  const root = document.documentElement;
  const insets = context?.safeAreaInsets;
  if (insets) {
    root.style.setProperty('--safe-top', `${insets.top}px`);
    root.style.setProperty('--safe-right', `${insets.right}px`);
    root.style.setProperty('--safe-bottom', `${insets.bottom}px`);
    root.style.setProperty('--safe-left', `${insets.left}px`);
  }
  if (context?.deviceCapabilities?.touch !== undefined) {
    root.dataset.touch = String(context.deviceCapabilities.touch);
  }
}

function Widget() {
  const [request, setRequest] = useState<OpenRequest | null>(null);
  const [loaded, setLoaded] = useState<LoadedDoc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<DocxEditorInstance | null>(null);
  const [mode, setMode] = useState<McpUiDisplayMode>('inline');
  const [hostTheme, setHostTheme] = useState<McpUiTheme | null>(null);
  const [fullscreenDenied, setFullscreenDenied] = useState(false);
  const [docRevision, setDocRevision] = useState(0);
  const [superseded, setSuperseded] = useState(supersession.superseded);
  useEffect(() => supersession.subscribe(() => setSuperseded(supersession.superseded)), []);
  const [handshakeContext, setHandshakeContext] = useState<McpUiHostContext | null>(null);
  const editorRef = useRef<DocxEditorRef>(null);

  // Registered before `connect()` resolves. `toolresult` is a one-shot event:
  // a handler added after the handshake can miss the notification that carried
  // the reader's file, and the widget then renders an empty card for ever.
  const onAppCreated = useCallback((app: App) => {
    // The notification's params ARE the CallToolResult (the spec wraps
    // nothing), so structuredContent sits directly on them.
    app.addEventListener('toolresult', (params) => {
      const structured = params.structuredContent as
        (OpenRequest & { createdAt?: number; seq?: number }) | undefined;
      if (!structured) return;
      setRequest({ url: structured.url ?? null, name: structured.name ?? 'Untitled.docx' });
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
      // The host may call the tools this widget registers. That is the whole
      // execution model: `src/server/mcp.ts` advertises only `open_document`.
      tools: { listChanged: true },
      availableDisplayModes: ['inline', 'fullscreen'],
    },
    onAppCreated,
  });

  // Tokens, theme AND the host's Anthropic Sans font faces. The hook applies
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

  // Fetch the file the tool named. Through the server's proxy, not directly:
  // the iframe's CSP names only this deployment's origin (see `mcp.ts`).
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    void (async () => {
      setLoadError(null);
      if (!request.url) {
        setLoaded({ request, bytes: 'blank' });
        return;
      }
      try {
        // A same-origin URL (the server's tokened /local/ files in stdio mode)
        // is fetched directly; anything else goes through the /fetch proxy,
        // because the CSP names only this origin.
        const target = request.url.startsWith(`${ASSET_ORIGIN}/`)
          ? request.url
          : `${ASSET_ORIGIN}/fetch?url=${encodeURIComponent(request.url)}`;
        const response = await fetch(target);
        if (!response.ok) {
          // The proxy's refusals name the cause; surface them over a bare code.
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `the link returned HTTP ${response.status}`);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!cancelled) setLoaded({ request, bytes });
      } catch (cause) {
        if (cancelled) return;
        setLoadError(cause instanceof Error ? cause.message : String(cause));
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
  }, [request, attempt]);

  const onEditor = useCallback((next: DocxEditorInstance | null) => setEditor(next), []);
  const onDocChange = useMemo(() => debounced(() => setDocRevision((n) => n + 1), 1000), []);

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
  const title = useMemo(() => documentName.replace(/\.docx$/i, ''), [documentName]);
  // The document shown is only ever the one the CURRENT request produced.
  const document = loaded && loaded.request === request ? loaded.bytes : null;
  const isFullscreen = mode === 'fullscreen';

  if (error) {
    return <ErrorCard title="Could not connect to the host" detail={error.message} />;
  }
  if (!isConnected || !request || (!document && !loadError)) return <InlineSkeleton />;

  const cardState: CardState = loadError
    ? {
        phase: 'error',
        reason: loadError,
        url: request.url,
        retry: () => setAttempt((n) => n + 1),
      }
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
              author={AUTHOR}
              modules={PRO_MODULES}
              title={title}
              mode="edit"
              // The thumbnail is a picture of the PAGE; the card beside it is
              // the chrome. Toolbar and title bar appear only in fullscreen.
              chrome={isFullscreen}
              // The editor chrome follows the HOST'S theme, not the OS's: a
              // light toolbar in a dark host makes the host's own overlaid
              // composer read as a broken box on top of it. The engine's dark
              // mode restyles chrome and canvas at render time only; a saved
              // file is unchanged.
              colorMode={hostTheme ?? 'system'}
              onChange={onDocChange}
              onSave={() => {
                if (!app) return;
                void (async () => {
                  const bytes = await save();
                  if (bytes) await downloadDocx(app, new Uint8Array(bytes), documentName);
                })();
              }}
              menu={{ reportIssue: false }}
              renderTitleBarRight={() => <AgentStatus />}
            >
              <DocxEditorReview />
              <EditorBridge onEditor={onEditor} />
            </DocxEditor>
            <ReviewPaneController editor={editor} />
          </div>
        </div>
      )}
      {app && (
        <InlineCard
          app={app}
          editor={editor}
          documentName={documentName}
          state={cardState}
          fullscreenUnavailable={fullscreenDenied}
          superseded={superseded}
          onOpenEditor={() => void openEditor()}
          save={save}
        />
      )}
      {app && editor && !superseded && (
        <ToolHost
          app={app}
          editor={editor}
          save={save}
          documentName={documentName}
          docRevision={docRevision}
        />
      )}
    </div>
  );
}

/**
 * Lifts the live editor INSTANCE out of the editor's own tree.
 *
 * `useDocxEditor()` reads the editor off React context, so it only answers from
 * inside `<DocxEditor>`. The card and `ToolHost` render beside it and need that
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

function debounced(fn: () => void, waitMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, waitMs);
  };
}

const container = window.document.getElementById('root');
if (!container) throw new Error('#root is missing from the widget shell');
// No <StrictMode>: its dev-only double-mount closes the SDK's first App mid
// handshake, and a host answers `ui/initialize` once — the remount's second
// handshake hangs and the widget runs on a half-closed transport. Production
// React compiles StrictMode away, so wrapping it would guard nothing there
// while breaking every dev-bundle run here.
createRoot(container).render(<Widget />);
