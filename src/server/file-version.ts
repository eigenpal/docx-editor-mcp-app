import { createHash } from 'node:crypto';
import { constants, open, type FileHandle } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';

export const OPEN_FLAGS =
  constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

export const metadataOf = (info: BigIntStats) =>
  `${info.dev}-${info.ino}-${info.size}-${info.mtimeNs}-${info.ctimeNs}`;

export const contentEtag = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Read through one descriptor so replacement cannot mix two files. */
export async function fileVersion(path: string): Promise<{ etag: string; info: BigIntStats }> {
  const handle = await open(path, OPEN_FLAGS);
  try {
    return await handleVersion(handle);
  } finally {
    await handle.close();
  }
}

/** The version of an open file. The caller keeps the handle, and with it the file's identity. */
export async function handleVersion(
  handle: FileHandle
): Promise<{ etag: string; info: BigIntStats }> {
  {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await handle.stat({ bigint: true });
      if (!before.isFile()) throw new Error('The path no longer holds a regular file.');
      const hash = createHash('sha256');
      const buffer = Buffer.allocUnsafe(64 * 1024);
      let position = 0;
      while (true) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
        if (!bytesRead) break;
        hash.update(buffer.subarray(0, bytesRead));
        position += bytesRead;
        // A continuously growing file must not hold a request open forever.
        if (BigInt(position) > before.size) break;
      }
      const after = await handle.stat({ bigint: true });
      if (BigInt(position) === before.size && metadataOf(before) === metadataOf(after)) {
        return { etag: hash.digest('hex'), info: after };
      }
    }
    throw new Error('The file kept changing during the read. Try again.');
  }
}
