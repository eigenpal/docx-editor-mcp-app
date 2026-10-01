# docx-editor MCP App

<p align="center">
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP_Apps-SEP--1865-3B5BDB?style=flat-square" alt="MCP Apps" /></a>
  <a href="https://github.com/eigenpal/docx-editor-mcp-app/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-blue.svg?style=flat-square&color=3B5BDB" alt="Apache 2.0 license" /></a>
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

## Install

Install the npm package, then add it to each desktop app you use. The package
needs Node.js 22 or later and installs no dependencies.

```bash
npm install -g @docx-editor.dev/mcp-app
docx-editor-mcp-app setup codex    # ChatGPT and Codex desktop (macOS, Linux)
docx-editor-mcp-app setup claude   # Claude Desktop
```

Restart the desktop app after setup. Then ask the agent to open a `.docx`, or
open one yourself in ChatGPT or Codex desktop.

To remove the plugin from ChatGPT and Codex, run
`codex plugin remove docx-editor@docx-editor`.

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

## Deploy for web hosts

Web hosts, and OpenAI's plugin directory, need a public HTTPS URL. Run the
server on any Node.js 22 host behind HTTPS:

```bash
npx -y @docx-editor.dev/mcp-app http --port "$PORT"
```

The server keeps no state, so you can run any number of instances. To submit
to the plugin directory, see [docs/submission](docs/submission/README.md).

- **Claude:** **Settings > Connectors > Add custom connector**, then enter
  `https://<your-host>/mcp`.
- **ChatGPT:** **Settings > Apps > Advanced**, enable **Developer mode**, then
  create an app with `https://<your-host>/mcp` and no authentication.

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

The source code in this repository uses the [Apache 2.0 license](LICENSE).

The built plugin bundles EigenPal components, including `@docx-editor.dev/pro`.
You can use them free of charge, including for business use, only as part of
this plugin: see [LICENSE-PLUGIN.md](LICENSE-PLUGIN.md). To build with the
docx-editor SDK in your own software, see
[pricing](https://www.docx-editor.dev/pricing). `THIRD_PARTY_NOTICES.md` in the
package lists every bundled package and its license.

For commercial support, email [docx-editor@eigenpal.com](mailto:docx-editor@eigenpal.com).
