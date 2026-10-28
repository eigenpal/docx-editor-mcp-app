# Troubleshoot docx-editor

## The preview does not finish loading

Finish running tasks, and then restart your desktop app.
If the problem continues, install the plugin again as described in the
[README](../README.md#install).

## The plugin does not appear in ChatGPT

Run `codex plugin list`, and check that `docx-editor@docx-editor` is
installed and enabled. Then restart ChatGPT.

## Page layout differs from Word

Check that the preview loaded `harfbuzz.wasm`.
Report engine layout problems in [eigenpal/docx-editor](https://github.com/eigenpal/docx-editor/issues).

## A file does not open

Use a `.docx` file no larger than 15 MB.
Provide an absolute path for local mode or `content_base64` for hosted mode.
