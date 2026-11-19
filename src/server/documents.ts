/**
 * Files `open_document` opened by path (local mode only), behind signed
 * tokens (`tokens.ts`). The widget reads a token as the `docx-local://<token>`
 * MCP resource; nothing accepts a raw path. Files are read fresh on every
 * request and versioned by content hashes. A save goes through `replace.ts`.
 *
 * Bytes passed in a call (`content_base64`) are only validated here: they go
 * back to the widget in the tool result, so the server keeps no document state.
 */

import { closeSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import type { BigIntStats } from 'node:fs';
import { access, constants, lstat, open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { formatLimit, MAX_CONTENT_BYTES } from '../shared/limits.js';
import { signPath, verifiedPath } from './tokens.js';
import { contentEtag, fileVersion, metadataOf, OPEN_FLAGS } from './file-version.js';
import { leftBySave, replaceFile } from './replace.js';

type Refusal = { message: string };
interface Version {
  /** SHA-256 of the file contents. */
  etag: string;
  writable: boolean;
}
type WriteResult =
  | { outcome: 'saved'; etag: string }
  | { outcome: 'conflict'; etag: string; recoveryPath?: string }
  | { outcome: 'too-large'; maxBytes: number }
  | { outcome: 'refused'; message: string };

const isDocx = (bytes: Uint8Array) =>
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

function startsAsDocx(path: string): boolean {
  const head = Buffer.alloc(4);
  let descriptor;
  try {
    descriptor = openSync(path, OPEN_FLAGS);
    return readSync(descriptor, head, 0, 4, 0) === 4 && isDocx(head);
  } catch {
    return false;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function openPath(
  raw: string,
  name?: string
): { token: string; name: string; path: string; size: number } | Refusal {
  const expanded = raw.startsWith('~/') ? resolve(homedir(), raw.slice(2)) : raw;
  if (!isAbsolute(expanded)) return { message: `"${raw}" is not an absolute path.` };
  let real: string;
  let info: ReturnType<typeof statSync>;
  try {
    real = realpathSync(expanded);
    info = statSync(real);
  } catch {
    // One answer for every path that is not a .docx, there or not: the tool
    // must not tell a model which other files exist.
    if (!/\.docx$/i.test(expanded)) return { message: `"${raw}" is not a .docx file.` };
    // A server that stopped during a save can leave the document beside its path.
    const copy = leftBySave(expanded);
    if (copy) return { message: `"${raw}" is not at its path. A save left a copy at ${copy}.` };
    return {
      message:
        `"${raw}" does not exist on this computer. For a file in a code sandbox, ` +
        'pass its bytes as content_base64.',
    };
  }
  // Checked on the REAL path: the preview writes there, so a `.docx` symlink to
  // another file must not open.
  if (!info.isFile() || !/\.docx$/i.test(real)) return { message: `"${raw}" is not a .docx file.` };
  // The name is not enough: a hard link named `.docx` can point at any file.
  // Checked at the open only. A later read can meet a half-written file, and
  // the widget waits that out.
  if (!startsAsDocx(real)) return { message: `"${raw}" is not a .docx file.` };
  // No size check here: a host's own file viewer shows any size. `read`
  // refuses a file too large for this server's messages.
  return { token: signPath(real), name: name ?? basename(real), path: real, size: info.size };
}

/**
 * Decodes `content_base64`. Node's decoder is lenient (URL-safe letters, stray
 * characters), so callers re-encode the result before the widget's strict `atob`.
 */
export function decodeBytes(base64: string): Buffer | Refusal {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.byteLength > MAX_CONTENT_BYTES) {
    return {
      message: `content_base64 is larger than the ${formatLimit(MAX_CONTENT_BYTES)} limit.`,
    };
  }
  return isDocx(bytes) ? bytes : { message: 'content_base64 is not a .docx file.' };
}

/**
 * The file behind a token, as it is now. `lstat`, not `stat`: the token names
 * a regular file, and a symlink or other node swapped in after the open must
 * not be read, versioned, or written through.
 */
const GONE = 'The file no longer exists at its path.';
/**
 * A save, by this process or another, leaves the path absent between two
 * system calls (`replace.ts`). A short wait tells that from a deleted file.
 */
const ABSENT_WAIT_MS = 25;
const ABSENT_ATTEMPTS = 3;
const pause = () => new Promise((resolve) => setTimeout(resolve, ABSENT_WAIT_MS));
const absent = (cause: unknown) => (cause as NodeJS.ErrnoException).code === 'ENOENT';

/** The file's content version, through the instant a save leaves the path absent. */
async function hashed(path: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fileVersion(path);
    } catch (cause) {
      if (!absent(cause) || attempt === ABSENT_ATTEMPTS) throw cause;
      await pause();
    }
  }
}

/**
 * A save would replace even a read-only file; respect its permission instead.
 * The directory counts too: a save makes its files there.
 */
async function canWrite(path: string): Promise<boolean> {
  for (let attempt = 1; ; attempt++) {
    try {
      await access(path, constants.W_OK);
      await access(dirname(path), constants.W_OK | constants.X_OK);
      return true;
    } catch (cause) {
      if (!absent(cause) || attempt === ABSENT_ATTEMPTS) return false;
      await pause();
    }
  }
}

async function current(
  token: string
): Promise<{ path: string; info: BigIntStats } | Refusal | null> {
  const path = verifiedPath(token);
  if (!path) return null;
  let info: BigIntStats | undefined;
  for (let attempt = 1; !info; attempt++) {
    try {
      info = await lstat(path, { bigint: true });
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' && attempt < ABSENT_ATTEMPTS) {
        await pause();
      } else if (code === 'ENOENT' || code === 'ENOTDIR') {
        const copy = leftBySave(path);
        return { message: copy ? `${GONE} A save left a copy at ${copy}.` : GONE };
      } else {
        return { message: `The file cannot be checked (${code ?? 'unknown error'}).` };
      }
    }
  }
  if (!info.isFile()) return { message: 'The path no longer holds a regular file.' };
  return { path, info };
}

