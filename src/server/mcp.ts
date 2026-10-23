/**
 * The MCP server: one model-facing tool, `open_document`, and the plumbing the
 * host and the widget call (`visibility: ['app']`).
 *
 * Agents edit a .docx with their own document skills (Codex: the built-in
 * Documents skill), never through this app. The preview follows the file
 * through the engine's refresh API and saves the reader's own edits back.
 *
 * Everything the widget needs travels over MCP: the widget is one inline
 * document, it reads `harfbuzz.wasm` and opened files as resources, and bytes
 * come in the tool result. Desktop hosts' iframe CSP allows no network origin
 * of ours, so nothing is fetched.
 */

import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
import {
  OpenAIFileEntrypointInputSchema,
  type OpenAIUiToolMetadata,
} from '@openai/mcp-extensions/server';
import {
  DOCUMENT_META,
  LOCAL_FILE_VERSION,
  OpenDocumentInput,
  VIEW_DOCX_FILE,
  WRITE_LOCAL_FILE,
} from '../shared/catalog.js';
import { decodeBytes, openPath, read, version, write } from './documents.js';
import { APP_ICONS } from './icons.js';
import { PACKAGE_VERSION, REPO_ROOT } from './paths.js';
import { createUpdateChecker } from './updates.js';
import { UPDATE_RESOURCE } from '../shared/updates.js';

const checkUpdates = createUpdateChecker(PACKAGE_VERSION);

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const appOnly = { ui: { visibility: ['app' as const] } };

/** The built widget, read once. The URI carries a hash so hosts never serve a stale build. */
let widget: { uri: string; html: string } | null = null;
function loadWidget() {
  if (widget) return widget;
  const html = readFileSync(join(REPO_ROOT, 'dist/app/editor.html'), 'utf8');
  const hash = readFileSync(join(REPO_ROOT, 'dist/app/editor.hash'), 'utf8').trim();
  return (widget = { uri: `ui://docx-editor/editor.html?v=${hash}`, html });
}
let wasm: string | null = null;
const loadWasm = () =>
  (wasm ??= readFileSync(join(REPO_ROOT, 'dist/app/harfbuzz.wasm')).toString('base64'));

/** The newest preview in a conversation wins; see src/app/supersession.ts. */
let seq = 0;

interface McpServerOptions {
  /**
   * Local (stdio) mode: `open_document` takes file paths and the preview syncs
   * with the file. The HTTP deployment never sets it: a deployed server that
   * read its own disk on request would be a file-disclosure endpoint.
   */
  local?: boolean;
  /** The widget; tests pass one instead of the build. */
  ui?: { uri: string; html: string };
}

