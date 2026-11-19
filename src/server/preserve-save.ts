import { constants, copyFile, link, mkdtemp, rename, rmdir, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileVersion } from './file-version.js';

type Result =
  { outcome: 'installed'; recoveryPath: string } | { outcome: 'conflict'; recoveryPath: string };

/** Restore without replacing a file that another app creates during recovery. */
async function restore(previous: string, path: string): Promise<void> {
  try {
    await link(previous, path);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'EEXIST') return;
    // Some file systems have no hard links. Keep the original and restore a copy.
    await copyFile(previous, path, constants.COPYFILE_EXCL).catch(() => undefined);
  }
}

/** Preserve the exact destination before installing bytes without overwriting another save. */
export async function preserveSave(
  path: string,
  temporary: string,
  ifMatch: string
): Promise<Result> {
  const directory = await mkdtemp(join(dirname(path), '.docx-recovery-'));
  const recoveryPath = join(directory, basename(path));
  let moved = false;
  let installed = false;
  try {
    await rename(path, recoveryPath);
    moved = true;
    const previous = await fileVersion(recoveryPath);
    if (previous.etag !== ifMatch) {
      // Exclusive links restore the old path only when another app has not claimed it.
      await restore(recoveryPath, path);
      return { outcome: 'conflict', recoveryPath };
    }
    try {
      await link(temporary, path);
      installed = true;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'EEXIST') {
        return { outcome: 'conflict', recoveryPath };
      }
      throw cause;
    }
    if ((await fileVersion(recoveryPath)).etag !== ifMatch) {
      return { outcome: 'conflict', recoveryPath };
    }
    // Keep the displaced file: another app can still write through an open descriptor.
    return { outcome: 'installed', recoveryPath };
  } catch (cause) {
    if (moved) {
      if (!installed) await restore(recoveryPath, path);
      throw new Error(`The save failed. The previous file is preserved at ${recoveryPath}.`, {
        cause,
      });
    }
    throw cause;
  } finally {
    if (!moved) await rmdir(directory).catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
  }
}
