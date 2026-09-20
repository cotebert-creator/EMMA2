#!/bin/zsh

set -eu

cd "${0:A:h}"

NODE="$(command -v node || true)"

if [[ -z "$NODE" ]]; then
  NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi

if [[ ! -x "$NODE" ]]; then
  print "Node.js is missing. Install Node.js 20 or later."
  read "?Press Return to close."
  exit 1
fi

export EMMA_HOST=127.0.0.1
export PORT=3000

print ""
print "Starting Emma web app..."
print "Open this address in your browser:"
print "http://localhost:3000"
print ""
print "Keep this window open while using Emma."
print ""

"$NODE" server.js