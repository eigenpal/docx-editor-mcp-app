/**
 * Every file system call of a save fails, in turn: once, or from then on.
 *
 * The race test asks what another program can do between two steps. This one
 * asks what happens when a step does not work: a full disk, a lost network
 * share, a permission that changed. The rule is the same: the document is at
 * its path, or the result says where it is.
 */

import { describe, expect, it, spyOn } from 'bun:test';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentEtag } from '../file-version.js';
import { openPath, version, write } from '../documents.js';

const doc = (text: string) =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(text)]);
const ORIGINAL = doc('original');
const MINE = doc('mine....');

const ASYNC_STEPS = ['lstat', 'access', 'open', 'mkdtemp', 'link', 'unlink', 'rmdir', 'readdir'];
const SYNC_STEPS = ['renameSync', 'linkSync', 'unlinkSync'];
/** A failure to remove a file can only leave that file behind. */
const REMOVALS = new Set(['unlink', 'unlinkSync', 'rmdir']);
// The test's own calls: the spies replace the module's exports while a save runs.
const { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } =
  fsSync;

/** One save in which call number `failAt` fails. Returns null when the save made fewer calls. */
async function saveWithFault(failAt: number, sticky: boolean, code: string) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'docx-save-fault-')));
  const path = join(dir, 'a.docx');
  writeFileSync(path, ORIGINAL);
  const opened = openPath(path);
  if ('message' in opened) throw new Error(opened.message);
  let count = 0;
  let failed = '';
  const spies: { mockRestore(): void }[] = [];
  const wrap = (target: Record<string, unknown>, name: string, sync: boolean) => {
    const real = target[name] as (...args: unknown[]) => unknown;
    const spy = spyOn(target, name).mockImplementation(((...args: unknown[]) => {
      count += 1;
      if (count === failAt) failed = name;
      if (count === failAt || (sticky && failed === name && count > failAt)) {
        const error = Object.assign(new Error(`${code}: injected`), { code });
        if (sync) throw error;
        return Promise.reject(error);
      }
      return real(...args);
    }) as never);
    spies.push(spy);
  };
  for (const name of ASYNC_STEPS) wrap(fs as never, name, false);
  for (const name of SYNC_STEPS) wrap(fsSync as never, name, true);
  try {
    const result = await write(opened.token, MINE, contentEtag(ORIGINAL));
    for (const spy of spies.splice(0)) spy.mockRestore();
    if (!failed) return null;
    const left = readdirSync(dir).filter((name) => name !== 'a.docx');
    return {
      failed,
      result,
      text: JSON.stringify(result),
      disk: existsSync(path) ? readFileSync(path) : null,
      left,
      next: await version(opened.token),
    };
  } finally {
    for (const spy of spies) spy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('a save in which one file system call fails', () => {
  for (const sticky of [false, true]) {
    for (const code of ['EIO', 'EACCES', 'ENOENT', 'EEXIST']) {
      it(`keeps the document: ${code}, ${sticky ? 'from then on' : 'once'}`, async () => {
        let covered = 0;
        for (let at = 1; at <= 60; at++) {
          const run = await saveWithFault(at, sticky, code);
          if (!run) break;
          covered += 1;
          const { result, disk, left, text } = run;
          const where = `${code} at call ${at} (${run.failed}): ${text}`;
          if (disk) {
            // Whole, and one of the two versions: never a mix, never another file.
            expect(disk.equals(ORIGINAL) || disk.equals(MINE), where).toBe(true);
          } else {
            // Not at its path: the result names the directory, and so does the next read.
            expect(left.length > 0 && left.every((name) => text.includes(name)), where).toBe(true);
            expect(JSON.stringify(run.next), where).toContain('A save left a copy at');
          }
          if (result.outcome === 'saved') expect(disk?.equals(MINE), where).toBe(true);
          // "Not saved" must be true, or the reader saves a copy for nothing.
          if (result.outcome === 'refused') expect(disk?.equals(MINE) ?? false, where).toBe(false);
          // A conflict names another version, never the caller's own.
          if (result.outcome === 'conflict') {
            expect(result.etag, where).not.toBe(contentEtag(ORIGINAL));
          }
          // Nothing stays behind unseen, unless the call that failed was a removal.
          if (!REMOVALS.has(run.failed)) {
            expect(
              left.every((name) => text.includes(name)),
              where
            ).toBe(true);
          }
        }
        // A clean save makes 18 calls; a short run means the spies did not see the save.
        expect(covered).toBeGreaterThan(15);
      });
    }
  }
});
