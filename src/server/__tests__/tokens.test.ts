/**
 * Signed document tokens. A token that verifies is a path this user's key
 * signed, so a forged or altered token must never resolve, and a second
 * server process must resolve a genuine one.
 */

import { describe, expect, it } from 'bun:test';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { signPath, verifiedPath } from '../tokens.js';

const PATH = '/Users/someone/Documents/contract.docx';

describe('signPath', () => {
  it('round-trips a path, including non-ASCII names', () => {
    expect(verifiedPath(signPath(PATH))).toBe(PATH);
    const named = '/Users/someone/Dokumenty/Nástupní smlouva.docx';
    expect(verifiedPath(signPath(named))).toBe(named);
  });

  it('keeps the key private to the user', () => {
    signPath(PATH);
    const key = join(process.env.DOCX_EDITOR_STATE_DIR!, 'token-key');
    expect(statSync(key).size).toBe(32);
    if (process.platform !== 'win32') expect(statSync(key).mode & 0o777).toBe(0o600);
  });
});

describe('verifiedPath', () => {
  it('refuses a token whose path was changed', () => {
    const [, signature] = signPath(PATH).split('.');
    const other = Buffer.from('/etc/secret.docx').toString('base64url');
    expect(verifiedPath(`${other}.${signature}`)).toBeNull();
  });

  it('refuses a changed signature and malformed tokens', () => {
    const [encoded, signature] = signPath(PATH).split('.');
    const flipped = `${signature!.startsWith('A') ? 'B' : 'A'}${signature!.slice(1)}`;
    expect(verifiedPath(`${encoded}.${flipped}`)).toBeNull();
    expect(verifiedPath(`${encoded}.${signature!.slice(1)}`)).toBeNull();
    for (const token of [
      '',
      encoded!,
      `${encoded}.`,
      `.${signature}`,
      `${encoded}.${signature}.x`,
    ]) {
      expect(verifiedPath(token)).toBeNull();
    }
  });

  it('resolves in another server process that shares the key', () => {
    const token = signPath(PATH);
    const child = Bun.spawnSync({
      cmd: [
        process.execPath,
        '-e',
        `import { verifiedPath } from ${JSON.stringify(join(import.meta.dir, '../tokens.ts'))};` +
          `console.log(verifiedPath(${JSON.stringify(token)}));`,
      ],
      env: { ...process.env },
    });
    expect(child.stdout.toString().trim()).toBe(PATH);
  });
});
