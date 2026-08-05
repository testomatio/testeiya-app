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

# Drop the SDK's speech-to-text stack (~430MB) from the bundle. `@huggingface/
# transformers` and `sherpa-onnx-node` are OPTIONAL dependencies of
# pi-coding-agent used only by its local STT/tiny-model workers; Testeiya never
# imports them (we transcribe via the Testomat.io cloud API). The SDK resolves
# both lazily and self-installs them into a side runtime dir if ever needed, so
# their absence is a supported state rather than a broken install.
# onnxruntime-* / sharp / @img are pulled in exclusively by transformers.
for pkg in \
  "@huggingface" \
  onnxruntime-node onnxruntime-web onnxruntime-common \
  sharp "@img" \
  sherpa-onnx-node sherpa-onnx-darwin-arm64 sherpa-onnx-darwin-x64 \
  sherpa-onnx-linux-arm64 sherpa-onnx-linux-x64 \
  sherpa-onnx-win-ia32 sherpa-onnx-win-x64
do
  rm -rf "cli/node_modules/$pkg"
done
