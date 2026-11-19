/**
 * Random sequences against the sync session: edits, foreign changes, manual
 * saves, flushes, and the two conflict buttons, with reads and writes that
 * take a random time. No sequence is planned; three rules must hold in all.
 *
 *   R1  A save that is not "Keep my version" replaces only a file version
 *       whose bytes the editor had taken in.
 *   R2  The editor's document is replaced only when it holds no unsaved edit,
 *       except by "Reload file".
 *   R3  At rest, the editor and the file hold the same bytes, or the status
 *       tells the reader (a conflict or an error).
 */

import { describe, expect, it } from 'bun:test';
import { FileSyncSession, type SyncStatus } from '../file-sync-session.js';
import type { HostFileWriteResult } from '../host-file.js';
import { FakeEditor, FakeRefresh } from './file-sync-fakes.js';
import { docx, p } from './fixtures.js';

/** A fixed sequence for each seed, so a failure names a seed that repeats it. */
function random(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}
const key = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(seed: number, versioned: boolean): Promise<string[]> {
  const next = random(seed);
  const pick = (n: number) => Math.floor(next() * n);
  let made = 0;
  const fresh = (who: string) => docx(p(`${who} ${++made}, seed ${seed}`));
  const editor = new FakeEditor();
  const refresh = new FakeRefresh(editor);
  const file = { bytes: editor.bytes as Uint8Array, version: 1 };
  let notify: (() => void) | null = null;
  const etag = () => (versioned ? `v${file.version}` : null);
  /** Bytes the editor took in from the file, or saved to it. */
  const takenIn = new Set([key(file.bytes)]);
  /** Bytes that exist only as an edit the reader made. */
  const unsaved = new Set<string>();
  const broken: string[] = [];
  const statuses: SyncStatus[] = [];
  let keeping = 0;
  let reloading = 0;

  const api = {
    read: async () => {
      await sleep(pick(3));
      return { bytes: file.bytes, etag: etag(), writable: true };
    },
    write: async (bytes: Uint8Array, ifMatch: string | null): Promise<HostFileWriteResult> => {
      await sleep(pick(4)); // a foreign save can land while the write travels
      if (ifMatch !== null && ifMatch !== etag())
        return { outcome: 'conflict', etag: etag() ?? '' };
      // Without etags no host can close the gap between the session's check
      // and its write; the rule holds where the file has a version.
      if (versioned && !keeping && !takenIn.has(key(file.bytes))) broken.push('R1');
      file.bytes = bytes;
      file.version += 1;
      takenIn.add(key(bytes));
      unsaved.delete(key(bytes));
      notify?.();
      return { outcome: 'saved', etag: etag() ?? `w${file.version}` };
    },
    watch: async (onChange: () => void) => {
      notify = onChange;
      return () => (notify = null);
    },
  };
  const applyUpdate = refresh.applyUpdate;
  refresh.applyUpdate = (async (update: Parameters<typeof applyUpdate>[0]) => {
    if (unsaved.has(key(editor.bytes))) broken.push('R2 (refresh)');
    const result = await applyUpdate(update);
    if (result.ok) takenIn.add(key(new Uint8Array(update.bytes as Uint8Array)));
    return result;
  }) as typeof applyUpdate;
  const load = editor.load.bind(editor);
  editor.load = (bytes: Uint8Array) => {
    if (!reloading && unsaved.has(key(editor.bytes))) broken.push('R2 (load)');
    takenIn.add(key(bytes));
    load(bytes);
  };

  const session = new FileSyncSession(
    editor,
    refresh,
    api,
    { bytes: file.bytes, etag: etag(), writable: true },
    { onStatus: (status) => statuses.push(status), follow: () => true, settleMs: 1, autosaveMs: 4 }
  );
  session.start();
  for (let step = 0; step < 40; step++) {
    const conflict = statuses.at(-1)?.kind === 'conflict';
    const action = pick(10);
    if (action < 3) {
      const bytes = fresh('reader');
      unsaved.add(key(bytes));
      editor.edit(bytes);
    } else if (action < 5) {
      file.bytes = fresh('disk');
      file.version += 1;
      (notify as (() => void) | null)?.();
    } else if (action === 5 && conflict) {
      keeping += 1;
      void session.keepMine().finally(() => (keeping -= 1));
    } else if (action === 6 && conflict) {
      reloading += 1;
      void session.reload().finally(() => (reloading -= 1));
    } else if (action === 7) void session.save();
    else if (action === 8) session.flush();
    await sleep(pick(8));
  }
  for (let rest = 0; rest < 12; rest++) {
    await sleep(12);
    await session.idle();
  }
  const last = statuses.at(-1);
  if (
    key(editor.bytes) !== key(file.bytes) &&
    last?.kind !== 'conflict' &&
    last?.kind !== 'error'
  ) {
    broken.push(`R3 (${last?.kind})`);
  }
  session.dispose();
  return broken.map((rule) => `${rule}, seed ${seed}`);
}

describe('FileSyncSession under random sequences', () => {
  const SEEDS = Number(process.env.DOCX_FUZZ_SEEDS ?? 200);
  for (const versioned of [true, false]) {
    it(`holds its rules for a file ${versioned ? 'with' : 'without'} etags`, async () => {
      const broken: string[] = [];
      // In batches: each sequence spends most of its time in timers.
      for (let first = 1; first <= SEEDS; first += 50) {
        const batch = Array.from({ length: Math.min(50, SEEDS - first + 1) }, (_, i) =>
          run(first + i, versioned)
        );
        broken.push(...(await Promise.all(batch)).flat());
      }
      expect(broken).toEqual([]);
    }, 120_000);
  }
});
