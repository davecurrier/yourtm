#!/bin/bash
# Build YourTM.app — a native SwiftUI macOS app bundle.
set -euo pipefail
cd "$(dirname "$0")"

CONFIG="${1:-release}"
APP_NAME="YourTM"
DIST="dist"
APP="$DIST/$APP_NAME.app"

echo "→ swift build -c $CONFIG"
swift build -c "$CONFIG"

BIN=".build/$CONFIG/$APP_NAME"
[ -f "$BIN" ] || { echo "Binary not found: $BIN"; exit 1; }

echo "→ assembling $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp "$BIN" "$APP/Contents/MacOS/$APP_NAME"

# Engine resources: the bundled esbuild binary and the JavaScriptCore runtime.
# Together these are what let the app compile containers and edit TypeScript
# sources without Node installed. Regenerate if either is missing.
if [ ! -f Sources/YourTM/Resources/ytm-script-runtime.js ] || [ ! -x Sources/YourTM/Resources/esbuild ]; then
  echo "→ building JS runtime resources"
  ./scripts/build-js-runtime.sh
fi
cp Sources/YourTM/Resources/ytm-script-runtime.js "$APP/Contents/Resources/"
cp Sources/YourTM/Resources/esbuild "$APP/Contents/Resources/esbuild"
chmod +x "$APP/Contents/Resources/esbuild"

# App icon — regenerate the iconset if the generator is newer than the .icns
if [ -f icon/GenerateIcon.swift ]; then
  if [ ! -f icon/YourTM.icns ] || [ icon/GenerateIcon.swift -nt icon/YourTM.icns ]; then
    echo "→ regenerating app icon"
    swift icon/GenerateIcon.swift icon/YourTM.iconset >/dev/null
    iconutil -c icns icon/YourTM.iconset -o icon/YourTM.icns
  fi
  cp icon/YourTM.icns "$APP/Contents/Resources/YourTM.icns"
fi

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>YourTM</string>
    <key>CFBundleDisplayName</key><string>YourTM</string>
    <key>CFBundleIdentifier</key><string>dev.yourtm.desktop</string>
    <key>CFBundleVersion</key><string>1</string>
    <key>CFBundleShortVersionString</key><string>0.1.0</string>
    <key>CFBundleExecutable</key><string>YourTM</string>
    <key>CFBundleIconFile</key><string>YourTM</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsLocalNetworking</key><true/>
    </dict>
</dict>
</plist>
PLIST

echo -n "APPL????" > "$APP/Contents/PkgInfo"

# Ad-hoc sign so macOS runs it without complaint
codesign --force --deep --sign - "$APP"

echo "✓ Built $APP"
