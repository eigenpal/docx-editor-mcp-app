/**
 * The state machine that keeps an opened file and the editor in step. React
 * owns none of it: `FileSync.tsx` renders its status, and the tests drive it
 * with fakes.
 *
 *   file → editor   Each change notification replaces the document through
 *                   the engine's refresh controller. Changed paragraphs are
 *                   derived here (paragraph-diff.ts) and highlighted.
 *   editor → file   Every edit, the reader's or an agent's through the widget's
 *                   tools, is saved shortly after it lands, and on hide or
 *                   close. Writes carry the last etag, or compare content
 *                   hashes, so a newer file is never overwritten blind.
 *
 * Reads, refreshes and writes run one at a time through one queue. When the
 * file and the editor both changed, the reader chooses: reload the file, or
 * keep their version.
 */

import type { HostFileVersion } from './host-file.js';
import { formatLimit } from '../shared/limits.js';
import { bodyParagraphTexts, diffParagraphs, toRefreshInputs } from './paragraph-diff.js';
import {
  CHANGED_AGAIN,
  EDITED_WHILE_CHANGED,
  NEWER_ON_DISK,
  TRANSIENT,
  TRANSIENT_RETRIES,
  delay,
  message,
  refusalCode,
  sha256,
  summarize,
  readSettled,
  type Expected,
  type Settled,
  type Snapshot,
  type WriteOutcome,
  type SyncEditor,
  type SyncFile,
  type SyncOptions,
  type SyncRefresh,
  type SyncStatus,
} from './file-sync-support.js';

export type { SyncEditor, SyncFile, SyncOptions, SyncRefresh, SyncStatus };

export class FileSyncSession {
  private etag: string | null;
  private writable: boolean;
  /** Content hash of the bytes the editor last matched; echo detection without etags. */
  private digest: Promise<string>;
  private editVersion = 0;
  private savedVersion = 0;
  /** A newer file version, held while the reader decides. */
  private pending: Settled | null = null;
  /** A write found a newer file; autosave waits for the reader's decision. */
  private blocked = false;
  /** The newer file's etag from that refused write, for "Keep my version". */
  private conflictEtag: string | null = null;
  /** The newer file's content hash, for "Keep my version" on hosts without etags. */
  private conflictDigest: string | null = null;
  /** The host refused the file's size; retrying each edit would only fail again. */
  private tooLarge = false;
  /** The edit version of a flushed write still queued or in flight. */
  private flushing: number | null = null;
  private disposed = false;
  private queue = Promise.resolve();
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  private teardown: (() => void)[] = [];
  private readonly settleMs: number;
  private readonly autosaveMs: number;

  constructor(
    private readonly editor: SyncEditor,
    private readonly refresh: SyncRefresh,
    private readonly file: SyncFile,
    opened: HostFileVersion,
    private readonly options: SyncOptions
  ) {
    this.etag = opened.etag;
    this.writable = opened.writable;
    this.digest = sha256(opened.bytes);
    this.settleMs = options.settleMs ?? 250;
    this.autosaveMs = options.autosaveMs ?? 1000;
  }

  start(): void {
    this.teardown.push(
      this.editor.on('change', (change) => {
        if (change.source) return; // load, refresh and recovery are not edits
        this.editVersion += 1;
        this.scheduleAutosave();
      })
    );
    void this.file
      .watch(() => {
        clearTimeout(this.settleTimer);
        // Writers rarely replace a .docx atomically; let a burst settle.
        this.settleTimer = setTimeout(() => void this.serial(() => this.sync()), this.settleMs);
      })
      .then((stop) => {
        if (this.disposed) return stop();
        this.teardown.push(stop);
        // The file may have changed between the first read and the subscription.
        void this.serial(() => this.sync());
      })
      .catch((cause) =>
        this.show({ kind: 'error', reason: `Live updates are off: ${message(cause)}` })
      );
  }

  /** The editor's Save command. False when the file cannot take a write. */
  async save(): Promise<boolean> {
    if (!this.writable) return false;
    let outcome = 'failed' as WriteOutcome;
    await this.serial(async () => {
      outcome = await this.write('checked');
    });
    // A file the host refused or failed to take still has to reach the reader.
    return outcome !== 'too-large' && outcome !== 'failed';
  }