export async function version(token: string): Promise<Version | Refusal | null> {
  const file = await current(token);
  if (!file || 'message' in file) return file;
  const writable = await canWrite(file.path);
  // The widget polls this. Nothing here reads or shows a file over the cap, so
  // such a file is versioned by its metadata instead of a hash of all of it.
  // That etag never equals a content hash: a save still hashes the file.
  if (file.info.size > BigInt(MAX_CONTENT_BYTES)) {
    return { etag: `unread-${metadataOf(file.info)}`, writable };
  }
  try {
    return { etag: (await hashed(file.path)).etag, writable };
  } catch {
    return { message: 'The file could not be versioned. Try again.' };
  }
}

const READ_ATTEMPTS = 3;
const SAVE_ATTEMPTS = 3;

/**
 * A token's file and the etag of exactly those bytes, or why it cannot travel.
 * A file over the cap is refused here: its base64 would exceed the host's
 * message limit, and the host would drop the connection. The etag comes from
 * the opened descriptor, checked before and after the read, so a save that
 * lands during the read can never pair old bytes with the new etag.
 */
export async function read(
  token: string
): Promise<{ bytes: Buffer; etag: string; writable: boolean } | Refusal | null> {
  const file = await current(token);
  if (!file || 'message' in file) return file;
  const tooLarge = {
    message: `The file is larger than the ${formatLimit(MAX_CONTENT_BYTES)} limit.`,
  };
  if (file.info.size > BigInt(MAX_CONTENT_BYTES)) return tooLarge;
  let handle;
  try {
    handle = await open(file.path, OPEN_FLAGS);
  } catch {
    return { message: 'The file could not be opened.' };
  }
  try {
    for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
      // The node opened may differ from the one `lstat` saw.
      const before = await handle.stat({ bigint: true });
      if (!before.isFile()) return { message: 'The path no longer holds a regular file.' };
      if (before.size > BigInt(MAX_CONTENT_BYTES)) return tooLarge;
      // One byte more than the size: a read that fills it means the file grew.
      const buffer = Buffer.allocUnsafe(Number(before.size) + 1);
      let length = 0;
      while (length < buffer.byteLength) {
        const { bytesRead } = await handle.read(buffer, length, buffer.byteLength - length, length);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      const after = await handle.stat({ bigint: true });
      if (BigInt(length) === before.size && metadataOf(after) === metadataOf(before)) {
        const bytes = buffer.subarray(0, length);
        return { bytes, etag: contentEtag(bytes), writable: await canWrite(file.path) };
      }
    }
    return { message: 'The file kept changing during the read. Try again.' };
  } finally {
    await handle.close();
  }
}

