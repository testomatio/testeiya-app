#!/usr/bin/env bash
set -euo pipefail

if [ "${CI:-}" = "true" ]; then
  (cd testeiya && bun install --frozen-lockfile)
else
  if command -v bun >/dev/null 2>&1; then
    (cd testeiya && bun install)
  else
    (cd testeiya && npm install)
  fi
fi

find testeiya/node_modules -type l ! -exec test -e {} \; -delete 2>/dev/null || true
