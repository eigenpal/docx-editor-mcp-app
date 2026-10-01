# Security policy

## Supported version

We support the current `main` branch.
Deployments can run older versions, so confirm the deployed commit.

## Report a vulnerability

Report vulnerabilities through
[GitHub Security Advisories](https://github.com/eigenpal/docx-editor-mcp-app/security/advisories/new).
Do not open a public issue.

We aim to acknowledge your report within five business days.
We will share updates about the fix and disclosure schedule.

## Review the security boundaries

Start with these security boundaries.

### File paths

In local mode, `open_document` takes a file path from a tool call.
Untrusted document content or chat content can influence that path.

`src/server/documents.ts` is the boundary.
It opens only `.docx` files, checked on the resolved path, so a symlink cannot reach another file.
It caps the file size, refuses to write read-only files, and keeps the file's permissions on save.
The app never fetches from the network.

### Document content

A `.docx` file contains untrusted XML.
The sender controls its text, font names, and hyperlink targets.

The engine sanitizes content during parsing.
Do not insert document content into HTML strings.

Report OOXML parsing, layout, or serialization vulnerabilities to
[`eigenpal/docx-editor`](https://github.com/eigenpal/docx-editor/security/advisories/new).