/**
 * Save over a token's file, only if it still holds the version `ifMatch`
 * names. There is no unconditional save: "Keep my version" passes the etag of
 * the newer file the reader chose to replace. `replace.ts` makes the swap and
 * explains why no step of it can overwrite another program's save.
 *
 * `saved` carries the hash of the bytes written, never a later look at the
 * path: an edit that lands right after the save must not pass for this one.
 */
export async function write(
  token: string,
  bytes: Uint8Array,
  ifMatch: string
): Promise<WriteResult> {
  const file = await current(token);
  if (!file) return { outcome: 'refused', message: 'This document is not open.' };
  if ('message' in file) return { outcome: 'refused', message: file.message };
  if (bytes.byteLength > MAX_CONTENT_BYTES) {
    return { outcome: 'too-large', maxBytes: MAX_CONTENT_BYTES };
  }
  if (!isDocx(bytes)) return { outcome: 'refused', message: 'The bytes are not a .docx file.' };
  if (!(await canWrite(file.path)))
    return { outcome: 'refused', message: 'The file is read-only.' };
  if (!ifMatch)
    return { outcome: 'refused', message: 'A save needs the etag of the file it replaces.' };
  const { path } = file;
  /** The etag on disk after the save, or why the file cannot give one. */
  const now = async (recoveryPath?: string): Promise<WriteResult> => {
    try {
      return { outcome: 'conflict', etag: (await hashed(path)).etag, recoveryPath };
    } catch {
      // Gone, or no longer a regular file: `current` has the words for it.
      const gone = await current(token);
      const reason =
        gone && 'message' in gone ? gone.message : 'The file could not be versioned. Try again.';
      const kept = recoveryPath ? ` Another version is kept in ${recoveryPath}.` : '';
      return { outcome: 'refused', message: reason + kept };
    }
  };
  // One attempt: check the version, replace the file, and look at the result.
  const attempt = async (): Promise<WriteResult> => {
    let seen;
    try {
      seen = await hashed(path);
    } catch {
      return { outcome: 'refused', message: 'The file could not be versioned. Try again.' };
    }
    if (seen.etag !== ifMatch) return { outcome: 'conflict', etag: seen.etag };
    let replaced;
    try {
      replaced = await replaceFile(path, bytes, seen.info, ifMatch);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      return { outcome: 'refused', message: `The file was not saved: ${reason}` };
    }
    // Deleted between the check and the move, or another save had it moved
    // aside at that instant. Nothing was written; report what is there now.
    if (replaced.outcome === 'missing') return now();
    if (replaced.outcome === 'unsupported') {
      return {
        outcome: 'refused',
        message:
          'This disk has no hard links, so the preview cannot save to it safely. ' +
          'Press Save to download a copy.',
      };
    }
    if (replaced.outcome === 'conflict') return now(replaced.recoveryPath);
    // Another program can save right after this one. Its version is on disk,
    // intact; report it, so that its etag never passes for this save's.
    const saved = contentEtag(bytes);
    const after = await now();
    if (after.outcome === 'conflict' && after.etag !== saved) return after;
    // The file is there but this look at it failed. The save stands: its etag
    // names the bytes written, so a later save cannot pass over another version.
    const there = after.outcome === 'conflict' || (await current(token));
    return there === true || (there && !('message' in there))
      ? { outcome: 'saved', etag: saved }
      : after;
  };
  for (let attempts = 1; ; attempts++) {
    const result = await attempt();
    // A conflict that names the caller's own version is no conflict: another
    // save crossed this one and left the file as it was. A caller that got
    // it would wait for a change that never comes. Try again instead.
    const crossed = result.outcome === 'conflict' && result.etag === ifMatch;
    if (!crossed || result.recoveryPath) return result;
    if (attempts === SAVE_ATTEMPTS) {
      return { outcome: 'refused', message: 'The file could not be saved. Try again.' };
    }
  }
}
