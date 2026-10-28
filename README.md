<p align="center">
  <a href="https://www.docx-editor.dev/mcp-app">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/eigenpal/docx-editor-mcp-app/main/.github/assets/readme-logo-dark.svg" />
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/eigenpal/docx-editor-mcp-app/main/.github/assets/readme-logo-light.svg" />
      <img src="https://raw.githubusercontent.com/eigenpal/docx-editor-mcp-app/main/.github/assets/readme-logo-light.svg" alt="DOCX Editor by EigenPal" width="320" height="90" />
    </picture>
  </a>
</p>

A live, Word-faithful preview of the `.docx` files your agent edits, in
ChatGPT, Codex, and Claude.

Your agent edits the file with its own document tools. The preview follows
each change and highlights changed paragraphs. You can also edit in the
preview and save to the same file.

![DOCX Editor preview with formatting controls and a sample document](https://raw.githubusercontent.com/eigenpal/docx-editor-mcp-app/main/docs/images/editor-preview.jpg)

## Install

Download the package for your host from the
[latest release](https://github.com/eigenpal/docx-editor-mcp-app/releases/latest).
You do not need an account or an API key.

- **Codex and ChatGPT desktop:** add the `stable` marketplace, then install
  the plugin:

  ```bash
  codex plugin marketplace add https://github.com/eigenpal/docx-editor-mcp-app.git --ref stable
  codex plugin add docx-editor@docx-editor
  ```

- **Claude Desktop:** download `docx-editor-claude-<version>.mcpb`. Go to
  **Settings > Extensions > Advanced settings > Install Extension**, and
  select the file.

Start a new desktop session after you install. For updates and directory
listings, see [Install and update docx-editor](docs/releases.md).

## Use

1. Ask your agent to show a file, for example: "Open ~/report.docx."
2. Select **Open editor** to see the full editor.
3. Ask for a change, for example: "Shorten the executive summary." The
   preview updates when the file changes.

If the file and your unsaved edits both change, the preview asks which
version to keep.

## How it works

The model gets one tool, `open_document`. Your desktop host starts a small
local server, and the editor runs inside the host. The plugin does not send
your documents to Eigenpal servers. To run the server as a remote MCP
endpoint instead, see [Choose local or hosted deployment](docs/hosting.md).

## Learn more

- [Troubleshoot docx-editor](docs/troubleshooting.md)
- [Contributing](CONTRIBUTING.md), including source builds
- [Local directory submissions](docs/submission/README.md)
- [Security policy](SECURITY.md)
- [Support](https://www.docx-editor.dev/mcp-app/support),
  [privacy policy](https://www.docx-editor.dev/mcp-app/privacy), and
  [terms of use](https://www.docx-editor.dev/mcp-app/terms)
- [DOCX Editor library](https://www.docx-editor.dev/), the engine behind
  this plugin

## License

The plugin source uses [Apache-2.0](LICENSE). The bundled Pro components
are proprietary. [LICENSE-PLUGIN.md](LICENSE-PLUGIN.md) lets you use them
free in the official plugin, including for business documents. To use Pro
features in your own product, see
[commercial licensing](https://www.docx-editor.dev/commercial-license).