export function createMcpServer({ local = false, ui = loadWidget() }: McpServerOptions = {}) {
  const server = new McpServer(
    // Hosts fall back to the server icon for entrypoints: the SDK's registerTool
    // does not carry tool icons.
    { name: 'docx-editor', title: 'docx-editor', version: PACKAGE_VERSION, icons: APP_ICONS },
    {
      instructions:
        'Shows .docx files in a Word-faithful preview. Call open_document to show a file. ' +
        'This app has no editing tools: edit the .docx with your own document tools, in ' +
        'place, so the formatting survives.' +
        (local
          ? ' The preview follows a file opened by path and refreshes when it changes. ' +
            'Do not call open_document again for a file that is already open.'
          : ''),
    }
  );

  registerAppTool(
    server,
    'open_document',
    {
      title: '.docx preview',
      description:
        'Show a .docx in a Word-faithful preview. ' +
        (local ? 'Pass its absolute path; the preview then follows the file. ' : '') +
        'For a file with no path here, pass content_base64. To change the document, ' +
        'edit the file with your own document tools.',
      // Hosted mode reads no disk, so its model never sees a `path` to try.
      inputSchema: local ? OpenDocumentInput.shape : OpenDocumentInput.omit({ path: true }).shape,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: { ui: { resourceUri: ui.uri } },
    },
    async (args) => {
      const { path, content_base64, name } = args as z.infer<typeof OpenDocumentInput>;
      const refuse = (text: string) => ({
        content: [{ type: 'text' as const, text }],
        isError: true,
      });
      const election = { seq: ++seq, createdAt: Date.now() };
      // A path wins over bytes: only a path gives a preview that follows the
      // file. A path that does not open here (a sandbox path) falls back to bytes.
      const opened = local && path ? openPath(path, name) : null;
      if (!opened || 'message' in opened) {
        if (!content_base64) {
          return refuse(
            opened?.message ?? (local ? 'Pass a path or content_base64.' : 'Pass content_base64.')
          );
        }
        const bytes = decodeBytes(content_base64);
        if ('message' in bytes) {
          return refuse(opened ? `${opened.message} ${bytes.message}` : bytes.message);
        }
        const shown = name ?? (path ? basename(path) : 'document.docx');
        // The agent must know this preview follows no file, or it waits for updates.
        const fallback = opened
          ? ` "${path}" did not open here, so the preview shows content_base64. It does ` +
            'not follow the file: show the document again after each change.'
          : '';
        return {
          content: [{ type: 'text', text: `Showing ${shown} in the preview.${fallback}` }],
          structuredContent: { name: shown, ...election },
          // The bytes ride in `_meta`, which hosts give the widget and not the
          // model: the server keeps no document state, so any host runs it.
          // Re-encoded: the widget's `atob` takes only canonical base64.
          _meta: { [DOCUMENT_META]: bytes.toString('base64') },
        };
      }
      return {
        content: [{ type: 'text', text: `Showing ${opened.name} in the preview.` }],
        structuredContent: {
          name: opened.name,
          resourceUri: `docx-local://${opened.token}`,
          ...election,
        },
      };
    }
  );

  // The file viewer: ChatGPT and Codex desktop open every .docx the user opens
  // in this widget. The host calls this tool and serves the file itself; the
  // widget reads, watches and writes it through the host (src/app/host-file.ts).
  registerAppTool(
    server,
    VIEW_DOCX_FILE.name,
    {
      title: VIEW_DOCX_FILE.title,
      description: VIEW_DOCX_FILE.description,
      inputSchema: OpenAIFileEntrypointInputSchema.shape,
      // The tool changes nothing. The viewer saves the user's own edits through
      // the host's file API, with the host's write consent.
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: {
        ui: { resourceUri: ui.uri, visibility: ['app'] },
        'openai/ui': {
          entrypoints: [{ type: 'file', extensions: ['.docx'] }],
        } satisfies OpenAIUiToolMetadata,
      },
    },
    // No election key: a file viewer never supersedes a chat preview, or the reverse.
    async ({ file }) => ({
      content: [{ type: 'text', text: `Showing ${file.name}.` }],
      structuredContent: { file },
    })
  );

  registerAppResource(
    server,
    'docx-editor',
    ui.uri,
    { description: 'A Word-faithful .docx preview.', mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: ui.uri,
          mimeType: RESOURCE_MIME_TYPE,
          text: ui.html,
          // No CSP domains: the widget fetches nothing.
          _meta: { ui: { prefersBorder: true } },
        },
      ],
    })
  );

  server.registerResource(
    'plugin-updates',
    UPDATE_RESOURCE,
    { description: 'Plugin release availability.', mimeType: 'application/json' },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            local ? await checkUpdates() : { current: PACKAGE_VERSION, latest: null }
          ),
        },
      ],
    })
  );

  server.registerResource(
    'harfbuzz-wasm',
    'docx-asset://harfbuzz.wasm',
    { title: 'Text shaper', mimeType: 'application/wasm' },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'application/wasm', blob: loadWasm() }],
    })
  );

  if (local) {
    server.registerResource(
      'document',
      new ResourceTemplate('docx-local://{token}', { list: undefined }),
      { title: 'Opened document', mimeType: DOCX_MIME },
      async (uri, { token }) => {
        const [bytes, current] = await Promise.all([read(String(token)), version(String(token))]);
        if (!bytes || !current) throw new Error('This document is no longer open.');
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: DOCX_MIME,
              blob: bytes.toString('base64'),
              // The OpenAI host's metadata shape, so one sync session handles both kinds of file.
              _meta: { 'openai/resource': current },
            },
          ],
        };
      }
    );

    registerAppTool(
      server,
      LOCAL_FILE_VERSION.name,
      {
        description: LOCAL_FILE_VERSION.description,
        inputSchema: LOCAL_FILE_VERSION.input.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        _meta: appOnly,
      },
      async ({ token }) => {
        const current = await version(token);
        if (!current) return { content: [{ type: 'text', text: 'Unknown file.' }], isError: true };
        return {
          content: [{ type: 'text', text: current.etag }],
          structuredContent: { ...current },
        };
      }
    );
    registerAppTool(
      server,
      WRITE_LOCAL_FILE.name,
      {
        description: WRITE_LOCAL_FILE.description,
        inputSchema: WRITE_LOCAL_FILE.input.shape,
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
        _meta: appOnly,
      },
      async ({ token, blob, ifMatch }) => {
        const result = await write(token, Buffer.from(blob, 'base64'), ifMatch);
        return {
          content: [{ type: 'text', text: 'message' in result ? result.message : result.outcome }],
          structuredContent: { ...result },
          isError: result.outcome === 'refused',
        };
      }
    );
  }

  return server;
}
