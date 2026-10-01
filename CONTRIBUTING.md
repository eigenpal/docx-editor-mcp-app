# Contributing

Thank you for contributing.
This repository connects MCP hosts to the docx-editor.dev engine.
The engine lives in [`eigenpal/docx-editor`](https://github.com/eigenpal/docx-editor).

## Choose the correct repository

Report these engine problems in `eigenpal/docx-editor`:

- OOXML parsing or serialization
- Pagination or layout
- Tracked changes or comments
- Editor commands

Do not add an engine workaround to this repository.
Fix the engine, then update its dependency here.

Use this repository for MCP tools, the widget, the server, and deployment.

## Set up the project

```bash
bun install
bun run dev
```

The MCP endpoint is `http://localhost:3000/mcp`.
The development server rebuilds changed files.

Choose a test host:

```bash
bun run build:harness
bun run build && node dist/cli.js setup codex
```

- Use the harness for local widget tests.
- Use ChatGPT, Codex, or Claude desktop for local stdio tests
  (`setup codex` or `setup claude`).
- For Claude or ChatGPT on the web, expose `bun run dev` with a tunnel.

Run `bun run inspect` to test the protocol with the MCP Inspector.

## Verify your change

```bash
bun run typecheck
bun run lint
bun run test
bun run build
bun run smoke
bun run format
```

`bun run build` bundles the widget and the server.
`bun run smoke` runs the built package over stdio, as desktop hosts do.

## Keep it a preview

The model gets one tool, `open_document`. Agents edit documents with their own
document skills, so do not add model-facing editing tools. Any new tool is
plumbing for the host or the widget: describe it in `src/shared/catalog.ts`
and register it with `visibility: ['app']`.

## Follow the style guidelines

- Follow the [Google developer documentation style](https://developers.google.com/style).
- Use second person, active voice, and present tense.
- Keep sentences short and focused.
- Comments explain why, not what. Name the trap.
- Keep each source file under 400 lines.
- Use a short, factual PR title with a conventional commit prefix.
- Include only necessary context in the PR body.

## Accept the contributor license agreement

Your contribution uses the
[docx-editor contributor license agreement](https://github.com/eigenpal/docx-editor/blob/main/CLA.md).
