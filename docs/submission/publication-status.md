# Prepare publication of version 1.0.0

Status checked on October 23, 2026.
Keep this record with the candidate packages until publication.

## Candidate

- Plugin version: `1.0.0`.
- Editor packages: `2.32.0`, pinned in `package.json` and `bun.lock`.
- Source repository: `https://github.com/eigenpal/docx-editor-mcp-app`.
- Repository visibility: public, with `main` as the default branch.
- Release preparation: merged through [pull request 11](https://github.com/eigenpal/docx-editor-mcp-app/pull/11).
- Published GitHub releases: none returned during the check.
- Source license: Apache-2.0.
- Pro permission: `LICENSE-PLUGIN.md`.
- Directory contact email: `docx-editor@eigenpal.com`, confirmed by the owner.

## Completed checks

Type checks, lint checks, and all 69 tests passed after the engine update.
The build, stdio smoke test, extracted package tests, and isolated upgrade test passed.
The installed Codex plugin matched the tested editor and WebAssembly files.
Its server passed a Node.js 22 launch check.

The test host used a 27-page document and two external file updates.
Clicks, typing, and saving worked after each update.
After restarting the desktop app, the owner repeated two file updates in the installed preview.
The owner confirmed that clicks and typing worked after both updates.
These results do not establish Claude installation, Windows support, or directory approval.

## Remaining publication work

1. Confirm the primary directory contact name.
2. Verify the published support, privacy, and terms pages at the manifest URLs.
3. Test the final `.mcpb` in Claude Desktop.
4. Record the demonstration and host versions with the candidate package checksums.
5. Create a draft `v1.0.0` release from the reviewed source commit.
6. Review the exact draft assets before publishing the GitHub release.
7. Submit the Claude extension with its complete license disclosure.
8. Obtain OpenAI local-MCP submission access before uploading its directory package.

The product, support, license, privacy, and terms pages are public under `/mcp-app`.
The production pages returned `200` on October 27, 2026.
Use the production URLs from `listing.md` in the final manifests.
Verify those URLs without authentication before submission.
Keep the support URL and policy URLs in the package synchronized with the published pages.

The review proposal fixture uses its clean synthetic version after the local document tests.
The plugin packages do not include review fixtures.

## Public source review

A fresh GitHub mirror contains 23 commits across the existing branches before release preparation.
The Gitleaks `8.30.1` scan found no secrets in that history.
The current release source scan also found no secrets.
The GitHub branches contain no generated package archives, old local sample documents, or private agent notes.
Local Codex snapshots contain extra test files, but normal branch pushes do not publish those snapshots.
Do not push local snapshot references with `git push --mirror`.

The source imports published engine packages instead of copying private engine implementation files.
The packages retain their original licenses and the separate Pro plugin permission.
GitHub's secret scan, lint, tests, and build passed before the merge into `main`.
The source publication preserves the existing Git history; no history replacement was necessary.
These checks reduce publication risk; they do not prove that an automated scan detects every possible secret.

## Host-specific requirements

Claude's live form primarily considers public GitHub repositories with MIT-licensed Node.js extensions.
Its form does not confirm that the bundled Pro permission is acceptable.
Use the explicit disclosure in `claude-submission.md`.
Review the directory terms before you accept them and submit.

OpenAI requires partner approval and organization allowlisting for local MCP submissions.
Use `openai-approval-request.md` to prepare that request.
Do not describe directory acceptance as complete until each host confirms it.

## References

- [OpenAI desktop-only submission](https://developers.openai.com/plugins/deploy/desktop-only)
- [Claude desktop extension route](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
- [Claude extension form](https://clau.de/desktop-extention-submission)
