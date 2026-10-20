/**
 * The inline surface: a summary card, per Claude's design guidelines for inline
 * MCP Apps — auto-fit height, at most two actions, a handful of data points, no
 * internal scrolling. The editor itself lives in fullscreen; this card is how
 * the reader gets there. (The live page thumbnail beside it is owned by
 * `main.tsx`, because the editor it scales must survive mode switches.)
 *
 * The chips come from pro's review hook, so they follow the file as it
 * changes. Every degraded state keeps the same geometry, so the card never jumps.
 */

import { useState } from 'react';
import type { App } from '@modelcontextprotocol/ext-apps';
import { useReviewOf } from '@docx-editor.dev/pro/react';
import type { DocxEditorInstance } from '@docx-editor.dev/core/editor';
import { downloadDocx } from './download.js';

/** What the card is showing. One union, one geometry. */
export type CardState = { phase: 'ready' } | { phase: 'error'; reason: string; retry: () => void };

interface CardProps {
  app: App;
  editor: DocxEditorInstance | null;
  documentName: string;
  state: CardState;
  /** The host has no fullscreen (declared, or refused when asked). */
  fullscreenUnavailable: boolean;
  /** A newer copy of this widget exists further down the conversation. */
  superseded: boolean;
  onOpenEditor: () => void;
  save: () => Promise<ArrayBuffer | null>;
  /** The preview follows a file on disk and refreshes when it changes. */
  live: boolean;
}

export function InlineCard({
  app,
  editor,
  documentName,
  state,
  fullscreenUnavailable,
  superseded,
  onOpenEditor,
  save,
  live,
}: CardProps) {
  const [downloading, setDownloading] = useState(false);
  const review = useReviewOf(editor);

  const suggestions = review.items.filter((item) => item.kind === 'revision').length;
  const comments = review.items.filter(
    (item) => item.kind === 'comment' && !item.resolved && !item.parentId
  ).length;

  const canDownload = Boolean(app.getHostCapabilities()?.downloadFile) && editor !== null;

  const download = () => {
    setDownloading(true);
    void (async () => {
      try {
        const bytes = await save();
        if (bytes) await downloadDocx(app, new Uint8Array(bytes), documentName);
      } catch {
        // The host reports its own download failures; nothing to add.
      } finally {
        setDownloading(false);
      }
    })();
  };

  if (state.phase === 'error') {
    return (
      <div className="card-main" data-tone="danger">
        <div className="card-head">
          <div className="card-icon" data-tone="danger">
            {WARN_ICON}
          </div>
          <div className="card-titles">
            <p className="card-name">{documentName}</p>
            <p className="card-meta">{state.reason}</p>
          </div>
        </div>
        <div className="card-actions">
          <button type="button" className="btn btn-primary" onClick={state.retry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (superseded) {
    return (
      <div className="card-main" data-superseded="true">
        <div className="card-head">
          <div className="card-titles">
            <p className="card-name">{documentName}</p>
            <p className="card-meta">Superseded — a newer copy is further down the conversation.</p>
          </div>
        </div>
      </div>
    );
  }

  const meta =
    editor === null
      ? 'Preparing preview…'
      : live
        ? 'Live preview. Updates when the file changes.'
        : 'Preview';

  return (
    <div className="card-main">
      <div className="card-head">
        <div className="card-titles">
          <p className="card-name">{documentName}</p>
          <p className="card-meta">{meta}</p>
        </div>
      </div>
      {(suggestions > 0 || comments > 0) && (
        <div className="card-status">
          {suggestions > 0 && (
            <span className="chip" data-tone="info">
              {suggestions} tracked change{suggestions === 1 ? '' : 's'}
            </span>
          )}
          {comments > 0 && (
            <span className="chip">
              {comments} comment{comments === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}
      <div className="card-actions">
        {!fullscreenUnavailable && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenEditor}
            disabled={editor === null}
          >
            Open editor
          </button>
        )}
        {canDownload && (
          <button
            type="button"
            className={`btn ${fullscreenUnavailable ? 'btn-primary' : 'btn-secondary'}`}
            disabled={downloading}
            onClick={download}
          >
            Download
          </button>
        )}
      </div>
      {fullscreenUnavailable && canDownload && (
        <p className="card-hint">Download the file to open it in Word.</p>
      )}
    </div>
  );
}

/**
 * The pre-content state, shaped like the card it becomes — Claude's guidelines
 * ask for layout-matching skeletons over spinners, so the swap does not jump.
 * The same markup is inlined in `index.html` for the moments before React runs.
 */
export function InlineSkeleton() {
  return (
    <div className="skeleton" aria-hidden="true">
      <div className="skeleton-row">
        <div className="shimmer shimmer-icon" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="shimmer shimmer-title" />
          <div className="shimmer shimmer-line" />
        </div>
      </div>
      <div className="skeleton-row">
        <div className="shimmer shimmer-btn" />
        <div className="shimmer shimmer-btn" />
      </div>
    </div>
  );
}

const WARN_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M12 4 2.5 20h19z" strokeLinejoin="round" />
    <path d="M12 10v5" strokeLinecap="round" />
    <path d="M12 18.2v.1" strokeLinecap="round" />
  </svg>
);
