# Contributing

Thanks for helping. This repository is small on purpose. The document engine
lives in [`eigenpal/docx-editor`](https://github.com/eigenpal/docx-editor).
Almost everything here is wiring around it.

## Where a change belongs

If pagination, parsing, serialization, tracked changes, or comments behave
wrongly, that is an engine bug. Fix it in `eigenpal/docx-editor` and bump the
dependency here. A workaround in this repository hides the bug from every other
consumer.

Changes that belong here: the tool catalog, how tools are described to a model,
the widget, the server, and the deployment story.

## Setup

```bash
bun install
bun run dev              # http://localhost:3000/mcp, rebuilds on change
```

Three ways to see your change inside a host, cheapest first:

```bash
bun run build:harness    # local MCP Apps host at /__harness/host.html
bun run setup --write    # install into Claude Desktop (stdio, no tunnel)
bun run dev:tunnel       # public URL for claude.ai (web) or ChatGPT
```

For protocol-level work, the
[MCP Inspector](https://github.com/modelcontextprotocol/inspector) is faster
than a real host: `bun run inspect`.

## Before you open a PR

```bash
bun run typecheck
bun run lint
bun run test
bun run build
bun run format
```

`bun run build` is a real gate. It is the only check that bundles the widget
and asserts the `__PUBLIC_ORIGIN__` placeholder survived.

## Adding a tool

Two edits; the compiler enforces the second.

1. Describe the tool in `src/shared/catalog.ts`. The description is the
   model's only documentation. Write it for a reader who cannot see the code.
2. Implement it in `src/app/executor.ts` and add it to `HANDLERS`. That table
   is typed `Record<AppToolName, …>`, so a missing executor fails
   `bun run typecheck`.

A tool that writes to the document should propose a tracked change, not apply
an edit, unless it cannot.

## Style

- Write documentation and PR bodies in the
  [Google developer documentation style](https://developers.google.com/style):
  second person, active voice, present tense, short sentences, one idea each.
- Comments explain why, not what. Name the trap.
- Keep files under 400 lines. Extract; do not raise the cap.
- PR title: short and factual, with a conventional-commit prefix. Body: the
  minimum the diff does not show.

## CLA

By contributing you agree to the
[CLA](https://github.com/eigenpal/docx-editor/blob/main/CLA.md) that covers
the docx-editor project.
