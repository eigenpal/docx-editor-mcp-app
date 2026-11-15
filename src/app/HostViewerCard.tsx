/**
 * The inline card for a file that the host's own file viewer shows.
 *
 * ChatGPT and Codex desktop open a local file in a side panel and move its
 * bytes themselves (`openai/files/open`). The editor runs there, as the
 * `view_docx_file` entrypoint. This card only points to it: it holds no
 * editor, so no copy of the file crosses this app's server.
 */

import { useState } from 'react';
import type { App } from '@modelcontextprotocol/ext-apps';
import { openInHostViewer } from './host-file.js';

/** A file opened by path, which the host's file viewer shows. */
export interface HostView {
  name: string;
  path: string;
  /** The `docx-local://` resource: the card's thumbnail, and the editor here if the host refuses. */
  resource: string;
}

/** A tool result younger than this opens the host's file viewer on its own. */
const FRESH_RESULT_MS = 60_000;

/**
 * Open the side panel for a new `open_document` result. Only a new result
 * opens it: a conversation that reloads must not reopen every file it showed.
 */
export function showInHostViewer(
  app: App,
  view: HostView,
  createdAt: number | undefined,
  onRefused: () => void
): void {
  if (Date.now() - (createdAt ?? 0) >= FRESH_RESULT_MS) return;
  void openInHostViewer(app, view.path).then((opened) => {
    if (!opened) onRefused();
  });
}

interface HostViewerCardProps {
  documentName: string;
  /** Asks the host to show the file again. Resolves false when it refused. */
  open: () => Promise<boolean>;
}

export function HostViewerCard({ documentName, open }: HostViewerCardProps) {
  const [state, setState] = useState<'idle' | 'opening' | 'refused'>('idle');

  const reopen = () => {
    setState('opening');
    void open().then((opened) => setState(opened ? 'idle' : 'refused'));
  };

  return (
    <div className="widget" data-mode="inline">
      <div className="card-main">
        <div className="card-head">
          <div className="card-titles">
            <p className="card-name">{documentName}</p>
            <p className="card-meta">
              {state === 'refused'
                ? 'The side panel did not open. Try again.'
                : 'Open in the side panel. It updates when the file changes.'}
            </p>
          </div>
        </div>
        <div className="card-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={state === 'opening'}
            onClick={reopen}
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}
