/** Constants, types and helpers for `file-sync-session.ts`, kept apart for the line cap. */

import type { DocumentRefresh, RefreshFailureCode } from '@docx-editor.dev/react';
import type { HostFileVersion, HostFileWriteResult } from './host-file.js';
import { bodyParagraphTexts, type ParagraphChange } from './paragraph-diff.js';

export type SyncStatus =
  | { kind: 'watching' }
  | { kind: 'updated'; summary: string }
  | { kind: 'conflict'; reason: string }
  | { kind: 'saving' }
  | { kind: 'error'; reason: string };

/** The editor surface the session needs. */
export interface SyncEditor {
  on(event: 'change', handler: (change: { source?: string }) => void): () => void;
  save(): Promise<ArrayBuffer>;
  load(bytes: Uint8Array): void;
}

export type SyncRefresh = Pick<
  DocumentRefresh,
  'capture' | 'applyUpdate' | 'finish' | 'highlightChanges' | 'navigateToChange' | 'cancel'
>;

/** The opened file, through the host. */
export interface SyncFile {
  read(): Promise<HostFileVersion>;
  write(bytes: Uint8Array, ifMatch: string | null): Promise<HostFileWriteResult>;
  watch(onChange: () => void): Promise<() => void>;
}

export interface SyncOptions {
  onStatus: (status: SyncStatus) => void;
  /** Whether to scroll to the first change after a refresh. */
  follow: () => boolean;
  settleMs?: number;
  autosaveMs?: number;
}

const UNREADABLE_RETRIES = 3;
/** Backoff doubles: about 8 s in all, enough for a large document to finish opening. */
export const TRANSIENT_RETRIES = 5;
/** Refusals that clear on their own: the editor was mid-open, mid-input, or busy. */
export const TRANSIENT: ReadonlySet<string> = new Set<RefreshFailureCode>([
  'busy',
  'unavailable',
  'cancelled',
  'document-changed',
  'input-failed',
]);

/** The document serialized at one edit version. */
export interface Snapshot {
  version: number;
  bytes: Promise<ArrayBuffer>;
}

export type WriteOutcome = HostFileWriteResult['outcome'] | 'skipped' | 'failed';

/** The file version a write expects to replace: its etag, or its content hash. */
export interface Expected {
  etag: string | null;
  digest: string | null;
}

export const NEWER_ON_DISK = 'A newer version is on disk. Your edits are not saved.';
export const EDITED_WHILE_CHANGED = 'The file changed while you were editing.';
export const CHANGED_AGAIN = 'The file changed again. Reload it, or keep your version.';

export interface Settled {
  version: HostFileVersion;
  texts: string[];
  digest: string;
}

export function refusalCode(cause: unknown): string {
  const code = (cause as { code?: unknown } | null)?.code;
  if (typeof code === 'string') return code;
  throw cause;
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * One short line for the status pill: how much changed and where it starts.
 * The paragraph text stays out; the highlight in the page already shows it.
 */
export function summarize(changes: readonly ParagraphChange[]): string {
  if (changes.length === 0) return 'Updated. No body text changed.';
  const first = changes.find((c) => c.location)?.location?.paragraphIndex;
  const where = first === undefined ? '' : `, from paragraph ${first + 1}`;
  return changes.length === 1
    ? `Updated: 1 change${where}.`
    : `Updated: ${changes.length} changes${where}.`;
}

/** A reason a person can read: hosts nest `MCP error -32602:` prefixes when they proxy. */
export function message(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause);
  return text.replace(/(MCP error -?\d+:\s*)+/g, '') || 'Something went wrong.';
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Read the file, waiting out a non-atomic write. Null when it never parses. */
export async function readSettled(
  file: { read(): Promise<HostFileVersion> },
  settleMs: number,
  attempt = 0
): Promise<Settled | null> {
  const version = await file.read();
  const texts = bodyParagraphTexts(version.bytes);
  if (texts) return { version, texts, digest: await sha256(version.bytes) };
  if (attempt >= UNREADABLE_RETRIES) return null;
  await delay(settleMs * (attempt + 1));
  return readSettled(file, settleMs, attempt + 1);
}
