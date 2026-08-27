/**
 * `bun run setup` — the path from a fresh clone to "installed in Claude".
 *
 * Prints ready-to-paste instructions with every path made absolute, because
 * Claude Desktop spawns servers with a minimal PATH and a relative command in
 * its config is the classic silent failure. `--write` merges the entry into
 * `claude_desktop_config.json` itself (after backing it up).
 */

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

// ---------------------------------------------------------------- prerequisites

const serverEntry = join(root, 'dist/server/server/stdio.js');
if (!existsSync(serverEntry) || !existsSync(join(root, 'dist/app/editor.html'))) {
  console.log('Building first (dist/ is missing)…\n');
  execSync('bun run build', { cwd: root, stdio: 'inherit' });
}

/**
 * The absolute node binary. `process.execPath` when this ran under node; under
 * bun, resolve node from the shell, because Claude Desktop's PATH may not have
 * either. dist/ is plain ESM, so node is all it needs.
 */
function nodeBinary() {
  if (process.versions.node && !process.versions.bun) return process.execPath;
  try {
    return execSync('which node', { encoding: 'utf8' }).trim();
  } catch {
    return 'node'; // last resort; the printed snippet stays editable
  }
}

const node = nodeBinary();
const entry = {
  command: node,
  args: [serverEntry],
};
const snippet = { mcpServers: { 'docx-editor': entry } };

const configPath =
  platform() === 'darwin'
    ? join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json')
    : platform() === 'win32'
      ? join(
          process.env.APPDATA ?? join(homedir(), 'AppData/Roaming'),
          'Claude/claude_desktop_config.json'
        )
      : join(homedir(), '.config/Claude/claude_desktop_config.json');

// ------------------------------------------------------------------------ write

if (write) {
  let config = {};
  if (existsSync(configPath)) {
    copyFileSync(configPath, `${configPath}.bak`);
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
      console.error(`Could not parse ${configPath}; fix it by hand (backup at .bak).`);
      process.exit(1);
    }
  } else {
    mkdirSync(dirname(configPath), { recursive: true });
  }
  config.mcpServers = { ...config.mcpServers, 'docx-editor': entry };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  console.log(`Wrote "docx-editor" into ${configPath}`);
  console.log(`(previous config backed up to ${configPath}.bak)`);
  console.log('\nRestart Claude Desktop, then ask Claude to open a .docx.');
  process.exit(0);
}

// ------------------------------------------------------------------------ print

console.log(`
docx-editor MCP App — setup
===========================

1) Claude Desktop (local — no deploy, no tunnel)

   Add this to ${configPath}
   (Claude Desktop → Settings → Developer → Edit Config), or run
   \`bun run setup --write\` to have it merged for you:

${JSON.stringify(snippet, null, 2).replace(/^/gm, '   ')}

   Restart Claude Desktop and ask Claude to open a .docx. Widget assets are
   served from http://localhost:3017 by the server itself — nothing leaves
   your machine.

2) claude.ai (web/mobile) and ChatGPT — needs a public HTTPS URL

   Local tunnel for a quick try:      bun run dev:tunnel
   Real deployment:                   see README → Deploy

   Claude:  Settings → Connectors → Add custom connector → paste
            https://<your-host>/mcp

   ChatGPT: Settings → Apps → Advanced → enable Developer mode
            (Pro/Plus/Business/Edu, web), then Apps → Create → paste
            https://<your-host>/mcp, auth: none. The app appears under
            Drafts; enable it and ask ChatGPT to open a .docx.

3) Poke at the protocol without a host:   bun run inspect
   Exercise the widget in a real host:    bun run build:harness, then open
                                          http://localhost:3000/__harness/host.html
`);
