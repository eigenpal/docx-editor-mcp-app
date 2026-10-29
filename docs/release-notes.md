## Install

You do not need an account or an API key.

- **Claude Desktop:** download `docx-editor-claude-<version>.mcpb` from the
  assets, open it, and then select **Install**.
- **ChatGPT and Codex:** run this command with the Codex CLI, and then restart
  the app:

  ```bash
  codex plugin marketplace add eigenpal/docx-editor-mcp-app@stable && codex plugin add docx-editor@docx-editor
  ```

## Update

- **Claude Desktop:** install the new `.mcpb` file.
- **ChatGPT and Codex:** run this command, and then restart the app:

  ```bash
  codex plugin marketplace upgrade && codex plugin add docx-editor@docx-editor
  ```

For more information, see
[Install and update docx-editor](https://github.com/eigenpal/docx-editor-mcp-app/blob/main/docs/releases.md).

## License

The plugin source uses Apache-2.0. The bundled Pro components are free to use
in the official plugin, including for business documents. To reuse them in
another product, you need an EigenPal Pro License. For more information, see
`LICENSE-PLUGIN.md`.
