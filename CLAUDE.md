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
not change. For example, write `src/server/fetch-proxy.ts` and `PUBLIC_ORIGIN`
in full.

Write all documentation — `README.md`, `CONTRIBUTING.md`, code comments, PR
bodies — in the
[Google developer documentation style](https://developers.google.com/style):
second person, active voice, present tense, sentence-case headings, American
spelling, short sentences, one idea each. Use code font for identifiers and
file names. Use bold for UI elements only. Apply the STE rules above to
documentation too.

## The split: server declares, widget executes

| Half   | File                | Answers                                   |
| ------ | ------------------- | ----------------------------------------- |
| Server | `src/server/mcp.ts` | `open_document` and the one HTML resource |
| Widget | `src/app/main.tsx`  | Every other tool, against the live editor |

The widget registers its tools with `App.registerTool` and declares
`capabilities: { tools: { listChanged: true } }`. The host proxies each model
call into the iframe. This works because `@docx-editor.dev/core` parses, lays
out, paints, and serializes OOXML in the browser. The server holds no document
state.

A host that does not call app-registered tools gets a read-only view. The
widget covers that case: it pushes document text and review counts through
`ui/update-model-context` on load and after every change. Do not remove that
push.

## The catalog is the allowlist

`src/shared/catalog.ts` is the only place that describes a tool. Both halves
import it. To add a tool, make two edits: describe it in the catalog, and
implement it in `HANDLERS` in `src/app/executor.ts`. `HANDLERS` is typed
`Record<AppToolName, …>`, so a missing executor fails `bun run typecheck`.

## Document work goes through editor-api

`@docx-editor.dev/editor-api/browser` borrows the editor the reader has open.
`run(context => ...)` is the Office.js batch shape. Known traps:

- Load in two phases. `text` and `uniqueLocalId` are properties of a
  `Paragraph`, not of the collection. Load the collection, `sync`, load each
  item, `sync` again. A load on the collection throws `InvalidArgument`.
- `hit.paragraphs.getFirst()` fails with `InvalidObjectPath` inside a batch.
  Materialize `hit.paragraphs` instead.
- `Paragraph` has no `search`. Search the `Body` and filter by owner.
- editor-api cannot create a comment. Select the phrase through editor-api,
  then create the comment through `useReviewOf` from
  `@docx-editor.dev/pro/react`.
- Tracked changes are engine commands. Select through editor-api, then
  `editor.exec({ type: 'proposeReplacement' | 'proposeDeletion' })`.
- `exec` returns an `ExecResult` value with a `code` and a `reason`. It does
  not throw. Give the reason to the model.
- Locate and select a phrase in ONE `run()` batch (`selectExactPhrase`). Two
  batches race the reader's typing and can select the wrong occurrence.

The runtime issues `uniqueLocalId` for every paragraph. Anchors match
case-sensitively on purpose: the model copies phrases verbatim from
`read_document`. Each refusal names what to do differently.

## Untrusted input

Every value from a `.docx` is attacker-controlled. The engine sanitizes at its
parse boundary. Do not undo that here; `eslint.config.js` bans `innerHTML` for
this reason.

The URL in `open_document` is attacker-controlled too. `src/server/fetch-proxy.ts`
is the boundary: it checks scheme, pins the resolved address at dial time,
refuses redirects, and caps the body size while streaming. Read it before you
change it, and keep `src/server/__tests__/fetch-proxy.test.ts` passing. Do not
widen `connectDomains` to avoid the proxy.

## PUBLIC_ORIGIN

One origin, used in three places: the CSP allowlist, the widget's
`harfbuzz.wasm` URL, and the `/fetch` proxy. The HTML shell carries a
`__PUBLIC_ORIGIN__` placeholder; `src/server/ui-resource.ts` substitutes it per
deployment and hashes the result into the resource URI. The widget JS reads its
own origin from `import.meta.url`.

A wrong origin does not crash. HarfBuzz fails to load, the shaper falls back,
and pagination drifts from Word silently. `scripts/build-app.mjs` fails the
build if the placeholder is missing.

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
- The document canvas is not themed. Word paints paper white in both themes.

## Build and assets

The `ui://` resource is a small HTML shell. The application is
`public/assets/editor-<hash>.{js,css}`, served from `PUBLIC_ORIGIN` and cached
as immutable. Only `/assets` gets immutable caching; the names there carry a
content hash or the engine version.

`harfbuzz.wasm` ships as `public/assets/harfbuzz-<engine-version>.wasm`. The
version is in the name because the loader refuses a binary from a different
engine build. Nothing under `public/assets/` is committed.

## Verify

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

- `bun run lint` enforces a 400-line cap per file and the `innerHTML` ban.
  Extract; do not raise the cap.
- `bun run build` is the only check that runs esbuild over the widget and
  asserts the `__PUBLIC_ORIGIN__` placeholder survived.
- `bun run format` before pushing.

For widget behavior, use the harness: `bun run build:harness`, then open
`/__harness/host.html` on the running server. It is a real MCP Apps host
(`AppBridge` + `PostMessageTransport`): handshake, tool calls, display modes,
and `ui/download-file` run as Claude runs them. `window.__bridge` exposes the
bridge. `src/harness/` is dev-only; `public/__harness/` is gitignored.

Entry points: `bun run dev` (HTTP), `bun run stdio` (Claude Desktop),
`bun run dev:tunnel` (public URL), `bun run setup` (install instructions).
In stdio mode, stdout is the protocol channel; log to stderr only.

## Conventions

- PRs: short factual title with a conventional-commit prefix. The body is the
  minimum the diff does not show. No mentions, file lists, tooling footers, or
  emojis.
- ESM only. No `require()` outside `scripts/`.
- Comments explain why, not what. Name the trap, not the line.
- Engine bugs belong upstream. Fix pagination, parsing, and serialization in
  `eigenpal/docx-editor` and bump the dependency. Do not work around them here.
