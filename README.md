# docx-editor MCP App

<p align="center">
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP_Apps-SEP--1865-3B5BDB?style=flat-square" alt="MCP Apps" /></a>
  <a href="https://github.com/eigenpal/docx-editor-mcp-app/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-blue.svg?style=flat-square&color=3B5BDB" alt="Apache 2.0 license" /></a>
  <a href="https://www.docx-editor.dev/docs"><img src="https://img.shields.io/badge/Docs-3B5BDB?style=flat-square&logo=readthedocs&logoColor=white" alt="docx-editor.dev documentation" /></a>
</p>

Open and edit `.docx` files inside Claude or ChatGPT.

The model can read text, suggest tracked changes, and respond to comments.
You review each change in the [docx-editor.dev](https://docx-editor.dev/) editor.

## How it works

The MCP server provides `open_document` and the editor widget.
The server keeps no document state.

`@docx-editor.dev/core` parses, lays out, displays, and saves OOXML in the browser.
The server proxies the initial document download because the widget runs in a sandbox.
All later document operations run in the browser.

```text
Claude or ChatGPT
        |
        | open_document
        v
MCP server ------> editor widget
        |               |
        | /fetch        | read, edit, review, export
        v               v
document URL       browser editor
```

The widget provides these tools:

- `read_document` returns document paragraphs and their IDs.
- `find_text` finds text and its paragraph ID.
- `edit_text` replaces exact text. It creates a tracked change by default.
- `add_comment` adds a Word comment to exact text.
- `read_comments` lists comments, authors, and states.
- `reply_comment` replies to a comment thread.
- `resolve_comment` resolves a completed comment thread.
- `read_changes` lists pending tracked changes and authors.
- `export_document` downloads the edited `.docx` file.

The server provides `open_document`.
The catalog in [`src/shared/catalog.ts`](src/shared/catalog.ts) defines the complete tool allowlist.

## Requirements

- [Bun](https://bun.sh/)
- Node.js 22 or later

## Install for Claude Desktop

Claude Desktop runs the server locally over stdio.

```bash
bun install
bun run setup --write
```

Restart Claude Desktop.
Then ask Claude to open a `.docx` file.

The server hosts widget assets at `http://localhost:3017`.
The document stays on your computer.

Run `bun run setup` without `--write` to print the configuration.
Run `bun run build` after each `git pull`.
Claude Desktop runs the files in `dist/`.

## Connect from Claude or ChatGPT on the web

Web hosts need a public HTTPS URL.
Use Cloudflare Tunnel for local development:

```bash
brew install cloudflared
bun run dev:tunnel
```

The command prints the public URL.

For Claude, open **Settings > Connectors > Add custom connector**.
Enter `https://<printed-url>/mcp`.

For ChatGPT, open **Settings > Apps > Advanced**.
Enable **Developer mode**.
Then create an app with `https://<printed-url>/mcp` and no authentication.

## Develop locally

Install dependencies and start the development server:

```bash
bun install
bun run dev
```

The MCP endpoint is `http://localhost:3000/mcp`.

Use the MCP Inspector for protocol work:

```bash
bun run inspect
```

Use the local harness for widget work:

```bash
bun run build:harness
bun run start
```

Open `http://localhost:3000/__harness/host.html`.
The harness supports tool calls, display modes, and downloads.

## Deploy

Run the container behind a public HTTPS endpoint:

```bash
docker build -t docx-editor-mcp .
docker run \
  -p 3000:3000 \
  -e PUBLIC_ORIGIN=https://your-host.example \
  docx-editor-mcp
```

Set `PUBLIC_ORIGIN` to the exact public origin.
The server uses it for the CSP, widget assets, and `harfbuzz.wasm`.
An incorrect value causes pagination differences without a startup error.

The server keeps no state, so you can run multiple instances.

## Troubleshoot

- Widget does not render: Check that `/mcp` returns `tools/list` with `bun run inspect`.
- Skeleton does not finish: Check access to `PUBLIC_ORIGIN/assets/*`.
- Pagination differs from Word: Check that the browser loaded `harfbuzz.wasm`.
- Open fails for a private address: Use a public HTTPS URL without redirects.
- ChatGPT returns `424`: Check `structuredContent` and `_meta` in the tool response.
- ChatGPT shows an old build: Confirm that your deployment includes the current asset hashes.

## Project structure

- `src/shared/catalog.ts` defines the tool catalog.
- `src/server/mcp.ts` provides `open_document` and the UI resource.
- `src/server/fetch-proxy.ts` validates and fetches document URLs.
- `src/app/main.tsx` connects the widget, host, and editor.
- `src/app/executor.ts` runs document operations through editor-api.

## Verify changes

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.
See [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

This project uses the [Apache 2.0 license](LICENSE).

`@docx-editor.dev/pro` and `@docx-editor.dev/editor-api` use the EigenPal Pro License.
See [pricing and support options](https://www.docx-editor.dev/pricing).

For commercial support, email [docx-editor@eigenpal.com](mailto:docx-editor@eigenpal.com).
