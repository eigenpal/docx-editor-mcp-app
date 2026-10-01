# docx-editor-mcp-app

An MCP App that opens a `.docx` in the docx-editor.dev engine, inside a Claude
or ChatGPT conversation. The engine does the document work. This repository is
the wiring.

## Communication

Write all replies in ASD-STE100 Simplified Technical English.

- Use the active voice.
- Keep sentences to 20 words or fewer.
- Give one idea in each sentence.
- Use simple tenses: present, past, and future.
- Use the same word for the same idea each time.
- Do not use idioms, slang, or jargon.
- Keep paragraphs to 6 sentences or fewer.

Keep technical items exact. File paths, function names, flags, and numbers do
not change. For example, write `src/server/documents.ts` and `MAX_CONTENT_BYTES`
in full.

Write all documentation — `README.md`, `CONTRIBUTING.md`, code comments, PR
bodies — in the
[Google developer documentation style](https://developers.google.com/style):
second person, active voice, present tense, sentence-case headings, American
spelling, short sentences, one idea each. Use code font for identifiers and
file names. Use bold for UI elements only. Apply the STE rules above to
documentation too.

## A preview, not an editing API

The model gets one tool, `open_document`. Agents edit a `.docx` with their own
document skills (Codex: the built-in Documents skill), never through this app.
The widget previews the file, follows its changes with the engine's refresh
API (capture, then apply), and lets a person edit it. Do not add model-facing
editing tools.

| Half   | File                      | Answers                                             |
| ------ | ------------------------- | --------------------------------------------------- |
| Server | `src/server/mcp.ts`       | Every tool and resource                             |
| Server | `src/server/documents.ts` | Opened documents behind tokens: read, version, save |
| Widget | `src/app/main.tsx`        | The editor, the inline card, and file sync          |

`src/shared/catalog.ts` is the allowlist. The tools other than `open_document`
are `visibility: ['app']` plumbing that the host or the widget calls.

## Nothing is fetched

Desktop hosts' iframe CSP allows no network origin of ours, ignores declared
domains, and blocks `blob:` images. So the widget is one inline document
(`scripts/build-app.mjs`), and everything else travels over MCP: the wasm as
`docx-asset://harfbuzz.wasm`, documents as `docx-local://<token>`
(`src/app/assets.ts`, `src/app/load-document.ts`). Images become `data:` URLs.
Never make the widget fetch anything.

Two transports, one server: `stdio` (local mode: `open_document` takes paths,
and the preview syncs with the file) and `http` (web hosts and OpenAI's plugin
directory: no paths; bytes return in the result `_meta`, so the server keeps
no state). Submission material is in `docs/submission/`; `bun run
build:directory` packages the hosted plugin.

## File sync

Two kinds of document follow the disk: a file the host opened through the
`view_docx_file` entrypoint (`src/app/host-file.ts`, via
`@openai/mcp-extensions/app`), and a file `open_document` opened by path
(`src/app/local-file.ts`, polled through `local_file_version`).
`src/app/file-sync-session.ts` owns the rules; keep its tests passing.

- A file viewer never takes part in the supersession election.
- Never replace the editor's document while it has unsaved edits. Hold the
  newer version and let the reader choose.
- Every write carries the last etag. Without etags, compare content hashes.
- Flush before anything unmounts the editor: the engine detaches it before
  `FileSync`'s cleanup runs, so a flush there finds no document.

## Untrusted input

Every value from a `.docx` is attacker-controlled. The engine sanitizes at its
parse boundary. Do not undo that here; `eslint.config.js` bans `innerHTML`.

Paths are attacker-controlled too. `src/server/documents.ts` is the boundary:
it resolves the REAL path and checks `.docx` on it (a symlink must not open),
caps the size, and saves through a same-directory temporary file that keeps
the original's mode. Nothing accepts a raw path except `open_document` in
local mode. Keep `src/server/__tests__/documents.test.ts` passing.

## Two display modes, one mounted editor

Claude's guidelines put document editing in fullscreen. Inline apps must fit
their content and must not scroll internally.

- Inline is a summary card (`src/app/InlineCard.tsx`) beside a live page-1
  thumbnail. The thumbnail is the mounted editor, scaled with a CSS transform.
- Fullscreen is the editor. `requestDisplayMode` asks; render from the mode
  the host reports, not the mode you asked for.

The editor stays mounted in both modes. It holds the document, the tracked
changes, and the undo history. Inline, the stage is `visibility: hidden` plus
the `inert` attribute. Do not replace that with a conditional render.

More rules from verification:

- The `hostcontextchanged` payload is the partial context itself. Re-read the
  merged `app.getHostContext()` instead of the params.
- Write `--safe-*` variables only when the context carries `safeAreaInsets`.
- The engine's `editor.css` sets `html, body { height: 100% }`. Our
  `styles.css` overrides it with `height: auto`; without that, autoResize
  cannot measure the card and the host clips it.
- No `<StrictMode>`. Its dev double-mount closes the SDK `App` mid-handshake,
  and a host answers `ui/initialize` once.
- Chrome styling uses the host's tokens (`--color-*`, `--font-*`) through
  `useHostStyleVariables(app, handshakeContext)`. The second argument carries
  the initial styles; without it the widget renders in fallback colors.
- Loading states are skeletons shaped like the card. Never spinners.
- The EDITOR follows the host theme: `colorMode={hostTheme ?? 'system'}` on
  `<DocxEditor>`. A light toolbar in a dark host makes the host's overlaid
  composer read as a broken box. The engine's dark mode restyles chrome and
  canvas at render time only; a saved file is unchanged.
- The bottom safe-area inset goes inside the engine's scroll viewport
  (`.docx-editor-one-surface__viewport`, not published contract), with an 88px
  floor for the host's composer.

## Build

`bun run build` writes `dist/app/` (the inline widget, its hash, and
`harfbuzz.wasm` from the installed engine; the loader refuses a binary from a
different build), `dist/cli.js` (the server with every dependency inlined; run
it with Node 22, not Bun), and `THIRD_PARTY_NOTICES.md`. All dependencies are
`devDependencies`: the npm package installs nothing.

## Verify

```bash
bun run typecheck
bun run lint
bun run test
bun run build
bun run smoke
```

- `bun run lint` enforces a 400-line cap per file and the `innerHTML` ban.
  Extract; do not raise the cap.
- `bun run smoke` runs the built package over stdio, as desktop hosts do.
- `bun run format` before pushing.

For widget behavior, use the harness: `bun run build:harness`, then open
`/__harness/host.html` on `bun run dev`. It is a real MCP Apps host
(`AppBridge` with an MCP client to `/mcp`) and emulates the OpenAI file viewer.
`src/harness/` is dev-only; `public/__harness/` is gitignored.

Entry points: `dist/cli.js` (`stdio`, `http`, `setup codex|claude`; the npm
`bin`) and `bun run dev`. In stdio mode, stdout is the protocol channel; log
to stderr only.

## Conventions

- PRs: short factual title with a conventional-commit prefix. The body is the
  minimum the diff does not show. No mentions, file lists, tooling footers, or
  emojis.
- ESM only. No `require()` outside `scripts/`.
- Comments explain why, not what. Name the trap, not the line.
- Engine bugs belong upstream. Fix pagination, parsing, and serialization in
  `eigenpal/docx-editor` and bump the dependency. Do not work around them here.
