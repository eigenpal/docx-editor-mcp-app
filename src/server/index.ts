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
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcp.js';
import { handleFetch } from './fetch-proxy.js';
import { PUBLIC_DIR } from './paths.js';

const PORT = Number(process.env.PORT ?? 3000);

/**
 * The origin the widget's CSP allowlist names, so it can fetch `harfbuzz.wasm`
 * back off this server from inside a sandboxed iframe. Set it in production;
 * getting it wrong costs Word-faithful pagination, silently.
 */
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN ?? `http://localhost:${PORT}`;

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // The widget runs in a sandboxed iframe with an opaque origin, so every asset
  // fetch it makes is cross-origin with `Origin: null`. A wildcard is the only
  // allowlist that matches it, and these are public static files.
  app.use(
    '/',
    express.static(PUBLIC_DIR, {
      setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    })
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // The widget's only way to reach a document. See `fetch-proxy.ts` for why the
  // iframe cannot fetch it itself, and for the SSRF boundary this crosses.
  app.get('/fetch', handleFetch);

  app.all('/mcp', async (req, res) => {
    // Everything inside the try, `createMcpServer` included: it reads the widget
    // bundle off disk, so a missing build would otherwise reach Express's
    // default error handler, which answers a JSON-RPC client with an HTML stack
    // trace naming this machine's paths.
    let server: ReturnType<typeof createMcpServer> | undefined;
    let transport: StreamableHTTPServerTransport | undefined;
    try {
      server = createMcpServer({ publicOrigin: PUBLIC_ORIGIN });
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
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  createApp().listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`docx-editor MCP server on http://localhost:${PORT}/mcp`);
    // eslint-disable-next-line no-console
    console.log(`  public origin: ${PUBLIC_ORIGIN}`);
  });
}
