#!/bin/sh
# Start the MCP server with a Node.js that the desktop app provides.
# ChatGPT and Codex desktop can start plugins with a PATH that omits Node.js,
# so a bare `node` command fails before the host finds any tool.
set -eu

# PATH can be empty here, so use shell built-ins until Node.js starts.
# Resolve the package from this file, so a host that ignores `cwd` still works.
case $0 in
  */*) here=${0%/*} ;;
  *) here=. ;;
esac
root=$(CDPATH='' cd -- "$here/.." && pwd)
cli="$root/dist/cli.js"

cache_root=${XDG_CACHE_HOME:-${HOME:-}/.cache}
cli_resources=
case "${CODEX_CLI_PATH:-}" in
  */*) cli_resources=${CODEX_CLI_PATH%/*} ;;
esac

# Directory installs can omit the host's variables, so the app bundles follow.
for candidate in \
  "${CODEX_MCP_NODE_PATH:-}" \
  "${CODEX_BROWSER_USE_NODE_PATH:-}" \
  "${CODEX_ELECTRON_RESOURCES_PATH:+$CODEX_ELECTRON_RESOURCES_PATH/cua_node/bin/node}" \
  "${cli_resources:+$cli_resources/cua_node/bin/node}" \
  "$cache_root/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" \
  "${HOME:+$HOME/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}" \
  /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node \
  "${HOME:+$HOME/Applications/Codex.app/Contents/Resources/cua_node/bin/node}" \
  /Applications/Codex.app/Contents/Resources/cua_node/bin/node
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    exec "$candidate" "$cli" stdio
  fi
done

PATH="${PATH:+$PATH:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export PATH
if node_path=$(command -v node 2>/dev/null); then
  exec "$node_path" "$cli" stdio
fi

# The host log keeps stderr. Say why, instead of exiting with no tools.
printf '%s\n' 'DOCX Editor could not find Node.js 22 or later. Update ChatGPT or install Node.js.' >&2
exit 127
