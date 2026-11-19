/**
 * Two real processes on one file, with no planned timing: this server saves
 * in a loop while another program saves in a loop.
 *
 * The other tests place each event. This one lets the operating system place
 * them, thousands of times, and audits every file the server removes: a save
 * may remove its own bytes and the version it was told to replace, and
 * nothing else.
 */

import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { read, version, write } from '../documents.js';
import { cleanUp, doc, setup } from './save-steps.js';

afterEach(cleanUp);

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
// The spies replace the module's exports; the test's own calls use these.
const { readFileSync, readdirSync, statSync } = fsSync;
const DURATION_MS = Number(process.env.DOCX_STRESS_MS ?? 1500);

function mine(n: number): Buffer {
  return doc(`mine ${n} `.padEnd(64 + (n % 5) * 3000, 'm'));
}

/** Whether these bytes are one whole version: its filler runs to the end. */
function whole(bytes: Buffer): boolean {
  const text = bytes.subarray(4).toString();
  const match = /^(start|(?:foreign|mine) \d+ )(x*|m*)$/.exec(text);
  return bytes.subarray(0, 4).equals(doc('').subarray(0, 4)) && match !== null;
}

describe('a server and another program save one file at the same time', () => {
  for (const mode of ['replace', 'rewrite'] as const) {
    it(`removes no file it may not remove: the other program does a ${mode}`, async () => {
      const { dir, path, token } = setup('a.docx', doc('start'));
      const out = join(dir, 'foreign.json');
      let allowed = new Set<string>();
      const wrong: string[] = [];
      let audited = 0;
      const audit = (target: unknown) => {
        let bytes: Buffer;
        try {
          // One more name of a file that stays is not a removal.
          if (statSync(String(target)).nlink > 1) return;
          bytes = readFileSync(String(target));
        } catch {
          return;
        }
        audited += 1;
        if (!allowed.has(sha(bytes))) wrong.push(`${String(target)}: ${bytes.subarray(4, 24)}`);
      };
      const realUnlink = fs.unlink;
      const realUnlinkSync = fsSync.unlinkSync;
      const spies = [
        spyOn(fs, 'unlink').mockImplementation(((target: string) => {
          audit(target);
          return realUnlink(target);
        }) as never),
        spyOn(fsSync, 'unlinkSync').mockImplementation(((target: string) => {
          audit(target);
          return realUnlinkSync(target);
        }) as never),
      ];
      const child = spawn(
        process.execPath,
        [join(import.meta.dir, 'foreign-writer.ts'), path, mode, String(DURATION_MS), out],
        { stdio: 'inherit' }
      );
      let running = true;
      const exited = new Promise<void>((resolve) =>
        child.on('exit', () => {
          running = false;
          resolve();
        })
      );
      const ours = new Map<string, string>(); // our bytes -> the etag that save named
      const keptByConflicts = new Set<string>();
      const outcomes: Record<string, number> = {};
      const badReads: string[] = [];
      let saves = 0;
      try {
        while (running) {
          const seen = await version(token);
          if (!seen || 'message' in seen) continue;
          const bytes = mine(++saves);
          ours.set(sha(bytes), seen.etag);
          allowed = new Set([sha(bytes), seen.etag]);
          const result = await write(token, bytes, seen.etag);
          outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
          if (result.outcome === 'saved' && result.etag !== sha(bytes)) {
            wrong.push(`saved with an etag that is not the bytes written, save ${saves}`);
          }
          if (result.outcome === 'conflict' && result.recoveryPath) {
            for (const name of readdirSync(result.recoveryPath)) {
              keptByConflicts.add(sha(readFileSync(join(result.recoveryPath, name))));
            }
          }
          // A read pairs its bytes with their own etag, whatever lands meanwhile.
          const got = await read(token);
          if (got && !('message' in got)) {
            if (got.etag !== sha(got.bytes)) badReads.push('the etag is not of the bytes read');
            // An atomic save shows a reader one whole version or another, never a mix.
            if (mode === 'replace' && !whole(got.bytes)) badReads.push('a mix of two versions');
          }
        }
        await exited;
      } finally {
        child.kill();
        for (const spy of spies) spy.mockRestore();
      }
      const foreign = JSON.parse(readFileSync(out, 'utf8')) as {
        log: [string | null, string | null][];
        last: string;
      };
      // What the other program found at the path, each time, was its own last
      // version, or bytes of ours from a chain of saves that each named what
      // it replaced. `unexplained` counts our bytes seen before a rollback
      // took them out again: seen, not lost.
      let unexplained = 0;
      for (const [previous, seen] of foreign.log) {
        if (seen === null || seen === previous || previous === null) continue;
        let at = seen;
        let explained = keptByConflicts.has(previous);
        for (let hops = 0; !explained && hops < 100_000 && ours.has(at); hops++) {
          at = ours.get(at)!;
          explained = at === previous;
        }
        if (!explained) unexplained += 1;
      }
      expect(wrong).toEqual([]);
      expect(badReads).toEqual([]);
      // Enough of both, or the test proved nothing.
      expect(foreign.log.length).toBeGreaterThan(50);
      expect(outcomes.saved ?? 0).toBeGreaterThan(5);
      expect(outcomes.conflict ?? 0).toBeGreaterThan(5);
      expect(audited).toBeGreaterThan(10);
      expect(outcomes['too-large']).toBeUndefined();
      // The file at the end is the last version of one of the two programs.
      const final = sha(readFileSync(path));
      expect(final === foreign.last || ours.has(final)).toBe(true);
      expect(unexplained).toBeLessThan(foreign.log.length / 10);
    }, 60_000);
  }
});

