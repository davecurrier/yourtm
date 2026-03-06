#!/bin/bash
# Build release tarball for YourTM CLI
# Usage: ./scripts/build-release.sh [version]

set -e

VERSION="${1:-0.1.0}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/release"
PACKAGE_NAME="yourtm-cli-v${VERSION}"

echo "Building YourTM CLI v${VERSION}"
echo "================================"
echo ""

# Clean
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/$PACKAGE_NAME"

# Build all packages
echo "Building packages..."
cd "$ROOT_DIR"

# Build core
echo "  Building @yourtm/core..."
cd "$ROOT_DIR/packages/core"
npm run build 2>/dev/null || true

# Build CLI
echo "  Building @yourtm/cli..."
cd "$ROOT_DIR/packages/cli"
npm run build

# Copy CLI dist
echo ""
echo "Packaging..."
cp -r "$ROOT_DIR/packages/cli/dist" "$DIST_DIR/$PACKAGE_NAME/"
cp "$ROOT_DIR/packages/cli/package.json" "$DIST_DIR/$PACKAGE_NAME/"

# Copy dependencies (node_modules that are needed)
mkdir -p "$DIST_DIR/$PACKAGE_NAME/node_modules"

# Create minimal package.json for runtime
cat > "$DIST_DIR/$PACKAGE_NAME/package.json" << EOF
{
  "name": "@yourtm/cli",
  "version": "${VERSION}",
  "type": "module",
  "bin": {
    "ytm": "./dist/bin.js"
  }
}
EOF

# Bundle with esbuild for a single file (optional, reduces deps)
echo "  Bundling to single file..."
cd "$ROOT_DIR/packages/cli"

# Check if esbuild is available
if command -v npx &> /dev/null; then
  npx esbuild dist/bin.js \
    --bundle \
    --platform=node \
    --target=node18 \
    --format=esm \
    --outfile="$DIST_DIR/$PACKAGE_NAME/dist/bin.js" \
    --external:fsevents \
    --external:esbuild \
    --minify \
    2>/dev/null || {
      # Fallback: just copy the dist folder
      echo "  (Using unbundled version)"
      cp -r dist/* "$DIST_DIR/$PACKAGE_NAME/dist/"
    }
fi

# Create tarball
echo ""
echo "Creating tarball..."
cd "$DIST_DIR"
tar -czf "${PACKAGE_NAME}.tar.gz" "$PACKAGE_NAME"

# Create checksums
echo "Creating checksums..."
if command -v shasum &> /dev/null; then
  shasum -a 256 "${PACKAGE_NAME}.tar.gz" > "${PACKAGE_NAME}.tar.gz.sha256"
elif command -v sha256sum &> /dev/null; then
  sha256sum "${PACKAGE_NAME}.tar.gz" > "${PACKAGE_NAME}.tar.gz.sha256"
fi

# Summary
echo ""
echo "Release built successfully!"
echo ""
echo "Files:"
ls -lh "$DIST_DIR/${PACKAGE_NAME}"*
echo ""
echo "Upload these to GitHub Releases:"
echo "  $DIST_DIR/${PACKAGE_NAME}.tar.gz"
echo "  $DIST_DIR/${PACKAGE_NAME}.tar.gz.sha256"
