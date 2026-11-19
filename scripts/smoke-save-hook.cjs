/**
 * Loaded into the built server with `--require`, by `smoke-save-races.mjs`.
 * Before file system call number `SMOKE_AT` of a save, it acts as another
 * program: it saves the document, deletes it, or stops the server.
 *
 * It patches `node:fs` from outside, so the server under test is the shipped
 * `dist/cli.js`, byte for byte.
 */

const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');

const { SMOKE_AT, SMOKE_ACTION, SMOKE_TARGET, SMOKE_ARM, SMOKE_BYTES } = process.env;
const real = { ...fs };
const at = Number(SMOKE_AT);
let count = 0;
let acting = false;

function act() {
  const bytes = Buffer.from(SMOKE_BYTES, 'base64');
  if (SMOKE_ACTION === 'kill') process.kill(process.pid, 'SIGKILL');
  else if (SMOKE_ACTION === 'delete') real.rmSync(SMOKE_TARGET, { force: true });
  else if (SMOKE_ACTION === 'replace') {
    real.writeFileSync(`${SMOKE_TARGET}.theirs`, bytes);
    real.renameSync(`${SMOKE_TARGET}.theirs`, SMOKE_TARGET);
  } else {
    // 'rewrite', and 'disguised': the same size, with the old modification time put back.
    const before = real.existsSync(SMOKE_TARGET) ? real.statSync(SMOKE_TARGET) : null;
    real.writeFileSync(SMOKE_TARGET, bytes);
    if (SMOKE_ACTION === 'disguised' && before) {
      real.utimesSync(SMOKE_TARGET, before.atime, before.mtime);
    }
  }
}

function wrap(target, name) {
  const original = target[name];
  target[name] = function (...args) {
    // Armed only while the save runs: the server makes other calls before it.
    if (!acting && real.existsSync(SMOKE_ARM)) {
      count += 1;
      real.writeFileSync(`${SMOKE_ARM}.count`, String(count));
      if (count === at) {
        acting = true;
        try {
          act();
        } finally {
          acting = false;
        }
      }
    }
    return original.apply(this, args);
  };
}

for (const name of ['lstat', 'access', 'open', 'mkdtemp', 'link', 'unlink', 'rmdir', 'readdir']) {
  wrap(fs.promises, name);
}
for (const name of ['renameSync', 'linkSync', 'unlinkSync']) wrap(fs, name);
// The server imports these as ES module bindings.
syncBuiltinESMExports();
