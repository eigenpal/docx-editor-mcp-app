#!/bin/sh
set -eu

# The desktop app can start the plugin with a PATH that omits Node.js.
if [ -n "${CODEX_MCP_NODE_PATH:-}" ] && [ -x "$CODEX_MCP_NODE_PATH" ]; then
  exec "$CODEX_MCP_NODE_PATH" ./dist/cli.js stdio
fi

# Directory installs can omit the host's Node.js variable.
for app_root in "${HOME:-}/Applications" /Applications; do
  for app in ChatGPT Codex; do
    node_path="$app_root/$app.app/Contents/Resources/node"
    if [ -x "$node_path" ]; then
      exec "$node_path" ./dist/cli.js stdio
    fi
  done
done

exec node ./dist/cli.js stdio
