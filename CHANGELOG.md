# Changelog

## 2.41.1

- Update the editor packages to `2.41.1`.

## 2.41.0

- Update the editor packages to `2.41.0`.

## 2.40.0

- Update the editor packages to `2.40.0`.
- Keep a save by another program that lands at any moment during a preview save. Before, an edit between the last version check and the file replacement was overwritten.
- Use the SHA-256 of the file contents as the etag. A `saved` result carries the hash of the bytes written, so a later edit never passes for the saved version.
- Report a conflict, and keep the other version on disk, when the file changes during a save.
- Refuse to save to a disk without hard links.
- Keep the document when a step of a save fails. Before, one sequence removed the file that the save had moved aside.
- Refuse to open a file that is named `.docx` but does not start as one, for example a hard link to another file.
- Remove line breaks and direction overrides from file names in tool results.
- Give one answer for a path that is not a `.docx`, whether the file is there or not.
- Send the token that reads and saves a file to the preview only. The model no longer receives it, so it cannot call the save tool in a host that ignores tool visibility.
- Name the copy that an interrupted save left, in `open_document` too.
- Leave a Claude Desktop configuration unchanged when `setup claude` does not understand it, and write the new one in one step.
- Put the new file at the path only when the save moved the file that it checked. Before, a second server could read the new bytes there, save over them, and lose that save to a rollback.
- Answer with an error, and keep running, when the hosted server cannot start for a request.
- Test the built package against another program at each step of a save, and against a stop of the server at each step.

## 2.39.0

- Update the editor packages to `2.39.0`.
- Require the etag of the replaced version for every `write_local_file` save. There is no unconditional save.
- Detect same-size file edits that restore the old modification time.
- Never read, version, or save through a symlink that replaces an opened file.
- Report a deleted file as deleted instead of failing.
- Check the version again just before a save replaces the file, and report a save that lands right after it as a conflict.
- Send each document with the etag of exactly the bytes read, not of a separate later check.
- Check the bytes returned by a file read, including files that grow during the read.
- Clarify the save and refresh limits of previews opened with document bytes.
- Remove references to paths from the hosted `open_document` description.
- Display binary file limits in MiB.
- Hide the font substitution notice. The editor still shows substitute fonts.
- Record the source commit in each package, and refuse release metadata for a different or uncommitted build.
- Serve the preview at widget URIs from earlier builds. Codex desktop pins that URI for its preferred `.docx` viewer, so an update no longer shows "Couldn't display DOCX Editor".
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
