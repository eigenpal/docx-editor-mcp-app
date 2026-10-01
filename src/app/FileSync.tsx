/**
 * The file viewer's status bar, and the owner of its sync session.
 *
 * `FileSyncSession` (file-sync-session.ts) does the work: live refresh from
 * the file, autosave back to it, and conflict handling. This component wires
 * it to the mounted editor and the host, flushes unsaved edits when the panel
 * is hidden or closed, and renders what the session reports.
 */

import { useEffect, useRef, useState } from 'react';
import type { App } from '@modelcontextprotocol/ext-apps';
import { createDocumentRefresh, useDocxEditor } from '@docx-editor.dev/react';
import { readHostFile, watchHostFile, writeHostFile, type HostFileVersion } from './host-file.js';
import { isLocalResource, localSyncFile } from './local-file.js';
import type { SyncFile } from './file-sync-session.js';
import { FileSyncSession, type SyncStatus } from './file-sync-session.js';
import './file-sync.css';

interface FileSyncProps {
  app: App;
  /**
   * The opened file: a host resource from the file entrypoint, or this
   * server's `docx-local://` resource for a file `open_document` opened.
   */
  file: { name: string; resourceUri: string };
  /** The version the editor was opened from. */
  opened: HostFileVersion;
  /** Receives the session's actions while it runs; see `FileActions`. */
  onActions: (actions: FileActions | null) => void;
}

/** What the widget calls on the open file from outside this component. */
export interface FileActions {
  /** The editor's Save command. Resolves false when the file cannot take a write. */
  save: () => Promise<boolean>;
  /**
   * Save unsaved edits now. Call it BEFORE anything that unmounts the editor:
   * the editor detaches ahead of this component's cleanup, so a flush from
   * the cleanup finds no document to serialize.
   */
  flush: () => void;
}

export function FileSync({ app, file, opened, onActions }: FileSyncProps) {
  const editor = useDocxEditor();
  const [status, setStatus] = useState<SyncStatus>({ kind: 'watching' });
  const [follow, setFollow] = useState(true);
  const followRef = useRef(follow);
  const session = useRef<FileSyncSession | null>(null);
  // The version the editor was opened from: read once, when the session starts.
  const openedRef = useRef(opened);

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  useEffect(() => {
    if (!editor) return;
    const uri = file.resourceUri;
    const current = new FileSyncSession(
      editor,
      createDocumentRefresh(editor),
      syncFile(app, uri),
      openedRef.current,
      { onStatus: setStatus, follow: () => followRef.current }
    );
    session.current = current;
    current.start();
    onActions({ save: () => current.save(), flush: () => current.flush() });
    // The panel can close without unmounting React; save what is pending first.
    const onHide = () => {
      if (document.visibilityState === 'hidden') current.flush();
    };
    const onPageHide = () => current.flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      onActions(null);
      session.current = null;
      current.dispose();
    };
  }, [app, editor, file.resourceUri, onActions]);

  return (
    <div className="file-sync" role="status" data-kind={status.kind}>
      <span className="file-sync-text">{describe(status, file.name)}</span>
      {status.kind === 'conflict' && (
        <>
          <button
            type="button"
            className="file-sync-button"
            onClick={() => void session.current?.reload()}
          >
            Reload file
          </button>
          <button
            type="button"
            className="file-sync-button"
            onClick={() => void session.current?.keepMine()}
          >
            Keep my version
          </button>
        </>
      )}
      {/* Hidden while the reader decides: two choices are enough. */}
      <label className="file-sync-follow" hidden={status.kind === 'conflict'}>
        <input
          type="checkbox"
          checked={follow}
          onChange={(event) => setFollow(event.target.checked)}
        />
        Scroll to changes
      </label>
    </div>
  );
}

/** The file view's load failure: the card that would show it is hidden there. */
export function FileOpenError({ reason, retry }: { reason: string; retry: () => void }) {
  return (
    <div className="file-sync file-open-error" role="alert" data-kind="error">
      <span className="file-sync-text">Could not open the file: {reason}</span>
      <button type="button" className="file-sync-button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}

function syncFile(app: App, uri: string): SyncFile {
  if (isLocalResource(uri)) return localSyncFile(app, uri);
  return {
    read: () => readHostFile(app, uri),
    write: (bytes, ifMatch) => writeHostFile(app, uri, bytes, ifMatch),
    watch: (onChange) => watchHostFile(app, uri, onChange),
  };
}

function describe(status: SyncStatus, name: string): string {
  switch (status.kind) {
    case 'watching':
      return `Watching ${name} for changes`;
    case 'updated':
      return status.summary;
    case 'saving':
      return `Saving ${name}…`;
    case 'conflict':
    case 'error':
      return status.reason;
  }
}
