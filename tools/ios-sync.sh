#!/bin/sh
# Build the web game, copy it into the iOS app bundle folder and regenerate the Xcode project.
set -e
cd "$(dirname "$0")/.."
npm run build
rm -rf ios/FidgetToyBox/Web
cp -R dist/web ios/FidgetToyBox/Web
cd ios && xcodegen generate --quiet
echo "iOS project ready → ios/FidgetToyBox.xcodeproj"
