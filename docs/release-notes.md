# docx-editor 1.0.0

Preview and edit Word documents inside ChatGPT, Codex, and Claude Desktop.
The plugin follows local file changes and preserves unsaved work during file conflicts.
This release shows full active comments and keeps nested menus inside the window.
Engine `2.32.0` keeps clicks and typing available after file updates.

## Install

Use **Install** on the approved host directory listing when available.
OpenAI local listings require partner approval.
Claude extensions require directory approval.
This release does not claim those approvals.

For Claude testing, download the `.mcpb` asset and install it through **Settings > Extensions > Advanced settings**.
For Codex testing, extract the Codex ZIP and register its directory as a local marketplace.
After stable marketplace promotion, use the Git installation instructions in [the release guide](https://github.com/eigenpal/docx-editor-mcp-app/blob/main/docs/releases.md).
The ChatGPT ZIP is the OpenAI local-directory submission package.
The npm tarball supports developer installation.

## Updates

Use your host's directory update process when available.
Otherwise, the preview shows a newer stable release with **Get update** and **Later** actions.
The check sends no documents or file paths.
It never replaces a running editor.

## Licenses

The MCP app source uses Apache-2.0.
The bundled Pro components permit plugin use inside ChatGPT, Codex, and Claude.
Reusing those Pro components in another product requires a separate EigenPal Pro License.
Open-source dependencies retain their own licenses.
The Apache 2.0 editor components remain available for commercial embedding under their own licenses.
The complete bundled package does not use a single open-source license.
