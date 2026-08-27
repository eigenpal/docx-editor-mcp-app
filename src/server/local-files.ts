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

const tokens = new Map<string, string>();

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
        'code sandbox lives there, not here. To draft a document, call ' +
        'open_document with no arguments and then write_document — the reader ' +
        'watches it appear in the editor.',
    };
  }

  const token = randomUUID();
  tokens.set(token, real);
  const name = real.split('/').pop() ?? 'document.docx';
  return { url: `${publicOrigin}/local/${token}`, name };
}

export function handleLocalFile(req: Request, res: Response): void {
  const path = tokens.get(String(req.params.token));
  if (!path) {
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
  res.sendFile(path);
}
