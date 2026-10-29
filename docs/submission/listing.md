# Directory listing copy

Use this copy in both directory submissions.
Match the publisher name to your verified identity.
Confirm the supported platforms after the desktop tests.

## Product and policy links

Use the production URLs in both submissions.
Keep preview URLs out of the release manifests.

| Purpose | URL                                         |
| ------- | ------------------------------------------- |
| Product | https://www.docx-editor.dev/mcp-app         |
| Support | https://www.docx-editor.dev/mcp-app/support |
| Privacy | https://www.docx-editor.dev/mcp-app/privacy |
| Terms   | https://www.docx-editor.dev/mcp-app/terms   |
| License | https://www.docx-editor.dev/mcp-app/license |

Verify these pages before you submit the final package for review.
Check each URL without a publisher account.

## Name

DOCX Editor

## Short description

Preview and edit Word documents beside your conversation.

## Description

Open a `.docx` and see its pages, tables, images, comments, and tracked changes beside your conversation.
Ask your assistant to change the document with its document tools.
The preview updates when the local file changes and highlights changed paragraphs.
You can also edit in the preview and save to the same file.

The editor and server run on your computer.
The package includes the editor assets and needs no Eigenpal account or API key.
The plugin does not send your documents to Eigenpal servers.
Your assistant provider processes content under its own policies.

The plugin previews `.docx` files up to 7 MB.
It does not convert PDFs or open legacy `.doc` files.
The assistant needs its own document tools to make changes from a prompt.

## Suggested prompts

- Open my report.docx in DOCX Editor.
- Shorten the summary in my proposal.docx and show the result.
- Show the comments and tracked changes in my contract.docx.

## OpenAI installation

After approval, install DOCX Editor from the desktop Plugin Directory.
Use a local conversation to open documents on your computer.
You can also open a `.docx` through the host's file viewer where available.

## Claude installation

After approval, install DOCX Editor from Claude Desktop's extension directory.
Ask Claude to open a local `.docx` and provide its absolute path.
Expand the preview to edit the document.

## Support page draft

Publish the following information at the manifest's support URL.

Contact docx-editor@eigenpal.com for help.
Include your operating system, desktop app version, plugin version, and the steps that caused the problem.
Send a synthetic example when a document causes the problem.
Do not send private documents or account credentials.

If the preview does not open, confirm that the plugin is enabled and the file uses the `.docx` format.
Confirm that the file is no larger than 7 MB.
Close and reopen the desktop app if installation requires a restart.

If the file changes during your edits, choose which version to keep in the preview.
If the assistant cannot edit the file, check that its document tools have access to the file.
The plugin provides the preview; the assistant uses its own document tools.
