/** The edges of a save that are not races: metadata, names, permissions, and what a stopped server leaves. */

import { afterEach, expect, it, setDefaultTimeout, spyOn } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_CONTENT_BYTES } from '../../shared/limits.js';
import { contentEtag } from '../file-version.js';
import { openPath, version, write } from '../documents.js';

// Each test runs a save some hundreds of times; a slow machine needs more than the default.
setDefaultTimeout(120_000);

const doc = (text: string) =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(text)]);
const ORIGINAL = doc('original');
const MINE = doc('mine....');
const OTHER = doc('other...');

const directories: string[] = [];
const restores: (() => void)[] = [];
afterEach(() => {
  for (const restore of restores.splice(0)) restore();
  for (const dir of directories.splice(0)) {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

function setup(name = 'a.docx', bytes: Uint8Array = ORIGINAL) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'docx-save-edge-')));
  directories.push(dir);
  const path = join(dir, name);
  writeFileSync(path, bytes);
  const opened = openPath(path);
  if ('message' in opened) throw new Error(opened.message);
  return { dir, path, token: opened.token };
}

/** Runs `act` once, after the save's version check and before it moves the document. */
function beforeTheMove(act: () => void) {
  // The save makes its directory right after the check.
  const real = fs.mkdtemp;
  const spy = spyOn(fs, 'mkdtemp').mockImplementation((async (...args: unknown[]) => {
    const made = await (real as (...a: unknown[]) => Promise<string>)(...args);
    act();
    return made;
  }) as never);
  restores.push(() => spy.mockRestore());
}

const saveDirectories = (dir: string) =>
  readdirSync(dir).filter((name) => name.startsWith('.docx-editor-save-'));

it('saves over a file whose metadata changed but whose contents did not', async () => {
  const { dir, path, token } = setup();
  // A `touch`, a new Finder tag, a backup tool: not another version.
  beforeTheMove(() => utimesSync(path, new Date(), new Date(Date.now() + 5000)));
  expect(await write(token, MINE, contentEtag(ORIGINAL))).toEqual({
    outcome: 'saved',
    etag: contentEtag(MINE),
  });
  expect(readFileSync(path)).toEqual(MINE);
  expect(saveDirectories(dir)).toEqual([]);
});

it('reports a file deleted during a save as gone, not as a conflict', async () => {
  const { dir, path, token } = setup();
  beforeTheMove(() => rmSync(path));
  expect(await write(token, MINE, contentEtag(ORIGINAL))).toEqual({
    outcome: 'refused',
    message: 'The file no longer exists at its path.',
  });
  expect(existsSync(path)).toBe(false);
  expect(saveDirectories(dir)).toEqual([]);
});

it('puts back a foreign version of a file with the longest name', async () => {
  // 255 bytes: a recovery name made from this one would not fit.
  const { dir, path, token } = setup(`${'n'.repeat(250)}.docx`);
  beforeTheMove(() => writeFileSync(path, OTHER));
  expect(await write(token, MINE, contentEtag(ORIGINAL))).toEqual({
    outcome: 'conflict',
    etag: contentEtag(OTHER),
  });
  expect(readFileSync(path)).toEqual(OTHER);
  expect(saveDirectories(dir)).toEqual([]);
});

it('reports a file in a read-only directory as not writable', async () => {
  const { dir, path, token } = setup();
  chmodSync(dir, 0o500);
  expect(await version(token)).toMatchObject({ writable: false });
  expect(await write(token, MINE, contentEtag(ORIGINAL))).toEqual({
    outcome: 'refused',
    message: 'The file is read-only.',
  });
  expect(readFileSync(path)).toEqual(ORIGINAL);
});

it('versions a file over the cap without a hash, and a save still names its real etag', async () => {
  const large = Buffer.alloc(MAX_CONTENT_BYTES + 1);
  doc('').copy(large);
  const { path, token } = setup('large.docx', large);
  const polled = await version(token);
  if (!polled || 'message' in polled) throw new Error('not versioned');
  expect(polled.etag).toStartWith('unread-');
  // That etag is not a content hash: the save answers with one that it accepts.
  const refused = await write(token, MINE, polled.etag);
  expect(refused).toEqual({ outcome: 'conflict', etag: contentEtag(large) });
  expect((await write(token, MINE, contentEtag(large))).outcome).toBe('saved');
  expect(readFileSync(path)).toEqual(MINE);
});

it('clears what a stopped server left, but only a staged file equal to the document', async () => {
  const { dir, path, token } = setup();
  const old = new Date(Date.now() - 60 * 60 * 1000);
  const leave = (name: string, staged: Uint8Array | null, age: Date | null) => {
    const left = join(dir, `.docx-editor-save-${name}`);
    mkdirSync(left);
    if (staged) writeFileSync(join(left, 'new'), staged);
    if (age) utimesSync(left, age, age);
    return left;
  };
  // Stopped after the link: the staged file is one more copy of the document.
  const redundant = leave('redundant', ORIGINAL, old);
  const empty = leave('empty', null, old);
  // Stopped before the link: the staged file holds edits that were never saved.
  const unsaved = leave('unsaved', OTHER, old);
  // Another save in progress, in another process.
  const fresh = leave('fresh', ORIGINAL, null);
  expect((await write(token, MINE, contentEtag(ORIGINAL))).outcome).toBe('saved');
  expect(existsSync(redundant)).toBe(false);
  expect(existsSync(empty)).toBe(false);
  expect(readFileSync(join(unsaved, 'new'))).toEqual(OTHER);
  expect(readFileSync(join(fresh, 'new'))).toEqual(ORIGINAL);
  expect(readFileSync(path)).toEqual(MINE);
});

it('says where the document is when a save stopped between the move and the link', async () => {
  const { dir, path, token } = setup();
  const left = join(dir, '.docx-editor-save-stopped');
  mkdirSync(left);
  writeFileSync(join(left, 'a.docx'), ORIGINAL);
  rmSync(path);
  expect(await version(token)).toEqual({
    message: `The file no longer exists at its path. A save left a copy at ${join(left, 'a.docx')}.`,
  });
});

it('saves, and puts back a foreign version, for every kind of file name', async () => {
  const names = [
    'with space.docx',
    'Nástupní smlouva.docx',
    'cafe\u0301 (decomposed).docx',
    '契約書.docx',
    '📄 emoji.docx',
    '.hidden.docx',
    'quote\'s "and" $(shell) `tick` %25 & ; .docx',
    '.docx-editor-save-looks-like-ours.docx',
    'UPPER.DOCX',
    '-leading-dash.docx',
    'new', // the server's own staging name, as a folder for the document
  ];
  for (const name of names) {
    const file = name === 'new' ? 'new.docx' : name;
    for (const foreign of [false, true]) {
      const { dir, path, token } = setup(file);
      if (foreign) beforeTheMove(() => writeFileSync(path, OTHER));
      const result = await write(token, MINE, contentEtag(ORIGINAL));
      for (const restore of restores.splice(0)) restore();
      const where = `${JSON.stringify(file)}, foreign save: ${foreign}: ${JSON.stringify(result)}`;
      expect(result.outcome, where).toBe(foreign ? 'conflict' : 'saved');
      expect(readFileSync(path).equals(foreign ? OTHER : MINE), where).toBe(true);
      expect(readdirSync(dir), where).toHaveLength(1);
    }
  }
});
