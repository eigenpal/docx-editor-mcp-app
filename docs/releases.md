# Install and update docx-editor

Download packages from the
[latest release](https://github.com/eigenpal/docx-editor-mcp-app/releases/latest).
Each release includes the Claude extension, the ChatGPT ZIP, the Codex
marketplace ZIP, an npm tarball, and SHA-256 checksums. You do not need an
account or an API key.

## Install in Claude Desktop

1. Download `docx-editor-claude-<version>.mcpb`.
2. Open the file, and then select **Install**.

If no dialog opens, drag the file into the Claude Desktop window. You can also
go to **Settings > Extensions > Advanced settings > Install Extension**, and
select the file.

## Install in ChatGPT and Codex

1. Run this command with the
   [Codex CLI](https://learn.chatgpt.com/docs/codex/cli):

   ```bash
   codex plugin marketplace add eigenpal/docx-editor-mcp-app@stable && codex plugin add docx-editor@docx-editor
   ```

2. Restart the app. One installation serves ChatGPT and Codex.

The `stable` branch holds the built package of the latest published release.

## Update

The plugin tells you when a new version is available. Select **Get update** to
open the release, or **Later** to hide the notice.

- **Claude Desktop:** install the new `.mcpb` file.
- **ChatGPT and Codex:** run this command, and then restart the app:

  ```bash
  codex plugin marketplace upgrade && codex plugin add docx-editor@docx-editor
  ```

Finish your running tasks before you restart. Directory installations update
through the host.

### Update checks

To find a newer version, the local server reads GitHub's latest public release
when a preview connects. GitHub receives your IP address and the plugin
version. The request includes no document content, file names, paths, or
credentials. The server caches each result for 24 hours, and a failed check
does not block the document. The plugin never downloads or runs new code.

To turn off update checks, set `DOCX_EDITOR_UPDATE_CHECK=0` in the server
environment.

## Version policy

The plugin follows the docx-editor unified release. Plugin `2.34.0` bundles
editor `2.34.0`, and the package, manifests, tag, and archives all use that
version.

- Add plugin changes under `## Unreleased` in `CHANGELOG.md`. The next editor
  release ships them.
- To ship a plugin-only fix sooner, add a patch changeset in
  `eigenpal/docx-editor`. The editor patch release then releases the plugin.
- Pin the editor packages to the exact version, with its matching WebAssembly
  file.
- Never replace the assets of a published version, and never move a tag.
- For an urgent regression, release the next editor patch with the previous
  working implementation.

## Publish a release

Each docx-editor release sends an `upstream-release` dispatch to this
repository. `.github/workflows/sync-release.yml` then does steps 1 to 3:

1. It runs `bun run release:version <version>`. This pins the editor packages,
   sets the plugin version, and turns `## Unreleased` into the release heading.
2. It opens a pull request and merges it after `lint`, `test`, `build`, and
   `history` pass. If a check fails, the pull request stays open, and `main`
   does not change.
3. It tags `v<version>`. The tag builds the packages into a draft release.

A person does the rest:

4. Inspect the draft release and its package checks.
5. Record the host acceptance results.
6. Publish the release. Publishing promotes the Codex package to the `stable`
   branch.
7. Submit the same packages for directory review. For more information, see
   [Local directory submissions](submission/README.md).

If a check fails, fix the problem on `main`. Then run the **Sync library
release** workflow with the same `version`. Use the same workflow to release
by hand.
