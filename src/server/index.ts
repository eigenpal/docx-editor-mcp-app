/**
 * HTTP entry point. Streamable HTTP at `/mcp`, static assets at `/`.
 *
 * The MCP half is STATELESS: a fresh `McpServer` and transport per request, torn
 * down when the response closes. There is no per-session document state to keep
 * — the document lives in the reader's browser — so a session store would only
 * be a thing to lose.
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcp.js';
import { handleFetch } from './fetch-proxy.js';
import { handleLocalFile } from './local-files.js';
import { join } from 'node:path';
import { PUBLIC_DIR } from './paths.js';

const PORT = Number(process.env.PORT ?? 3000);

/**
 * The origin the widget's CSP allowlist names, and where it fetches its own
 * assets and `harfbuzz.wasm` from inside the sandboxed iframe.
 *
 * REQUIRED in production, and the server refuses to start without it rather
 * than defaulting: a localhost origin in a deployed CSP does not error, it
 * just quietly costs Word-faithful pagination — the worst kind of wrong.
 */
function resolvePublicOrigin(port: number): string {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'PUBLIC_ORIGIN is required in production. It is the one origin the widget CSP ' +
        'names; without it the sandboxed iframe cannot fetch the editor assets.'
    );
  }
  return `http://localhost:${port}`;
}

export function createApp(publicOrigin: string): express.Express {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // The widget runs in a sandboxed iframe with an opaque origin, so every asset
  // fetch it makes is cross-origin with `Origin: null`. A wildcard is the only
  // allowlist that matches it, and these are public static files.
  //
  // Immutable caching is scoped to `/assets` ONLY: everything in there carries
  // a content hash or the engine version in its NAME, which is what makes
  // "immutable" true. Anything served outside it (the dev harness, one day a
  // favicon) is mutable and must not be pinned for a year.
  app.use(
    '/assets',
    express.static(join(PUBLIC_DIR, 'assets'), {
      setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    })
  );
  app.use(
    '/',
    express.static(PUBLIC_DIR, {
      setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // The widget's only way to reach a document. See `fetch-proxy.ts` for why the
  // iframe cannot fetch it itself, and for the SSRF boundary this crosses.
  app.get('/fetch', handleFetch);

  // Tokened local files, stdio mode only. Tokens exist only after
  // open_document accepted a path, so the route serves nothing otherwise.
  app.get('/local/:token', handleLocalFile);

  app.all('/mcp', async (req, res) => {
    // Everything inside the try, `createMcpServer` included: it reads the widget
    // bundle off disk, so a missing build would otherwise reach Express's
    // default error handler, which answers a JSON-RPC client with an HTML stack
    // trace naming this machine's paths.
    let server: ReturnType<typeof createMcpServer> | undefined;
    let transport: StreamableHTTPServerTransport | undefined;
    try {
      server = createMcpServer({ publicOrigin });
      transport = new StreamableHTTPServerTransport({
        // Stateless: no session id, no session store, no resumability.
        sessionIdGenerator: undefined,
      });

      res.on('close', () => {
        void transport?.close();
        void server?.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[mcp] request failed', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: randomUUID(),
        });
      }
    }
  });

  return app;
}

// `node dist/server/server/index.js` starts the server; importing it does not.
// `pathToFileURL`, not a hand-built `file://` string: a path with a space or a
// non-ASCII character percent-encodes in import.meta.url, and the hand-built
// comparison then fails silently — `npm start` exits 0 having started nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicOrigin = resolvePublicOrigin(PORT);
  createApp(publicOrigin).listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`docx-editor MCP server on http://localhost:${PORT}/mcp`);
    // eslint-disable-next-line no-console
    console.log(`  public origin: ${publicOrigin}`);
  });
}
