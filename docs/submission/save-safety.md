# Save safety

This page states what a save guarantees, where the guarantee stops, and which tests hold it.
It applies to `write_local_file`, the tool that saves your preview edits to a file that `open_document` opened by path.
ChatGPT and Codex desktop save through the host's file viewer, not through this tool.

## The rule

A save replaces a file only if the file still holds the version that the save names in `ifMatch`.
Another program can save the file at any moment.
Its version is never destroyed: it stays at the path, or in a directory that the result names.

## How a save works

No file system call compares a file and replaces it in one step.
A version check followed by `rename(new, path)` destroys an edit that lands between the two.
So the server never replaces a file by name.

1. The server reads the file and compares its SHA-256 with `ifMatch`.
2. It writes the new bytes to a private directory beside the file.
3. It moves the file at the path into that directory. The move is atomic: it takes the file that is there at that instant.
4. It links the new file in at the path. A link fails if the path holds a file.
5. It reads the file that it moved. If that file is the `ifMatch` version, the server removes it.
6. If that file is another version, the server moves its own file out and links the other version back. The result is `conflict`.

The server removes a file only after it read that file and found the `ifMatch` version or its own bytes.
A file that is neither stays in the directory, and the result names the directory as `recoveryPath`.

An etag is the SHA-256 of the file contents.
A `saved` result carries the hash of the bytes that the server wrote, never a later look at the path.
So an edit that lands right after a save cannot pass for the saved version.

## Results

| Result      | Meaning                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| `saved`     | The file held the `ifMatch` version, and the path received the new bytes.                   |
| `conflict`  | Another version is on disk. `etag` names the file at the path now.                          |
| `too-large` | The bytes are over the size limit. Nothing changed.                                         |
| `refused`   | The save could not run, for example without `ifMatch` or on a read-only file. See the text. |

## Limits

- The path is absent for about 0.2 ms between step 3 and step 4. A program that opens the path in that time gets "not found".
- If the server stops in that time, the document is in the `.docx-editor-save-*` directory beside its path. The next read and the next `open_document` name the copy.
- A program that keeps a descriptor open on the old file, and writes through it after step 5, loses that write. Every atomic save has this limit. Only a lock that both programs honor removes it.
- A disk without hard links refuses saves. The preview then offers a download.
- The plugin is not tested on Windows.

## Review findings

| Finding                                                               | Fix                                                           | Test                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------ |
| A 12 MiB document made a message over the 10 MiB limit of the host    | A 7 MiB limit on every read, show, and save                   | `review-findings.test.ts`, finding 1 |
| `ifMatch: null` skipped the version check                             | `ifMatch` is required; there is no unconditional save         | `review-findings.test.ts`, finding 2 |
| An edit after the last check, before the replacement, was overwritten | Steps 3 to 6: the server never replaces a file by name        | `review-findings.test.ts`, finding 3 |
| An edit right after the save was returned as the saved version        | Content hashes; `saved` carries the hash of the written bytes | `review-findings.test.ts`, finding 4 |

## Tests

The tests do not pick their moments.
They act before every file system call that a save makes, so a new step is covered without a new test.
All files are in `src/server/__tests__/` unless the table says otherwise.

| Test                                       | What it does before each call of a save                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `document-save-race.test.ts`               | Another program saves the file (3 ways) or deletes it                                    |
| `document-save-faults.test.ts`             | The call fails with one of 4 errors, once or from then on                                |
| `document-save-pairs.test.ts`              | Two foreign saves, or a foreign save and a failed call, at every pair of calls           |
| `document-save-swaps.test.ts`              | The path becomes a symlink or a directory, or loses its permissions                      |
| `document-save-edges.test.ts`              | Not a race: metadata changes, long and unusual names, leftovers of a stopped server      |
| `document-save-stress.test.ts`             | No plan: this server and another program save one file in loops; 3 servers save one file |
| `review-findings.test.ts`                  | The 4 review findings, through the MCP protocol                                          |
| `scripts/smoke-save-races.mjs`             | Foreign saves and a kill of the server, on the built `dist/cli.js` over stdio            |
| `src/app/__tests__/file-sync-fuzz.test.ts` | Random sequences of edits, foreign changes, and button presses in the preview            |

The stress test audits every file that the server removes.
A removed file must hold the bytes of the save or the version that the save named.
With 3 servers on one file, it checks that no 2 saves replace the same version.

### Run the tests

```bash
bun run test          # every test, about 30 seconds
bun run build
bun run smoke         # the built package, with an event before each call of a save
bun run test:stress   # the random suites for 30 seconds and 3,000 sequences
```

Set `DOCX_STRESS_MS` and `DOCX_FUZZ_SEEDS` to run the random suites for longer.