  /**
   * "Keep my version": overwrite the newer file the reader saw with the
   * editor's document. A version newer still is a new conflict, not a loss.
   */
  keepMine(): Promise<void> {
    // The version the reader saw when they clicked, not one that arrives later.
    const seen: Expected = {
      etag: this.conflictEtag ?? this.pending?.version.etag ?? this.etag,
      digest: this.conflictDigest ?? this.pending?.digest ?? null,
    };
    return this.serial(async () => {
      await this.write('overwrite', undefined, seen);
    });
  }

  /** "Reload file": discard the editor's edits for the file's current version. */
  reload(): Promise<void> {
    return this.serial(async () => {
      // Always the file as it is now: the held version may be gone already.
      const next = await readSettled(this.file, this.settleMs);
      if (this.disposed) return;
      if (!next)
        return this.show({ kind: 'error', reason: 'The file on disk is not a readable .docx.' });
      this.editor.load(next.version.bytes);
      this.adopt(next);
      this.show({ kind: 'updated', summary: 'Reloaded from the file.' });
    });
  }

  /**
   * Save unsaved edits now, for example when the panel is hidden. The document
   * is serialized HERE, synchronously: on unmount the editor is destroyed in
   * the same commit, before any queued task could still read it.
   */
  flush(): void {
    if (!this.canAutosave() || !this.dirty() || this.flushing === this.editVersion) return;
    clearTimeout(this.autosaveTimer);
    const version = this.editVersion;
    this.flushing = version;
    const snapshot: Snapshot = { version, bytes: this.editor.save() };
    snapshot.bytes.catch(() => undefined); // reported by the queued write
    void this.serial(async () => {
      try {
        await this.write('checked', snapshot);
      } finally {
        // Whatever the outcome, a later flush may try again.
        if (this.flushing === version) this.flushing = null;
      }
    });
  }

  /** Flush, then stop. A queued final save still completes. */
  dispose(): void {
    this.flush();
    this.disposed = true;
    clearTimeout(this.settleTimer);
    clearTimeout(this.autosaveTimer);
    for (const stop of this.teardown.splice(0)) stop();
    this.refresh.cancel();
  }

  /** Resolves when every queued read and write has finished. For tests. */
  idle(): Promise<void> {
    return this.queue;
  }

  private dirty(): boolean {
    return this.editVersion !== this.savedVersion;
  }

  private canAutosave(): boolean {
    return this.writable && this.pending === null && !this.blocked && !this.tooLarge;
  }

  private scheduleAutosave(): void {
    clearTimeout(this.autosaveTimer);
    if (this.disposed || !this.canAutosave()) return;
    this.autosaveTimer = setTimeout(
      () => void this.serial(() => this.write('checked')),
      this.autosaveMs
    );
  }

  private show(status: SyncStatus): void {
    if (!this.disposed) this.options.onStatus(status);
  }

  /** One queue for every read, refresh and write; a failure never stalls it. */
  private serial(task: () => Promise<unknown>): Promise<void> {
    this.queue = this.queue
      .then(async () => {
        await task();
      })
      .catch((cause) => this.show({ kind: 'error', reason: message(cause) }));
    return this.queue;
  }

  private async sync(attempt = 0): Promise<void> {
    if (this.disposed) return;
    const next = await readSettled(this.file, this.settleMs);
    if (this.disposed) return;
    if (!next)
      return this.show({ kind: 'error', reason: 'The file on disk is not a readable .docx.' });
    if (await this.isCurrent(next)) return;
    if (this.dirty()) return this.hold(next, EDITED_WHILE_CHANGED);

    const code = await this.replace(next);
    if (code === null || this.disposed) return;
    if (code === 'local-edits') return this.hold(next, EDITED_WHILE_CHANGED);
    if (TRANSIENT.has(code) && attempt < TRANSIENT_RETRIES) {
      await delay(this.settleMs * 2 ** attempt);
      return this.sync(attempt + 1);
    }
    this.show({ kind: 'error', reason: `Could not show the new version (${code}).` });
  }

  /**
   * The file holds what the editor last matched: our own save's echo, a touch,
   * or a revert. Any conflict held against another version is moot.
   */
  private async isCurrent(next: Settled): Promise<boolean> {
    const sameEtag = next.version.etag !== null && next.version.etag === this.etag;
    if (!sameEtag && next.digest !== (await this.digest)) return false;
    this.etag = next.version.etag;
    this.writable = next.version.writable;
    if (this.pending !== null || this.blocked) {
      this.pending = null;
      this.blocked = false;
      this.conflictEtag = null;
      this.conflictDigest = null;
      this.show({ kind: 'watching' });
    }
    if (this.dirty()) this.scheduleAutosave();
    return true;
  }

