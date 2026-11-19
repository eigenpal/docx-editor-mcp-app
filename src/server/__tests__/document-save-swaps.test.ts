/**
 * The path stops being the document during a save: it becomes a symlink to
 * another file, or a directory, or it loses its permissions. Each change
 * lands before every file system call of a save, in turn.
 *
 * The rule: a save writes to the document's own path or to nothing. It never
 * writes through a link, never removes what it did not make, and never throws.
 */

import { afterEach, describe, expect, it, setDefaultTimeout } from 'bun:test';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { contentEtag } from '../file-version.js';
import { write } from '../documents.js';
import { MINE, ORIGINAL, cleanUp, doc, intercept, release, setup } from './save-steps.js';

afterEach(cleanUp);

// Each test runs a save some hundreds of times; a slow machine needs more than the default.
setDefaultTimeout(120_000);

const VICTIM = doc('victim..');
const CALLS = 40; // more than a save with a rollback makes

/** Every regular file under a directory, by its bytes. */
function filesUnder(dir: string): Buffer[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return entry.isFile() ? [readFileSync(path)] : [];
  });
}

describe('the path changes its kind at every step of a save', () => {
  // Both etags: the attacker wants the save to take the victim for the document.
  for (const [whose, ifMatch] of [
    ['the document', contentEtag(ORIGINAL)],
    ['the link target', contentEtag(VICTIM)],
  ] as const) {
    it(`never writes through a symlink that replaces the document (etag of ${whose})`, async () => {
      for (let at = 1; at <= CALLS; at++) {
        const { dir, path, token } = setup();
        const victim = join(dir, 'victim.docx');
        writeFileSync(victim, VICTIM);
        intercept(
          (_step, count) => count === at,
          () => {
            rmSync(path, { force: true });
            symlinkSync(victim, path);
          }
        );
        const result = await write(token, MINE, ifMatch);
        release();
        const where = `symlink before call ${at}: ${JSON.stringify(result)}`;
        expect(readFileSync(victim).equals(VICTIM), where).toBe(true);
        expect(['saved', 'conflict', 'refused'], where).toContain(result.outcome);
        // Whatever stays beside the document, the result names it.
        for (const name of readdirSync(dir).filter((entry) => entry.startsWith('.docx-editor'))) {
          expect(JSON.stringify(result), where).toContain(name);
        }
      }
    });
  }

  it('keeps the files of a directory that replaces the document', async () => {
    const INNER = Buffer.from('a file inside the directory');
    for (let at = 1; at <= CALLS; at++) {
      const { dir, path, token } = setup();
      const calls = intercept(
        (_step, count) => count === at,
        () => {
          if (existsSync(path)) renameSync(path, `${path}.moved`);
          mkdirSync(path);
          writeFileSync(join(path, 'inner.txt'), INNER);
        }
      );
      const result = await write(token, MINE, contentEtag(ORIGINAL));
      release();
      if (calls() < at) break; // the save made fewer calls
      const where = `directory before call ${at}: ${JSON.stringify(result)}`;
      expect(['saved', 'conflict', 'refused'], where).toContain(result.outcome);
      // The directory's file is somewhere under the document's folder, whole.
      expect(
        filesUnder(dir).some((bytes) => bytes.equals(INNER)),
        where
      ).toBe(true);
      if (result.outcome === 'saved') expect(result.etag, where).toBe(contentEtag(MINE));
    }
  });

  for (const [name, change] of [
    ['the file loses every permission', (path: string) => chmodSync(path, 0)],
    ['the folder becomes read-only', (path: string) => chmodSync(dirname(path), 0o500)],
  ] as const) {
    it(`keeps the document when ${name}`, async () => {
      for (let at = 1; at <= CALLS; at++) {
        const { dir, path, token } = setup();
        intercept(
          (_step, count) => count === at,
          () => {
            if (existsSync(path)) change(path);
          }
        );
        const result = await write(token, MINE, contentEtag(ORIGINAL));
        release();
        chmodSync(dir, 0o700);
        const where = `${name} before call ${at}: ${JSON.stringify(result)}`;
        // At its path, whole, and one of the two versions.
        expect(lstatSync(path).isFile(), where).toBe(true);
        chmodSync(path, 0o600);
        const disk = readFileSync(path);
        expect(disk.equals(ORIGINAL) || disk.equals(MINE), where).toBe(true);
        if (result.outcome === 'saved') expect(disk.equals(MINE), where).toBe(true);
        if (result.outcome === 'refused') expect(disk.equals(ORIGINAL), where).toBe(true);
        expect(['saved', 'refused'], where).toContain(result.outcome);
      }
    });
  }
});
