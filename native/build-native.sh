#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Markdown Reader Native"
BUILD_DIR="$ROOT_DIR/build/native"
RELEASE_DIR="$ROOT_DIR/release-native"
APP_DIR="$RELEASE_DIR/$APP_NAME.app"
DMG_STAGING_DIR="$BUILD_DIR/dmg-staging"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
EXECUTABLE="$MACOS_DIR/$APP_NAME"
DMG_PATH="$RELEASE_DIR/$APP_NAME-0.1.0-arm64.dmg"

rm -rf "$BUILD_DIR" "$APP_DIR" "$DMG_PATH"
mkdir -p "$BUILD_DIR" "$MACOS_DIR" "$RESOURCES_DIR"

swiftc \
  -parse-as-library \
  -O \
  -framework Cocoa \
  -framework WebKit \
  "$ROOT_DIR/native/Sources/MarkdownReaderNative.swift" \
  -o "$EXECUTABLE"

cp "$ROOT_DIR/native/Info.plist" "$CONTENTS_DIR/Info.plist"

if [[ -f "$ROOT_DIR/assets/icon.icns" ]]; then
  cp "$ROOT_DIR/assets/icon.icns" "$RESOURCES_DIR/icon.icns"
elif [[ -f "$ROOT_DIR/release/mac-arm64/Markdown Reader.app/Contents/Resources/icon.icns" ]]; then
  cp "$ROOT_DIR/release/mac-arm64/Markdown Reader.app/Contents/Resources/icon.icns" "$RESOURCES_DIR/icon.icns"
fi

codesign --force --deep --sign - "$APP_DIR" >/dev/null

# Build a familiar drag-to-install DMG layout:
# app bundle on the left, Applications shortcut on the right.
mkdir -p "$DMG_STAGING_DIR"
cp -R "$APP_DIR" "$DMG_STAGING_DIR/"
ln -s /Applications "$DMG_STAGING_DIR/Applications"

hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$DMG_STAGING_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH" >/dev/null

echo "$DMG_PATH"
