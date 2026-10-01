/** Fakes for the file sync tests: an editor, the refresh controller, a host file. */

import type { RefreshUpdate } from '@docx-editor.dev/react';
import {
  FileSyncSession,
  type SyncEditor,
  type SyncRefresh,
  type SyncStatus,
} from '../file-sync-session.js';
import type { HostFileVersion, HostFileWriteResult } from '../host-file.js';
import { docx, p } from './fixtures.js';

export const V1 = docx(p('Fee: 100') + p('Term: 1 year'));
export const V2 = docx(p('Fee: 120') + p('Term: 1 year'));
export const EDITED = docx(p('Fee: 100') + p('Term: 2 years'));
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

export class FakeEditor implements SyncEditor {
  bytes = V1;
  loads = 0;
  /** React destroys the editor in the same commit that disposes the session. */
  destroyed = false;
  private handlers = new Set<(change: { source?: string }) => void>();
  on(_event: 'change', handler: (change: { source?: string }) => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  edit(bytes = EDITED) {
    this.bytes = bytes;
    for (const handler of this.handlers) handler({});
  }
  save() {
    if (this.destroyed) return Promise.reject(new Error('no document is loaded'));
    return Promise.resolve(this.bytes.slice().buffer as ArrayBuffer);
  }
  load(bytes: Uint8Array) {
    this.loads += 1;
    this.bytes = bytes;
  }
}

export class FakeRefresh implements SyncRefresh {
  updates: RefreshUpdate[] = [];
  /** Refusal codes to return, in order, before succeeding. */
  refusals: string[] = [];
  constructor(private readonly editor: FakeEditor) {}
  capture = (async () => ({
    id: 's',
    bytes: this.editor.bytes.slice().buffer,
  })) as SyncRefresh['capture'];
  applyUpdate = (async (update: RefreshUpdate) => {
    const code = this.refusals.shift();
    if (code) return { ok: false, resultId: 'r', code };
    this.updates.push(update);
    this.editor.bytes = new Uint8Array(update.bytes as Uint8Array);
    const changes = (update.changes ?? []).map((c) => ({
      id: c.id,
      resultId: 'r',
      isNew: true,
      status: c.location ? 'available' : 'unavailable',
      ...(c.location ? { location: c.location } : {}),
    }));
    return { ok: true, resultId: 'r', changes, changeInformation: 'available', failures: [] };
  }) as SyncRefresh['applyUpdate'];
  finish = () => undefined;
  highlightChanges = () => 0;
  navigateToChange = () => true;
  cancel = () => undefined;
}

export class FakeFile {
  version = 1;
  writes: { ifMatch: string | null }[] = [];
  private notify: (() => void) | null = null;
  constructor(
    public bytes: Uint8Array,
    private readonly versioned = true,
    public writable = true
  ) {}
  get etag() {
    return this.versioned ? `v${this.version}` : null;
  }
  current(): HostFileVersion {
    return { bytes: this.bytes, etag: this.etag, writable: this.writable };
  }
  api = {
    read: async () => this.current(),
    write: async (bytes: Uint8Array, ifMatch: string | null): Promise<HostFileWriteResult> => {
      this.writes.push({ ifMatch });
      if (ifMatch !== null && ifMatch !== this.etag) {
        return { outcome: 'conflict', etag: this.etag ?? '' };
      }
      this.bytes = bytes;
      this.version += 1;
      this.notify?.(); // a real host reports our own save as a change
      return { outcome: 'saved', etag: this.etag ?? `w${this.version}` };
    },
    watch: async (onChange: () => void) => {
      this.notify = onChange;
      return () => (this.notify = null);
    },
  };
  /** Another program (a coding agent) replaces the file. */
  replace(bytes: Uint8Array) {
    this.bytes = bytes;
    this.version += 1;
    this.notify?.();
  }
}

export function setup(options: { versioned?: boolean; writable?: boolean } = {}) {
  const editor = new FakeEditor();
  const refresh = new FakeRefresh(editor);
  const file = new FakeFile(V1, options.versioned ?? true, options.writable ?? true);
  const statuses: SyncStatus[] = [];
  const session = new FileSyncSession(editor, refresh, file.api, file.current(), {
    onStatus: (status) => statuses.push(status),
    follow: () => true,
    settleMs: 1,
    autosaveMs: 5,
  });
  session.start();
  const settle = async () => {
    for (let i = 0; i < 6; i += 1) {
      await tick(10);
      await session.idle();
    }
  };
  return { editor, refresh, file, session, statuses, settle, last: () => statuses.at(-1) };
}
