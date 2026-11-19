/**
 * Another program, as its own process: it saves a new version of one file in a
 * loop, as fast as it can, and records what it found at the path before each
 * save. `document-save-stress.test.ts` starts it.
 *
 * Usage: foreign-writer.ts <path> <replace|rewrite> <milliseconds> <log file>
 */

import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

const [path, mode, duration, out] = process.argv.slice(2) as [string, string, string, string];
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** A version whose length and filler follow from its number, so a reader can tell a whole one. */
export function foreignVersion(n: number): Buffer {
  const text = `foreign ${n} `.padEnd(64 + (n % 7) * 1000, 'x');
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(text)]);
}

if (path && out) {
  const end = Date.now() + Number(duration);
  /** Each entry: the version this program wrote last, and what it found before the next save. */
  const log: [string | null, string | null][] = [];
  let previous: string | null = null;
  let absent = 0;
  for (let n = 1; Date.now() < end; n++) {
    let seen: string | null = null;
    try {
      seen = sha(readFileSync(path));
    } catch {
      absent += 1; // a save by the server had the file moved aside at that instant
    }
    const bytes = foreignVersion(n);
    if (mode === 'replace') {
      writeFileSync(`${path}.theirs`, bytes);
      renameSync(`${path}.theirs`, path);
    } else writeFileSync(path, bytes);
    log.push([previous, seen]);
    previous = sha(bytes);
    const until = performance.now() + Math.random() * 3;
    while (performance.now() < until);
  }
  writeFileSync(out, JSON.stringify({ log, absent, last: previous }));
}
