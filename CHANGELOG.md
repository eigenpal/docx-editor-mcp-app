# Changelog

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
