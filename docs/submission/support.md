# Support for the DOCX Editor plugin

Use DOCX Editor to preview and edit `.docx` files in ChatGPT, Codex, and Claude Desktop.
Your assistant uses its own document tools for changes that you request in the conversation.

## Contact support

Email docx-editor@eigenpal.com for help.
Include your operating system, desktop app version, plugin version, and the steps that caused the problem.
Use a synthetic example when you report a document problem.
Do not send private documents, account credentials, or API keys.

## Open a document

Confirm that the plugin is enabled and the file uses the `.docx` format.
The plugin accepts files up to 7 MB.
In Claude, provide the absolute path to the local file.
The plugin does not open legacy `.doc` files or convert PDFs.

## Check file updates

Keep the preview open when your assistant changes the file.
The same preview updates and highlights changed paragraphs.
You can click and type after the update.
Your edits save to the same file when it permits writes.
If a newer file conflicts with unsaved edits, choose which version to keep in the preview.

## Update the plugin

Use your host's directory update process when available.
For a direct installation, install the new package from the [official release page](https://github.com/eigenpal/docx-editor-mcp-app/releases).
Restart your desktop app after your running tasks finish if the installation requires it.
An engine update does not update your installed plugin until you install a plugin release containing that engine.

## Licenses and privacy

The MCP app source uses Apache-2.0.
The Apache 2.0 editor components retain their own commercial reuse rights.
The official plugin includes separate permission for its bundled proprietary Pro code.
That permission covers use in ChatGPT, Codex, and Claude, including business documents.
It does not permit extracting Pro code for another product or service.

Read the [plugin privacy policy](https://www.docx-editor.dev/mcp-app/privacy) and [terms of use](https://www.docx-editor.dev/mcp-app/terms) before installation.
The plugin does not send your documents to Eigenpal servers.
Your host and model provider can process document data under their own policies.
