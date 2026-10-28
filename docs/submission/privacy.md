# docx-editor privacy policy

Effective date: October 23, 2026

Eigenpal, Inc. provides the docx-editor local plugin for ChatGPT, Codex, and Claude Desktop.
This policy describes the local plugin.
It does not cover a separately deployed HTTP server.

## Documents and local files

Your desktop host starts the plugin's MCP server on your computer.
You or your agent select documents for the preview.
The server reads local files you open and saves your preview edits to those files.
The viewer processes document contents inside your desktop host.
The package includes its editor assets and WebAssembly file.
It does not load an editor from an Eigenpal website.

The plugin does not send your documents to Eigenpal servers.
Your desktop host and model provider can process document contents under their own policies.
Local installation does not change those policies.

## Local settings

The viewer stores your suggestion author name in the host's local storage.
It uses this name for comments and tracked changes.
The server creates one random signing key in your user state folder.
It uses the key to sign the token for each document you open, so each plugin process on your computer can find that document.
A token contains the file path. The key contains no document data.
It does not create an Eigenpal account for you.
The local plugin includes no analytics service.
Your host can keep its own diagnostic logs.

## Update checks

The local server requests public release metadata from GitHub to identify newer stable plugin versions.
GitHub receives your IP address and the installed plugin version through the request.
The request includes no document text, document names, local file paths, or account credentials.
The running server caches success and failure results for 24 hours.
The plugin does not download or run replacement code.
Set `DOCX_EDITOR_UPDATE_CHECK=0` in the server environment to disable these checks.
A failed or disabled check does not stop document editing.

## Support and websites

If you email support, you choose which information to send.
Do not send private documents unless you intend to share them with support.
Our website and directory providers can process information under their own policies.
This package does not include an automatic document upload to support.

## Your choices

Close the preview or disable the plugin in your desktop host.
Uninstall the plugin through the host's settings.
Your saved documents remain under your control.
Ask your host provider how to remove its stored conversations and local application data.

## Contact

Email docx-editor@eigenpal.com with questions or requests.
