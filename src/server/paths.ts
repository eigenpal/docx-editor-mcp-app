/**
 * Where the repository root is, from wherever this file ended up.
 *
 * The server runs from two layouts — `src/server/` under bun in development,
 * the npm package's `dist/` in production — and the build output sits at the
 * root in both. Counting `..` segments gets one of the two
 * wrong, silently, so walk up to the `package.json` instead.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function findRoot(from: string): string {
  let current = from;
  for (;;) {
    if (existsSync(join(current, 'package.json'))) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`no package.json above ${from}; cannot locate the repository root`);
    }
    current = parent;
  }
}

export const REPO_ROOT = findRoot(dirname(fileURLToPath(import.meta.url)));

/** The one version: the server info, `--version`, and the plugin manifest agree with it. */
export const PACKAGE_VERSION = (
  JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { version: string }
).version;
