# Changelog

## 2.33.0

- Use the editor version as the plugin version. This release keeps the editor packages at `2.33.0`.
- Open a file in every server process of the host. Claude Desktop can send the open and the preview's reads to different processes, for example between a chat and Cowork.
- Sign document tokens with a per-user key, so a token still opens its file after a restart.

## 1.0.1

- Send replies from the button and Enter key inside restricted host frames.
- Save comment replies and tracked-change replies without native form submission.
- Keep the editor packages pinned to `2.33.0`.

## 1.0.0

- Pin the editor packages to `2.33.0`, including the file refresh fixes and current rendering improvements.
- Add a release update notice with no package replacement during document editing.
- Build versioned ChatGPT, Codex marketplace, Claude, and npm packages from one release.
- Publish release artifacts through a draft GitHub release and promote the stable marketplace after publication.
- License the MCP app source under Apache-2.0 and define the bundled Pro permission for ChatGPT, Codex, and Claude.
- Show full active comments and keep nested menus inside the window.

## 0.1.2

- Pin the editor packages to the latest verified release, `2.31.0`.
- Add commands to check editor updates and change both plugin versions.
- Record editor versions in packages and reject outdated editor builds.
- Add release checks, a package workflow, and official listing preparation files.

## 0.1.1

- Build local ChatGPT plugin ZIP and Claude `.mcpb` submission packages.
- Include the server, editor assets, WebAssembly file, icons, and license notices in both packages.
- Test extracted packages without repository dependencies.
- Use a plain heading for changes and comments.
- Keep comment badges in the right panel when that panel is open.

## 0.1.0

- A Word-faithful `.docx` preview for ChatGPT, Codex, and Claude, shipped as
  the npm package `@docx-editor.dev/mcp-app`.
- The preview follows the file: when the agent changes it with its own
  document tools, the preview updates in place and highlights the changed
  paragraphs. Your edits in the preview save back to the file.
- ChatGPT and Codex desktop open `.docx` files in the preview's file viewer.
- `docx-editor-mcp-app setup codex` (macOS and Linux) and `setup claude` install
  the app into the desktop apps.
