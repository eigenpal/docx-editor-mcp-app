# Record the directory demonstration

Use the synthetic files in `fixtures/`.
Do not record private documents, account details, or unrelated windows.
Record each desktop host separately.
Use the final package and record its checksum in your review notes.

## Prepare the review files

Use `proposal.docx` for headings, a table, an image, and agent edits.
Use `contract.docx` for a comment and a tracked replacement.
Copy the originals before each recording so the review prompts produce the same result.
Attach the files through the submission portal when it supports attachments.
Otherwise, provide reviewer-accessible HTTPS download URLs in the review notes.
Do not put the fixtures inside the plugin archives.

## Record the workflow

1. Show the plugin name, publisher, and version.
2. Show installation without npm commands or a manually started server.
3. Ask the assistant to open `proposal.docx` from an absolute local path.
4. Show the inline card, then select **Open editor**.
5. Show the heading, schedule table, and desk image.
6. Ask the assistant to shorten the first paragraph with its document tools.
7. Show the same preview update and the highlighted paragraph.
8. Change one word directly in the editor.
9. Close and reopen the file to show that the manual edit saves.
10. Open `contract.docx` and show its comment and tracked replacement.
11. Switch between light and dark modes and between inline and fullscreen modes.
12. For OpenAI, show the `.docx` file viewer workflow where supported.
13. Send a comment reply with the send button, then send another reply with Enter.
14. Close and reopen the file, then confirm that both replies remain in the thread.

Test replies inside the harness iframe with its existing sandbox permissions.
The sandbox blocks native form submission before a submit handler runs.
Reply controls must call the reply action directly.

Record the conflict test separately if it makes the main demonstration too long.
Make an unsaved editor change, change the same file externally, and show the version choice.
Verify that the preview keeps the unsaved change until the reader chooses.

## Prepare screenshots

Capture a full editor page with the table and image.
Capture the comments and tracked changes view.
Capture the inline card beside the conversation.
Use each portal's current dimensions and file requirements.
Do not claim that screenshots prove clean installation or update delivery.

## Publish the recording

Upload the final recording to a public HTTPS URL.
Pass that URL as `DEMO_URL` when you rebuild both packages.
Verify playback from an account without publisher access.
Record host versions and desktop test results with your release records.
