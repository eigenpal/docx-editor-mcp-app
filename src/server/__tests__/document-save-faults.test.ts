/**
 * Every file system call of a save fails, in turn: once, or from then on.
 *
 * The race test asks what another program can do between two steps. This one
 * asks what happens when a step does not work: a full disk, a lost network
 * share, a permission that changed. The rule is the same: the document is at
 * its path, or the result says where it is.
 */

import { afterEach, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { contentEtag } from '../file-version.js';
import { version, write } from '../documents.js';
import { MINE, ORIGINAL, cleanUp, intercept, leftovers, release, setup } from './save-steps.js';

afterEach(cleanUp);

// Each test runs a save some hundreds of times; a slow machine needs more than the default.
setDefaultTimeout(120_000);

/** A failure to remove a file can only leave that file behind. */
const REMOVALS = new Set(['unlink', 'unlinkSync', 'rmdir']);

/** One save in which call number `failAt` fails. Returns null when the save made fewer calls. */
async function saveWithFault(failAt: number, sticky: boolean, code: string) {
  const { dir, path, token } = setup();
  let failed = '';
  intercept(
    () => false,
    () => undefined,
    (step, count) => {
      if (count === failAt) failed = step;
      return count === failAt || (sticky && failed === step && count > failAt) ? code : undefined;
    }
  );
  const result = await write(token, MINE, contentEtag(ORIGINAL));
  release();
  if (!failed) return null;
  return {
    failed,
    result,
    text: JSON.stringify(result),
    disk: existsSync(path) ? readFileSync(path) : null,
    left: leftovers(dir),
    next: await version(token),
  };
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
