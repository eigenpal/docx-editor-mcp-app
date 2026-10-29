# Troubleshoot docx-editor

## Claude Desktop does not open the install dialog

Drag the `.mcpb` file into the Claude Desktop window. You can also go to
**Settings > Extensions > Advanced settings > Install Extension**, and select
the file.

## The preview does not finish loading

Finish running tasks, and then restart your desktop app.
If the problem continues, install the plugin again as described in the
[README](../README.md#install).

## The plugin does not appear in ChatGPT

Run `codex plugin list`, and check that `docx-editor@docx-editor` is
installed and enabled. Then restart ChatGPT.

## Page layout differs from Word

Report the problem in
[eigenpal/docx-editor](https://github.com/eigenpal/docx-editor/issues).
Attach a sample document without private content.

## A file does not open

Check that the file is a `.docx` file of 7 MB or less. Then ask your agent
to open it by its absolute path, for example `/Users/you/report.docx`.
