/**
 * `bun run dev:tunnel` — a public HTTPS URL for the local server, so claude.ai
 * (web) and ChatGPT can reach it during development.
 *
 * Uses a Cloudflare quick tunnel (`cloudflared`, no account needed). The
 * tunnel URL is only known once cloudflared starts, and the widget's CSP must
 * name it, so the order is: tunnel first, then the server with PUBLIC_ORIGIN
 * set to what the tunnel answered.
 */

import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3000);

const probe = spawn('cloudflared', ['--version'], { stdio: 'ignore' });
probe.on('error', () => {
  console.error(
    'cloudflared is not installed. It provides free, account-less tunnels:\n' +
      '  macOS:  brew install cloudflared\n' +
      '  other:  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n' +
      '\nAny tunnel works — with ngrok, run `ngrok http ' +
      PORT +
      '` and start the server yourself with PUBLIC_ORIGIN=<the https URL> bun run start'
  );
  process.exit(1);
});

probe.on('exit', (code) => {
  if (code !== 0) return; // the error handler already spoke
  const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let server;
  let found = false;
  const watch = (chunk) => {
    const text = chunk.toString();
    process.stderr.write(text);
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !found) {
      found = true;
      const origin = match[0];
      console.error(`\n─────────────────────────────────────────────────────`);
      console.error(`  Public URL:   ${origin}`);
      console.error(`  MCP endpoint: ${origin}/mcp   ← paste this into the host`);
      console.error(`─────────────────────────────────────────────────────\n`);
      server = spawn('bun', ['run', 'dev'], {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, PUBLIC_ORIGIN: origin },
      });
    }
  };
  tunnel.stdout.on('data', watch);
  tunnel.stderr.on('data', watch);

  const stop = () => {
    server?.kill();
    tunnel.kill();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  tunnel.on('exit', stop);
});
