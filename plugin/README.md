# DOCX Editor for ChatGPT desktop

Install this plugin through the desktop plugin directory after OpenAI approves the listing.
You need no account or API key for DOCX Editor.
Your desktop host starts the bundled MCP server over stdio.
The server uses Node.js 22 or later.
The package includes all server dependencies and editor assets.
You do not run an HTTP server or install npm packages.

## Open a document

Ask your agent to open a local `.docx` file in DOCX Editor.
Use an absolute file path.
Select **Open editor** to expand the preview.
You can also open a `.docx` through the host's file viewer when available.

Your agent edits the document with its own document tools.
The preview follows the file and highlights changed paragraphs.
Your edits in the preview save to the same file.
If both versions change, choose which version to keep.

## Data and access

The server reads files you open and saves edits to those files.
The viewer loads its editor and WebAssembly assets through MCP.
The plugin does not send documents to Eigenpal servers.
Your host and model provider process data under their own policies.

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
