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
bun run setup --write
bun run dev:tunnel
```

- Use the harness for local widget tests.
- Use Claude Desktop for local stdio tests.
- Use the tunnel for Claude or ChatGPT on the web.

Run `bun run inspect` to test the protocol with the MCP Inspector.

## Verify your change

```bash
bun run typecheck
bun run lint
bun run test
bun run build
bun run format
```

`bun run build` bundles the widget.
It also verifies the `__PUBLIC_ORIGIN__` placeholder.

## Add a tool

Make two changes:

1. Define the tool in `src/shared/catalog.ts`.
2. Add its implementation to `HANDLERS` in `src/app/executor.ts`.

Write tool descriptions for a model that cannot inspect the source.
The `Record<AppToolName, …>` type makes `bun run typecheck` detect missing handlers.

Create tracked changes for document edits when the editor supports them.

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
