/**
 * Shared by the save tests: a document in its own directory, and a way to act
 * before any file system call that a save makes.
 */

import { spyOn } from 'bun:test';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPath } from '../documents.js';

export const doc = (text: string) =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(text)]);
// One length: a same-size edit must not hide behind the size.
export const ORIGINAL = doc('original');
export const MINE = doc('mine....');
export const OTHER = doc('other...');
export const THIRD = doc('third...');

/** Every file system call a save makes. The move and the link are synchronous (`replace.ts`). */
const ASYNC_STEPS = ['lstat', 'access', 'open', 'mkdtemp', 'link', 'unlink', 'rmdir', 'readdir'];
const SYNC_STEPS = ['renameSync', 'linkSync', 'unlinkSync'];

// The spies replace the modules' exports; the tests' own calls use these.
const real = { ...fsSync };

const directories: string[] = [];
const restores: (() => void)[] = [];

/** Call from `afterEach`. */
export function cleanUp(): void {
  release();
  for (const dir of directories.splice(0)) {
    try {
      real.chmodSync(dir, 0o700);
    } catch {
      // Moved or removed by the test.
    }
    real.rmSync(dir, { recursive: true, force: true });
  }
}

/** Remove the spies. */
export function release(): void {
  for (const restore of restores.splice(0)) restore();
}

export function setup(name = 'a.docx', bytes: Uint8Array = ORIGINAL) {
  // The real path: the server resolves it, and the tests match its calls by path.
  const dir = real.realpathSync(real.mkdtempSync(join(tmpdir(), 'docx-save-')));
  directories.push(dir);
  const path = join(dir, name);
  real.writeFileSync(path, bytes, { mode: 0o640 });
  const opened = openPath(path);
  if ('message' in opened) throw new Error(opened.message);
  return { dir, path, token: opened.token };
}

/** What a save left in the directory, apart from the document. */
export const leftovers = (dir: string, name = 'a.docx') =>
  real.readdirSync(dir).filter((entry) => entry !== name);

/** The files in the directory that a conflict result names. */
export const kept = (recoveryPath: string | undefined) =>
  recoveryPath
    ? real.readdirSync(recoveryPath).map((name) => real.readFileSync(join(recoveryPath, name)))
    : [];

/**
 * Runs `act` before the file system calls a save makes. `when` sees each call
 * and its count, and says whether to act now. `fail` makes the call fail
 * instead of running it. Returns the count so far.
 */
export function intercept(
  when: (step: string, count: number, args: unknown[]) => boolean,
  act: () => void,
  fail?: (step: string, count: number) => string | undefined
) {
  let count = 0;
  // A foreign save uses the same calls; it must not count as a step of the save.
  let acting = false;
  const wrap = (target: Record<string, unknown>, step: string, sync: boolean) => {
    const original = target[step] as (...args: unknown[]) => unknown;
    const spy = spyOn(target, step).mockImplementation(((...args: unknown[]) => {
      if (acting) return original(...args);
      count += 1;
      if (when(step, count, args)) {
        acting = true;
        try {
          act();
        } finally {
          acting = false;
        }
      }
      const code = fail?.(step, count);
      if (code) {
        const error = Object.assign(new Error(`${code}: injected`), { code });
        if (sync) throw error;
        return Promise.reject(error);
      }
      return original(...args);
    }) as never);
    restores.push(() => spy.mockRestore());
  };
  for (const step of ASYNC_STEPS) wrap(fs as never, step, false);
  for (const step of SYNC_STEPS) wrap(fsSync as never, step, true);
  return () => count;
}
