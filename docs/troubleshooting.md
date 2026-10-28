# Troubleshoot docx-editor

## The preview does not finish loading

Run `setup codex` or `setup claude` again, then restart your desktop app.
Finish running tasks before you restart.

## The plugin does not appear in ChatGPT

Run `codex plugin list` and check for `docx-editor@docx-editor`.
Then restart ChatGPT.

## Page layout differs from Word

Check that the preview loaded `harfbuzz.wasm`.
Report engine layout problems in [eigenpal/docx-editor](https://github.com/eigenpal/docx-editor/issues).

## A file does not open

Use a `.docx` file no larger than 15 MB.
Provide an absolute path for local mode or `content_base64` for hosted mode.
