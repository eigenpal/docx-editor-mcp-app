/**
 * Where the repository root is, from wherever this file ended up.
 *
 * The server runs from two layouts — `src/server/` under bun in development,
 * `dist/server/server/` under node in production — and the widget bundle and
 * `public/` sit at the root in both. Counting `..` segments gets one of the two
 * wrong, silently, so walk up to the `package.json` instead.
 */

import { existsSync } from 'node:fs';
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
export const WIDGET_HTML = join(REPO_ROOT, 'dist/app/editor.html');
export const PUBLIC_DIR = join(REPO_ROOT, 'public');
