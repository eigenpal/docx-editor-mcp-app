# Local directory submissions

Use these packages to submit DOCX Editor to the ChatGPT and Claude desktop directories.
Both packages run the MCP server and editor locally.
Use the product and policy URLs in [listing.md](listing.md) for both submissions.
Verify those pages before final review.
You do not deploy an editor or MCP endpoint.

See the [release guide](release.md) for editor updates and bug-fix releases.
Use [publication status](publication-status.md) for the current release checks and remaining work.
Use [license scopes](licensing.md) for the source, editor, and Pro license scopes.
Use [OpenAI approval request](openai-approval-request.md) when you contact your OpenAI representative.

Use [directory listing copy](listing.md) for listing copy and the support page draft.
Use [demonstration guide](demo.md) and `fixtures/` for the review demonstration.

## Build both packages

```bash
bun install --frozen-lockfile
bun run build:local
bun run smoke:packages
```

The build writes these files:

| Host    | Archive                                             | Extracted contents             |
| ------- | --------------------------------------------------- | ------------------------------ |
| ChatGPT | `dist/local-packages/docx-editor-chatgpt-1.0.0.zip` | `dist/local-packages/chatgpt/` |
| Claude  | `dist/local-packages/docx-editor-claude-1.0.0.mcpb` | `dist/local-packages/claude/`  |

The version comes from `package.json` and `.codex-plugin/plugin.json`.
Use `bun run release:version <major.minor.patch>` to update both versions.
Each archive has a `.sha256` checksum file beside it.
The archive root contains the host manifest, not an enclosing directory.

Both packages include the server, inline editor, matching WebAssembly file, icons, and license notices.
The server dependencies are bundled into `dist/cli.js`.
The packages contain no `node_modules`, repository files, local documents, or host credentials.
The ChatGPT package also includes the document preview skill.
Claude desktop extensions do not install that skill.

To rebuild one package after `bun run build`, use `bun run build:directory` or `bun run build:claude`.

## Verify the archives

`bun run smoke:packages` extracts both archives into temporary folders with spaces in their paths.
It starts each configured server from an unrelated working directory.
It checks these operations:

- List tools and expose only `open_document` to the model.
- Offer local paths through `open_document`.
- Read the inline editor and bundled WebAssembly through MCP.
- Open a local document and read its bytes through MCP.
- Save changed content through the version check and verify the saved bytes.
- Refuse a stale save without overwriting the document.
- Refuse a missing document and keep the connection open.
- Check archive checksums and exclude development files.

The test writes runtime details and archive hashes to `dist/local-packages/verification.json`.

Run the official Claude validator before submission:

```bash
npx --yes @anthropic-ai/mcpb@2.1.2 validate dist/local-packages/claude/manifest.json
npx --yes @anthropic-ai/mcpb@2.1.2 info dist/local-packages/docx-editor-claude-1.0.0.mcpb
```

The generated `.mcpb` is an unsigned ZIP bundle.
Directory review and signing are separate from package creation.
Do not treat schema validation as directory approval.

## Submit to ChatGPT

Follow OpenAI's [desktop-only submission instructions](https://developers.openai.com/plugins/deploy/desktop-only).
Local MCP submissions require an approved organization.
Ask your OpenAI representative to approve your organization before submission.
Complete publisher identity verification and confirm your submission permissions.

1. Record the desktop review cases in [review.json](review.json).
2. Publish the demo recording at an HTTPS URL.
3. Rebuild the packages with the recording URL:

   ```bash
   DEMO_URL=https://your-domain.example/demo.mp4 bun run build:local
   bun run smoke:packages
   ```

4. In the submission portal, select **Create plugin > Skills only > Upload ZIP**.
5. Upload `dist/local-packages/docx-editor-chatgpt-1.0.0.zip`.
6. Complete the remaining review requirements and submit for review.

The build includes review cases without a demo when you omit `DEMO_URL`.
It reports the missing recording instead of inventing a URL.
The package sets `requires_local_executor` and declares a stdio MCP server.
The host must provide Node.js 22 or later for the `node` launch command.
No shell launcher, global npm package, or local HTTP port is required.

OpenAI hosts support `view_docx_file` for their file viewer.
The model uses `open_document`; the host or widget uses the other tools.

## Submit to Claude

Follow Claude's [desktop extension instructions](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).
Use the desktop extension submission form linked from that page.
Submit the `.mcpb` package through that route, not the remote connector route.

The manifest uses the `node` server type and requires Node.js 22 or later.
Claude Desktop supplies the Node.js runtime.
The package supports macOS and Windows without a shell command.
Confirm both platforms through clean desktop installation tests before you claim release support.

For local review, open **Settings > Extensions > Advanced settings > Install Extension**.
Select `dist/local-packages/docx-editor-claude-1.0.0.mcpb`.
Use `open_document` with an absolute path.
Claude does not use the OpenAI file viewer entrypoint.

## Complete desktop review

Archive smoke tests verify the server protocol and bundled files.
They do not prove that either directory installs the package or renders the editor correctly.
Before submission, test a clean installation in each desktop host:

1. Confirm that installation needs no terminal, account, API key, or manually started server.
2. Open a local `.docx` by path and expand the preview.
3. Change the file with the agent's document tools and check the preview update.
4. Edit in the preview and verify the saved document.
5. Test comments, tracked changes, and simultaneous file edits.
6. For ChatGPT, test its file viewer entrypoint.
7. Test Windows and macOS launches with paths that contain spaces.
8. Record the results and demo without private documents or account details.

## Complete listing requirements

Use the published support, privacy, and terms pages under `https://www.docx-editor.dev/mcp-app`.
Keep the URLs in `.codex-plugin/plugin.json` synchronized with those pages.
The page drafts are [support.md](support.md), [privacy.md](privacy.md), and [terms.md](terms.md).
Each policy states its effective date.
Review `LICENSE-PLUGIN.md` for the bundled Eigenpal components.
The local packages carry that license and `THIRD_PARTY_NOTICES.md`.

The plugin does not send documents to Eigenpal servers.
The desktop host and model provider can process document data under their own policies.
Do not claim that local installation prevents all document transmission.

## Content security policy

The widget reads its editor assets and documents through MCP.
It does not fetch assets from an editor website.
The server declares no widget connect or resource domains.
The local process exposes no HTTP listener when the host starts it with `stdio`.

## Install link

The link `codex://plugins/install/docx-editor?marketplace=docx-editor` works
only after a user adds the `docx-editor` marketplace. It does not add an
unknown marketplace, so do not use it as a first-install button.
