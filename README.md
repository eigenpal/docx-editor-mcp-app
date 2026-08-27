# docx-editor MCP App

<p align="center">
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP_Apps-SEP--1865-3B5BDB?style=flat-square" alt="MCP Apps" /></a>
  <a href="https://github.com/eigenpal/docx-editor-mcp-app/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-blue.svg?style=flat-square&color=3B5BDB" alt="license" /></a>
  <a href="https://www.docx-editor.dev/docs"><img src="https://img.shields.io/badge/Docs-3B5BDB?style=flat-square&logo=readthedocs&logoColor=white" alt="Documentation" /></a>
</p>

An [MCP App](https://modelcontextprotocol.io/) that opens a `.docx` in a real
WYSIWYG Word editor **inside the conversation** — Word-faithful pagination,
tracked changes and comments — and lets the model read it, redline it and hand
it back. One codebase, two hosts: Claude and ChatGPT.

It is a thin wrapper over [docx-editor.dev](https://docx-editor.dev/), which
does the hard part.

## Why this can be a chat widget at all

Every other Word editor you could put behind an MCP server needs a document
service running beside it — OnlyOffice and Syncfusion both do. That is a
component to deploy, scale and keep alive, and it is why "edit a Word document"
is normally an app rather than a connector.

`@docx-editor.dev/core` parses, lays out, paints and serializes OOXML **in the
browser**. So the MCP server here holds no document state, runs no document
pipeline, and answers exactly one tool. Everything else runs in the iframe the
host already gave us:

```
Claude / ChatGPT
   │  tools/call open_document          ← the only thing the server answers
   ▼
MCP server  ──── resources/read ────▶  one HTML file: the editor
   │                                        │
   └─ GET /fetch?url=…  (bytes only) ──────▶│  read_document   find_text
                                            │  edit_text       add_comment
                                            │  export_document
                                            └─ registered BY THE WIDGET,
                                               run against the live editor
```

The document bytes reach the server once, on open, and only because a sandboxed
iframe may not fetch from an origin its CSP never named. Every read, edit,
comment and export after that happens in the reader's browser.

## What the model can do

| Tool              | Runs in | What it does                                                               |
| ----------------- | ------- | -------------------------------------------------------------------------- |
| `open_document`   | server  | Renders the editor on a URL, or on an empty document.                      |
| `read_document`   | widget  | The document as paragraphs with ids. Paged, and it says when it truncated. |
| `find_text`       | widget  | Locates a phrase, with the id of the paragraph holding it.                 |
| `edit_text`       | widget  | Replaces a verbatim phrase. **A tracked change by default.**               |
| `add_comment`     | widget  | A real Word comment, anchored to the phrase, surviving the save into Word. |
| `export_document` | widget  | Hands the reader the edited `.docx`.                                       |

`edit_text` proposes rather than applies. An agent editing someone's contract in
place, with no record of what it touched, is the failure mode this exists to
avoid — so the reader accepts or rejects each change, in the editor, the way
they would in Word.

The catalog is the allowlist. A model that decides to do something
[`src/shared/catalog.ts`](src/shared/catalog.ts) does not name has nothing to
call, rather than merely being told not to.

## Run it

```bash
bun install
bun run dev          # http://localhost:3000/mcp
```

Point the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) at
it:

```bash
bun run inspect
```

To try it in Claude, expose the port (`ngrok http 3000`), set `PUBLIC_ORIGIN` to
the public URL, and add it under **Settings → Connectors → Add custom
connector**. `PUBLIC_ORIGIN` is not optional in a real deployment: it is the one
domain the widget's CSP allowlist names, and getting it wrong costs Word-faithful
pagination, silently.

```bash
bun run build
PUBLIC_ORIGIN=https://your-host.example bun run start
```

## ChatGPT

The same build. Since ChatGPT adopted the MCP Apps spec, a widget written against
[`@modelcontextprotocol/ext-apps`](https://github.com/modelcontextprotocol/ext-apps)
runs in both hosts — no `window.openai`, no second bundle. Two things to know:

- **Cache-bust the resource URI.** ChatGPT caches MCP resources hard and keys the
  cache on the URI, so a fixed URI ships a redeploy to a client that keeps
  rendering the old build. [`src/server/ui-resource.ts`](src/server/ui-resource.ts)
  hashes the bytes into the URI, which also means an unchanged build keeps its
  cache.
- **A bare `424` is a shape mismatch**, not a network problem: malformed
  `structuredContent`, or a missing `_meta`.

A few ChatGPT-only capabilities (`uploadFile`, `getFileDownloadUrl`) are not in
the spec yet. Nothing here needs them; if you add a flow that does, feature-detect
rather than fork the bundle.

## Layout

| Path                        | What it owns                                                         |
| --------------------------- | -------------------------------------------------------------------- |
| `src/shared/catalog.ts`     | The tool catalog. Schemas and descriptions, imported by both halves. |
| `src/server/mcp.ts`         | `open_document` and the UI resource. Nothing else.                   |
| `src/server/fetch-proxy.ts` | The one place an attacker-controlled URL is fetched. Read it first.  |
| `src/app/main.tsx`          | The widget: host connection, editor, tool registration.              |
| `src/app/executor.ts`       | Every document operation, against the live editor via editor-api.    |

## Verify

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

For the widget itself there is a local host harness — a minimal MCP Apps host
built on the SDK's own `AppBridge` that runs the real `ui/initialize`
handshake, delivers `open_document` results, calls the widget's registered
tools and flips display modes:

```bash
bun run build && bun run build:harness && bun run start
# open http://localhost:3000/__harness/host.html
```

## License

[Apache 2.0](LICENSE).

This app depends on `@docx-editor.dev/pro` and `@docx-editor.dev/editor-api`,
which are licensed under the EigenPal Pro Evaluation License 1.0: free to
evaluate, production use requires a commercial agreement —
**[licensing@eigenpal.com](mailto:licensing@eigenpal.com)**. Deploying this
connector publicly is production use.

## Commercial support

> [!TIP]
> Questions or custom features? Email **[docx-editor@eigenpal.com](mailto:docx-editor@eigenpal.com)**.
