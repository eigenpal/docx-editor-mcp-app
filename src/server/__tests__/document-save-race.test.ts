/**
 * Another program saves the document while this server saves it.
 *
 * The first test does not pick its moments: it puts each kind of foreign save
 * before EVERY file system call a save makes, and after the last one. A new
 * step in `replace.ts` is covered without a new test. The rule it holds is the
 * one a reviewer checks: the foreign save is never lost, and `saved` never
 * names a version that is not this save's own bytes.
 */

import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import {
  closeSync,
  existsSync,
  ftruncateSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentEtag } from '../file-version.js';
import { openPath, version, write } from '../documents.js';

// One length: a same-size edit must not hide behind the size.
const doc = (text: string) =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(text)]);
const ORIGINAL = doc('original');
const MINE = doc('mine....');
const OTHER = doc('other...');
const THIRD = doc('third...');

// Every file system call a save makes. The move and the link are synchronous (`replace.ts`).
const ASYNC_STEPS = ['lstat', 'access', 'open', 'mkdtemp', 'link', 'unlink', 'rmdir'] as const;
const SYNC_STEPS = ['renameSync', 'linkSync', 'unlinkSync'] as const;
type Step = (typeof ASYNC_STEPS)[number] | (typeof SYNC_STEPS)[number];

const directories: string[] = [];
const restores: (() => void)[] = [];
afterEach(() => {
  for (const restore of restores.splice(0)) restore();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup() {
  // The real path: the server resolves it, and the tests match its calls by path.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'docx-save-race-')));
  directories.push(dir);
  const path = join(dir, 'a.docx');
  writeFileSync(path, ORIGINAL, { mode: 0o640 });
  const opened = openPath(path);
  if ('message' in opened) throw new Error(opened.message);
  return { dir, path, token: opened.token };
}

/**
 * Runs `act` before the file system calls a save makes. `when` sees each call
 * and its count, and says whether to act now. Returns the count so far.
 */
function intercept(when: (step: Step, count: number, args: unknown[]) => boolean, act: () => void) {
  let count = 0;
  // The foreign save uses the same calls; it must not count as a step of the save.
  let acting = false;
  const wrap = (target: Record<string, unknown>, step: Step) => {
    const real = target[step] as (...args: unknown[]) => unknown;
    const spy = spyOn(target, step).mockImplementation(((...args: unknown[]) => {
      if (!acting) {
        count += 1;
        if (when(step, count, args)) {
          acting = true;
          try {
            act();
          } finally {
            acting = false;
          }
        }
      }
      return real(...args);
    }) as never);
    restores.push(() => spy.mockRestore());
  };
  for (const step of ASYNC_STEPS) wrap(fs as never, step);
  for (const step of SYNC_STEPS) wrap(fsSync as never, step);
  return () => count;
}

const leftovers = (dir: string) => readdirSync(dir).filter((name) => name !== 'a.docx');
const kept = (recoveryPath: string | undefined) =>
  recoveryPath
    ? readdirSync(recoveryPath).map((name) => readFileSync(join(recoveryPath, name)))
    : [];

/** How another program saves a file. */
const FOREIGN: Record<string, (path: string, bytes: Buffer) => void> = {
  // An atomic save: Word, a sync client, most editors.
  'replaces the file': (path, bytes) => {
    writeFileSync(`${path}.theirs`, bytes);
    renameSync(`${path}.theirs`, path);
  },
  // `open(path, 'w')`: python-docx and most scripts.
  'rewrites the file in place': (path, bytes) => writeFileSync(path, bytes),
  // The reviewer's case: the same size, and the old modification time put back.
  'rewrites it with the same size and time': (path, bytes) => {
    const before = existsSync(path) ? statSync(path) : null;
    writeFileSync(path, bytes);
    if (before) utimesSync(path, before.atime, before.mtime);
  },
};

describe('a foreign save at every step of a save', () => {
  for (const [name, foreign] of Object.entries(FOREIGN)) {
    it(`keeps the other version when another program ${name}`, async () => {
      // A clean save, to count its file system calls.
      const clean = setup();
      const counted = intercept(
        () => false,
        () => undefined
      );
      expect(await write(clean.token, MINE, contentEtag(ORIGINAL))).toEqual({
        outcome: 'saved',
        etag: contentEtag(MINE),
      });
      const calls = counted();
      for (const restore of restores.splice(0)) restore();
      expect(calls).toBeGreaterThan(10);

      const outcomes = new Set<string>();
      // A rollback makes more calls than a clean save; cover those too.
      for (let at = 1; at <= calls + 12; at++) {
        const { dir, path, token } = setup();
        const total = intercept(
          (_step, count) => count === at,
          () => foreign(path, OTHER)
        );
        const result = await write(token, MINE, contentEtag(ORIGINAL));
        for (const restore of restores.splice(0)) restore();
        // Past the last call: the foreign save lands after the save returned.
        if (total() < at) foreign(path, OTHER);
        const where = `foreign save before call ${at}: ${JSON.stringify(result)}`;
        outcomes.add(result.outcome);

        const recoveryPath = result.outcome === 'conflict' ? result.recoveryPath : undefined;
        const onDisk = readFileSync(path);
        const survivors = [onDisk, ...kept(recoveryPath)];
        // The foreign save survives, at the path or in the directory the result names.
        expect(
          survivors.some((bytes) => bytes.equals(OTHER)),
          where
        ).toBe(true);
        // No stray file, and no directory the result does not name.
        expect(leftovers(dir), where).toEqual(recoveryPath ? [recoveryPath.split('/').pop()!] : []);
        expect(result.outcome === 'saved' || result.outcome === 'conflict', where).toBe(true);
        if (result.outcome === 'conflict') {
          expect(result.etag, where).toBe(contentEtag(onDisk));
        } else if (result.outcome === 'saved') {
          // `saved` names this save's bytes, whatever is on disk by now.
          expect(result.etag, where).toBe(contentEtag(MINE));
          // So the next save, with that etag, cannot overwrite the foreign one.
          expect(await write(token, THIRD, result.etag), where).toEqual({
            outcome: 'conflict',
            etag: contentEtag(OTHER),
          });
          expect(readFileSync(path).equals(OTHER), where).toBe(true);
        }
      }
      // The steps covered both sides of the move: some saves lost, some won.
      expect([...outcomes].sort()).toEqual(['conflict', 'saved']);
    });
  }

  it('never fails or strands a file when another program deletes the document', async () => {
    for (let at = 1; at <= 40; at++) {
      const { dir, path, token } = setup();
      intercept(
        (_step, count) => count === at,
        () => rmSync(path, { force: true })
      );
      const result = await write(token, MINE, contentEtag(ORIGINAL));
      for (const restore of restores.splice(0)) restore();
      const where = `delete before call ${at}: ${JSON.stringify(result)}`;
      // Deleted before the move: nothing is written. Deleted in the gap or after: no trace.
      if (existsSync(path)) expect(readFileSync(path).equals(MINE), where).toBe(true);
      expect(
        readdirSync(dir).filter((name) => name !== 'a.docx'),
        where
      ).toEqual([]);
      expect(['saved', 'refused', 'conflict'], where).toContain(result.outcome);
    }
  });
});

it('puts back an edit that lands between the last check and the move', async () => {
  const { dir, path, token } = setup();
  let renames = 0;
  // Once: the rollback moves the path too.
  intercept(
    (step, _count, args) => step === 'renameSync' && args[0] === path && ++renames === 1,
    () => writeFileSync(path, OTHER)
  );
  expect(await write(token, MINE, contentEtag(ORIGINAL))).toEqual({
    outcome: 'conflict',
    etag: contentEtag(OTHER),
  });
  expect(readFileSync(path)).toEqual(OTHER);
  expect(leftovers(dir)).toEqual([]);
});

it('never returns a later edit as the saved version', async () => {
  const { path, token } = setup();
  const saved = await write(token, MINE, contentEtag(ORIGINAL));
  expect(saved).toEqual({ outcome: 'saved', etag: contentEtag(MINE) });
  // Right after the save: the same size, and the saved file's modification time.
  const { atime, mtime } = statSync(path);
  writeFileSync(path, OTHER);
  utimesSync(path, atime, mtime);
  expect(await write(token, THIRD, contentEtag(MINE))).toEqual({
    outcome: 'conflict',
    etag: contentEtag(OTHER),
  });
  expect(readFileSync(path)).toEqual(OTHER);
});

it('puts back a file that another program writes through an open descriptor', async () => {
  const { dir, path, token } = setup();
  const descriptor = openSync(path, 'r+');
  let moved = false;
  // After the move: the descriptor now writes to the file that was moved aside.
  intercept(
    (step) => {
      const act = moved && step === 'linkSync';
      if (step === 'renameSync') moved = true;
      return act;
    },
    () => {
      moved = false;
      ftruncateSync(descriptor, 0);
      writeSync(descriptor, OTHER, 0, OTHER.length, 0);
    }
  );
  try {
    expect(await write(token, MINE, contentEtag(ORIGINAL))).toEqual({
      outcome: 'conflict',
      etag: contentEtag(OTHER),
    });
    expect(readFileSync(path)).toEqual(OTHER);
    expect(leftovers(dir)).toEqual([]);
    // The same file is back at the path: the other program still writes to it.
    writeSync(descriptor, THIRD, 0, THIRD.length, 0);
    expect(readFileSync(path)).toEqual(THIRD);
  } finally {
    closeSync(descriptor);
  }
});

it('keeps both versions when two foreign saves land during one save', async () => {
  const { dir, path, token } = setup();
  let renames = 0;
  intercept(
    (step, _count, args) => step === 'renameSync' && args[0] === path && ++renames > 0,
    () => {
      // Before the move, and again before the rollback takes this save's file out.
      const bytes = renames === 1 ? OTHER : THIRD;
      writeFileSync(`${path}.theirs`, bytes);
      renameSync(`${path}.theirs`, path);
    }
  );
  const result = await write(token, MINE, contentEtag(ORIGINAL));
  if (result.outcome !== 'conflict' || !result.recoveryPath)
    throw new Error(JSON.stringify(result));
  expect(readFileSync(path)).toEqual(OTHER);
  expect(kept(result.recoveryPath)).toEqual([THIRD]);
  expect(statSync(result.recoveryPath).mode & 0o777).toBe(0o700);
  expect(leftovers(dir)).toEqual([result.recoveryPath.split('/').pop()!]);
});

it('lets one of two saves of the same version win', async () => {
  const { dir, path, token } = setup();
  const results = await Promise.all([
    write(token, MINE, contentEtag(ORIGINAL)),
    write(token, OTHER, contentEtag(ORIGINAL)),
  ]);
  const saved = results.filter((result) => result.outcome === 'saved');
  expect(saved).toHaveLength(1);
  expect((saved[0] as { etag: string }).etag).toBe(contentEtag(readFileSync(path)));
  expect(leftovers(dir)).toEqual([]);
});

it('refuses to save, and moves nothing, on a disk without hard links', async () => {
  const { dir, path, token } = setup();
  // The probe: the first link of a save, before the document moves.
  const link = spyOn(fs, 'link').mockRejectedValue(
    Object.assign(new Error('not supported'), { code: 'ENOTSUP' })
  );
  restores.push(() => link.mockRestore());
  const result = await write(token, MINE, contentEtag(ORIGINAL));
  expect(result).toMatchObject({ outcome: 'refused' });
  expect((result as { message: string }).message).toContain('download a copy');
  expect(readFileSync(path)).toEqual(ORIGINAL);
  expect(leftovers(dir)).toEqual([]);
});

it('keeps the mode of the file it replaces and leaves no directory', async () => {
  const { dir, path, token } = setup();
  expect((await write(token, MINE, contentEtag(ORIGINAL))).outcome).toBe('saved');
  expect(statSync(path).mode & 0o777).toBe(0o640);
  expect(readFileSync(path)).toEqual(MINE);
  expect(leftovers(dir)).toEqual([]);
});

it('reads the version through the instant a save leaves the path absent', async () => {
  const { path, token } = setup();
  renameSync(path, `${path}.aside`);
  setTimeout(() => renameSync(`${path}.aside`, path), 5);
  expect(await version(token)).toMatchObject({ etag: contentEtag(ORIGINAL) });
});
