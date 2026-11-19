/**
 * The save path of the BUILT package, over stdio, against another program.
 *
 * The unit tests prove `src/server/replace.ts` under Bun. This proves what
 * ships: `dist/cli.js` under Node, through the MCP protocol, as a host
 * runs it. Before every file system call of one save, in turn:
 *
 *   - another program saves the document (three ways) or deletes it;
 *   - the server process is killed.
 *
 * After each run, the other program's version must be on disk, and the
 * document must be at its path or in a place the server names.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'dist/cli.js');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const doc = (text) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(text)]);
const ORIGINAL = doc('original');
const MINE = doc('mine....');
const OTHER = doc('other...');
const THIRD = doc('third...');
const work = realpathSync(mkdtempSync(join(tmpdir(), 'smoke-races-')));
const state = join(work, 'state');
const problems = [];

async function connect(env = {}, hook = true) {
  const client = new Client({ name: 'smoke-races', version: '0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [...(hook ? ['--require', join(here, 'smoke-save-hook.cjs')] : []), cli, 'stdio'],
      stderr: 'ignore',
      env: { ...process.env, DOCX_EDITOR_STATE_DIR: state, DOCX_EDITOR_UPDATE_CHECK: '0', ...env },
    })
  );
  return client;
}

const tool = (client, name, args) =>
  client.callTool({ name, arguments: args }).then(
    (result) => ({ ...result.structuredContent, text: result.content?.[0]?.text }),
    (cause) => ({ outcome: 'disconnected', text: String(cause.message) })
  );

/** One save with one event before call `at`. Returns the number of calls the save made. */
async function once(action, at, n) {
  const arm = join(work, `arm-${action}-${n}`);
  const made = mkdtempSync(join(work, `${action}-`));
  const file = join(made, 'a.docx');
  writeFileSync(file, ORIGINAL);
  const client = await connect({
    SMOKE_AT: String(at),
    SMOKE_ACTION: action,
    SMOKE_TARGET: file,
    SMOKE_ARM: arm,
    SMOKE_BYTES: OTHER.toString('base64'),
  });
  const opened = await client.callTool({ name: 'open_document', arguments: { path: file } });
  const token = opened._meta['docx-editor/resource'].split('//')[1];
  const save = (c, bytes, ifMatch) =>
    tool(c, 'write_local_file', { token, blob: bytes.toString('base64'), ifMatch });
  writeFileSync(arm, '');
  const result = await save(client, MINE, sha(ORIGINAL));
  rmSync(arm);
  const calls = Number(readFileSync(`${arm}.count`, 'utf8'));
  rmSync(`${arm}.count`);
  await client.close().catch(() => undefined);
  const fired = at > 0 && calls >= at;
  const report = (text) =>
    problems.push(`${action} before call ${at}: ${text} ${JSON.stringify(result)}`);
  const disk = existsSync(file) ? readFileSync(file) : null;
  const left = readdirSync(made).filter((name) => name !== 'a.docx');
  const text = JSON.stringify(result);

  if (action === 'kill') {
    if (!fired) return calls;
    // A new server, as after a restart of the host. The token still verifies.
    const next = await connect({}, false);
    const version = await tool(next, 'local_file_version', { token });
    if (disk) {
      if (!disk.equals(ORIGINAL) && !disk.equals(MINE)) report('the document is neither version');
      // The next save works, whatever the stopped one left behind.
      const again = await save(next, THIRD, sha(disk));
      if (again.outcome !== 'saved') report(`the next save failed: ${JSON.stringify(again)}`);
    } else {
      const copy = /A save left a copy at (.+)\.$/.exec(version.text ?? '')?.[1];
      if (!copy || !existsSync(copy) || !readFileSync(copy).equals(ORIGINAL)) {
        report(`the document is gone and the server does not say where: ${version.text}`);
      }
      const reopened = await tool(next, 'open_document', { path: file });
      if (!/A save left a copy at/.test(reopened.text ?? ''))
        report('open_document does not name the copy');
    }
    await next.close();
    return calls;
  }

  const namedDirs = left.filter((name) => text.includes(name));
  const kept = namedDirs.flatMap((name) =>
    readdirSync(join(made, name)).map((entry) => readFileSync(join(made, name, entry)))
  );
  if (left.length !== namedDirs.length) report(`left without a word: ${left}`);
  if (fired && action !== 'delete' && ![disk, ...kept].some((bytes) => bytes?.equals(OTHER))) {
    report('THE OTHER VERSION IS LOST');
  }
  if (result.outcome === 'saved') {
    if (result.etag !== sha(MINE)) report('saved with an etag that is not the bytes written');
    if (disk && !disk.equals(MINE)) {
      // The other program saved after this save. The next save must not pass over it.
      const next = await connect({}, false);
      const again = await save(next, THIRD, result.etag);
      if (again.outcome !== 'conflict' || !readFileSync(file).equals(disk))
        report('the next save overwrote');
      await next.close();
    }
  } else if (result.outcome === 'conflict') {
    if (!disk || result.etag !== sha(disk)) report('the conflict etag is not the file on disk');
    if (result.etag === sha(ORIGINAL)) report('the conflict names the version the save was given');
  } else if (result.outcome === 'refused') {
    if (action !== 'delete') report('refused');
  } else report('an unknown result');
  return calls;
}

const clean = await once('none', 0, 0);
let runs = 0;
for (const action of ['replace', 'rewrite', 'disguised', 'delete', 'kill']) {
  // A rollback makes more calls than a clean save; cover those too.
  for (let at = 1; at <= clean + 14; at++) {
    const calls = await once(action, at, at);
    runs += 1;
    if (action === 'kill' && calls < at) break;
  }
}
rmSync(work, { recursive: true, force: true });
if (problems.length) {
  console.error(`smoke-save-races: ${problems.length} problems\n${problems.join('\n')}`);
  process.exit(1);
}
if (clean < 15) {
  console.error(`smoke-save-races: the hook saw only ${clean} calls; it no longer covers a save`);
  process.exit(1);
}
console.log(`smoke-save-races: ok (${runs} saves, an event before each of ${clean} calls)`);
