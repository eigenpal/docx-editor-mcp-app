# Test docx-editor in Codex desktop

Use this private test package before the official directory listing is available.
The legal owner is Eigenpal, Inc.
The public publisher name is Eigenpal.

## Install

You need Codex desktop, the `codex` command, and Node.js 22 or later.
This private installation uses terminal commands.
The official directory installation remains a separate approval process.

1. Extract the ZIP into a permanent folder.
2. Open a terminal in the extracted `docx-editor-test-<version>` folder.
3. Run these commands:

   ```bash
   codex plugin marketplace add .
   codex plugin add docx-editor@eigenpal-test
   ```

4. Finish your current tasks before you restart Codex desktop.
5. Open a local conversation after the restart.
6. Ask Codex to open `examples/proposal.docx` in docx-editor, using its absolute path.

Keep the extracted folder for the duration of the test.
Test in Codex desktop first.
Other OpenAI desktop surfaces can have different local plugin support.

## Check the preview

1. Expand the preview and inspect the table and image.
2. Ask Codex to shorten the first paragraph with its document tools.
3. Confirm that the preview updates and highlights the changed paragraph.
4. Make a manual edit and reopen the document to check the saved result.
5. Open `examples/contract.docx` and inspect the comment and tracked replacement.

Use copies of the examples when you repeat the test.
Report the operating system, Codex version, plugin version, and steps for any failure.
Desktop installation and rendering still need validation on each supported operating system.

## Remove

Run these commands:

```bash
codex plugin remove docx-editor@eigenpal-test
codex plugin marketplace remove eigenpal-test
```

Restart Codex after your current tasks finish.
Your saved documents remain on disk.
