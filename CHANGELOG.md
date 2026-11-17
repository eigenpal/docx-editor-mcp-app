# Changelog

## Unreleased

- Describe conditional saves and explicit `ifMatch: null` overwrites in the tool description and schema.
- Clarify the save and refresh limits of previews opened with document bytes.
- Check the bytes returned by a file read, including files that grow during the read.
- Display binary file limits in MiB.
- Record the source commit and matching tag in review metadata, and identify uncommitted changes.
- Update the submission guide to match the current release workflow.

## 2.38.0

- Update the editor packages to `2.38.0`.
- In ChatGPT and Codex desktop, open a file by path in the host's file viewer. The host reads and writes the file, so files over 7 MB open, follow agent edits, and save.
- Show every `.docx` that the agent creates or changes, without a request from the user.
- Keep a live page thumbnail in the chat card. Its **Open** button opens the side panel, also on older cards.
- Refuse to send a file that grew past 7 MB after it opened. Before, the server sent it, and the host closed the connection.

## 2.37.0

- Update the editor packages to `2.37.0`.

## 2.35.0

- Update the editor packages to `2.35.0`.

## 2.34.0

- Update the editor packages to `2.34.0`.

## 2.33.0

- Use the editor version as the plugin version. This release keeps the editor packages at `2.33.0`.
- Open a file in every server process of the host. Claude Desktop can send the open and the preview's reads to different processes, for example between a chat and Cowork.
- Sign document tokens with a per-user key, so a token still opens its file after a restart.
- Name the file viewer DOCX Editor in ChatGPT and Codex, and say how to make it the default `.docx` viewer.
- Show comment badges beside the page when the editor opens from the inline card. Before, they stayed at the editor's right edge until the first click on a comment or a tracked change.

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