describe('several servers save one file at the same time', () => {
  it('lets exactly one save win over each version', async () => {
    const { dir, path } = setup('a.docx', doc('start'));
    const names = ['alpha', 'bravo', 'charlie'];
    const workers = names.map((who) => {
      const child = spawn(
        process.execPath,
        [join(import.meta.dir, 'save-worker.ts'), path, String(DURATION_MS), join(dir, who), who],
        { stdio: 'inherit' }
      );
      return new Promise<number | null>((resolve) => child.on('exit', resolve));
    });
    expect(await Promise.all(workers)).toEqual([0, 0, 0]);
    type Save = { ifMatch: string; outcome: string; etag: string; sent: string; message?: string };
    const saves = names.flatMap(
      (who) => JSON.parse(readFileSync(join(dir, who), 'utf8')) as Save[]
    );
    const won = saves.filter((save) => save.outcome === 'saved');
    // `saved` names the bytes that were sent.
    expect(won.filter((save) => save.etag !== save.sent)).toEqual([]);
    // No two saves replaced the same version: a second one would be a lost update.
    const replaced = new Map<string, number>();
    for (const save of won) replaced.set(save.ifMatch, (replaced.get(save.ifMatch) ?? 0) + 1);
    expect([...replaced.values()].filter((count) => count > 1)).toEqual([]);
    // So the saves form one line, from the first version to the file on disk now.
    const next = new Map(won.map((save) => [save.ifMatch, save.etag]));
    let at = sha(doc('start'));
    let length = 0;
    while (next.has(at)) {
      at = next.get(at)!;
      length += 1;
    }
    expect(length).toBe(won.length);
    expect(at).toBe(sha(readFileSync(path)));
    // A conflict never names the version that the save itself named.
    expect(
      saves.filter((save) => save.outcome === 'conflict' && save.etag === save.ifMatch)
    ).toEqual([]);
    // No save directory stays, and no server claimed the file was gone.
    expect(readdirSync(dir).filter((name) => name.startsWith('.docx-editor-save-'))).toEqual([]);
    const gone = saves.filter((save) => /no longer exists/.test(save.message ?? ''));
    expect(gone.length).toBeLessThan(saves.length / 50 + 2);
    expect(won.length).toBeGreaterThan(10);
  }, 120_000);
});
