/**
 * The file viewer's sync rules, driven with fakes for the editor, the refresh
 * controller and the host file. Each test names the failure it guards: lost
 * edits, a refresh that replays our own save, a blind overwrite.
 */

import { describe, expect, it } from 'bun:test';
import { EDITED, V1, V2, setup } from './file-sync-fakes.js';
import { docx, p } from './fixtures.js';

describe('FileSyncSession', () => {
  it('refreshes from an external change and locates the changed paragraph', async () => {
    const { file, refresh, settle, last } = setup();
    file.replace(V2);
    await settle();
    expect(refresh.updates).toHaveLength(1);
    expect(refresh.updates[0]!.changes).toEqual([
      { id: 'paragraph-0', location: { paragraphIndex: 0, start: 0, end: 8, text: 'Fee: 120' } },
    ]);
    expect(last()).toEqual({
      kind: 'updated',
      summary: 'Updated: 1 change, from paragraph 1.',
    });
  });

  it('autosaves an edit and does not replay its own save as a refresh', async () => {
    const { editor, file, refresh, settle, last } = setup();
    editor.edit();
    await settle();
    expect(file.writes).toEqual([{ ifMatch: 'v1' }]);
    expect(refresh.updates).toHaveLength(0);
    expect(last()).toEqual({ kind: 'updated', summary: 'Saved to the file.' });
  });

  it('recognizes its own save on a host without version tokens', async () => {
    const { editor, file, refresh, settle } = setup({ versioned: false });
    editor.edit();
    await settle();
    expect(file.writes).toHaveLength(1);
    expect(refresh.updates).toHaveLength(0);
  });

  it('refuses a blind write when an unversioned file changed underneath', async () => {
    const { editor, file, settle, last } = setup({ versioned: false });
    file.bytes = V2; // changed on disk, notification not yet delivered
    editor.edit();
    await settle();
    expect(file.writes).toHaveLength(0);
    expect(last()?.kind).toBe('conflict');
  });

  it('holds an external change while edits are unsaved, then reloads on request', async () => {
    const { editor, file, refresh, session, settle, last } = setup();
    editor.edit();
    file.replace(V2); // arrives before the autosave timer
    await settle();
    expect(refresh.updates).toHaveLength(0);
    expect(last()?.kind).toBe('conflict');
    await session.reload();
    expect(editor.loads).toBe(1);
    expect(editor.bytes).toBe(file.bytes);
    expect(last()).toEqual({ kind: 'updated', summary: 'Reloaded from the file.' });
  });

  it('keeps the reader version on request, overwriting the version they saw', async () => {
    const { editor, file, session, settle } = setup();
    editor.edit();
    file.replace(V2);
    await settle();
    await session.keepMine();
    expect(file.writes.at(-1)).toEqual({ ifMatch: 'v2' });
    expect(file.bytes).toEqual(EDITED);
  });

  it('stops autosaving after a write conflict until the reader decides', async () => {
    const { editor, file, settle, last } = setup();
    await settle();
    file.bytes = V2; // the file moved on; its notification was lost
    file.version = 7;
    editor.edit();
    await settle();
    editor.edit(docx(p('another edit')));
    await settle();
    expect(file.writes).toEqual([{ ifMatch: 'v1' }]);
    expect(last()?.kind).toBe('conflict');
  });

  it('saves edits typed while "Keep my version" was writing', async () => {
    const { editor, file, session, settle } = setup();
    editor.edit();
    file.replace(V2);
    await settle(); // conflict: autosave is held
    const write = file.api.write;
    file.api.write = async (bytes, ifMatch) => {
      editor.edit(docx(p('typed during the write'))); // still held: no timer
      file.api.write = write;
      return write(bytes, ifMatch);
    };
    await session.keepMine();
    await settle();
    expect(file.writes).toHaveLength(2);
    expect(file.bytes).toEqual(editor.bytes);
  });

  it('saves edits flushed before the editor unmounts', async () => {
    const { editor, file, session } = setup();
    editor.edit();
    session.flush(); // the widget flushes before a new request unmounts the editor
    editor.destroyed = true; // the editor detaches before the session's cleanup
    session.dispose();
    await session.idle();
    expect(file.writes).toHaveLength(1);
    expect(file.bytes).toEqual(EDITED);
  });

  it('retries a transient refusal', async () => {
    const { file, refresh, settle, last } = setup();
    refresh.refusals.push('busy');
    file.replace(V2);
    await settle();
    expect(refresh.updates).toHaveLength(1);
    expect(last()?.kind).toBe('updated');
  });

  it('waits out a torn write before refreshing', async () => {
    const { file, refresh, settle } = setup();
    file.replace(V2.subarray(0, V2.length >> 1));
    setTimeout(() => (file.bytes = V2), 2);
    await settle();
    expect(refresh.updates).toHaveLength(1);
  });

  it('reports a read-only file so Save can fall back to a download', async () => {
    const { editor, file, session, settle } = setup({ writable: false });
    editor.edit();
    await settle();
    expect(await session.save()).toBe(false);
    expect(file.writes).toHaveLength(0);
  });

  it('drops a held conflict when the file reverts to what the editor matched', async () => {
    const { editor, file, session, settle, last } = setup();
    await settle();
    editor.edit();
    file.replace(V2);
    await settle();
    expect(last()?.kind).toBe('conflict');
    file.replace(V1); // for example, a git checkout
    await settle();
    expect(file.writes).toHaveLength(1); // the held edit saves after all
    expect(file.bytes).toEqual(EDITED);
    await session.reload();
    expect(editor.bytes).toEqual(EDITED); // reload reads the file as it is now
  });

  it('resumes autosave when a refused write was only a version touch', async () => {
    const { editor, file, settle, last } = setup();
    await settle();
    file.version = 5; // touched: new etag, same bytes, notification late
    editor.edit();
    await settle();
    expect(last()?.kind).toBe('conflict');
    file.replace(file.bytes);
    await settle();
    expect(file.writes.at(-1)).toEqual({ ifMatch: 'v6' });
    expect(last()).toEqual({ kind: 'updated', summary: 'Saved to the file.' });
  });

  it('stops retrying a write the host refused as too large', async () => {
    const { editor, file, settle, last } = setup();
    let attempts = 0;
    file.api.write = async () => {
      attempts += 1;
      return { outcome: 'too-large', maxBytes: 10 };
    };
    editor.edit();
    await settle();
    editor.edit(docx(p('more')));
    await settle();
    expect(attempts).toBe(1);
    expect(last()?.kind).toBe('error');
  });

  it('says so when a reload finds no readable file', async () => {
    const { editor, file, session, settle, last } = setup();
    await settle();
    editor.edit();
    file.replace(V2);
    await settle();
    file.bytes = new Uint8Array([1, 2, 3]);
    await session.reload();
    expect(editor.loads).toBe(0);
    expect(last()).toEqual({ kind: 'error', reason: 'The file on disk is not a readable .docx.' });
  });

  it('lets a later flush retry after a flushed write failed', async () => {
    const { editor, file, session, settle } = setup();
    await settle();
    const write = file.api.write;
    file.api.write = async () => {
      file.api.write = write;
      throw new Error('host unavailable');
    };
    editor.edit();
    session.flush(); // the panel hides; the write fails
    await settle();
    session.flush(); // the reader switches files
    await settle();
    expect(file.writes).toEqual([{ ifMatch: 'v1' }]);
    expect(file.bytes).toEqual(EDITED);
  });

  it('clears the size refusal after a save fits, and reports it to Save', async () => {
    const { editor, file, session, settle, last } = setup();
    await settle();
    const write = file.api.write;
    file.api.write = async () => ({ outcome: 'too-large', maxBytes: 10 });
    editor.edit();
    expect(await session.save()).toBe(false); // Save falls back to a download
    file.api.write = write;
    expect(await session.save()).toBe(true);
    expect(last()).toEqual({ kind: 'updated', summary: 'Saved to the file.' });
    editor.edit(docx(p('after the fix')));
    await settle();
    expect(file.bytes).toEqual(editor.bytes); // autosave works again
  });

  it('keeps the version check on "Keep my version" after the conflict cleared', async () => {
    const { editor, file, session, settle } = setup();
    await settle();
    editor.edit();
    file.replace(V2);
    await settle();
    const keep = session.keepMine(); // clicked while the revert is still arriving
    file.replace(V1);
    await keep;
    await settle();
    expect(file.writes[0]?.ifMatch).toBe('v2');
  });

  it('refuses "Keep my version" on an unversioned host when a third version arrived', async () => {
    const { editor, file, session, settle, last } = setup({ versioned: false });
    await settle();
    editor.edit();
    file.replace(V2);
    await settle(); // holding V2
    file.bytes = docx(p('a third program wrote this')); // its notification is late
    await session.keepMine();
    expect(file.writes).toHaveLength(0);
    expect(last()).toEqual({
      kind: 'conflict',
      reason: 'The file changed again. Reload it, or keep your version.',
    });
  });

  it('retries "Keep my version" against the newest version the host reported', async () => {
    const { editor, file, session, settle } = setup();
    await settle();
    editor.edit();
    file.replace(V2);
    await settle(); // holding v2
    file.version = 3; // a newer write; its notification is late
    await session.keepMine(); // refused: the host reports v3
    await session.keepMine(); // the reader confirms again
    expect(file.writes.map((w) => w.ifMatch)).toEqual(['v2', 'v3']);
    expect(file.bytes).toEqual(EDITED);
  });

  it('reports a failed write to Save so it can download instead', async () => {
    const { editor, file, session, settle } = setup();
    await settle();
    file.api.write = async () => {
      throw new Error('EACCES');
    };
    editor.edit();
    expect(await session.save()).toBe(false);
  });

  it('clears a false conflict from a double "Keep my version" when its save echoes', async () => {
    const { editor, file, session, settle, last } = setup();
    await settle();
    editor.edit();
    file.replace(V2);
    await settle();
    const first = session.keepMine();
    const second = session.keepMine(); // clicked twice; carries the old etag
    await Promise.all([first, second]);
    await settle(); // the first save's echo arrives
    expect(file.writes.map((w) => w.ifMatch)).toEqual(['v2', 'v2']);
    expect(last()?.kind).not.toBe('conflict');
    editor.edit(docx(p('later edit')));
    await settle();
    expect(file.bytes).toEqual(editor.bytes);
  });
});
