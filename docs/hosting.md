# Choose local or hosted deployment

Use the local plugin when you need live updates from files on your computer.
Use a hosted MCP server when you want a remote connection without a local Node.js server.
Both modes render the document inside the host's browser view.

## Compare the options

| Capability                       | Local plugin             | Hosted MCP server                      | Standalone editor website                  |
| -------------------------------- | ------------------------ | -------------------------------------- | ------------------------------------------ |
| Local Node.js server             | Included in the plugin   | Not required for the remote connection | Not required                               |
| MCP endpoint                     | Local stdio process      | Public HTTPS endpoint                  | None unless you add one                    |
| Open an absolute local path      | Yes                      | No                                     | Through browser file selection only        |
| Follow local file changes        | Yes                      | No for `content_base64` previews       | Requires separate browser file integration |
| Save to the original local file  | Yes, with version checks | No for `content_base64` previews       | Depends on browser file permissions        |
| Document bytes reach your server | No Eigenpal upload       | Yes, through `open_document`           | Depends on the website implementation      |
| Updates                          | Install a plugin release | Deploy the server and widget together  | Deploy the website                         |

The OpenAI file viewer uses a separate host file API.
The server registers that entrypoint in both modes.
A remote connection alone does not establish that the host supports the file viewer.
Test that integration before you promise local file updates through a hosted plugin.

## What local installation includes

The package includes the MCP server, editor widget, WebAssembly file, and license notices.
The desktop host starts the server over stdio.
Users do not manually start a web server.
Approved directory packages can remove terminal setup from the installation process.
Directory approval and runtime availability remain host requirements.

## Host the MCP server on your domain

The existing HTTP mode provides `/mcp` and `/health`.
You can route an HTTPS address on `docx-editor.dev` to that Node.js service.
This repository does not establish that a production endpoint exists there.

Build and start the service:

```bash
bun install --frozen-lockfile
bun run build
node dist/cli.js http --port 3000
```

Deploy the package with `dist/cli.js`, `dist/app/`, and its supporting files.
Use Node.js 22 or later.
Place the service behind an HTTPS proxy.
Keep `DOCX_HARNESS` unset in production.

Connect the host to the public `/mcp` URL.
The host obtains the widget HTML and WebAssembly through MCP.
The widget does not fetch the editor website or remote assets.
Uploading static HTML to your website does not replace the MCP server.

The current HTTP tool accepts `content_base64` and returns document bytes in result `_meta`.
It does not accept local paths or retain document state between requests.
The request still passes through your infrastructure.
Show the document again after an agent changes a byte-based preview.
Saving a copy depends on the host's download support.
Test practical document sizes because base64 increases request size and hosts can impose lower limits.

## Prepare a public hosted service

Before release, complete these deployment tasks:

1. Test tool calls, rendering, downloads, and file viewer availability in each target host.
2. Configure HTTPS, request limits, timeouts, and rate limits at the service boundary.
3. Keep document contents out of application and proxy logs.
4. Publish a hosted privacy policy that describes document transfer and retention.
5. Confirm the Pro permission for the official hosted offering.
6. Complete the host's remote plugin review and domain verification.

The existing privacy policy covers the local plugin only.
The existing Pro permission does not grant third parties permission to run a hosted editor service.
Ownership lets Eigenpal offer its own Pro code under additional terms.
Keep dependency notices and rights from other licensors separate.

## Recommended release sequence

Publish the local plugin first for the current live document workflow.
Add a hosted option for users who prefer a remote connection and can use byte-based previews.
Keep both modes until host testing confirms that a remote option preserves the required file workflow.
Use your website for discovery, installation guidance, and commercial licensing.

## References

Checked on October 27, 2026:

- [OpenAI MCP server deployment](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI custom UI integration](https://developers.openai.com/plugins/build/chatgpt-ui)
- [OpenAI desktop-only publication](https://developers.openai.com/plugins/deploy/desktop-only)
- [DOCX Editor commercial terms](https://www.docx-editor.dev/commercial-license)
