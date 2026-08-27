/**
 * The MCP server. It is deliberately almost empty.
 *
 * One tool (`open_document`) and one resource (the widget). Every other tool in
 * `src/shared/catalog.ts` is registered by the WIDGET and runs in the browser,
 * against the editor the reader is looking at. That is not a shortcut: the
 * docx-editor engine needs no server-side document service, so the document
 * bytes never reach this process, and the deployment stays a static handler
 * rather than something with a document pipeline to operate.
 *
 * What that costs: a host that does not call app-registered tools gets a
 * read-only view. The widget covers that case by pushing the document text into
 * the conversation with `ui/update-model-context` on load and after every edit,
 * so the model can always READ the document even where it cannot call into it.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
import { OpenDocumentInput } from '../shared/catalog.js';
import { getUiResource } from './ui-resource.js';
import { looksLikeLocalPath, registerBytesContent, registerLocalFile } from './local-files.js';

/** Where the widget fetches `harfbuzz.wasm` and any fonts from. */
export interface McpServerOptions {
  /**
   * Public origin this server is reachable at, for example
   * `https://docx-editor-mcp.example.com`. It ends up in the widget's CSP
   * allowlist, because the sandboxed iframe may only fetch from domains the
   * resource declares. Without it the engine falls back to its non-shaped text
   * measurement and pagination drifts away from Word.
   */
  publicOrigin: string;
  /**
   * Accept absolute file paths in `open_document`. The stdio (Claude Desktop)
   * entry sets this; the HTTP deployment never does — a deployed server that
   * read its own disk on request would be a file-disclosure endpoint.
   */
  allowLocalFiles?: boolean;
}

/**
 * Election counter for widget supersession: each open_document result carries
 * `{createdAt, seq}`, and the newest widget instance wins (see
 * src/app/supersession.ts). Per process; createdAt breaks ties across restarts.
 */
let seq = 0;

export function createMcpServer({ publicOrigin, allowLocalFiles }: McpServerOptions): McpServer {
  const server = new McpServer(
    { name: 'docx-editor', version: '0.1.0' },
    {
      instructions:
        'Opens .docx files in a real WYSIWYG Word editor inside the conversation. ' +
        'Call open_document first; it renders the editor. Once the editor is open, ' +
        'the other tools run inside it. To DRAFT a new document, call open_document ' +
        'with no arguments and then write_document — never generate the .docx ' +
        'elsewhere. Edits land as Word tracked changes by default, so the reader ' +
        'accepts or rejects each one.' +
        (allowLocalFiles
          ? ' This server runs locally: open_document also accepts an absolute ' +
            'file path. When you create or receive a .docx on this machine, open ' +
            'it here to show it to the reader.'
          : ''),
    }
  );

  const ui = getUiResource(publicOrigin);

  registerAppTool(
    server,
    'open_document',
    {
      title: 'Open document',
      description:
        'Open a .docx file in an editable Word-faithful editor inside the conversation. ' +
        'Pass a URL to open an existing file, content_base64 for a file you have as bytes ' +
        '(for example one created in a code sandbox), or no arguments to start an empty document. ' +
        (allowLocalFiles
          ? 'An absolute local file path (for example /Users/me/report.docx) also works. ' +
            'Open every .docx you create or receive, so the reader sees it rendered. '
          : '') +
        'Call this before any other document tool.',
      inputSchema: OpenDocumentInput.shape,
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { ui: { resourceUri: ui.uri } },
    },
    async ({ url, name, content_base64 }) => {
      // The server never parses the file. It hands a reference to the widget,
      // which fetches the bytes into the iframe. Bytes passed in the call, and
      // local paths (stdio mode only), become tokened /local/ URLs on this
      // server; see local-files.ts.
      seq += 1;
      const election = { seq, createdAt: Date.now() };

      if (content_base64) {
        const stored = registerBytesContent(content_base64, publicOrigin);
        if ('message' in stored) {
          return { content: [{ type: 'text', text: stored.message }], isError: true };
        }
        const opened = name ?? 'document.docx';
        return {
          content: [
            {
              type: 'text',
              text: `Opening ${opened} in the editor. Call read_document to see its text.`,
            },
          ],
          structuredContent: { url: stored.url, name: opened, ...election },
        };
      }

      if (url && allowLocalFiles && looksLikeLocalPath(url)) {
        const local = registerLocalFile(url, publicOrigin);
        if ('message' in local) {
          return { content: [{ type: 'text', text: local.message }], isError: true };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Opening ${name ?? local.name} in the editor. Call read_document to see its text.`,
            },
          ],
          structuredContent: { url: local.url, name: name ?? local.name, ...election },
        };
      }

      const opened = name ?? (url ? guessFileName(url) : 'Untitled.docx');
      return {
        content: [
          {
            type: 'text',
            text: url
              ? `Opening ${opened} in the editor. Call read_document to see its text.`
              : 'Opened an empty document in the editor.',
          },
        ],
        structuredContent: { url: url ?? null, name: opened, ...election },
      };
    }
  );

  registerAppResource(
    server,
    'DOCX editor',
    ui.uri,
    {
      description:
        'A Word-faithful WYSIWYG .docx editor: pagination, tracked changes and comments, rendered in the conversation.',
      mimeType: RESOURCE_MIME_TYPE,
    },
    async () => ({
      contents: [
        {
          uri: ui.uri,
          mimeType: RESOURCE_MIME_TYPE,
          text: ui.html,
          _meta: {
            ui: {
              // The inline surface is a summary card; the host's bordered
              // treatment is what makes it read as one. (Web defaults to
              // borderless, so the preference has to be explicit.)
              prefersBorder: true,
              // One origin, for both lists. The engine shapes text with
              // HarfBuzz to match Word's line breaking, so it fetches
              // `harfbuzz.wasm` back off this server; deny that and pagination
              // drifts, silently. Document downloads come through the same
              // origin's `/fetch` proxy rather than a wildcard, because
              // `open_document` takes an arbitrary URL and no allowlist can be
              // written for "anywhere".
              csp: {
                // assets.claude.ai serves the host's Anthropic Sans font faces
                // (applied by useHostStyles); everything else is this origin.
                resourceDomains: [publicOrigin, 'https://assets.claude.ai'],
                connectDomains: [publicOrigin],
              },
            },
          },
        },
      ],
    })
  );

  return server;
}

function guessFileName(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').pop();
    return last && last.length > 0 ? decodeURIComponent(last) : 'document.docx';
  } catch {
    return 'document.docx';
  }
}
