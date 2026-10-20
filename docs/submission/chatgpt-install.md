# docx-editor for ChatGPT desktop

Install this plugin through the desktop plugin directory after OpenAI approves the listing.
You need no account or API key for docx-editor.
Your desktop host starts the bundled MCP server over stdio.
The server uses Node.js 22 or later.
The package includes all server dependencies and editor assets.
You do not run an HTTP server or install npm packages.

## Open a document

Ask your agent to open a local `.docx` file in docx-editor.
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

## Support

Visit https://www.docx-editor.dev/support or email docx-editor@eigenpal.com.
Read `LICENSE-PLUGIN.md` and `THIRD_PARTY_NOTICES.md` for bundled component terms.
