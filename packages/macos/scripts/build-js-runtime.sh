#!/usr/bin/env bash
# Builds the JavaScript half of the engine into a single file the Mac app runs
# inside JavaScriptCore (a macOS system framework) — no Node at runtime.
#
# ts-morph carries the TypeScript compiler, which has no Swift equivalent, so
# it stays JavaScript. Everything around it is native Swift.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MACOS_PKG="$(dirname "$HERE")"
REPO="$(cd "$MACOS_PKG/../.." && pwd)"
DESKTOP="$REPO/packages/desktop"
OUT="$MACOS_PKG/Sources/YourTM/Resources"

ESBUILD="$REPO/node_modules/@esbuild/darwin-arm64/bin/esbuild"
[ -x "$ESBUILD" ] || { echo "esbuild binary not found at $ESBUILD" >&2; exit 1; }

mkdir -p "$OUT"

# The entry must live inside the package so node_modules resolution works.
ENTRY="$DESKTOP/.ytm-jsc-entry.mjs"
cp "$HERE/js/asset-editor.mjs" "$ENTRY"
trap 'rm -f "$ENTRY"' EXIT

echo "→ bundling ts-morph for JavaScriptCore"
"$ESBUILD" "$ENTRY" \
  --bundle --format=iife --platform=browser \
  --define:process.env.NODE_ENV='"production"' \
  --outfile="$OUT/ytm-script-runtime.js" \
  --log-level=warning

# Ship esbuild itself so the app can compile containers with no toolchain installed.
cp "$ESBUILD" "$OUT/esbuild"
chmod +x "$OUT/esbuild"

echo "✓ $(cd "$OUT" && ls -lh ytm-script-runtime.js esbuild | awk '{print $9" "$5}' | tr '\n' ' ')"
