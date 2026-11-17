# Release and update DOCX Editor

Use [the release guide](../releases.md) for versioning, package preparation, publication, updates, and recovery.
Use [publication status](publication-status.md) for historical submission results.
Use [license scope](licensing.md) when you describe the source and bundled editor components.

## Prepare the candidate

1. Pin all editor packages to the same tested release.
2. Run `bun run release:version <version>` when you need a version above the current candidate.
3. Update `CHANGELOG.md` and run `bun install --lockfile-only`.
4. Run `bun run format` and review your changes.
5. Run `bun run release:verify`.
6. Run the official Claude validator listed in `README.md` in this folder.
7. Record clean host installation, file updates, manual edits, conflicts, and upgrade results.

Read the candidate version and editor pins from `package.json`.
Retest clicks and typing after file updates when you change the engine version.
A successful text refresh alone does not prove that pointer input works.

## Build the review artifacts

Use the **Release packages** workflow on the reviewed commit or version tag.
Supply a public demonstration URL when you have the recording.
The workflow runs package verification with Node.js 22 and validates the Claude manifest.
It uploads the `docx-editor-release` artifact.
A version tag publishes the GitHub release and promotes the Codex package to the `stable` branch.
A manual workflow run uploads artifacts without publishing a release.
Neither action submits a host listing.

Publishing the reviewed stable GitHub release promotes its Codex archive to the `stable` marketplace branch.
Keep the version, source commit, package checksums, host versions, and test results together.
Never replace assets for a published version.

For an untagged review build, use the source commit and package checksum as its identity.
`release.json` records `sourceCommit`, `sourceDirty`, and the matching version tag, or `null` when none matches.
Commit your source changes and build again before you share a package.
Confirm that `sourceDirty` is `false` and keep the exact ZIP that you tested.
Describe manual desktop checks as passed only after you observe their results.

## Update the host listings

Submit the new package through each host's publisher process.
OpenAI requires local-MCP submission access before its local ZIP upload.
Claude's extension directory uses the `.mcpb` submission route.
Disclose the proprietary Pro permission with the source and dependency licenses.

Directory approval and client update timing remain host decisions.
Do not promise automatic updates for direct `.mcpb` or personal Git marketplace installations.
Keep earlier releases available for recovery.
Use a higher patch version for a replacement release.
