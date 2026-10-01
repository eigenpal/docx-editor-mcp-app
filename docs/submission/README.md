# Plugin directory submission

Use this checklist to submit docx-editor to OpenAI's plugin directory. The
directory accepts only a hosted MCP server.

## Before you begin

- A verified OpenAI publisher identity for EigenPal, Inc.
- A public HTTPS host for the server, for example `https://mcp.docx-editor.dev`.
- The privacy policy, terms of use, and support page published at the URLs in
  `.codex-plugin/plugin.json` (drafts: [privacy.md](privacy.md),
  [terms.md](terms.md)). Get legal review first. The support page can list
  the support email address.
- A demo video, uploaded to a public HTTPS URL.
- Legal review of [LICENSE-PLUGIN.md](../../LICENSE-PLUGIN.md).

## Deploy and verify the domain

1. Run the server on any Node.js 22 host behind HTTPS. It keeps no state, so
   you can run any number of instances:

   ```bash
   npx -y @docx-editor.dev/mcp-app http --port "$PORT"
   ```

2. In the submission portal, copy the domain-verification token. Set it as
   `OPENAI_APPS_CHALLENGE` on the server. The server then answers
   `GET /.well-known/openai-apps-challenge` with the token as plain text.

## Build the package

```bash
bun run build
MCP_URL=https://mcp.docx-editor.dev/mcp DEMO_URL=https://... bun run build:directory
```

The build fails without `DEMO_URL`. To check the package before you record the
demo, add `-- --draft`.

Upload `dist/directory-plugin/`. It holds `plugin.json` (with the listing and
the review block), `mcp.json`, the `docx-editor` skill, the icons, and
`LICENSE`. It carries no engine code, so it is licensed under Apache-2.0.

## Content security policy

The widget fetches nothing: it is one inline document, and it reads its
WebAssembly and documents through MCP. The server declares no connect or
resource domains.

## Tool annotations

| Tool             | Seen by                | `readOnlyHint` | `destructiveHint` | `openWorldHint` |
| ---------------- | ---------------------- | -------------- | ----------------- | --------------- |
| `open_document`  | Model                  | `true`         | `false`           | `false`         |
| `view_docx_file` | Host (file entrypoint) | `true`         | `false`           | `false`         |

The hosted server registers no other tools. It needs no authentication and no
reviewer credentials.

Neither tool writes. In the desktop file viewer, the user can type in the
document, and the viewer saves those edits through the host's file API
(`openai/resources/write`). The host controls that write.

## Test cases

[review.json](review.json) holds five positive and three negative cases.
The build adds them to `plugin.json`. Before you submit, run each case on the
hosted server in ChatGPT, and attach the files that the prompts name.

The file viewer (`view_docx_file`) works in the desktop apps only. On the web
and on mobile, a preview shows the document but does not follow a file.

## Demo video

Record one take of positive cases 1 to 3: open a `.docx` in the side panel,
ask for an edit, and show the highlighted update.
