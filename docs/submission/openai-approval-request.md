# Request OpenAI local MCP submission approval

Use these details when you contact OpenAI about local MCP submission access.
Add your organization ID, verified publisher name, and contact details before sending.
This file does not send a message or request approval.

## Start without an OpenAI representative

OpenAI's public desktop-only instructions require partner approval through an OpenAI representative.
They do not provide a self-service application form for this approval.
OpenAI's review guide directs unanswered submission questions to OpenAI support.

Contact support and ask who handles local MCP partner eligibility for your organization.
This is a request for routing; support does not guarantee approval or a representative.
Include your organization ID, legal owner, public publisher name, product website, and a short demonstration when available.
Include a plugin ID only if the portal already provides one.
Do not send API keys or account credentials.

You can prepare your organization and complete business verification before this request.
Use the [plugin submission portal](https://platform.openai.com/plugins) when you have the required access.
The released ZIP is uploaded as a draft.
The portal blocks review until OpenAI approves command-line MCP submissions.
Do not submit it as an ordinary skills-only plugin to bypass the local MCP requirement.

See [OpenAI's submission support guidance](https://developers.openai.com/plugins/deploy/app-review#getting-help).

## Support request draft

We want to publish DOCX Editor under the public publisher name Eigenpal.
The legal owner is Eigenpal, Inc.
Our OpenAI organization ID is [add organization ID].

The plugin bundles a local stdio MCP server and an interactive Word document preview.
It needs local execution for file access and file synchronization.
We have no OpenAI representative.

Your desktop-only submission documentation requires approval for local MCP submissions.
Who handles eligibility and organization approval for companies without an existing OpenAI representative?
Please route this request to the relevant team and tell us what information they need.

Product: https://www.docx-editor.dev/mcp-app
Repository: https://github.com/eigenpal/docx-editor-mcp-app
Primary contact: Jedrzej Blaszyk
Contact: docx-editor@eigenpal.com

The MCP source and open-source editor components use Apache-2.0.
Bundled proprietary Pro components have separate permission for free personal and business use inside the official plugin.
That permission does not allow Pro reuse in other products or services.

## Product details

Product: DOCX Editor

Legal owner: Eigenpal, Inc.

Public publisher name: Eigenpal.

Match this name to the business identity approved by OpenAI.

Website: https://www.docx-editor.dev/mcp-app

Repository: https://github.com/eigenpal/docx-editor-mcp-app

Support: docx-editor@eigenpal.com

## Public review links

- Support: https://www.docx-editor.dev/mcp-app/support
- Privacy: https://www.docx-editor.dev/mcp-app/privacy
- Terms: https://www.docx-editor.dev/mcp-app/terms
- License: https://www.docx-editor.dev/mcp-app/license

The production pages are available without authentication.
Verify them again before final submission.

## Request

Please approve our organization for desktop-only plugin submissions with a bundled local MCP server.
We want customers to discover DOCX Editor in the public Plugin Directory before installation.

The package runs its MCP server locally over stdio.
It includes the editor, WebAssembly, server dependencies, icons, and license notices.
It exposes one model-facing tool, `open_document`.
The assistant edits documents with its existing document tools.
The preview follows local file changes and saves manual edits to the same file.

The plugin needs local execution for file access and file synchronization.
It does not require a public MCP endpoint or an Eigenpal account.
It does not send documents to Eigenpal servers.
The host and model provider still process data under their own policies.

## Confirm before submission

1. Confirm our organization's eligibility and approval for local MCP submissions.
2. Confirm the current ZIP upload route and required review material.
3. Confirm how the installed package receives Node.js 22 or later without customer setup.
4. Confirm support for the `view_docx_file` extension in approved directory packages.
5. Confirm how customers receive bundled local code updates.
6. Confirm update review, rollback controls, and supported desktop operating systems.

Use [OpenAI's desktop-only instructions](https://developers.openai.com/plugins/deploy/desktop-only) as the submission reference.
Do not submit until your representative confirms organization approval.
