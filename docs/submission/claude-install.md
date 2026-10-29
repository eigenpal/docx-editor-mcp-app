# DOCX Editor for Claude Desktop

Install DOCX Editor from the desktop extension directory after Anthropic approves the listing.
For a local test, open **Settings > Extensions > Advanced settings > Install Extension**.
Select the `.mcpb` file.
Claude uses its Node.js runtime to start the bundled server.
You do not install npm packages or start an HTTP server.
You need no account or API key for DOCX Editor.

## Open a document

Ask Claude to open a local `.docx` file in DOCX Editor.
Give Claude the absolute file path.
Select **Open editor** to expand the preview.
Your agent edits the document with its own document tools.
The preview follows the file and highlights changed paragraphs.
Your edits in the preview save to the same file.
If both versions change, choose which version to keep.

The ChatGPT file viewer entrypoint is specific to OpenAI hosts.
Use `open_document` in Claude.

## Example prompts

Use absolute paths to copies of the synthetic review documents.

1. "Open /absolute/path/proposal.docx in DOCX Editor."
   Check the headings, table, and image in the expanded preview.
2. "Shorten the first paragraph of /absolute/path/proposal.docx and show the result."
   Claude needs document tools with local file access for this example.
   Check that the open preview updates after the file changes.
3. "Open /absolute/path/contract.docx and show its comments and tracked changes."
   Check the comment and tracked replacement in the review view.

## Data and access

The server reads files you open and saves edits to those files.
The viewer loads its editor and WebAssembly assets through MCP.
The plugin does not send documents to Eigenpal servers.
Claude and its model provider process data under their own policies.

## Updates

Use the host directory update process when available.
The preview shows **Get update** when it finds a newer stable release.
Select that button for release instructions and packages.
Select **Later** to continue your document work.
The check sends only release request information to GitHub, not your document or file path.
Set `DOCX_EDITOR_UPDATE_CHECK=0` in the server environment to disable it.
The server caches the result for 24 hours while it runs.
The plugin never replaces an open editor with downloaded code.
See `docs/releases.md` in this package for the complete release policy.

## Support

Visit https://www.docx-editor.dev/mcp-app/support or email docx-editor@eigenpal.com.
Read `LICENSE-PLUGIN.md` and `THIRD_PARTY_NOTICES.md` for bundled component terms.
