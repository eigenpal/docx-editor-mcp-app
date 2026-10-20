# docx-editor privacy policy

> Draft for legal review. Publish at https://www.docx-editor.dev/privacy.

Effective date: _to be set_

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
The server keeps document tokens and file versions in process memory while it runs.
It does not create an Eigenpal account for you.
The local plugin includes no analytics service.
Your host can keep its own diagnostic logs.

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
