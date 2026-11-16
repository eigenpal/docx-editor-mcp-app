---
name: docx-editor
description: Show a .docx in a live, page-by-page preview while you edit it with your own document skill. Use when the user asks to see a .docx, or when you change a .docx that is open in the preview.
---

# Live preview for .docx files

DOCX Editor shows a `.docx` page by page and follows the file.
When the file changes, the preview updates in place and highlights the
changed paragraphs. DOCX Editor has no editing tools.

## Show the file once

Use the first option that applies:

1. If the user opened the file, it is already in the preview. Do nothing.
2. If `open_document` accepts a `path`, call it with the file's absolute path.
   The preview then follows that file.
3. If you have the file, for example in a code sandbox, call `open_document`
   with its bytes as `content_base64`. That preview does not follow a file,
   so show the result again after each change.
4. Otherwise, ask the user to open the file from the conversation.

After you edit a file that the preview follows (options 1 and 2), do not
show it again. The open preview updates by itself.

## Edit the file with your document skill

1. Use your document skill, for example the built-in **Documents** skill.
2. Change the existing file in place. Do not regenerate it, or it loses its
   styles, numbering, headers, and footers.
3. Save over the same path: write a temporary file, then rename it over the
   original, so the preview never reads half a file.
4. Make one save for each logical change, so the user can follow your work.

For reviewable edits, write tracked changes and comments into the `.docx` with your
document skill. The preview shows them.

## The user's edits

The user can type in the preview, and the preview saves to the file. Read the
file again before each edit. If both of you change it at once, the preview
asks the user to reload the file or keep their version.
