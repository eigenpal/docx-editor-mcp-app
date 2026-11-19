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

  it('gives the signed path, or nothing, for every one-character change of a token', () => {
    const token = signPath(PATH);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.=/+ ';
    let refused = 0;
    for (let at = 0; at < token.length; at++) {
      for (const letter of alphabet) {
        if (letter === token[at]) continue;
        const path = verifiedPath(token.slice(0, at) + letter + token.slice(at + 1));
        // Base64 has spare bits: a changed letter can decode to the same bytes.
        // What it can never do is verify for another path.
        if (path === null) refused += 1;
        else expect(path).toBe(PATH);
      }
    }
    expect(refused).toBeGreaterThan(token.length * 60);
  });

  it('refuses a signature made for another path, and random tokens', () => {
    const [, signature] = signPath(PATH).split('.');
    for (const path of [
      '/etc/passwd',
      `${PATH}x`,
      PATH.slice(0, -1),
      `${PATH}\0`,
      PATH.toUpperCase(),
    ]) {
      expect(verifiedPath(`${Buffer.from(path).toString('base64url')}.${signature}`)).toBeNull();
    }
    for (let n = 0; n < 2000; n++) {
      const random = Buffer.from(Array.from({ length: 40 }, () => Math.floor(Math.random() * 256)));
      const forged = `${Buffer.from(PATH).toString('base64url')}.${random.subarray(0, 32).toString('base64url')}`;
      expect(verifiedPath(forged)).toBeNull();
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
