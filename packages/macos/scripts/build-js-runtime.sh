#!/usr/bin/env bash
# Builds the app's JavaScript resources into a single file the Mac app runs
# inside JavaScriptCore (a macOS system framework) — no Node at runtime.
#
# ts-morph carries the TypeScript compiler, which has no Swift equivalent, so
# it stays JavaScript. Everything around it is native Swift.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MACOS_PKG="$(dirname "$HERE")"
REPO="$(cd "$MACOS_PKG/../.." && pwd)"
OUT="$MACOS_PKG/Sources/YourTM/Resources"

# The host's own esbuild binary: npm installs only the platform package that
# matches this Mac, so the app is built for the machine that builds it.
case "$(uname -m)" in
  arm64)  ESBUILD_PLATFORM="darwin-arm64" ;;
  x86_64) ESBUILD_PLATFORM="darwin-x64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac
ESBUILD="$REPO/node_modules/@esbuild/$ESBUILD_PLATFORM/bin/esbuild"
[ -x "$ESBUILD" ] || { echo "esbuild binary not found at $ESBUILD (run npm install at the repo root)" >&2; exit 1; }

mkdir -p "$OUT"

# Entries are bundled where they live. ts-morph is a dependency of this
# package (packages/macos/package.json), so it resolves from here.
echo "→ bundling ts-morph for JavaScriptCore"
"$ESBUILD" "$HERE/js/asset-editor.mjs" \
  --bundle --format=iife --platform=browser \
  --define:process.env.NODE_ENV='"production"' \
  --outfile="$OUT/ytm-script-runtime.js" \
  --log-level=warning

# GTM importer. Separate from the ts-morph bundle so importing does not drag in
# the TypeScript compiler, and so a failure in one cannot break the other.
echo "→ bundling the GTM importer"
# Alias straight at the vendor detectors rather than the package barrel: the
# barrel re-exports the CLI itself, which pulls in commander, chalk and node:fs
# and cannot bundle for a browser-like target.
"$ESBUILD" "$HERE/js/gtm-import.ts" \
  --bundle --format=iife --platform=browser \
  --alias:@yourtm/cli="$REPO/packages/cli/src/vendors/index.ts" \
  --define:process.env.NODE_ENV='"production"' \
  --outfile="$OUT/ytm-gtm-import.js" \
  --log-level=warning

# @yourtm/runtime, pre-bundled to one self-contained ESM file.
#
# A compiled container's entry point imports initYourTM from the runtime, so the
# runtime source has to be reachable at build time. Resolving it by walking the
# filesystem only works inside this monorepo — build a container from anywhere
# else and it fails, which would break the app the moment it is handed to
# someone. Shipping the source tree alone is not enough either: the runtime
# imports @yourtm/core, so it is bundled here instead, with core resolved in.
echo "→ bundling @yourtm/runtime"
"$ESBUILD" "$REPO/packages/runtime/src/index.ts" \
  --bundle --format=esm --platform=browser \
  --outfile="$OUT/ytm-runtime.mjs" \
  --log-level=warning

# Ship esbuild itself so the app can compile containers with no toolchain installed.
cp "$ESBUILD" "$OUT/esbuild"
chmod +x "$OUT/esbuild"

echo "✓ $(cd "$OUT" && ls -lh ytm-script-runtime.js ytm-gtm-import.js ytm-runtime.mjs esbuild | awk '{print $9" "$5}' | tr '\n' ' ')"
