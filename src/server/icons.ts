/**
 * The docx-editor mark, for the server, its tools, and the plugin listing.
 *
 * Inlined as data URIs: a host shows icons before it trusts any origin of
 * ours, and the stdio server has no public origin at all.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './paths.js';

function svgIcon(file: string, theme: 'light' | 'dark') {
  const svg = readFileSync(join(REPO_ROOT, 'assets', file), 'utf8');
  return {
    src: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    mimeType: 'image/svg+xml',
    sizes: ['any'],
    theme,
  };
}

export const APP_ICONS = [svgIcon('icon.svg', 'light'), svgIcon('icon-dark.svg', 'dark')];
