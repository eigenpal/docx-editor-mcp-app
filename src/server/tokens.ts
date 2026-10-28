/**
 * Tokens for files `open_document` opened by path, that every server process
 * of this user can check. A host may run the server more than once and send
 * `open_document` to one process and the widget's reads to another (Claude
 * Desktop does, between a chat and Cowork), so no process may depend on
 * remembering the open.
 *
 * A token is the file's real path and an HMAC of it under a key in the user's
 * state directory. Only `openPath` signs, after its checks; a token for any
 * other path does not verify.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const KEY_BYTES = 32;
let key: Buffer | undefined;

/** `DOCX_EDITOR_STATE_DIR` overrides it, for tests and locked-down homes. */
function stateDirectory(): string {
  if (process.env.DOCX_EDITOR_STATE_DIR) return process.env.DOCX_EDITOR_STATE_DIR;
  if (platform() === 'darwin') return join(homedir(), 'Library/Application Support/docx-editor');
  if (platform() === 'win32') {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData/Local'), 'docx-editor');
  }
  return join(process.env.XDG_STATE_HOME ?? join(homedir(), '.local/state'), 'docx-editor');
}

/**
 * The first process to need the key creates it. It is written to a private
 * temporary file and hard-linked into place, so a process starting at the
 * same moment reads the whole key or none of it, never half.
 */
function signingKey(): Buffer {
  if (key) return key;
  const directory = stateDirectory();
  const path = join(directory, 'token-key');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  writeFileSync(temporary, randomBytes(KEY_BYTES), { mode: 0o600 });
  try {
    linkSync(temporary, path);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
  } finally {
    unlinkSync(temporary);
  }
  const stored = readFileSync(path);
  if (stored.byteLength !== KEY_BYTES) throw new Error(`${path} is not a docx-editor token key.`);
  key = stored;
  return key;
}

const mac = (path: string) => createHmac('sha256', signingKey()).update(path).digest();

export function signPath(path: string): string {
  return `${Buffer.from(path).toString('base64url')}.${mac(path).toString('base64url')}`;
}

/** The path a token was signed for, or null for a token this user's key did not sign. */
export function verifiedPath(token: string): string | null {
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra !== undefined) return null;
  const path = Buffer.from(encoded, 'base64url').toString();
  const given = Buffer.from(signature, 'base64url');
  const expected = mac(path);
  return given.byteLength === expected.byteLength && timingSafeEqual(given, expected) ? path : null;
}
