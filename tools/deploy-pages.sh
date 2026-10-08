#!/bin/sh
# Build and publish dist/web to the gh-pages branch (GitHub Pages).
set -e
cd "$(dirname "$0")/.."
npm run build
REMOTE=$(git remote get-url origin)
TMP=$(mktemp -d)
cp -R dist/web/. "$TMP"
touch "$TMP/.nojekyll"
cd "$TMP"
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy web build"
git push -q -f "$REMOTE" gh-pages
rm -rf "$TMP"
echo "Deployed → https://nhatbien.github.io/fidget-toy-box/"
