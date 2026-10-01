/**
 * The package's command-line entry, bundled by `scripts/build-cli.mjs` into
 * `dist/cli.js` with every dependency inlined, so `npx` starts it without an
 * install step and a Codex plugin copy needs no `node_modules`.
 *
 * In stdio mode, stdout is the protocol channel: everything a person reads
 * goes to stderr.
 */

import { realpathSync } from 'node:fs';
import { PACKAGE_VERSION } from './paths.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MAX_MESSAGE_BYTES } from '../shared/limits.js';
import { startHttp } from './http.js';
import { createMcpServer } from './mcp.js';
import { say, setupClaude, setupCodex } from './setup.js';

const USAGE = `Usage: docx-editor-mcp-app [command]

Commands:
  stdio            Run the MCP server over stdio (default). For desktop hosts.
  http [--port N]  Serve MCP at http://localhost:N/mcp (default 3000).
  setup codex      Install the plugin into ChatGPT and Codex desktop.
  setup claude     Add the server to Claude Desktop.
  --version        Print the version.
  --help           Print this help.`;

async function main(argv: string[]): Promise<void> {
  const [command = 'stdio', ...rest] = argv;
  switch (command) {
    case 'stdio':
      // Desktop hosts start the server this way. Local mode: paths and file sync.
      return createMcpServer({ local: true }).connect(
        new StdioServerTransport(undefined, undefined, { maxBufferSize: MAX_MESSAGE_BYTES })
      );
    case 'http': {
      const flag = rest.indexOf('--port');
      const port = flag === -1 ? Number(process.env.PORT ?? 3000) : Number(rest[flag + 1]);
      if (!Number.isInteger(port) || port <= 0) return exit('--port needs a port number.');
      return startHttp(port);
    }
    case 'setup':
      if (rest[0] === 'codex') return setupCodex();
      if (rest[0] === 'claude') return setupClaude(realpathSync(process.argv[1]!));
      return exit('Name a host: setup codex, or setup claude.');
    case '--version':
    case '-v':
      say(PACKAGE_VERSION);
      return;
    case '--help':
    case '-h':
      say(USAGE);
      return;
    default:
      return exit(`Unknown command: ${command}\n\n${USAGE}`);
  }
}

function exit(message: string): never {
  console.error(message);
  process.exit(1);
}

await main(process.argv.slice(2));
