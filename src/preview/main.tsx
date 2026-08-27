/**
 * Standalone preview page — no MCP host required.
 *
 * This is the path into the editor from environments that cannot render an
 * MCP App, such as the Claude Code terminal: `bun run preview <file>` copies
 * the file next to this page and opens it in a normal browser tab. The page
 * is the full editor, so the reader can also edit and save.
 *
 * It loads the document from the `src` query parameter (same origin), or from
 * a file picker when the parameter is absent.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocxEditor, type DocxEditorRef } from '@docx-editor.dev/react';
import { reviewModule } from '@docx-editor.dev/pro';
import { DocxEditorReview } from '@docx-editor.dev/pro/react';
import { setHarfBuzzWasmUrl } from '@docx-editor.dev/core/layout';
import '@docx-editor.dev/core/styles/editor.css';
import './styles.css';

const ASSET_ORIGIN = new URL(import.meta.url).origin;

declare const __DOCX_ENGINE_VERSION__: string;

setHarfBuzzWasmUrl(`${ASSET_ORIGIN}/assets/harfbuzz-${__DOCX_ENGINE_VERSION__}.wasm`);

/** Module registration is construction-time, so this array must be stable. */
const PRO_MODULES = [reviewModule()];

function Preview() {
  const [doc, setDoc] = useState<Uint8Array | null>(null);
  const [title, setTitle] = useState('Document');
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<DocxEditorRef>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const src = new URLSearchParams(window.location.search).get('src');

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        setDoc(bytes);
        const name = decodeURIComponent(src.split('/').pop() ?? 'Document');
        setTitle(name.replace(/\.docx$/i, ''));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  const openPicker = useCallback(() => fileRef.current?.click(), []);

  const onPick = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    setError(null);
    setTitle(file.name.replace(/\.docx$/i, ''));
    // `load` swaps the document in place when an editor is already mounted.
    if (editorRef.current) editorRef.current.load(bytes);
    else setDoc(bytes);
  }, []);

  return (
    <div className="preview">
      <input ref={fileRef} type="file" accept=".docx" hidden onChange={(e) => void onPick(e)} />
      {doc ? (
        <DocxEditor ref={editorRef} document={doc} author="You" modules={PRO_MODULES} title={title}>
          <DocxEditorReview />
        </DocxEditor>
      ) : (
        <div className="empty">
          <p className="empty-title">
            {error ? `Could not load the document: ${error}` : 'docx-editor preview'}
          </p>
          <button type="button" className="empty-btn" onClick={openPicker}>
            Open a .docx
          </button>
        </div>
      )}
    </div>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing');
createRoot(container).render(<Preview />);
