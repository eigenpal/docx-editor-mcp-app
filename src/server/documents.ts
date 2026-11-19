/**
 * Files `open_document` opened by path (local mode only), behind signed
 * tokens (`tokens.ts`). The widget reads a token as the `docx-local://<token>`
 * MCP resource; nothing accepts a raw path. Files are read fresh on every
 * request, versioned by content hashes, and saved with recovery files.
 *
 * Bytes passed in a call (`content_base64`) are only validated here: they go
 * back to the widget in the tool result, so the server keeps no document state.
 */

import { randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import type { BigIntStats } from 'node:fs';
import { access, chmod, constants, lstat, open, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, resolve } from 'node:path';
import { formatLimit, MAX_CONTENT_BYTES } from '../shared/limits.js';
import { signPath, verifiedPath } from './tokens.js';
import { contentEtag, fileVersion, metadataOf, OPEN_FLAGS } from './file-version.js';
import { preserveSave } from './preserve-save.js';

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
    return {
      message:
        `"${raw}" does not exist on this computer. For a file in a code sandbox, ` +
        'pass its bytes as content_base64.',
    };
  }
  // Checked on the REAL path: the preview writes there, so a `.docx` symlink to
  // another file must not open.
  if (!info.isFile() || !/\.docx$/i.test(real)) return { message: `"${raw}" is not a .docx file.` };
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
async function current(
  token: string
): Promise<{ path: string; info: BigIntStats } | Refusal | null> {
  const path = verifiedPath(token);
  if (!path) return null;
  let info: BigIntStats;
  try {
    info = await lstat(path, { bigint: true });
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { message: 'The file no longer exists at its path.' };
    }
    return { message: `The file cannot be checked (${code ?? 'unknown error'}).` };
  }
  if (!info.isFile()) return { message: 'The path no longer holds a regular file.' };
  return { path, info };
}

export async function version(token: string): Promise<Version | Refusal | null> {
  const file = await current(token);
  if (!file || 'message' in file) return file;
  // A rename would replace even a read-only file; respect its permission instead.
  const writable = await access(file.path, constants.W_OK).then(
    () => true,
    () => false
  );
  try {
    return { etag: (await fileVersion(file.path)).etag, writable };
  } catch {
    return { message: 'The file could not be versioned. Try again.' };
  }
}

const READ_ATTEMPTS = 3;

/**
 * A token's file and the etag of exactly those bytes, or why it cannot travel.
 * A file over the cap is refused here: its base64 would exceed the host's
 * message limit, and the host would drop the connection. The etag comes from
 * the opened descriptor, checked before and after the read, so a save that
 * lands during the read can never pair old bytes with the new etag.
 */
export async function read(
  token: string
): Promise<{ bytes: Buffer; etag: string } | Refusal | null> {
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
        return { bytes: buffer.subarray(0, length), etag: contentEtag(buffer.subarray(0, length)) };
      }
    }
    return { message: 'The file kept changing during the read. Try again.' };
  } finally {
    await handle.close();
  }
}

/**
 * Preserve the replaced file because another app can save after any version check.
 * Recovery files remain beside the document in private directories.
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
  const writable = await access(file.path, constants.W_OK).then(
    () => true,
    () => false
  );
  if (!writable) return { outcome: 'refused', message: 'The file is read-only.' };
  if (!ifMatch)
    return { outcome: 'refused', message: 'A save needs the etag of the file it replaces.' };
  const initial = await version(token);
  if (!initial || 'message' in initial) {
    return { outcome: 'refused', message: 'The file could not be versioned. Try again.' };
  }
  if (initial.etag !== ifMatch) return { outcome: 'conflict', etag: initial.etag };
  const { path } = file;
  // The mode of the version that passed the check, not of a later lookup.
  const mode = Number(file.info.mode & 0o777n);
  const temporary = `${path}.${randomUUID()}.tmp`;
  let recoveryPath: string | undefined;
  try {
    await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
    await chmod(temporary, mode); // exactly: writeFile's mode passes the umask
    const now = await version(token);
    if (!now || 'message' in now || now.etag !== ifMatch) {
      await unlink(temporary);
      if (!now) return { outcome: 'refused', message: 'This document is not open.' };
      if ('message' in now) return { outcome: 'refused', message: now.message };
      return { outcome: 'conflict', etag: now.etag };
    }
    const result = await preserveSave(path, temporary, ifMatch);
    recoveryPath = result.recoveryPath;
    if (result.outcome === 'conflict') {
      const now = await version(token);
      return {
        outcome: 'conflict',
        etag: now && !('message' in now) ? now.etag : '',
        recoveryPath: result.recoveryPath,
      };
    }
  } catch (cause) {
    await unlink(temporary).catch(() => undefined);
    throw cause;
  }
  const after = await version(token);
  if (!after || 'message' in after) {
    return {
      outcome: 'refused',
      message: `The file changed after the save. The previous file is preserved at ${recoveryPath}.`,
    };
  }
  const savedEtag = contentEtag(bytes);
  if (after.etag !== savedEtag) return { outcome: 'conflict', etag: after.etag, recoveryPath };
  return { outcome: 'saved', etag: savedEtag };
}
