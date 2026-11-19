/**
 * Replaces a file only if it still holds the version the caller names.
 *
 * No file system call compares a file and replaces it in one step, and another
 * program can save at any moment. A check followed by `rename(new, path)`
 * destroys an edit that lands between the two. So this module never replaces
 * a file by name:
 *
 * - `rename` only MOVES the file at the path to a fresh name in a private
 *   directory. The move is atomic: it takes whatever is there at that instant.
 * - `link` installs a file at the path. It fails when the path holds a file.
 * - `unlink` removes only a file that was read and found to be the caller's
 *   version or this save's own bytes.
 *
 * A file that is neither stays in the directory, and the result names it.
 *
 * Trap: the path is absent between a move and the link that follows it, two
 * system calls. A program that opens the path then gets "not found", and a
 * stop there leaves the document in the directory. `current` in `documents.ts`
 * waits out that window for this server's own readers.
 *
 * A program that keeps a descriptor open on the old file, and writes through
 * it after the last check here, loses that write. Every atomic save has this
 * limit; only a lock that both programs honor removes it.
 */

import { linkSync, renameSync, unlinkSync, type BigIntStats } from 'node:fs';
import { link, lstat, mkdtemp, open, readdir, rmdir, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { contentEtag, fileVersion, metadataOf } from './file-version.js';

export type Replaced =
  | { outcome: 'saved' }
  /** Another version is on disk. `recoveryPath` is a directory with a version that could not go back to the path. */
  | { outcome: 'conflict'; recoveryPath?: string }
  | { outcome: 'missing' }
  | { outcome: 'unsupported' };

const PREFIX = '.docx-editor-save-';
/** Older than any save in progress, in this process or another. */
const STALE_MS = 10 * 60 * 1000;

const codeOf = (cause: unknown) => (cause as NodeJS.ErrnoException).code;

/** The version of a regular file, or null when it cannot be read as one stable file. */
const versionOf = (path: string) => fileVersion(path).catch(() => null);

const metadataAt = (path: string) =>
  lstat(path, { bigint: true }).then(metadataOf, () => null as string | null);

/**
 * @param seen The file that passed the caller's version check, from its descriptor.
 * @param ifMatch The content hash of the version this save may replace.
 */
export async function replaceFile(
  path: string,
  bytes: Uint8Array,
  seen: BigIntStats,
  ifMatch: string
): Promise<Replaced> {
  await sweep(path);
  // Private: the directory can hold a version of a private document.
  const directory = await mkdtemp(join(dirname(path), PREFIX));
  const staged = join(directory, 'new');
  const aside = join(directory, basename(path));
  try {
    // 0o600 until the bytes are down; then exactly the mode of the version seen.
    const handle = await open(staged, 'wx', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.chmod(Number(seen.mode & 0o777n));
      await handle.sync();
    } finally {
      await handle.close();
    }
    // Checked before the document moves: without hard links there is no
    // install that cannot overwrite, and no safe way back.
    const probe = join(directory, 'probe');
    try {
      await link(staged, probe);
      await unlink(probe);
    } catch {
      return { outcome: 'unsupported' };
    }
    // Staging took time. A change since the check needs no move at all. Only
    // the contents decide: a `touch` or a new tag is not another version.
    if ((await metadataAt(path)) !== metadataOf(seen)) {
      if ((await versionOf(path))?.etag !== ifMatch) return { outcome: 'conflict' };
    }

    const move = moveThenLink(path, aside, staged);
    if (move === 'missing') return { outcome: 'missing' };
    // 'occupied': another program created the path in the gap. Its file is the newer one.
    const installed = move === 'installed';
    // Only now is it known WHICH file the move took.
    const taken = await versionOf(aside);
    const replaceable =
      taken?.etag === ifMatch && (await metadataAt(aside)) === metadataOf(taken.info);
    if (replaceable) {
      // A failure here leaves the old version in the directory. The save still stands.
      await unlink(aside).catch(() => undefined);
      return { outcome: installed ? 'saved' : 'conflict' };
    }
    if (!installed) return { outcome: 'conflict', recoveryPath: directory };
    // A fixed, short name: one made from the document's name can pass the name limit.
    return await rollBack(path, aside, join(directory, 'newer.docx'), bytes);
  } finally {
    // `staged` is this save's own file, or one more name of it.
    await unlink(staged).catch(() => undefined);
    // Fails when the directory keeps a file. That is the intent.
    await rmdir(directory).catch(() => undefined);
  }
}

/**
 * A server that stops during a save leaves its directory. Clear old ones, by
 * the same rule as a save: remove only what was read and found redundant, here
 * a staged file equal to the document. A directory with anything else stays.
 */
async function sweep(path: string): Promise<void> {
  const parent = dirname(path);
  const names = await readdir(parent).catch(() => [] as string[]);
  for (const name of names.filter((entry) => entry.startsWith(PREFIX))) {
    const directory = join(parent, name);
    const info = await lstat(directory).catch(() => null);
    if (!info?.isDirectory() || Date.now() - info.mtimeMs < STALE_MS) continue;
    const staged = join(directory, 'new');
    const copy = await versionOf(staged);
    if (copy && copy.etag === (await versionOf(path))?.etag) {
      await unlink(staged).catch(() => undefined);
    }
    await unlink(join(directory, 'probe')).catch(() => undefined);
    await rmdir(directory).catch(() => undefined);
  }
}

/**
 * A copy of the document that a save left beside its path: the document
 * itself when the server stopped between the move and the link, or a version
 * from a conflict. For the message about a file that is gone.
 */
export async function leftBySave(path: string): Promise<string | null> {
  const names = await readdir(dirname(path)).catch(() => [] as string[]);
  for (const name of names.filter((entry) => entry.startsWith(PREFIX))) {
    const copy = join(dirname(path), name, basename(path));
    if ((await lstat(copy).catch(() => null))?.isFile()) return copy;
  }
  return null;
}

/**
 * Move the file at `path` to `aside`, then link `from` in at `path`.
 * Synchronous, back to back: the path is absent only between these two calls,
 * and an `await` between them would widen that to a turn of the event loop.
 */
function moveThenLink(path: string, aside: string, from: string) {
  try {
    renameSync(path, aside);
  } catch (cause) {
    if (codeOf(cause) === 'ENOENT') return 'missing' as const;
    throw cause;
  }
  try {
    linkSync(from, path);
    return 'installed' as const;
  } catch (cause) {
    if (codeOf(cause) === 'EEXIST') return 'occupied' as const;
    // Any other failure: undo the move, or say where the document is.
    try {
      linkSync(aside, path);
      unlinkSync(aside);
    } catch {
      throw new Error(`The save failed. Your document is at ${aside}.`);
    }
    throw cause;
  }
}

/**
 * The move took a file that is not the caller's version: another program
 * saved between the check and the move. Put that file back and take this
 * save's file out again. The caller gets a conflict, as if nothing was written.
 */
async function rollBack(
  path: string,
  aside: string,
  displaced: string,
  bytes: Uint8Array
): Promise<Replaced> {
  const kept = { outcome: 'conflict', recoveryPath: dirname(aside) } as const;
  // A symlink or a directory is not linked back: `link` follows a symlink on macOS.
  const info = await lstat(aside, { bigint: true }).catch(() => null);
  if (!info?.isFile()) return kept;
  // This save's file goes out and the other file goes back in, the same way.
  let move;
  try {
    move = moveThenLink(path, displaced, aside);
  } catch {
    return kept;
  }
  const moved = move !== 'missing';
  let restored = move === 'installed';
  if (!moved) {
    // Another program deleted this save's file. The path is free: link the other file back.
    try {
      linkSync(aside, path);
      restored = true;
    } catch {
      restored = false;
    }
  }
  if (restored) await unlink(aside);
  // The file moved out is this save's own, unless a third save landed on it.
  let cleared = true;
  if (moved) {
    cleared = (await versionOf(displaced))?.etag === contentEtag(bytes);
    if (cleared) await unlink(displaced);
  }
  return restored && cleared ? { outcome: 'conflict' } : kept;
}