  /** Replace the document. Returns null on success, else the refusal code. */
  private async replace(next: Settled): Promise<string | null> {
    let submission;
    try {
      submission = await this.refresh.capture();
    } catch (cause) {
      return refusalCode(cause);
    }
    try {
      const before = bodyParagraphTexts(submission.bytes);
      const changes = before ? diffParagraphs(before, next.texts) : [];
      const result = await this.refresh.applyUpdate({
        submission,
        sequence: 1,
        bytes: next.version.bytes,
        changes: toRefreshInputs(changes),
      });
      if (!result.ok) return result.code;
      this.adopt(next);
      if (this.disposed) return null;
      const first = result.changes.find((c) => c.isNew && c.status === 'available');
      if (this.options.follow() && first) {
        this.refresh.navigateToChange(first.id, { block: 'centerIfNeeded' });
      }
      this.refresh.highlightChanges({ timeoutMs: 4000 });
      this.show({ kind: 'updated', summary: summarize(changes) });
      return null;
    } finally {
      this.refresh.finish(submission);
    }
  }

  private hold(next: Settled, reason: string): void {
    clearTimeout(this.autosaveTimer);
    this.pending = next;
    this.conflictEtag = null;
    this.conflictDigest = null;
    this.show({ kind: 'conflict', reason });
  }

  /** The editor now matches this version of the file. */
  private adopt(next: Settled): void {
    this.etag = next.version.etag;
    this.writable = next.version.writable;
    this.digest = Promise.resolve(next.digest);
    this.savedVersion = this.editVersion;
    this.pending = null;
    this.blocked = false;
    this.conflictEtag = null;
    this.conflictDigest = null;
    this.tooLarge = false;
  }

  private async write(
    mode: 'checked' | 'overwrite',
    snapshot?: Snapshot,
    seen: Expected | null = null
  ): Promise<WriteOutcome> {
    if (mode === 'checked') {
      if (this.pending !== null || this.blocked) return this.refused(null);
      if (!this.dirty()) return 'skipped';
    }
    if (!this.writable) {
      this.show({ kind: 'error', reason: 'The host opened this file read-only.' });
      return 'failed';
    }
    // Without etags, compare content: what the editor last matched for a checked
    // write, the version the reader chose to overwrite for "Keep my version".
    const expected = mode === 'checked' ? this.etag : (seen?.etag ?? null);
    const expectedDigest = mode === 'checked' ? await this.digest : (seen?.digest ?? null);
    // Serialize first, so the content check sits right before the write.
    const version = snapshot?.version ?? this.editVersion;
    const bytes = new Uint8Array(await (snapshot?.bytes ?? this.editor.save()));
    if (expected === null && expectedDigest !== null) {
      const disk = await sha256((await this.file.read()).bytes);
      if (disk !== expectedDigest) {
        this.conflictDigest = disk;
        return this.refused(null, mode === 'overwrite' ? CHANGED_AGAIN : undefined);
      }
    }
    this.show({ kind: 'saving' });
    const result = await this.file.write(bytes, expected);
    if (result.outcome === 'conflict') {
      return this.refused(result.etag || null, mode === 'overwrite' ? CHANGED_AGAIN : undefined);
    }
    clearTimeout(this.autosaveTimer);
    if (result.outcome === 'too-large') {
      this.tooLarge = true;
      const limit = `The file exceeds the ${formatLimit(result.maxBytes)} write limit.`;
      this.show({ kind: 'error', reason: `${limit} Press Save to download a copy.` });
      return 'too-large';
    }
    this.etag = result.etag || null; // an empty etag cannot guard the next write
    this.digest = sha256(bytes);
    this.savedVersion = version;
    this.pending = null;
    this.blocked = false;
    this.conflictEtag = null;
    this.conflictDigest = null;
    this.tooLarge = false;
    this.show({ kind: 'updated', summary: 'Saved to the file.' });
    // Edits made while the write was in flight still need their own save.
    if (this.dirty()) this.scheduleAutosave();
    return 'saved';
  }

  /** A newer file is on disk: hold autosave until the reader chooses. */
  private refused(newerEtag: string | null, reason = NEWER_ON_DISK): 'conflict' {
    clearTimeout(this.autosaveTimer);
    this.blocked = true;
    if (newerEtag !== null) this.conflictEtag = newerEtag;
    this.show({ kind: 'conflict', reason });
    return 'conflict';
  }
}
