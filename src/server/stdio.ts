/**
 * Stdio entry point — the zero-deploy path into Claude Desktop.
 *
 * Claude Desktop launches local MCP servers over stdio from
 * `claude_desktop_config.json`, and renders their MCP Apps like any remote
 * connector's. The one thing stdio cannot carry is the widget's STATIC side —
 * the hashed JS/CSS, `harfbuzz.wasm`, and the `/fetch` document proxy — so this
 * entry runs the same express app on a local port purely for those, and names
 * `http://localhost:<port>` in the widget's CSP. The iframe renders on the
 * developer's own machine, where localhost is reachable; nothing is exposed
 * beyond it.
 *
 * Protocol discipline: stdout IS the JSON-RPC channel. Anything a human should
 * read goes to stderr, and nothing here may ever `console.log`.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp.js';
import { createApp } from './index.js';

// 3017, not 3000: `bun run dev` owns 3000, and a developer will have both
// running — the desktop app in one window, the dev loop in another.
const PORT = Number(process.env.PORT ?? 3017);
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN ?? `http://localhost:${PORT}`;

const app = createApp(PUBLIC_ORIGIN);
const listener = app.listen(PORT, () => {
  console.error(`[docx-editor] assets on ${PUBLIC_ORIGIN} (stdio mode)`);
});
listener.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    // Another instance (or another app) holds the port. The MCP side still
    // works over stdio; the widget will fail to load its assets, so say so
    // rather than dying — a second Claude Desktop window hits this path.
    console.error(
      `[docx-editor] port ${PORT} is taken; assuming another instance already serves the assets`
    );
    return;
  }
  throw error;
});

const server = createMcpServer({ publicOrigin: PUBLIC_ORIGIN });
await server.connect(new StdioServerTransport());
console.error('[docx-editor] MCP server connected over stdio');
