# Explain the plugin licenses

Use this scope when you describe or submit the plugin.
Keep the Pro permission and original dependency notices with each release.

| Component                           | License                                                     | Commercial reuse                                                                                   |
| ----------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| MCP app source                      | MIT in `LICENSE`                                            | You may reuse it under MIT.                                                                        |
| Editor core and React adapter       | Apache 2.0                                                  | You may embed them in commercial products under Apache 2.0.                                        |
| Bundled `@docx-editor.dev/pro` code | Pro terms with additional permission in `LICENSE-PLUGIN.md` | You may use the official plugin in ChatGPT, Codex, and Claude without a separate Pro subscription. |
| Other dependencies                  | Individual licenses in `THIRD_PARTY_NOTICES.md`             | Follow each component's license.                                                                   |

The Pro permission does not allow extraction for another product, SDK, or hosted editor service.
That restriction covers Pro code, including Pro code inside combined bundles.
It does not cover the open-source editor or MIT-licensed MCP app source.
Your documents remain yours, including documents you use in products or services.

## Directory disclosure

Describe the source repository as MIT licensed.
Describe the complete package as a combination of licenses.
Do not claim that the complete package uses MIT or that all editor embedding requires payment.
Keep the original dependency notices with every package.

The Claude submission form primarily considers MIT-licensed extensions.
Its form does not confirm acceptance of this combined package.
Use the disclosure in `claude-submission.md` and request a decision from the reviewer.
Do not remove the Pro notice to make the package appear MIT licensed.

## Earlier releases and source rights

Earlier recipients retain the rights supplied with their copies.
The MIT source license does not withdraw earlier Apache 2.0 grants.
Do not replace dependency licenses or third-party copyright notices with the MCP app's MIT license.

## References checked on October 23 2026

- [DOCX Editor pricing and component scope](https://www.docx-editor.dev/pricing)
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [Claude desktop extension submission form](https://clau.de/desktop-extention-submission)

The package's installed Pro evaluation license remains in `THIRD_PARTY_NOTICES.md`.
The additional permission names the plugin use that overrides its conflicting restrictions.
