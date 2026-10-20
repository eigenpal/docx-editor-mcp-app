# docx-editor for Claude Desktop

Install docx-editor from the desktop extension directory after Anthropic approves the listing.
For a local test, open **Settings > Extensions > Advanced settings > Install Extension**.
Select the `.mcpb` file.
Claude uses its Node.js runtime to start the bundled server.
You do not install npm packages or start an HTTP server.
You need no account or API key for docx-editor.

## Open a document

Ask Claude to open a local `.docx` file in docx-editor.
Give Claude the absolute file path.
Select **Open editor** to expand the preview.
Your agent edits the document with its own document tools.
The preview follows the file and highlights changed paragraphs.
Your edits in the preview save to the same file.
If both versions change, choose which version to keep.

The ChatGPT file viewer entrypoint is specific to OpenAI hosts.
Use `open_document` in Claude.

## Data and access

The server reads files you open and saves edits to those files.
The viewer loads its editor and WebAssembly assets through MCP.
The plugin does not send documents to Eigenpal servers.
Claude and its model provider process data under their own policies.

## Support

Visit https://www.docx-editor.dev/support or email docx-editor@eigenpal.com.
Read `LICENSE-PLUGIN.md` and `THIRD_PARTY_NOTICES.md` for bundled component terms.
