import { mkdtemp, rename, rmdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileVersion } from './file-version.js';
import { swapFiles } from './atomic-swap.js';

type Result = { outcome: 'installed' | 'conflict'; recoveryPath: string };

/** Keep the exact displaced file even when another app saves after the final check. */
export async function preserveSave(
  path: string,
  temporary: string,
  ifMatch: string
): Promise<Result> {
  const directory = await mkdtemp(join(dirname(path), '.docx-recovery-'));
  const recoveryPath = join(directory, basename(path));
  let prepared = false;
  try {
    // Put new bytes at the recovery name first. After the swap, it holds the old file.
    await rename(temporary, recoveryPath);
    prepared = true;
    swapFiles(path, recoveryPath);
    const previous = await fileVersion(recoveryPath);
    return { outcome: previous.etag === ifMatch ? 'installed' : 'conflict', recoveryPath };
  } catch (cause) {
    // Never remove either name after a native error: a remote file system can report an uncertain result.
    if (prepared) {
      throw new Error(
        `The save could not be verified. A recovery file remains at ${recoveryPath}.`,
        {
          cause,
        }
      );
    }
    throw cause;
  } finally {
    if (!prepared) await rmdir(directory).catch(() => undefined);
  }
}
