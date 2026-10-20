# Release and update docx-editor

You distribute a complete local package for each release.
You do not update installed files from an Eigenpal server.
The host manages installation and updates.
Keep the plugin name `docx-editor` for every release.

## Check the editor

Run `bun run engine:check` with npm registry access.
The command compares the declared, installed, and latest published versions of all three editor packages.
It fails if the packages need an update or use different release versions.

Run `bun run engine:update` to install the latest matching release.
This command updates `package.json` and `bun.lock` with exact versions.
Review the upstream changes before you release the plugin.
You must rebuild the editor and its matching `harfbuzz.wasm` together.
An engine publication alone does not update an installed plugin.

## Prepare a bug fix

1. Apply the fix or update the engine.
2. Run `bun run release:version 0.1.3` for the next patch release.
   Choose a higher version when `0.1.3` is already in use.
3. Run `bun install --lockfile-only` to update the root lockfile metadata.
4. Add the release notes to `CHANGELOG.md`.
5. Run `bun run format` and review the changes.
6. Run `DEMO_URL=https://your-domain.example/demo.mp4 bun run release:verify` with your actual recording URL.
7. Run the official Claude validator from `README.md` in this folder.
8. Test installation, document edits, file conflicts, and an upgrade from the previous release on each supported desktop host.

The version command updates `package.json` and `.codex-plugin/plugin.json` together.
Both generated host manifests use that version.
The server and editor also use the package version.
Never reuse a published version for changed bytes.

## Build review artifacts in GitHub

Run the **Release packages** workflow against the reviewed commit.
Supply the public demonstration URL.
Download the `official-listing-packages` artifact and keep its checksums with your release records.
The workflow checks the latest editor version and runs package verification with Node.js 22.
It validates the Claude manifest with `@anthropic-ai/mcpb@2.1.2`.
It does not publish to GitHub, npm, or either directory.
Record the commit, checksums, host versions, and desktop results before submission.

## Update the OpenAI listing

Upload the complete new ZIP to the existing plugin in the submission portal.
Complete the applicable checks and review, then publish the approved package version.
See [OpenAI's update instructions](https://developers.openai.com/plugins/deploy/submission).

The hosted MCP daily scan does not distribute our bundled local code.
Confirm installed-client update timing and rollback support with your OpenAI representative.
Do not promise immediate updates to existing installations.

## Update the Claude listing

Submit the new `.mcpb` through the directory's publisher update process.
Confirm that process with the reviewer during initial approval.
Claude supports directory extension updates, but its public guide does not specify every publisher step.
See [Claude's extension guide](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).

For directly distributed extensions, give users the new `.mcpb` for manual installation.
For custom team extensions, use **Upload new version** and keep the extension name unchanged.
See [Claude's team update instructions](https://support.claude.com/en/articles/12592343-enabling-and-using-the-desktop-extension-allowlist).

## Recover from a faulty release

Keep each approved archive and its checksum.
Disable publication of a faulty release through the host's available controls.
Prepare a higher patch version with the previous working code when the host does not support rollback.
Repeat verification and review before publication.
Do not replace an archive under an existing version.
