# docx-editor MCP App

<p align="center">
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP_Apps-SEP--1865-3B5BDB?style=flat-square" alt="MCP Apps" /></a>
  <a href="https://github.com/eigenpal/docx-editor-mcp-app/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-blue.svg?style=flat-square&color=3B5BDB" alt="license" /></a>
  <a href="https://www.docx-editor.dev/docs"><img src="https://img.shields.io/badge/Docs-3B5BDB?style=flat-square&logo=readthedocs&logoColor=white" alt="Documentation" /></a>
</p>

An [MCP App](https://modelcontextprotocol.io/) that opens a `.docx` file in a
WYSIWYG Word editor inside a Claude or ChatGPT conversation. The model reads
the document, suggests tracked changes, and answers comments. The reader
accepts or rejects each change in the editor. One codebase serves both hosts.

The editor is [docx-editor.dev](https://docx-editor.dev/).

## Architecture

Most Word editors need a document service on the server. This one does not:
`@docx-editor.dev/core` parses, lays out, paints, and serializes OOXML in the
browser. The MCP server answers one tool and serves static files. It holds no
document state.

```
Claude / ChatGPT
   │  tools/call open_document          ← the only tool the server answers
   ▼
MCP server  ──── resources/read ────▶  HTML shell: the editor widget
   │                                        │
   └─ GET /fetch?url=…  (bytes only) ──────▶│  read_document   find_text
                                            │  edit_text       add_comment
                                            │  read_comments   read_changes
                                            │  export_document …
                                            └─ registered by the widget,
                                               run against the live editor
```

The document bytes pass through the server once, at open. The sandboxed iframe
can only fetch from origins that its CSP names, so the server proxies that one
download. Every later read, edit, and export runs in the reader's browser.

## Tools

| Tool              | Runs in | What it does                                                 |
| ----------------- | ------- | ------------------------------------------------------------ |
| `open_document`   | server  | Opens the editor on a URL, or on an empty document.          |
| `read_document`   | widget  | Returns paragraphs with ids. Paged; reports truncation.      |
| `find_text`       | widget  | Finds a phrase and the id of the paragraph that holds it.    |
| `edit_text`       | widget  | Replaces a verbatim phrase. A tracked change by default.     |
| `add_comment`     | widget  | Adds a Word comment anchored to a phrase. Survives the save. |
| `read_comments`   | widget  | Lists comments with author and resolved state.               |
| `reply_comment`   | widget  | Replies to a comment thread.                                 |
| `resolve_comment` | widget  | Resolves a thread after the requested change lands.          |
| `read_changes`    | widget  | Lists pending tracked changes by author.                     |
| `export_document` | widget  | Gives the reader the edited `.docx`.                         |

`edit_text` proposes; it does not apply. The reader accepts or rejects each
change in the editor, as in Word.

The review loop runs both ways. The reader edits and comments in the editor.
`read_comments` and `read_changes` return authorship, so the model can tell the
reader's edits from its own. After every change, the widget updates the
conversation context ("4 unresolved comments, 3 by the reader"). When you say
"I left you comments", Claude knows where to look.

The catalog in [`src/shared/catalog.ts`](src/shared/catalog.ts) is the
allowlist. A tool the catalog does not name does not exist.

## Display modes

[Claude's design guidelines](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines)
put document editing in fullscreen. Inline apps must fit their content and must
not scroll. So:

- **Inline** is a summary card: a live page-1 thumbnail, word counts,
  suggestion and comment chips, and two buttons. The thumbnail is the editor,
  scaled down, so edits appear in it as they land.
- **Fullscreen** is the full editor: toolbar, ruler, review rail.

The editor stays mounted in both modes. Collapsing to the card keeps every
tracked change and the undo history.

## Install in Claude Desktop

No deploy needed. Claude Desktop runs the server locally over stdio.

```bash
bun install
bun run setup --write
```

Restart Claude Desktop and ask Claude to open a `.docx`. The server serves the
widget assets from `http://localhost:3017`. Nothing leaves your machine.

`bun run setup` without `--write` prints the config snippet instead. After a
`git pull`, run `bun run build` again; Claude Desktop runs what `dist/`
contains.

## Install in claude.ai or ChatGPT

Both hosts fetch the MCP server over the network, so they need a public HTTPS
URL. To test with the dev server, use a tunnel:

```bash
brew install cloudflared   # once; free, no account
bun run dev:tunnel         # prints the URL and sets the CSP to it
```

- **Claude**: **Settings → Connectors → Add custom connector**. Paste
  `https://<printed-url>/mcp`.
- **ChatGPT**: **Settings → Apps → Advanced → Developer mode** (Pro, Plus,
  Business, or Edu, on the web). Then **Apps → Create**: enter a name, a
  description, the MCP server URL, and authentication _None_. Enable the app
  under **Drafts** and ask ChatGPT to open a `.docx`.

ChatGPT supports the MCP Apps specification, so the same build runs in both
hosts.

## Deploy

Any host that runs a container and provides HTTPS works:

```bash
docker build -t docx-editor-mcp .
docker run -p 3000:3000 -e PUBLIC_ORIGIN=https://your-host.example docx-editor-mcp
```

`PUBLIC_ORIGIN` is required in production; the server refuses to start without
it. It is the one origin the widget's CSP names. A wrong value does not raise
an error. It stops the HarfBuzz load, and pagination drifts from Word. The
server is stateless, so you can scale it horizontally.

## Troubleshooting

| Symptom                                    | Cause                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Tool listed, widget never renders          | The host cannot reach the resource. Check that `/mcp` answers `tools/list` (`bun run inspect`).    |
| Widget shows the skeleton forever          | The iframe cannot fetch `PUBLIC_ORIGIN/assets/*`. The origin is wrong, or the host requires HTTPS. |
| Pagination does not match Word             | `harfbuzz.wasm` did not load. Check the browser console for a blocked fetch.                       |
| "resolves to a non-public address" on open | The `/fetch` proxy refused the URL. It fetches public HTTPS only, and it refuses redirects.        |
| ChatGPT shows a bare `424`                 | The tool response shape is wrong: malformed `structuredContent` or missing `_meta`.                |
| ChatGPT renders an old build               | ChatGPT caches resources by URI. This server hashes the build into the URI, so verify the deploy.  |

To test the protocol without a host, run `bun run inspect`. To test the widget
in a local MCP Apps host:

```bash
bun run build:harness && bun run start
# open http://localhost:3000/__harness/host.html
```

## Layout

| Path                        | What it owns                                                     |
| --------------------------- | ---------------------------------------------------------------- |
| `src/shared/catalog.ts`     | The tool catalog. Both halves import it.                         |
| `src/server/mcp.ts`         | `open_document` and the UI resource. Nothing else.               |
| `src/server/fetch-proxy.ts` | The only place that fetches an attacker-controlled URL.          |
| `src/app/main.tsx`          | The widget: host connection, editor, display modes.              |
| `src/app/executor.ts`       | Document operations against the live editor, through editor-api. |

## Verify

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

The harness at `/__harness/host.html` is a real MCP Apps host built on the
SDK's `AppBridge`. It runs the `ui/initialize` handshake, delivers tool
results, calls the widget's tools, and switches display modes.

## License

[Apache 2.0](LICENSE).

This app depends on `@docx-editor.dev/pro` and `@docx-editor.dev/editor-api`,
which are licensed under the EigenPal Pro License. You can compare and buy
license and support levels on the
[pricing page](https://www.docx-editor.dev/pricing).

## Commercial support

> [!TIP]
> Questions or custom features? Email **[docx-editor@eigenpal.com](mailto:docx-editor@eigenpal.com)**.
