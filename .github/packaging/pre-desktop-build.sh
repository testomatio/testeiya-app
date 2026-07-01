#!/usr/bin/env bash
set -euo pipefail

if [ "${CI:-}" = "true" ]; then
  (cd cli && bun install --frozen-lockfile)
else
  if command -v bun >/dev/null 2>&1; then
    (cd cli && bun install)
  else
    (cd cli && npm install)
  fi
fi

find cli/node_modules -type l ! -exec test -e {} \; -delete 2>/dev/null || true
