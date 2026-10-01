/**
 * `docx-editor-mcp-app setup <host>`: install this package into a desktop host.
 *
 *   codex   ChatGPT and Codex desktop share one plugin runtime. The package
 *           root is a plugin marketplace (`.agents/plugins/marketplace.json`),
 *           so the Codex CLI adds it and installs the plugin. Codex copies the
 *           plugin into its own cache, so an `npx` cache cleanup cannot break it.
 *   claude  Claude Desktop reads `claude_desktop_config.json`. The entry runs
 *           this file's CLI with absolute paths, because Claude Desktop starts
 *           servers with a minimal PATH.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from './paths.js';

const MARKETPLACE = 'docx-editor';
const PLUGIN = `docx-editor@${MARKETPLACE}`;

export function setupCodex(): void {
  // The plugin starts the server through /bin/sh (.mcp.json).
  if (platform() === 'win32') fail('Codex setup supports macOS and Linux.');
  const codex = (...args: string[]) =>
    execFileSync('codex', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    codex('--version');
  } catch {
    fail(
      'The Codex CLI is not on PATH. Install it, or run `codex` once from the ChatGPT desktop app.'
    );
  }
  // Re-adding refreshes the snapshot after an upgrade; remove first so an older
  // copy of this marketplace cannot shadow the new one.
  try {
    codex('plugin', 'marketplace', 'remove', MARKETPLACE);
  } catch {
    // Not added yet.
  }
  codex('plugin', 'marketplace', 'add', REPO_ROOT);
  codex('plugin', 'add', PLUGIN);
  say(`Installed ${PLUGIN} from ${REPO_ROOT}.`);
  say('Restart ChatGPT or Codex desktop, then open a .docx file.');
  say(`To remove it: codex plugin remove ${PLUGIN}`);
}

export function setupClaude(cliPath: string): void {
  if (cliPath.includes(`${'/'}_npx${'/'}`)) {
    console.warn(
      'Warning: this copy runs from the npx cache, which npm can delete.\n' +
        'Install the package globally first: npm install -g <package>'
    );
  }
  const entry = { command: process.execPath, args: [cliPath, 'stdio'] };
  const configPath = claudeConfigPath();
  let config: { mcpServers?: Record<string, unknown> } = {};
  if (existsSync(configPath)) {
    copyFileSync(configPath, `${configPath}.bak`);
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8')) as typeof config;
    } catch {
      fail(`Could not parse ${configPath}. Fix it by hand; a backup is at .bak.`);
    }
  } else {
    mkdirSync(dirname(configPath), { recursive: true });
  }
  config.mcpServers = { ...config.mcpServers, 'docx-editor': entry };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  say(`Added "docx-editor" to ${configPath} (backup at .bak).`);
  say('Restart Claude Desktop, then ask Claude to open a .docx file.');
}

function claudeConfigPath(): string {
  if (platform() === 'darwin') {
    return join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json');
  }
  if (platform() === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData/Roaming');
    return join(appData, 'Claude/claude_desktop_config.json');
  }
  return join(homedir(), '.config/Claude/claude_desktop_config.json');
}

/**
 * Setup output goes to stdout on purpose: these commands never run in stdio
 * mode, where stdout is the protocol channel and `console.log` is banned.
 */
export function say(message: string): void {
  process.stdout.write(`${message}\n`);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
