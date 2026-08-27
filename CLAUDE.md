# docx-editor-mcp-app

An MCP App that opens a `.docx` in the docx-editor.dev engine, inside a Claude or
ChatGPT conversation. The engine does the document work. This repository is the
wiring.

## Communication

Write all replies in ASD-STE100 Simplified Technical English.

- Use the active voice.
- Keep sentences to 20 words or fewer.
- Give one idea in each sentence.
- Use simple tenses: present, past, and future.
- Use the same word for the same idea each time.
- Do not use idioms, slang, or jargon.
- Keep paragraphs to 6 sentences or fewer.

Keep technical items exact. File paths, function names, flags, and numbers do not
change. For example, write `src/server/fetch-proxy.ts` and `PUBLIC_ORIGIN` in
full.

## The split — server declares, widget executes

Two halves. Neither is where you expect it.

| Half   | File                | Answers                                                                     |
| ------ | ------------------- | --------------------------------------------------------------------------- |
| Server | `src/server/mcp.ts` | `open_document`, and the one HTML resource                                  |
| Widget | `src/app/main.tsx`  | `read_document`, `find_text`, `edit_text`, `add_comment`, `export_document` |

The widget registers its tools with `App.registerTool` and declares
`capabilities: { tools: { listChanged: true } }`. The host proxies each model
call into the iframe. That is the whole execution model, and it works only
because `@docx-editor.dev/core` parses, lays out, paints and serializes OOXML in
the browser. No document service runs beside this server. No document state lives
in it.

**A host that does not call app-registered tools gets a read-only view.** The
widget covers that case with `ui/update-model-context` on load, so the model can
still READ the document. Do not remove that call because the tools "work
anyway" — it is the fallback for a host that does not.

## The catalog is the allowlist

`src/shared/catalog.ts` is the only place a tool is described. Both halves import
it. The engine ships no tool schemas on purpose: which operations a model may
reach is a decision about the model's interface, not about the editor.

Adding a tool means two edits, and the compiler enforces the second. `HANDLERS`
in `src/app/executor.ts` is typed `Record<AppToolName, …>`, so a tool with no
executor fails `bun run typecheck` rather than failing at the model's first call.

## Document work goes through editor-api

`@docx-editor.dev/editor-api/browser` borrows the editor the reader has open.
`run(context => ...)` is the Office.js batch shape.

**Two phases, and the first is not optional.** `text` and `uniqueLocalId` are
properties of a `Paragraph`, not of the collection. Load the collection, `sync`,
then load each item, then `sync` again. Asking the collection for `text` throws
`InvalidArgument`.

- `hit.paragraphs.getFirst()` does not survive a batch. It mints a promised
  object whose path is already released, and the run dies with
  `InvalidObjectPath`. Materialise `hit.paragraphs` instead.
- `Paragraph` has no `search`. Only `Body` and `Range` do. Search the body and
  filter by owner.
- editor-api cannot CREATE a comment. `addComment` selects the phrase through
  editor-api, then lands the comment through `useReviewOf` from
  `@docx-editor.dev/pro/react`. Both halves drive the same editor.
- Tracked changes are engine commands, not editor-api calls. Select through
  editor-api, then `editor.exec({ type: 'proposeReplacement' | 'proposeDeletion' })`.
- `exec` returns an `ExecResult`, a refusal VALUE with a `code` and a `reason`.
  It does not throw. Give the reason to the model; it is usually enough for a
  retry that can work.

Paragraphs are addressed by `uniqueLocalId`. The runtime issues it, so every
paragraph has one, whether or not the OOXML carried an id.

## Anchors are verbatim and case-sensitive

`resolveAnchor` matches case-sensitively on purpose. The model is told to copy
the phrase out of `read_document`, and a case-insensitive match would silently
anchor to a different occurrence than the one it meant. Zero hits, a hit in the
wrong paragraph, and two hits in the right one are three different refusals, and
each one names what to do differently.

## Untrusted input

**Every value from a `.docx` is attacker-controlled.** A `.docx` is a zip of XML
the sender fully controls: font names, hyperlink targets, run text. The engine
sanitizes at its own parse boundary. This repository must not undo that, which is
what the `innerHTML` ban in `eslint.config.js` is for.

**The URL in `open_document` is attacker-controlled too.** It arrives from a tool
call a document, a web page or a chat message can steer. `src/server/fetch-proxy.ts`
is the boundary: scheme, resolved address, redirect and size, all checked before
any body is read. Read it before you change it, and keep
`src/server/__tests__/fetch-proxy.test.ts` passing.

