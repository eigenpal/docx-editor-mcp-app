/**
 * The one HTML resource this server serves, and the URI it is served under.
 *
 * The URI carries a content hash. ChatGPT caches MCP resources hard and keys
 * that cache on the URI, so a fixed URI means a redeploy ships to a client that
 * keeps rendering the previous build. Hashing the bytes makes a new build a new
 * URI, and an unchanged build keep its old one, which is what a cache wants.
 *
 * `registerAppTool` and `registerAppResource` must agree on the URI exactly, so
 * both read it from here rather than spelling it out.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { WIDGET_HTML } from './paths.js';

function readWidgetHtml(): string {
  try {
    return readFileSync(WIDGET_HTML, 'utf8');
  } catch {
    throw new Error(
      `the widget bundle is missing (${WIDGET_HTML}). Run \`bun run build:app\` first.`
    );
  }
}

export interface UiResource {
  /** The single-file widget, inlined script and all. */
  html: string;
  /** `ui://docx-editor/editor.html?v=<hash>` — stable per build, new per change. */
  uri: string;
}

const cache = new Map<string, UiResource>();

/**
 * @param publicOrigin - Where the widget fetches `harfbuzz.wasm` and documents
 *   from. The bundle is built once and carries a `__PUBLIC_ORIGIN__` placeholder,
 *   because the origin is deployment configuration, not build configuration.
 *   It is substituted before the hash, so two deployments do not share a URI.
 */
export function getUiResource(publicOrigin: string): UiResource {
  const hit = cache.get(publicOrigin);
  if (hit) return hit;

  const html = readWidgetHtml().replaceAll('__PUBLIC_ORIGIN__', publicOrigin);
  const version = createHash('sha256').update(html).digest('hex').slice(0, 12);
  const resource = { html, uri: `ui://docx-editor/editor.html?v=${version}` };
  cache.set(publicOrigin, resource);
  return resource;
}
