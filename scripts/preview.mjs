/**
 * `bun run preview <file.docx>` — open a local file in the editor, in the
 * browser. For environments without an MCP Apps surface, such as a terminal.
 *
 * Reuses a running server on PORT when one answers /health; otherwise starts
 * one detached. The file is copied into public/preview-files/ (gitignored),
 * which the server already serves.
 */

import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3000);
const file = process.argv[2];

if (!file || !/\.docx$/i.test(file)) {
  console.error('Usage: bun run preview <file.docx>');
  process.exit(1);
}
const source = resolve(file);
if (!existsSync(source)) {
  console.error(`${source} does not exist`);
  process.exit(1);
}

if (!existsSync(join(root, 'dist/app/editor.html'))) {
  const { execSync } = await import('node:child_process');
  execSync('bun run build', { cwd: root, stdio: 'inherit' });
}

const dir = join(root, 'public/preview-files');
mkdirSync(dir, { recursive: true });
const name = basename(source);
copyFileSync(source, join(dir, name));

const healthy = await fetch(`http://localhost:${PORT}/health`).then(
  (r) => r.ok,
  () => false
);
if (!healthy) {
  const server = spawn('node', [join(root, 'dist/server/server/index.js')], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
  });
  server.unref();
  for (let i = 0; i < 40; i++) {
    if (
      await fetch(`http://localhost:${PORT}/health`).then(
        (r) => r.ok,
        () => false
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
}

const url = `http://localhost:${PORT}/preview.html?src=/preview-files/${encodeURIComponent(name)}`;
console.log(url);
const opener =
  process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
