# Contributing

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

For harness tests, run `bun run build:harness` and open `http://localhost:3000/__harness/host.html`.
For Codex desktop tests, install the packed build:

```bash
npm pack
npm install -g ./docx-editor.dev-mcp-app-*.tgz
docx-editor-mcp-app setup codex
```

- Use the harness for local widget tests.
- Use ChatGPT, Codex, or Claude desktop for local stdio tests
  (`setup codex` or `setup claude`).
- For Claude or ChatGPT on the web, expose `bun run dev` with a tunnel.

Run `bun run inspect` to test the protocol with the MCP Inspector.

## TypeScript tooling

Use `bun run typecheck` to run the TypeScript 7 compiler.
The `@typescript/native` alias supplies that compiler.
The `typescript` alias supplies the TypeScript 6 API required by ESLint.
Keep both aliases until the lint tools support the TypeScript 7 API.
See [Microsoft's compatibility guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0).

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

## Update the editor

Set `DOCX_EDITOR_VERSION` to the published editor version.
Update `core`, `react`, and `pro` to the same version.
The MCP package bundles these dependencies, so an editor release does not update an installed preview.

```bash
DOCX_EDITOR_VERSION=2.33.0
bun add --dev --exact "@docx-editor.dev/core@$DOCX_EDITOR_VERSION" \
  "@docx-editor.dev/react@$DOCX_EDITOR_VERSION" \
  "@docx-editor.dev/pro@$DOCX_EDITOR_VERSION"
bun run typecheck
bun run lint
bun run test
bun run build
bun run smoke
npm pack
npm install -g ./docx-editor.dev-mcp-app-*.tgz
docx-editor-mcp-app setup codex
```

Restart your desktop app, then reopen the document.
For a hosted MCP server, deploy the rebuilt `dist/cli.js` and `dist/app/` together.

## Keep it a preview

The model gets one tool, `open_document`.
Agents edit documents with their own document skills.
Do not add editing tools for the model.
Describe host and widget tools in `src/shared/catalog.ts`.
Register those tools with `visibility: ['app']`.

## Follow the style guidelines

- Follow the [Google developer documentation style](https://developers.google.com/style).
- Use second person, active voice, and present tense.
- Keep sentences short and focused.
- Explain the reason for a constraint in comments.
- Keep each sentence to 20 words or fewer.
- Use code font for identifiers and file names.
- Use bold only for UI elements.
- Keep each source file under 400 lines.
- Use a short, factual PR title with a conventional commit prefix.
- Include only necessary context in the PR body.

## Understand the component licenses

You can modify and redistribute the MCP app source under Apache-2.0.
The build also includes `@docx-editor.dev/pro`, which has separate license terms.
The free plugin permission covers official releases and limited internal source builds.
You may change the Apache-2.0 source for personal use or your organization's internal business use.
Keep the covered Pro code unchanged and use a Pro version recorded in an official release.
Use the build only as a document plugin in ChatGPT, Codex, or Claude.
Do not publicly distribute modified builds containing Pro code or offer them as a hosted service without separate permission.
Read [the license scopes](docs/submission/licensing.md) before distributing a build.

## Accept the contributor license agreement

Your contribution uses the
[docx-editor contributor license agreement](https://github.com/eigenpal/docx-editor/blob/main/CLA.md).
