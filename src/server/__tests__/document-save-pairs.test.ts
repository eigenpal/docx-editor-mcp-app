/**
 * Two things go wrong in one save, at every pair of steps: two foreign saves,
 * or a foreign save and a file system call that fails.
 *
 * One event at a time proves each step. A rollback, a put-back and a retry
 * each add steps of their own, and those run only after a first event. This
 * test reaches them.
 */

import { afterEach, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentEtag } from '../file-version.js';
import { write } from '../documents.js';
import { MINE, ORIGINAL, OTHER, THIRD, cleanUp, intercept, release, setup } from './save-steps.js';

afterEach(cleanUp);

// Each test runs a save some hundreds of times; a slow machine needs more than the default.
setDefaultTimeout(120_000);

const CALLS = 34; // more than a save with a rollback and a retry makes
const KINDS = {
  replace: (path: string, bytes: Buffer) => {
    writeFileSync(`${path}.theirs`, bytes);
    renameSync(`${path}.theirs`, path);
  },
  rewrite: (path: string, bytes: Buffer) => writeFileSync(path, bytes),
};
type Kind = keyof typeof KINDS;

/** The bytes of every regular file in the save directories that a result names. */
function named(dir: string, text: string): Buffer[] {
  return readdirSync(dir)
    .filter((name) => name.startsWith('.docx-editor-save-') && text.includes(name))
    .flatMap((name) =>
      readdirSync(join(dir, name)).map((file) => readFileSync(join(dir, name, file)))
    );
}

const unnamed = (dir: string, text: string) =>
  readdirSync(dir).filter((name) => name.startsWith('.docx-editor-save-') && !text.includes(name));

describe('two foreign saves in one save', () => {
  for (const first of Object.keys(KINDS) as Kind[]) {
    for (const second of Object.keys(KINDS) as Kind[]) {
      it(`keeps the last version: ${first}, then ${second}`, async () => {
        for (let i = 1; i <= CALLS; i++) {
          for (let j = i; j <= CALLS; j++) {
            const { dir, path, token } = setup();
            let acted = 0;
            intercept(
              (_step, count) => (count === i && acted === 0) || (count === j && acted === 1),
              () => KINDS[acted++ === 0 ? first : second](path, acted === 1 ? OTHER : THIRD)
            );
            const result = await write(token, MINE, contentEtag(ORIGINAL));
            release();
            if (acted === 0) break; // the save made fewer calls than i
            const last = acted === 2 ? THIRD : OTHER;
            const text = JSON.stringify(result);
            const where = `${first} before call ${i}, ${second} before call ${j}: ${text}`;
            const disk = existsSync(path) ? readFileSync(path) : null;
            // The last foreign version survives: at the path, or in a directory the result names.
            const survivors = [disk, ...named(dir, text)];
            expect(
              survivors.some((bytes) => bytes?.equals(last)),
              where
            ).toBe(true);
            // The first one too, unless the second foreign save replaced it at the path.
            if (acted === 2 && !disk?.equals(THIRD)) {
              expect(
                survivors.some((bytes) => bytes?.equals(OTHER)),
                where
              ).toBe(true);
            }
            expect(unnamed(dir, text), where).toEqual([]);
            if (result.outcome === 'saved') expect(result.etag, where).toBe(contentEtag(MINE));
            else if (result.outcome === 'conflict') {
              expect(result.etag, where).toBe(disk ? contentEtag(disk) : '');
            } else expect<string>(result.outcome, where).toBe('conflict');
          }
        }
      });
    }
  }
});

describe('a foreign save and a failed call in one save', () => {
  for (const kind of Object.keys(KINDS) as Kind[]) {
    // Not ENOENT: each one makes the server wait for the path, and the fault test covers it alone.
    for (const code of ['EIO', 'EEXIST']) {
      it(`keeps the other version: ${kind}, ${code}`, async () => {
        for (let i = 1; i <= CALLS; i++) {
          for (let j = 1; j <= CALLS; j++) {
            const { dir, path, token } = setup();
            let acted = false;
            let failed = '';
            intercept(
              (_step, count) => count === i,
              () => {
                acted = true;
                KINDS[kind](path, OTHER);
              },
              (step, count) => {
                if (count !== j) return undefined;
                failed = step;
                return code;
              }
            );
            const result = await write(token, MINE, contentEtag(ORIGINAL));
            release();
            if (!acted && !failed) break;
            if (!acted) continue; // the save ended before call i: the fault test covers it
            const text = JSON.stringify(result);
            const where = `${kind} before call ${i}, ${code} at call ${j} (${failed}): ${text}`;
            const disk = existsSync(path) ? readFileSync(path) : null;
            const everywhere = readdirSync(dir)
              .filter((name) => name.startsWith('.docx-editor-save-'))
              .flatMap((name) =>
                readdirSync(join(dir, name)).map((file) => readFileSync(join(dir, name, file)))
              );
            // The foreign version is never destroyed.
            expect(
              [disk, ...everywhere].some((bytes) => bytes?.equals(OTHER)),
              where
            ).toBe(true);
            // Off its path, the result says where it is.
            if (!disk?.equals(OTHER)) {
              expect(
                named(dir, text).some((bytes) => bytes.equals(OTHER)),
                where
              ).toBe(true);
            }
            if (result.outcome === 'saved') expect(result.etag, where).toBe(contentEtag(MINE));
            if (result.outcome === 'conflict' && disk) {
              expect(result.etag, where).toBe(contentEtag(disk));
            }
          }
        }
      });
    }
  }
});
