# docx-editor MCP App

<p align="center">
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP_Apps-SEP--1865-3B5BDB?style=flat-square" alt="MCP Apps" /></a>
  <a href="https://github.com/eigenpal/docx-editor-mcp-app/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square&color=3B5BDB" alt="Apache-2.0 source license" /></a>
  <a href="https://www.docx-editor.dev/docs"><img src="https://img.shields.io/badge/Docs-3B5BDB?style=flat-square&logo=readthedocs&logoColor=white" alt="docx-editor.dev documentation" /></a>
</p>

A Word-faithful `.docx` preview for ChatGPT, Codex, and Claude.

The agent edits documents with its own document skills. docx-editor shows the
file with Word-faithful pages and follows it: each time the file changes, the
preview updates in place and highlights the changed paragraphs. You can also
edit in the preview, and your edits save back to the file.

## How it works

The app has one model-facing tool, `open_document`. It has no editing tools.

- **Local mode** runs on your computer, started by the desktop app. The
  preview opens files by path, watches them, and saves your edits to them.
- **File viewer** in ChatGPT and Codex desktop: open any `.docx` and it opens
  in the side panel, with the same live updates.
- **Hosted mode** serves the app over HTTPS for web hosts. It previews files
  passed as bytes.

The [docx-editor.dev](https://docx-editor.dev/) engine parses, lays out, and
saves the document in the browser. When the file changes, the preview applies
the new version through the engine's refresh API: your scroll position and
edits are handled, and the changed paragraphs are highlighted.

## Install and receive updates

Use the approved desktop directory listing for ChatGPT, Codex, or Claude when available.
Select **Install** in your host.
OpenAI requires partner approval for local MCP listings.
Claude requires desktop extension review.
The source repository does not create an approved public listing.

For installation before directory approval, use the packages on the
[stable release page](https://github.com/eigenpal/docx-editor-mcp-app/releases/latest).
Claude uses the `.mcpb` package.
Codex supports the built Git marketplace on the `stable` branch.
The ChatGPT ZIP is the public local-directory submission package.
See [installation and updates](docs/releases.md) for exact steps and verified host differences.

Claude directory extensions update automatically by default.
For other installations, the preview shows **Get update** when a newer stable release is available.
The local server checks GitHub release metadata without sending documents or file paths.
It caches each result for 24 hours while it runs.
Set `DOCX_EDITOR_UPDATE_CHECK=0` to disable checks.
An update never replaces your running editor or its unsaved document.

### Developer installation

Use Node.js 22 or later for the npm fallback:

```bash
npm install -g @docx-editor.dev/mcp-app
docx-editor-mcp-app setup codex
docx-editor-mcp-app setup claude
```

Restart the desktop app after setup.
This developer route is separate from directory installation.

## Use it

1. Ask the agent to show a file, for example: "Open ~/report.docx."
2. Expand the preview to see the full editor.
3. Ask for changes, for example: "Shorten the executive summary." The agent
   edits the file with its own tools, and the preview updates.

If you edit in the preview while the agent changes the file, the preview asks
you to reload the file or keep your version.

Other commands:

- `docx-editor-mcp-app stdio` runs the server over stdio. Hosts start it this way.
- `docx-editor-mcp-app http --port 3000` serves MCP at `http://localhost:3000/mcp`.

## Build local directory packages

Prepare the ChatGPT plugin ZIP and Claude desktop extension from the same local build:

```bash
bun run build:local
bun run smoke:packages
```

The archives appear in `dist/local-packages/`.
Both include the server, editor assets, WebAssembly file, and license notices.
The host starts the server over stdio.
You do not host the editor or run a public endpoint.

See [docs/submission](docs/submission/README.md) for installation tests and directory submission requirements.
OpenAI requires approval for local MCP submissions.
Claude reviews desktop extensions through its extension submission process.

You can still use `http` for a separate deployment that needs a remote MCP endpoint.
The local directory packages do not use that mode.

## Develop

```bash
bun install
bun run dev                 # HTTP server at http://localhost:3000/mcp
bun run build:harness       # then open /__harness/host.html
```

The harness is a real MCP Apps host. It emulates the OpenAI file viewer, so
you can test live updates and conflicts without a desktop app.

Before you push, run:

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and
[SECURITY.md](SECURITY.md) to report a vulnerability.

## Troubleshoot

- **The preview stays on its loading skeleton.** Reinstall with `setup codex`
  or `setup claude`, then quit and reopen the desktop app.
- **The plugin is missing in ChatGPT.** Run `codex plugin list` and check for
  `docx-editor@docx-editor`. Then quit ChatGPT fully and open it again.
- **Pagination differs from Word.** Check that the preview loaded `harfbuzz.wasm`.
- **A file does not open.** `open_document` takes `.docx` files up to 15 MB.

## License

The MCP app source uses [Apache-2.0](LICENSE).
This license excludes proprietary Pro components, including Pro code inside combined bundles.

The proprietary bundled Pro components have additional host permission in [LICENSE-PLUGIN.md](LICENSE-PLUGIN.md).
You may use the official plugin free in ChatGPT, Codex, and Claude, including for business documents.
You need no separate Pro subscription for this use.
You may not reuse those Pro components in another product without a separate EigenPal Pro License.
Your documents remain yours.
Open-source editor components retain their Apache 2.0 terms.
You may embed those components in commercial products under their own licenses.
The complete bundled plugin does not use a single open-source license.
The built package lists dependency terms in `THIRD_PARTY_NOTICES.md`.

For commercial support, email [docx-editor@eigenpal.com](mailto:docx-editor@eigenpal.com).
