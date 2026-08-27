# Contributing

Thanks for helping. This repository is small on purpose: the document engine
lives in [`eigenpal/docx-editor`](https://github.com/eigenpal/docx-editor), and
almost everything here is wiring around it.

## Where a change belongs

If pagination, parsing, serialization, tracked changes or comments behave wrongly,
that is an engine bug. Fix it in `eigenpal/docx-editor` and bump the dependency
here. A workaround in this repository hides the bug from every other consumer.

Changes that do belong here: the tool catalog, how tools are described to a model,
the widget's chrome, the server, and the deployment story.

## Setup

```bash
bun install
bun run dev          # http://localhost:3000/mcp
```

`bun run dev` rebuilds the widget on change and restarts the server with it.

To exercise it against a real host, expose the port and set `PUBLIC_ORIGIN`:

```bash
ngrok http 3000
PUBLIC_ORIGIN=https://<your-subdomain>.ngrok.app bun run dev
```

Then add the `/mcp` URL in Claude under **Settings → Connectors → Add custom
connector**.

For protocol-level work the [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
is faster than a real host:

```bash
bun run inspect
```

## Before you open a PR

```bash
bun run typecheck
bun run lint
bun run test
bun run build
bun run format
```

`bun run build` is a real gate. It is the only check that runs esbuild over the
widget, and the only one that asserts the `__PUBLIC_ORIGIN__` placeholder survived
minification.

## Adding a tool

Two edits, and the compiler enforces the second.

1. Describe it in `src/shared/catalog.ts`. The description is the model's only
   documentation, so write it for a reader who cannot see the code.
2. Implement it in `src/app/executor.ts` and add it to `HANDLERS`. That table is
   typed `Record<AppToolName, …>`, so a missing executor fails `bun run typecheck`
   rather than failing at the model's first call.

A tool that writes to the document should propose a tracked change, not apply an
edit, unless there is a reason it cannot.

## Style

- Comments explain why, not what. The `.docx` pipeline is full of traps that look
  like ordinary code; a comment that names the trap earns its place.
- Files stay under 400 lines. Extract rather than raising the cap.
- PR title: short, factual, conventional-commit prefix. Body: the minimum the
  diff does not show.

## CLA

By contributing you agree to the [CLA](https://github.com/eigenpal/docx-editor/blob/main/CLA.md)
that covers the docx-editor project.
