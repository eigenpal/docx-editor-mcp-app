/**
 * One server process that saves one file in a loop, for
 * `document-save-stress.test.ts`. A host can run this server more than once
 * for the same document, so two of these must never both win over one version.
 *
 * Usage: save-worker.ts <path> <milliseconds> <log file> <name>
 */

import { writeFileSync } from 'node:fs';
import { openPath, version, write } from '../documents.js';

const [path, duration, out, who] = process.argv.slice(2) as [string, string, string, string];
const opened = openPath(path);
if ('message' in opened) throw new Error(opened.message);
const end = Date.now() + Number(duration);
/** Each save: the etag it named, its result, and the etag of the bytes it sent. */
const log: { ifMatch: string; outcome: string; etag: string; sent: string; message?: string }[] =
  [];
for (let n = 1; Date.now() < end; n++) {
  const seen = await version(opened.token);
  if (!seen || 'message' in seen) continue;
  const text = `${who} ${n} `.padEnd(64 + (n % 5) * 2000, who[0]);
  const bytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(text)]);
  const result = await write(opened.token, bytes, seen.etag);
  log.push({
    ifMatch: seen.etag,
    outcome: result.outcome,
    etag: 'etag' in result ? result.etag : '',
    sent: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
    message: 'message' in result ? result.message : undefined,
  });
}
writeFileSync(out, JSON.stringify(log));
