# Test file conflicts on desktop

Run these checks on the release candidate before you publish it.
They cover what the automated tests cannot: a real host, a real editor, and real timing.
Each check names the result you expect. Record each result in the table at the end.

Claude Desktop saves through `write_local_file`, which this release changes.
ChatGPT and Codex desktop save through the host's file viewer.
Run the Claude section in full, and the Codex section as a regression check.

## Prepare

1. Build the candidate from a clean commit:

   ```bash
   bun install --frozen-lockfile
   bun run release:verify
   ```

2. Define these helpers in a terminal. You use this terminal for every external change.

   ```bash
   T=~/Documents/conflict-test
   F="$T/conflict.docx"
   mkdir -p "$T"
   # Replace the file from outside the editor, with one line of text.
   disk() { echo "$1" > "$T/in.txt" && textutil -convert docx "$T/in.txt" -output "$F"; }
   # Print the text that is on disk now.
   show() { textutil -convert txt -stdout "$F"; }
   # Change the file every 0.5 seconds for 10 seconds.
   storm() { for i in $(seq 1 20); do disk "Storm $i"; sleep 0.5; done; disk "Storm final"; }
   ```

3. Before each check, reset the file with `disk "Start"`, then open it again if the check says so.

`textutil` is part of macOS.
On another system, replace the file with a copy of a different `.docx`.

## Claude Desktop

Install `dist/local-packages/docx-editor-claude-<version>.mcpb`.
Go to **Settings > Extensions > Advanced settings > Install Extension**.
Restart Claude Desktop.
Then ask: "Open ~/Documents/conflict-test/conflict.docx in DOCX Editor."
Expand the preview to fullscreen.

### C1. A manual edit saves

1. Type `Mine` at the end of the text.
2. Wait 2 seconds.
3. Run `show`.

Expected: The status shows `Saving conflict.docx…`, then `Saved to the file.`
`show` prints `StartMine`.

### C2. An external change with no unsaved edits

1. Do not type in the editor.
2. Run `disk "From disk"`.

Expected: Within 2 seconds, the preview shows `From disk` and highlights the change.
No conflict message shows.

### C3. An external change while you edit

1. Run `storm`.
2. While it runs, type `Mine` in the editor.
3. Wait for `storm` to finish.

Expected: The status shows `The file changed while you were editing.` or `A newer version is on disk. Your edits are not saved.`
The **Reload file** and **Keep my version** buttons show.
The editor still shows your edit.
`show` prints `Storm final`: your edit did not overwrite the file.

### C4. Reload file

1. Get the conflict message from C3.
2. Click **Reload file**.
3. Run `show`.

Expected: The status shows `Reloaded from the file.`
The editor shows `Storm final` and your edit is gone.
The file on disk is unchanged.

### C5. Keep my version

1. Get the conflict message from C3.
2. Click **Keep my version**.
3. Wait 2 seconds and run `show`.

Expected: The status shows `Saved to the file.`
`show` prints the text with your edit, not `Storm final`.
Type again: the next autosave succeeds with no new conflict.

### C6. The agent edits while you edit

1. Type a word in the editor, and do not wait for the save.
2. At once, ask Claude to change the first sentence with its document tools.

Expected: You get the conflict message from C3, or the preview shows the agent's change after your save.
Either your edit or the agent's edit must never disappear without a conflict message.
Repeat with **Reload file** and with **Keep my version**.

### C7. An edit that restores the old modification time

1. Do not type in the editor.
2. Run this:

   ```bash
   touch -r "$F" "$T/ref"; disk "Old time"; touch -r "$T/ref" "$F"
   ```

Expected: The preview shows `Old time`.
Before this release, the preview could miss this change.

### C8. A read-only file

1. Run `chmod 444 "$F"`.
2. Type a word in the editor and wait 2 seconds.
3. Run `show`, then `chmod 644 "$F"`.

Expected: Nothing saves, and `show` prints the text from before your edit.
The status shows no message, or `The file is read-only.`
It never shows `Saved to the file.`

### C9. A deleted file

1. Run `rm "$F"`.
2. Type a word in the editor and wait 2 seconds.
3. Run `ls "$T"`.

Expected: The status shows `The file no longer exists at its path.`
The preview does not create the file again.

### C10. A symlink in place of the file

1. Run `echo secret > "$T/secret.txt"; rm -f "$F"; ln -s "$T/secret.txt" "$F"`.
2. Type a word in the editor and wait 2 seconds.
3. Run `cat "$T/secret.txt"`, then `rm "$F"`.

Expected: The status shows `The path no longer holds a regular file.`
`cat` prints `secret`: the save did not write through the link.

### C11. Unsaved edits when you leave fullscreen

1. Type a word in the editor.
2. At once, leave fullscreen or close the preview.
3. Run `show`.

Expected: `show` prints your edit.

## ChatGPT and Codex desktop

Install the packed build as described in `AGENTS.md`, then restart the app.
Ask the agent to open `~/Documents/conflict-test/conflict.docx` in DOCX Editor.
Click **Open** to show the file in the host's file viewer.

The Codex sandbox cannot write to `~/Documents`.
Run `disk` and `storm` in your own terminal, not through the agent.
For X3, give the agent write access to the test folder first.

### X1. An external change with no unsaved edits

Repeat C2. Expected: The viewer updates and highlights the change.

### X2. An external change while you edit

Repeat C3, then C4, then C3 and C5.
Expected: The results of C3, C4, and C5. The host can ask you to allow the write.

### X3. The agent edits while you edit

Repeat C6. Expected: The result of C6.

## Record the results

Copy this table into the release notes for the candidate.
`release.json` gives the version and source commit.

| Check | Host and version | Operating system | Result | Notes |
| ----- | ---------------- | ---------------- | ------ | ----- |
| C1    |                  |                  |        |       |
| C2    |                  |                  |        |       |
| C3    |                  |                  |        |       |
| C4    |                  |                  |        |       |
| C5    |                  |                  |        |       |
| C6    |                  |                  |        |       |
| C7    |                  |                  |        |       |
| C8    |                  |                  |        |       |
| C9    |                  |                  |        |       |
| C10   |                  |                  |        |       |
| C11   |                  |                  |        |       |
| X1    |                  |                  |        |       |
| X2    |                  |                  |        |       |
| X3    |                  |                  |        |       |

Mark a check as passed only after you observe its result.
For a failure, write down the steps, the status text, and the output of `show`.
