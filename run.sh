#!/bin/sh
set -eu

# Resolve the app directory even when launched from another directory.
CDPATH='' cd -- "$(dirname -- "$0")"

if ! node --no-warnings -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) process.exit(1);
  require("node:sqlite");
' >/dev/null 2>&1; then
  printf '%s\n' 'Apex Goods requires Node.js 22.13 or newer with node:sqlite.' >&2
  exit 1
fi

exec node src/server.js
