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
| `read_comments`   | widget  | The comments, with author and resolved state — how Claude reads feedback.  |
| `reply_comment`   | widget  | Replies into a thread, recording what was done about it.                   |
| `resolve_comment` | widget  | Marks a thread resolved, after the requested change actually landed.       |
| `read_changes`    | widget  | The pending tracked changes, by author — the reader's edits included.      |
| `export_document` | widget  | Hands the reader the edited `.docx`.                                       |

`edit_text` proposes rather than applies. An agent editing someone's contract in
place, with no record of what it touched, is the failure mode this exists to
avoid — so the reader accepts or rejects each change, in the editor, the way
they would in Word.

**The loop runs both ways.** The reader edits and comments in the editor; the
model sees it all — `read_comments` and `read_changes` return authorship, and
the widget keeps the conversation's context line current ("4 unresolved
comments, 3 by the reader") after every change, the reader's own included. Say
"I left you comments" and Claude already knows where to look.

The catalog is the allowlist. A model that decides to do something
[`src/shared/catalog.ts`](src/shared/catalog.ts) does not name has nothing to
call, rather than merely being told not to.

## Two display modes

Per [Claude's MCP Apps design guidelines](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines),
document editing belongs in fullscreen, and inline apps auto-fit with no
internal scrolling. So inline is a **summary card** — a live, scaled-down page-1
thumbnail (it IS the editor, so agent edits appear in it as they land), counts,
suggestion/comment chips, Open editor and Download — and fullscreen is the full
editor: toolbar, ruler, review rail. One mount for both: collapsing back to the
card keeps every tracked change and the undo history.

## Get it into Claude — two minutes, no deploy

```bash
bun install
bun run setup --write   # builds, then adds the server to Claude Desktop's config
```

Restart Claude Desktop and ask Claude to open a `.docx`. That is the whole
setup: Claude Desktop launches the server locally over stdio, and the widget's
assets come off `http://localhost:3017` from the same process — nothing leaves
your machine. `bun run setup` (without `--write`) prints the config snippet
instead of writing it. After a `git pull`, run `bun run build` again — Desktop
runs whatever `dist/` holds.

## claude.ai (web/mobile) and ChatGPT — needs a public URL

Both hosts fetch the MCP server from their side, so they need HTTPS they can
reach. For a quick try, tunnel the dev server:

```bash
brew install cloudflared   # once; free, no account
bun run dev:tunnel         # prints the public URL, serves with the CSP set to it
```

Then:

- **Claude** — **Settings → Connectors → Add custom connector**, paste
  `https://<printed-url>/mcp`.
- **ChatGPT** — **Settings → Apps → Advanced → Developer mode** (Pro/Plus/
  Business/Edu, on the web), then **Apps → Create**: name, description, MCP
  server URL `https://<printed-url>/mcp`, authentication _None_. The app lands
  under **Drafts**; enable it and ask ChatGPT to open a `.docx`. ChatGPT has
  adopted the MCP Apps spec, so this is the same build — no `window.openai`,
  no second bundle. (A few ChatGPT-only APIs like `uploadFile` are not in the
  spec yet; nothing here needs them.)

## Deploy

Anything that runs a container and gives you HTTPS:

```bash
docker build -t docx-editor-mcp .
docker run -p 3000:3000 -e PUBLIC_ORIGIN=https://your-host.example docx-editor-mcp
```

`PUBLIC_ORIGIN` is not optional in production — the server refuses to start
without it. It is the one domain the widget's CSP allowlist names; wrong, it
does not error, it silently costs Word-faithful pagination. The server is
stateless (no document ever reaches it after open), so scale horizontally or
not at all.

## When it doesn't work

| Symptom                                                            | Cause                                                                                                                            |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Tool listed, widget never renders                                  | The host can't reach the resource — check the `/mcp` URL answers `tools/list` (`bun run inspect`).                               |
| Widget renders, page is blank / skeleton forever                   | The iframe can't fetch `PUBLIC_ORIGIN/assets/*` — origin wrong, or not HTTPS where the host requires it.                         |
| Document opens, pagination looks un-Word-like                      | `harfbuzz.wasm` didn't load: `PUBLIC_ORIGIN` mismatch. Check the browser console for a blocked wasm fetch.                       |
| "could not resolve …" / "resolves to a non-public address" on open | The `/fetch` proxy refused the document URL — it only fetches public HTTPS, no redirects. Use a direct public link.              |
| ChatGPT shows a bare `424`                                         | Tool response shape — `structuredContent` malformed or `_meta` missing.                                                          |
| ChatGPT renders an old build                                       | It caches resources by URI; this server hashes the build into the URI, so a stale build means the deploy didn't actually update. |

Poke at the protocol without a host (`bun run inspect`), or exercise the widget
in a real MCP Apps host locally:

```bash
bun run build:harness && bun run start
# open http://localhost:3000/__harness/host.html
```

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
