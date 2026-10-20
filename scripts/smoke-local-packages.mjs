/** Test extracted archives from an unrelated directory, without the repository or node_modules. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const artifacts = join(root, 'dist/local-packages');
const temp = await mkdtemp(join(tmpdir(), 'docx local packages '));
const docx = zipSync({
  '[Content_Types].xml': strToU8(
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  ),
  'word/document.xml': strToU8(
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Local package test</w:t></w:r></w:p></w:body></w:document>'
  ),
});
const required = [
  'dist/cli.js',
  'dist/app/editor.html',
  'dist/app/editor.hash',
  'dist/app/build.json',
  'dist/app/harfbuzz.wasm',
  'assets/icon.svg',
  'assets/icon-dark.svg',
  'LICENSE',
  'LICENSE-PLUGIN.md',
  'THIRD_PARTY_NOTICES.md',
  'package.json',
];
const changed = zipSync({
  ...unzipSync(docx),
  'word/document.xml': strToU8(
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Saved local edit</w:t></w:r></w:p></w:body></w:document>'
  ),
});
const verified = [];
try {
  for (const host of ['chatgpt', 'claude']) {
    const name = `docx-editor-${host}-${pkg.version}.${host === 'chatgpt' ? 'zip' : 'mcpb'}`;
    const archive = await readFile(join(artifacts, name));
    const checksum = await readFile(join(artifacts, `${name}.sha256`), 'utf8');
    assert.equal(checksum.split(' ')[0], createHash('sha256').update(archive).digest('hex'));
    const files = unzipSync(archive);
    for (const path of required) assert.ok(files[path]?.length, `${host}: missing ${path}`);
    const stage = join(temp, `${host} extracted`);
    for (const [path, bytes] of Object.entries(files)) {
      assert.ok(
        !path.startsWith('/') && !path.split('/').includes('..'),
        `Unsafe archive path: ${path}`
      );
      assert.ok(
        !/(^|\/)(node_modules|src|samples|\.git|\.env)(\/|$)/.test(path),
        `Development file: ${path}`
      );
      assert.ok(!path.endsWith('.docx'), `Local document in archive: ${path}`);
      await mkdir(dirname(join(stage, path)), { recursive: true });
      await writeFile(join(stage, path), bytes);
    }
    const meta = JSON.parse(Buffer.from(files['package.json']).toString());
    assert.equal(meta.version, pkg.version);
    const built = JSON.parse(Buffer.from(files['dist/app/build.json']).toString());
    assert.equal(built.version, pkg.version);
    for (const [name, version] of Object.entries(built.engine)) {
      assert.equal(version, pkg.devDependencies[`@docx-editor.dev/${name}`]);
    }
    assert.equal(meta.type, 'module');
    assert.equal(meta.dependencies, undefined);
    let config;
    let placeholder;
    if (host === 'chatgpt') {
      const manifest = JSON.parse(Buffer.from(files['plugin.json']).toString());
      assert.equal(manifest.version, pkg.version);
      assert.equal(manifest.extensions['com.openai'].requires_local_executor, true);
      assert.ok(files['skills/docx-editor/SKILL.md']);
      config = JSON.parse(Buffer.from(files['mcp.json']).toString()).mcpServers['docx-editor'];
      assert.equal(config.type, 'stdio');
      assert.equal(config.url, undefined);
      placeholder = '${PLUGIN_ROOT}';
    } else {
      const manifest = JSON.parse(Buffer.from(files['manifest.json']).toString());
      assert.equal(manifest.version, pkg.version);
      assert.equal(manifest.server.type, 'node');
      assert.equal(manifest.server.entry_point, 'dist/cli.js');
      assert.equal(manifest.user_config, undefined);
      config = manifest.server.mcp_config;
      placeholder = '${__dirname}';
    }
    assert.equal(config.command, 'node');
    const args = config.args.map((arg) => arg.replaceAll(placeholder, stage));
    assert.equal(resolve(args[0]), join(stage, 'dist/cli.js'));
    assert.equal(args[1], 'stdio');
    const client = new Client({ name: 'local-package-smoke', version: '1' });
    try {
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args,
          cwd: temp,
          env: { PATH: dirname(process.execPath) },
          stderr: 'inherit',
        })
      );
      assert.equal(client.getServerVersion().version, pkg.version);
      const { tools } = await client.listTools();
      const visible = tools.filter(
        (tool) => !tool._meta?.ui?.visibility?.every((mode) => mode === 'app')
      );
      assert.deepEqual(
        visible.map((tool) => tool.name),
        ['open_document']
      );
      assert.ok(visible[0].inputSchema.properties.path, 'Local paths must be enabled.');
      const widget = await client.readResource({ uri: visible[0]._meta.ui.resourceUri });
      assert.ok(widget.contents[0].text.length > 1_000_000);
      assert.ok(!/<(script|link)[^>]+(src|href)=/.test(widget.contents[0].text));
      const wasm = await client.readResource({ uri: 'docx-asset://harfbuzz.wasm' });
      assert.deepEqual(
        Buffer.from(wasm.contents[0].blob, 'base64'),
        Buffer.from(files['dist/app/harfbuzz.wasm'])
      );
      const path = join(temp, `${host} sample.docx`);
      await writeFile(path, docx);
      const opened = await client.callTool({ name: 'open_document', arguments: { path } });
      assert.ok(!opened.isError, JSON.stringify(opened));
      const uri = opened.structuredContent.resourceUri;
      assert.ok(uri.startsWith('docx-local://'));
      const content = await client.readResource({ uri });
      assert.deepEqual(Buffer.from(content.contents[0].blob, 'base64'), Buffer.from(docx));
      const version = await client.callTool({
        name: 'local_file_version',
        arguments: { token: uri.split('//')[1] },
      });
      const saved = await client.callTool({
        name: 'write_local_file',
        arguments: {
          token: uri.split('//')[1],
          blob: Buffer.from(changed).toString('base64'),
          ifMatch: version.structuredContent.etag,
        },
      });
      assert.equal(saved.structuredContent.outcome, 'saved');
      assert.deepEqual(await readFile(path), Buffer.from(changed));
      const stale = await client.callTool({
        name: 'write_local_file',
        arguments: {
          token: uri.split('//')[1],
          blob: Buffer.from(docx).toString('base64'),
          ifMatch: version.structuredContent.etag,
        },
      });
      assert.equal(stale.structuredContent.outcome, 'conflict');
      assert.deepEqual(await readFile(path), Buffer.from(changed));
      const rejected = await client.callTool({
        name: 'open_document',
        arguments: { path: join(temp, 'missing.docx') },
      });
      assert.equal(rejected.isError, true);
      await client.listTools();
    } finally {
      await client.close();
    }
    verified.push({
      host,
      archive: name,
      version: pkg.version,
      engine: built.engine,
      sha256: checksum.split(' ')[0],
      result: 'passed',
    });
    console.log(`smoke-local-packages: ${host} ok`);
  }
  await writeFile(
    join(artifacts, 'verification.json'),
    `${JSON.stringify(
      {
        node: process.version,
        platform: process.platform,
        checked_at: new Date().toISOString(),
        packages: verified,
      },
      null,
      2
    )}\n`
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
