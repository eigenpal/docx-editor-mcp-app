# Install and update docx-editor

## Publication status

See [publication status](https://github.com/eigenpal/docx-editor-mcp-app/blob/main/docs/submission/publication-status.md) for candidate checks and remaining work.
See [license scope](https://github.com/eigenpal/docx-editor-mcp-app/blob/main/docs/submission/licensing.md) for the source, editor, and Pro permissions.

Download packages from the [stable release page](https://github.com/eigenpal/docx-editor-mcp-app/releases/latest).
Use the Codex marketplace or install the downloaded Claude extension as described below.
For developer installation, install the npm tarball from the same release with `npm install -g <tarball>`.
GitHub distribution does not require npm registry publication or directory approval.
You can also use the [source setup instructions](../CONTRIBUTING.md#set-up-the-project).

Use a complete local package with the editor included.
Use native directory updates when the host provides them.
Use the plugin's update notice when the host does not update it automatically.
Do not replace files or restart an editor while a document is open.

The public source repository is https://github.com/eigenpal/docx-editor-mcp-app.
The stable release page is https://github.com/eigenpal/docx-editor-mcp-app/releases/latest.
The MCP app source uses Apache-2.0.
The proprietary bundled Pro components have the host permission in `LICENSE-PLUGIN.md`.
Open-source dependencies retain their own licenses.

## Install in ChatGPT or Codex

After OpenAI approves the public desktop listing, select **Install** on its plugin page.
The desktop directory supplies the local package.
Use the same plugin in locally executed ChatGPT and Codex chats.
You do not need an Eigenpal account or an API key.

OpenAI limits public local-MCP submissions to approved partners.
A GitHub release cannot bypass that approval.
A universal one-click public listing is therefore a distribution approval, not a feature the package can create.

After the first stable release, use the public Git marketplace with Codex CLI:

```bash
codex plugin marketplace add eigenpal/docx-editor-mcp-app@stable
codex plugin add docx-editor@docx-editor
```

Start a new desktop session after installation.
The `stable` branch contains built packages, not source that you must compile.
The release workflow creates that branch after the first release publication.

The install link `codex://plugins/install/docx-editor?marketplace=docx-editor` works after you register that marketplace.
It does not register an unknown marketplace.
Do not advertise that link as a first-install button for unknown users.

## Install in Claude Desktop

After Anthropic approves the extension, select **Install** in its desktop extension directory.
Claude supplies the local Node.js runtime.
Directory extensions update automatically by default.

After the first release, download `docx-editor-claude-<version>.mcpb` from the stable release page.
Open **Settings > Extensions > Advanced settings > Install Extension** and select that file.
This fallback has additional steps and does not provide directory automatic updates.
Use the desktop extension submission route, not the remote connector submission route.

## Receive updates

Claude directory installations use the host's automatic update mechanism.
GitHub-managed OpenAI workspaces synchronize their marketplaces daily.
Do not assume that behavior for personal desktop Git installations.

Version 1.0.0 includes a host-independent fallback notice.
The local MCP server checks GitHub's latest public release metadata when a preview connects.
Each running server caches success and failure results for 24 hours.
The check has a three-second timeout and does not block document loading.
Only a newer stable version produces a notice.
Select **Get update** to open that release's installation instructions and packages.
Select **Later** to hide the notice for this preview.
Install the update through your original directory or package route, then start a new session if required.
The plugin never downloads executable updates or replaces its running package.

The request sends your IP address and the installed plugin version to GitHub.
It sends no document contents, document names, file paths, or account credentials.
Set `DOCX_EDITOR_UPDATE_CHECK=0` in the server environment to disable these requests.
The interface reads update status through MCP and declares no additional network domains.

## Version and recovery policy

The plugin follows the docx-editor unified release.
Its version is the editor version: plugin `2.34.0` bundles editor `2.34.0`.
The package, host manifests, release tag, and archives all use that version.

- Add plugin changes to `main` under `## Unreleased` in `CHANGELOG.md`.
  The next editor release ships them.
- To ship a plugin-only fix sooner, add a patch changeset in `eigenpal/docx-editor`.
  The editor patch release then releases the plugin too.
- Never replace assets for an existing published version.
- Keep the previous release available for manual recovery.
- For an urgent regression, release the next editor patch with the previous working implementation.
- Do not move a stable tag or silently downgrade a user's files.

## Publish a release

Each docx-editor release sends an `upstream-release` dispatch to this repository.
`.github/workflows/sync-release.yml` then does steps 1 to 3 without a person:

1. It runs `bun run release:version <version>`.
   This pins the editor packages and sets the plugin version.
   It also turns `## Unreleased` into the release heading.
2. It opens a pull request, waits for its checks, and merges it only if they pass.
   A failed check leaves the pull request open, and `main` does not change.
3. It pushes the `v<version>` tag, which builds the packages into a draft release.

A person does the rest:

4. Inspect the draft GitHub release and its package checks.
5. Record the manual host acceptance results.
6. Publish the draft release.
   Publishing promotes the exact Codex archive to the `stable` marketplace branch.
7. Submit the same built packages to the host directories through their review routes.

To release by hand, run the **Sync library release** workflow with a `version`.
The workflow does not upload a directory submission or invent a directory listing URL.
Directory review and account eligibility remain controlled by OpenAI and Anthropic.
The release includes ChatGPT ZIP, Codex marketplace ZIP, Claude MCPB, npm tarball, and SHA-256 checksums.

## Verification scope

The package checks run the bundled servers outside the repository without development dependencies.
The upgrade check installs an older test version and refreshes it to the release version in an isolated Codex profile.
Update-notice tests cover numeric versions, caching, concurrent requests, malformed data, oversized responses, and offline use.
These checks do not claim directory approval or unattended updates on a host that does not document them.

## Sources checked on October 23 2026

- [OpenAI desktop-only publication](https://developers.openai.com/plugins/deploy/desktop-only)
- [OpenAI Git marketplace packaging](https://developers.openai.com/plugins/build/plugins)
- [OpenAI install deep links](https://learn.chatgpt.com/docs/reference/commands)
- [OpenAI workspace synchronization](https://learn.chatgpt.com/docs/enterprise/plugin-management)
- [Claude desktop installation and update behavior](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
