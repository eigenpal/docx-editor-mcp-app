/**
 * Builds the package for OpenAI's plugin directory into `dist/directory-plugin/`.
 *
 * The directory accepts only a hosted MCP server, so this package points at
 * your HTTPS deployment instead of starting the server locally:
 *
 *   MCP_URL=https://mcp.example.com/mcp DEMO_URL=https://... bun run build:directory
 *
 * Review requires the demo recording. Pass `--draft` to build without it.
 *
 * The review block (five positive and three negative test cases) comes from
 * `docs/submission/review.json`; DEMO_URL adds the demo recording.
 *
 * It uses the portable layout (root `plugin.json` with the OpenAI overlay,
 * root `mcp.json`); the local npm plugin keeps the `.codex-plugin` layout
 * that desktop Codex reads today. Both share one listing, from
 * `.codex-plugin/plugin.json`.
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist/directory-plugin');
const url = process.env.MCP_URL;
if (!url?.startsWith('https://') || !url.endsWith('/mcp')) {
  console.error('Set MCP_URL to your deployment, for example https://mcp.example.com/mcp');
  process.exit(1);
}

const review = JSON.parse(await readFile(join(root, 'docs/submission/review.json'), 'utf8'));
if (review.positive.length !== 5 || review.negative.length !== 3) {
  console.error(
    'docs/submission/review.json needs exactly five positive and three negative cases.'
  );
  process.exit(1);
}
const demo = process.env.DEMO_URL;
if (demo ? !demo.startsWith('https://') : !process.argv.includes('--draft')) {
  console.error('Set DEMO_URL to the https URL of the demo recording, or pass --draft.');
  process.exit(1);
}
const legacy = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
const { skills: _skills, mcpServers: _mcp, interface: listing, ...portable } = legacy;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await writeFile(
  join(out, 'plugin.json'),
  json({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    ...portable,
    // This package carries no EigenPal engine code: only the manifest, skill and icons.
    license: 'Apache-2.0',
    extensions: {
      'com.openai': {
        interface: listing,
        review: { test_cases: review, ...(demo && { demo_recording_url: demo }) },
      },
    },
  })
);
await writeFile(
  join(out, 'mcp.json'),
  json({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: { 'docx-editor': { type: 'streamable-http', url } },
  })
);
await cp(join(root, 'skills'), join(out, 'skills'), { recursive: true });
await cp(join(root, 'LICENSE'), join(out, 'LICENSE'));
await mkdir(join(out, 'assets'));
for (const file of ['icon.png', 'logo.png', 'logo-dark.png']) {
  await cp(join(root, 'assets', file), join(out, 'assets', file));
}
console.log(`built ${out} for ${url}`);
