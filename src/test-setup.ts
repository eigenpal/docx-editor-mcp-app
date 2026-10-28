/**
 * Preloaded before every test file (`bunfig.toml`): the token key goes to a
 * throwaway directory, never to the user's real state directory.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DOCX_EDITOR_STATE_DIR = mkdtempSync(join(tmpdir(), 'docx-state-'));
