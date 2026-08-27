/**
 * Local-file serving for the stdio (Claude Desktop) mode.
 *
 * `open_document` accepts an absolute file path when the server runs locally.
 * The widget cannot read the disk, so the server maps each opened path to a
 * random token and serves the bytes at `/local/<token>`.
 *
 * The token is the security boundary. The asset server answers any local page
 * with `Access-Control-Allow-Origin: *`, so a route that took raw paths would
 * let any website the user visits read local files. A token is single-file,
 * unguessable, and exists only after the model opened that file in this
 * process.
 */

import { randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import type { Request, Response } from 'express';

type Entry = { kind: 'path'; path: string } | { kind: 'bytes'; bytes: Buffer };

const tokens = new Map<string, Entry>();

/** Bytes-backed entries are bounded; the oldest fall out first. */
const MAX_ENTRIES = 50;

function store(entry: Entry): string {
  const token = randomUUID();
  tokens.set(token, entry);
  if (tokens.size > MAX_ENTRIES) {
    const oldest = tokens.keys().next().value;
    if (oldest) tokens.delete(oldest);
  }
  return token;
}

/** True when the string is a local path rather than a URL. */
export function looksLikeLocalPath(value: string): boolean {
  return value.startsWith('/') || value.startsWith('~/');
}

export interface LocalFileRefusal {
  message: string;
}

/**
 * Validates a path and returns the token URL to hand the widget, or a refusal
 * with a reason the model can act on.
 */
export function registerLocalFile(
  rawPath: string,
  publicOrigin: string
): { url: string; name: string } | LocalFileRefusal {
  const expanded = rawPath.startsWith('~/') ? resolve(homedir(), rawPath.slice(2)) : rawPath;
  if (!isAbsolute(expanded)) {
    return { message: `"${rawPath}" is not an absolute path. Pass the full path to the file.` };
  }
  if (!/\.docx$/i.test(expanded)) {
    return { message: `"${rawPath}" is not a .docx file. This editor opens .docx only.` };
  }

  let real: string;
  try {
    real = realpathSync(expanded);
    if (!statSync(real).isFile()) {
      return { message: `"${rawPath}" is not a file.` };
    }
  } catch {
    return {
      message:
        `"${rawPath}" does not exist on the reader's machine. A file created in a ` +
        'code sandbox lives there, not here. Either call open_document again ' +
        'with content_base64 (base64 of the file bytes), or draft with ' +
        'open_document + write_document so the reader watches it appear.',
    };
  }

  const token = store({ kind: 'path', path: real });
  const name = real.split('/').pop() ?? 'document.docx';
  return { url: `${publicOrigin}/local/${token}`, name };
}

/** A `.docx` starts as a zip: PK\x03\x04. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const MAX_CONTENT_BYTES = 15 * 1024 * 1024;

/**
 * Registers document BYTES passed through a tool call — the handoff for a file
 * the model created somewhere this server cannot read, such as a code sandbox.
 * Safe in every mode: the bytes arrive in the call, so nothing reads a disk.
 */
export function registerBytesContent(
  base64: string,
  publicOrigin: string
): { url: string } | LocalFileRefusal {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch {
    return { message: 'content_base64 is not valid base64.' };
  }
  if (bytes.byteLength === 0) {
    return { message: 'content_base64 decoded to zero bytes.' };
  }
  if (bytes.byteLength > MAX_CONTENT_BYTES) {
    return { message: `content_base64 decodes to more than ${MAX_CONTENT_BYTES} bytes.` };
  }
  if (!bytes.subarray(0, 4).equals(ZIP_MAGIC)) {
    return {
      message:
        'content_base64 is not a .docx file (a .docx is a zip and starts with PK). ' +
        'Base64-encode the file bytes, not its text.',
    };
  }
  const token = store({ kind: 'bytes', bytes });
  return { url: `${publicOrigin}/local/${token}` };
}

export function handleLocalFile(req: Request, res: Response): void {
  const entry = tokens.get(String(req.params.token));
  if (!entry) {
    res.status(404).json({ error: 'unknown token' });
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  // The reader may re-open after Claude regenerated the file; always re-read.
  res.setHeader('Cache-Control', 'no-store');
  if (entry.kind === 'bytes') res.end(entry.bytes);
  else res.sendFile(entry.path);
}
