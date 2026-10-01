/**
 * HTTP entry: Streamable HTTP at `/mcp`, for hosts that connect over the
 * network (ChatGPT and Claude on the web, behind a public HTTPS URL).
 *
 * Stateless: a fresh server and transport per request, and no document state
 * (bytes travel in tool results), so any number of instances can run.
 * `OPENAI_APPS_CHALLENGE` answers OpenAI's domain verification.
 * In development (`DOCX_HARNESS=1`), `/__harness/` serves the harness.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { MAX_MESSAGE_BYTES } from '../shared/limits.js';
import { createMcpServer } from './mcp.js';
import { REPO_ROOT } from './paths.js';

const HARNESS = join(REPO_ROOT, 'public/__harness');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript' };

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}
const rpcError = (code: number, message: string) => ({
  jsonrpc: '2.0',
  error: { code, message },
  id: null,
});

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_MESSAGE_BYTES) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
  } catch {
    throw Object.assign(new Error('parse'), { status: 400 });
  }
}

async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Stateless: no session to stream on (GET) or close (DELETE).
  if (req.method !== 'POST') return json(res, 405, rpcError(-32000, 'Method not allowed'));
  let body: unknown;
  try {
    body = await readBody(req);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 400;
    return json(
      res,
      status,
      status === 413
        ? rpcError(-32600, `The request is larger than ${MAX_MESSAGE_BYTES} bytes.`)
        : rpcError(-32700, 'Parse error')
    );
  }
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    console.error('[mcp] request failed', error);
    if (!res.headersSent) json(res, 500, rpcError(-32603, 'Internal server error'));
  }
}

/** Dev only (`DOCX_HARNESS=1`, set by scripts/dev.mjs): the harness page and the widget it hosts. */
async function handleHarness(path: string, res: ServerResponse): Promise<void> {
  const file = normalize(join(HARNESS, path.slice('/__harness/'.length) || 'host.html'));
  if (!file.startsWith(HARNESS)) return json(res, 404, { error: 'not found' });
  const body = await readFile(file).catch(() => null);
  if (!body) return json(res, 404, { error: 'not found' });
  res
    .writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    .end(body);
}

export function startHttp(port: number): void {
  createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/mcp') return void handleMcp(req, res);
    if (path === '/health') return json(res, 200, { ok: true });
    // The plugin directory's domain check: the token, exactly, as plain text.
    if (path === '/.well-known/openai-apps-challenge' && process.env.OPENAI_APPS_CHALLENGE) {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end(process.env.OPENAI_APPS_CHALLENGE);
      return;
    }
    if (process.env.DOCX_HARNESS === '1' && path.startsWith('/__harness/')) {
      return void handleHarness(path, res);
    }
    json(res, 404, { error: 'not found' });
  }).listen(port, () => console.error(`docx-editor MCP server on http://localhost:${port}/mcp`));
}
