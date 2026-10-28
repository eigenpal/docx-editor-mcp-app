/**
 * Files `open_document` opened by path (local mode only), behind signed
 * tokens (`tokens.ts`). The widget reads a token as the `docx-local://<token>`
 * MCP resource; nothing accepts a raw path. Files are read fresh on every
 * request, versioned by `stat`, and written back atomically.
 *
 * Bytes passed in a call (`content_base64`) are only validated here: they go
 * back to the widget in the tool result, so the server keeps no document state.
 */

import { randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import {
  access,
  chmod,
  constants,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, resolve } from 'node:path';
import { MAX_CONTENT_BYTES } from '../shared/limits.js';
import { signPath, verifiedPath } from './tokens.js';

type Refusal = { message: string };
interface Version {
  /** Changes whenever the file changes: modification time and size. */
  etag: string;
  writable: boolean;
}
type WriteResult =
  | { outcome: 'saved' | 'conflict'; etag: string }
  | { outcome: 'too-large'; maxBytes: number }
  | { outcome: 'refused'; message: string };

const isDocx = (bytes: Uint8Array) =>
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

export function openPath(raw: string, name?: string): { token: string; name: string } | Refusal {
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
  if (info.size > MAX_CONTENT_BYTES) {
    return { message: `"${raw}" is larger than the ${MAX_CONTENT_BYTES}-byte limit.` };
  }
  return { token: signPath(real), name: name ?? basename(real) };
}

/**
 * Decodes `content_base64`. Node's decoder is lenient (URL-safe letters, stray
 * characters), so callers re-encode the result before the widget's strict `atob`.
 */
export function decodeBytes(base64: string): Buffer | Refusal {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.byteLength > MAX_CONTENT_BYTES) {
    return { message: `content_base64 is larger than the ${MAX_CONTENT_BYTES}-byte limit.` };
  }
  return isDocx(bytes) ? bytes : { message: 'content_base64 is not a .docx file.' };
}

export async function version(token: string): Promise<Version | null> {
  const path = verifiedPath(token);
  if (!path) return null;
  const info = await stat(path);
  // A rename would replace even a read-only file; respect its permission instead.
  const writable = await access(path, constants.W_OK).then(
    () => true,
    () => false
  );
  return { etag: `${info.mtimeMs}-${info.size}`, writable };
}

export async function read(token: string): Promise<Buffer | null> {
  const path = verifiedPath(token);
  return path ? readFile(path) : null;
}

/**
 * Save over a token's file, only if it is still the version the preview last
 * saw. A temporary file in the same directory, given the original's mode, is
 * renamed into place: no reader sees half a file, and a private file stays private.
 */
export async function write(
  token: string,
  bytes: Uint8Array,
  ifMatch: string | null
): Promise<WriteResult> {
  const path = verifiedPath(token);
  const current = await version(token);
  if (!path || !current) return { outcome: 'refused', message: 'This document is not open.' };
  if (bytes.byteLength > MAX_CONTENT_BYTES) {
    return { outcome: 'too-large', maxBytes: MAX_CONTENT_BYTES };
  }
  if (!isDocx(bytes)) return { outcome: 'refused', message: 'The bytes are not a .docx file.' };
  if (!current.writable) return { outcome: 'refused', message: 'The file is read-only.' };
  if (ifMatch !== null && current.etag !== ifMatch) {
    return { outcome: 'conflict', etag: current.etag };
  }
  const { mode } = await stat(path);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600 });
    await chmod(temporary, mode & 0o777); // exactly: writeFile's mode passes the umask
    await rename(temporary, path);
  } catch (cause) {
    await unlink(temporary).catch(() => undefined);
    throw cause;
  }
  return { outcome: 'saved', etag: (await version(token))!.etag };
}
