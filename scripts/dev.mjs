/**
 * Development loop: rebuild the widget on change, restart the server with it.
 *
 * The server reads `dist/app/editor.html` once, so a widget rebuild restarts
 * it. `DOCX_HARNESS=1` serves the dev harness at `/__harness/`.
 */

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, NODE_ENV: 'development', DOCX_HARNESS: '1' };

let server;
let building = false;
let queued = false;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} failed`))));
  });
}

function restartServer() {
  server?.kill();
  server = spawn('bun', ['src/server/cli.ts', 'http'], { cwd: root, stdio: 'inherit', env });
}

async function rebuild() {
  if (building) {
    queued = true;
    return;
  }
  building = true;
  try {
    await run(process.execPath, [join(root, 'scripts/build-app.mjs')]);
    restartServer();
  } catch (error) {
    console.error(error.message);
  } finally {
    building = false;
    if (queued) {
      queued = false;
      void rebuild();
    }
  }
}

await rebuild();

watch(join(root, 'src'), { recursive: true }, (_event, file) => {
  if (!file) return;
  if (file.startsWith('server')) {
    restartServer();
    return;
  }
  void rebuild();
});

process.on('SIGINT', () => {
  server?.kill();
  process.exit(0);
});
