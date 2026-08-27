# Security Policy

## Supported Versions

`main` is the supported version. This app is deployed as a connector, so the
version that matters is the one running.

## Reporting a Vulnerability

Report vulnerabilities privately via
[GitHub Security Advisories](https://github.com/eigenpal/docx-editor-mcp-app/security/advisories/new).
Please do not open a public issue.

We aim to acknowledge reports within 5 business days and will keep you updated on
the fix and disclosure timeline.

## What to look at first

Two boundaries carry most of the risk in this repository.

**`src/server/fetch-proxy.ts`.** The URL it fetches arrives from a tool call, and
a document, a web page or a chat message can steer that call. A proxy that
fetches whatever it is handed is an SSRF gadget pointed at whatever the server
can reach that the caller cannot. Scheme, resolved address, redirect and size are
all checked before any body is read.

**Anything that renders `.docx` content.** A `.docx` is a zip of XML the sender
fully controls — font names, hyperlink targets, run text. The engine sanitizes at
its own parse boundary; this repository must not route that content into an
HTML-from-strings sink.

Engine-level vulnerabilities (OOXML parsing, layout, serialization) belong to
[`eigenpal/docx-editor`](https://github.com/eigenpal/docx-editor/security/advisories/new).