The proxy exists only because a sandboxed iframe may reach nothing its resource's
CSP did not name, and `open_document` takes an arbitrary URL. Do not "simplify"
it by putting a wildcard in `connectDomains`.

## PUBLIC_ORIGIN

One origin, named in three places: the CSP allowlist, the widget's
`harfbuzz.wasm` URL, and the `/fetch` proxy the widget calls. The widget bundle
is built once and carries a `__PUBLIC_ORIGIN__` placeholder;
`src/server/ui-resource.ts` substitutes it per deployment, then hashes the result
into the resource URI.

Get it wrong and the engine cannot load HarfBuzz. It does not crash. It falls
back, and pagination drifts away from Word — a silent fidelity loss, which is the
only kind worth wiring up front. The widget JS needs no placeholder — it is a
static asset and reads its own origin off `import.meta.url`; the HTML shell is
the artifact that carries `__PUBLIC_ORIGIN__`, and `scripts/build-app.mjs` fails
the build if the placeholder goes missing.

## Two display modes, one mounted editor

Claude's MCP App design guidelines put document editing in FULLSCREEN. Inline
apps auto-fit their content and may not scroll internally; on mobile, vertical
pan gestures inside an inline app go to the conversation, not the app. So:

- **Inline** is a summary card (`src/app/InlineCard.tsx`): name, counts, a
  pending-suggestions chip, "Open editor" and "Download". At most two actions
  and a handful of data points, per the guidelines.
- **Fullscreen** is the editor. "Open editor" calls `requestDisplayMode` and
  renders from the mode the host REPORTS, not the one that was asked for.

The editor is mounted in BOTH modes. It holds the document, its tracked changes
and its undo history; unmounting on collapse would discard all three. Inline,
`.stage` is `opacity: 0` and inert — do not "simplify" that to a conditional
render.

Chrome styling uses the HOST'S tokens (`--color-background-primary`,
`--font-sans`, …), applied by `useHostStyleVariables`. Safe-area insets arrive
via `hostContext` and land as `--safe-*` CSS variables. Loading states are
skeletons shaped like the card, never spinners.

## The resource is a small shell; the app is static assets

The `ui://` resource is `dist/app/editor.html`: an inline skeleton plus a
`<link>` and `<script>` pointing at `public/assets/editor-<hash>.{js,css}` on
`PUBLIC_ORIGIN`, which the resource's CSP names. `scripts/build-app.mjs` emits
the hashed assets and fails the build if a placeholder survives substitution.

Why split: first paint is the skeleton rather than a multi-megabyte parse; the
hashed names make the server's immutable `/assets` caching correct; and the
engine is cached by the browser across conversations.

`harfbuzz.wasm` ships as `public/assets/harfbuzz-<engine-version>.wasm` — the
version is in the NAME because `/assets` is cached immutable and the loader
refuses a binary from a different engine build. esbuild does not rewrite
`new URL('harfbuzz.wasm', import.meta.url)`, so `src/app/main.tsx` calls
`setHarfBuzzWasmUrl`. Nothing under `public/assets/` is committed.

## Theme

The widget chrome follows the host, through `useHostStyleVariables`. The document
canvas does not. Word paints a page on white paper, so the editor does too, in
both themes. A dark-mode document would be a different document from the one the
reader downloads.

## Verify

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

For widget behavior, use the host harness: `bun run build:harness`, then open
`/__harness/host.html` on the running server. It is a real MCP Apps host
(`AppBridge` + `PostMessageTransport`), so the handshake, tool calls,
display-mode flips and `ui/download-file` all run the way Claude runs them.
`src/harness/` is dev-only and `public/__harness/` is gitignored.

- `bun run lint` enforces a 400-line cap per file and the `innerHTML` ban.
  Extract; do not raise the cap.
- `bun run build` is a real gate, not a formality. It is the only check that runs
  esbuild over the widget, and the only one that asserts `__PUBLIC_ORIGIN__`
  survived minification.
- `bun run format` before pushing.

## Conventions

- **PRs** — short factual title (conventional-commit prefix); body is the minimum
  the diff does not show, often one sentence. No `@`-mentions, file lists,
  tooling footers or emojis. Write the body in the
  [Google developer documentation style](https://developers.google.com/style):
  second person, active voice, present tense, sentence-case headings, American
  spelling, short sentences, one idea each.
- **ESM only** — no `require()` outside `scripts/`.
- **Comments explain why, not what.** The `.docx` pipeline is full of traps that
  look like ordinary code. A comment that names the trap is worth more than one
  that restates the line.
- **Engine bugs belong upstream.** If pagination, parsing or serialization is
  wrong, fix it in `eigenpal/docx-editor` and bump the dependency. Do not work
  around it here.
