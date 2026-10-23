# Prepare the official Claude listing

Use the desktop extension submission form linked from the official extension guide.
You submit a `.mcpb` for a local server.
You do not need a hosted MCP endpoint.

[Official extension guide](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

[Desktop extension submission form](https://clau.de/desktop-extention-submission)

## Current form requirements

The form primarily considers extensions with these properties:

- A public GitHub repository.
- An MIT license.
- A Node.js implementation.
- A manifest author field that points to a GitHub profile.

The form describes a selective directory and does not guarantee a response or inclusion.
It asks whether the submission updates an existing extension.
It also requests a contact name, contact email, short description, repository URL, and `.mcpb` attachment.
You must confirm your relationship to the product and accept the directory terms before submission.
Review the terms yourself before you agree.
The form links an older terms page that points to the current [Anthropic Software Directory Terms](https://support.claude.com/en/articles/13145338-anthropic-software-directory-terms).

## Current package status

- Legal owner: Eigenpal, Inc.
- Public publisher: Eigenpal.
- Primary contact email: docx-editor@eigenpal.com, confirmed by the owner.
- Primary contact name: awaiting owner confirmation.
- Product: docx-editor.
- Candidate version: `1.0.0`.
- Local server: Node.js over stdio.
- Author profile: https://github.com/eigenpal.
- GitHub repository: https://github.com/eigenpal/docx-editor-mcp-app.
- Repository visibility: public, verified on October 23, 2026.
- Source license: Apache-2.0.
- Bundled proprietary Pro permission: `LICENSE-PLUGIN.md`, limited to ChatGPT, Codex, and Claude.
- Open-source editor components retain their own Apache 2.0 terms.

The owner selected a public repository and Apache-2.0 for the MCP app source.
The form's MIT preference differs from the source license.
It does not establish approval for bundled Pro components.
Disclose both licenses and request confirmation if you retain them.
Do not describe the bundled package as MIT licensed.

## Description for the form

Preview and edit Word documents beside your Claude conversation.
Open local `.docx` files with pages, tables, images, comments, and tracked changes.
The preview follows file changes and saves manual edits.
The editor runs locally and needs no Eigenpal account or API key.

## Remaining work

1. Disclose the host-specific Pro permission in the submission.
2. Test the `.mcpb` in Claude Desktop, including local file access and an agent edit.
3. Publish the support, privacy, and terms pages after review.
4. Confirm the primary contact name.
5. Attach the final `.mcpb` and submit after reviewing the directory terms.

Keep screenshots and a short demonstration ready for reviewer follow-up.
The initial form does not include a dedicated demonstration URL field.
The initial form includes an optional feedback field where you can explain the license combination.

## License disclosure for the reviewer

The MCP app source uses Apache-2.0.
The package also includes the Apache 2.0 editor core and React adapter.
It bundles proprietary code from `@docx-editor.dev/pro` for comments and tracked changes.
Eigenpal grants separate permission for free personal and business use inside ChatGPT, Codex, and Claude.
This permission also covers directory distribution of the official plugin.
It does not permit extracting Pro code for another product or service.
The open-source licenses retain their independent commercial reuse rights.
The complete package does not use a single open-source license.
Please confirm whether the directory accepts this license combination.

See `LICENSE`, `LICENSE-PLUGIN.md`, and `THIRD_PARTY_NOTICES.md` in the attached package.

## Test the extension first

Open **Settings > Extensions > Advanced settings > Install Extension** in Claude Desktop.
Choose the candidate `.mcpb` from `dist/local-packages/`.
Use the three examples in `claude-install.md`.
Record the Claude version, operating system, plugin version, and results.
Test Windows before you claim Windows support.

Directory extensions update automatically by default, according to Claude's official extension guide.
Confirm the publisher update process during review.
Users of privately distributed `.mcpb` files install updates manually.
