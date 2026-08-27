/**
 * Development loop: rebuild the widget on change, restart the server with it.
 *
 * The server reads `dist/app/editor.html` once and caches it by origin, so a
 * widget rebuild has to restart the server to be seen. That is cheap — the
 * server holds no state — and it is one fewer cache to be wrong about.
 */

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, NODE_ENV: 'development' };

let server;
let building = false;
let queued = false;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} failed`))));
  });
}

async function rebuild() {
  if (building) {
    queued = true;
    return;
  }
  building = true;
  try {
    await run(process.execPath, [join(root, 'scripts/build-app.mjs')]);
    server?.kill();
    server = spawn('bun', ['src/server/index.ts'], { cwd: root, stdio: 'inherit', env });
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
  if (!file || file.startsWith('server')) return;
  void rebuild();
});

watch(join(root, 'src/server'), { recursive: true }, () => {
  server?.kill();
  server = spawn('bun', ['src/server/index.ts'], { cwd: root, stdio: 'inherit', env });
});

process.on('SIGINT', () => {
  server?.kill();
  process.exit(0);
});
