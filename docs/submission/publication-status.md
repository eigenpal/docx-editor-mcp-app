# Publication of version 1.0.0

Publication availability checked on October 28, 2026.
The candidate includes the October 27 MCP main changes and editor `2.33.0`.
Use the published release assets for directory submissions.

## Release

- Plugin version: `1.0.0`.
- Editor packages: `2.33.0`, pinned in `package.json` and `bun.lock`.
- Source repository: `https://github.com/eigenpal/docx-editor-mcp-app`.
- Repository visibility: public, with `main` as the default branch.
- Release preparation: merged through [pull request 11](https://github.com/eigenpal/docx-editor-mcp-app/pull/11).
- Published release: [v1.0.0](https://github.com/eigenpal/docx-editor-mcp-app/releases/tag/v1.0.0), October 28, 2026.
- Release source: `d69c26533ad38e85da82b3426b80ed3d5182fe2a`.
- Editor update: [pull request 16](https://github.com/eigenpal/docx-editor-mcp-app/pull/16), merged.
- Stable marketplace branch: promoted from the published Codex package.
- npm registry publication: incomplete; this computer has no npm login.
- Installable npm archive: available in the GitHub release.
- Source license: Apache-2.0.
- Pro permission: `LICENSE-PLUGIN.md`.
- Directory contact name: Jedrzej Blaszyk, confirmed by the owner.
- Directory contact email: `docx-editor@eigenpal.com`, confirmed by the owner.

## Completed checks

Type checks, lint checks, and all 69 tests passed with editor `2.33.0`.
The build, stdio smoke test, extracted package tests, and isolated upgrade test passed.
Both extracted desktop packages passed runtime checks with Node.js `22.23.3`.
The official Claude manifest validator passed.

The `2.33.0` browser harness passed two external file updates, pointer input, typing, and autosave.
Both typed changes survived the later file update.
The harness used the synthetic proposal fixture and reported no page errors.

The earlier `2.32.0` test used a 27-page document and two external file updates.
Clicks, typing, and saving worked after each update.
The owner also confirmed two file updates in the installed preview after restarting the desktop app.
These earlier installed-plugin checks do not verify the installed `2.33.0` candidate.
The harness checks do not establish Claude installation, Windows support, or directory approval.

## Directory submission status

Claude recorded the submission on October 28, 2026.
The owner approved acceptance of Anthropic's directory terms before submission.
The form uses the Eigenpal Google account and names Jedrzej Blaszyk as the primary contact.
The submission discloses Apache-2.0 source and the separate proprietary Pro permission.
Claude has not confirmed directory acceptance.

Submitted file: `docx-editor-claude-1.0.0.mcpb` from the published release.
SHA-256: `43ad2c4e271300069be358622f9f686841d05a8f65069ca9fba93d3b62f4c804`.

OpenAI accepted the released `docx-editor-chatgpt-1.0.0.zip` as a draft upload.
The portal shows **Needs attention** and **Not published**.
Its blocking finding requires an OpenAI representative for command-line MCP submissions.
The portal shows the local MCP configuration as **Unavailable**.
The draft has not entered review.
Do not remove the local server to bypass this requirement.

## Remaining work

1. Obtain OpenAI approval for local MCP submission access.
2. Record a demonstration and add its accessible URL to the OpenAI review material.
3. Test the released `.mcpb` in Claude Desktop and record the host version.
4. Complete OpenAI review submission after the blocking finding clears.
5. Sign in to npm before publishing the registry package, if required.
6. Track reviewer responses and confirm the license combination with Claude.

The product, support, license, privacy, and terms pages are public under `/mcp-app`.
The product, support, privacy, and terms pages returned `200` on October 28, 2026.
The canonical license page at `/mcp-app/license` also returned `200`.
The older `/mcp-app/licence` URL redirects to that page.
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
