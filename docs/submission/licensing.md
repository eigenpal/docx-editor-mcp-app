# Explain the plugin licenses

Use this scope when you describe or submit the plugin.
Keep the Pro permission and original dependency notices with each release.

| Component                           | License                                                     | Commercial reuse                                                                                   |
| ----------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| MCP app source                      | Apache-2.0 in `LICENSE`                                     | You may reuse it under Apache-2.0.                                                                 |
| Editor core and React adapter       | Apache 2.0                                                  | You may embed them in commercial products under Apache 2.0.                                        |
| Bundled `@docx-editor.dev/pro` code | Pro terms with additional permission in `LICENSE-PLUGIN.md` | You may use the official plugin in ChatGPT, Codex, and Claude without a separate Pro subscription. |
| Other dependencies                  | Individual licenses in `THIRD_PARTY_NOTICES.md`             | Follow each component's license.                                                                   |

The Pro permission does not allow extraction for another product, SDK, or hosted editor service.
That restriction covers Pro code, including Pro code inside combined bundles.
It does not cover the open-source editor or Apache-2.0-licensed MCP app source.
Your documents remain yours, including documents you use in products or services.

## Free plugin and commercial licensing

Eigenpal supplies the official plugin without a separate Pro subscription.
Official channels include npm, the Eigenpal GitHub repository, host directories, and downloads identified on the plugin website.
The permission controls conflicts with the Pro evaluation license, including termination and feedback assignment.
Compliant recipients retain their rights for received versions after policy changes or discontinued support.
Ordinary plugin feedback does not assign documents or unrelated intellectual property.

This permission includes business document use within ChatGPT, Codex, and Claude.
Customers need a separate license to embed the proprietary Pro components in another product.
The Apache-2.0 editor core remains available for commercial use under Apache-2.0.
Do not describe every commercial editor integration as requiring payment.

The plugin permission relies on Eigenpal's rights to the covered Pro code.
It does not replace licenses from other copyright owners.
Keep dependency notices and confirm contributor rights for code that you license separately.
The public repository alone cannot establish ownership of every contribution.

## Source builds and hosted services

You can change and redistribute the Apache-2.0 MCP app source.
The current build includes Pro components with separate terms.
The plugin permission covers limited internal source builds for personal and business use in ChatGPT, Codex, and Claude.
You may modify the Apache-2.0 source, but keep the covered Pro code unchanged.
Use a Pro version recorded in an official release and preserve all notices.
You may share these builds with employees and contractors for your organization's internal use.

Public distribution of modified builds containing Pro code requires separate permission.

The permission also excludes third-party hosted editor services.
Confirm the terms for any official hosted offering before launch.
See [local and hosted deployment](../hosting.md) for the technical differences.

## Directory disclosure

Describe the source repository as Apache-2.0 licensed.
Describe the complete package as a combination of licenses.
Do not claim that the complete package uses Apache-2.0 or that all editor embedding requires payment.
Keep the original dependency notices with every package.

The Claude submission form primarily considers MIT-licensed extensions.
Its form does not confirm acceptance of this combined package.
Use the disclosure in `claude-submission.md` and request a decision from the reviewer.
Do not remove the Pro notice to make the package appear MIT licensed.

## Earlier releases and source rights

Earlier recipients retain the rights supplied with their copies.
The Apache-2.0 source license does not withdraw earlier MIT or Apache-2.0 grants.
Do not replace dependency licenses or third-party copyright notices with the MCP app's Apache-2.0 license.

## References checked on October 23 2026

- [DOCX Editor pricing and component scope](https://www.docx-editor.dev/pricing)
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [Claude desktop extension submission form](https://clau.de/desktop-extention-submission)

The package's installed Pro evaluation license remains in `THIRD_PARTY_NOTICES.md`.
The additional permission names the plugin use that overrides its conflicting restrictions.
