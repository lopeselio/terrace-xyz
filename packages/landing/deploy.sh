#!/bin/bash
# Deploy landing to Vercel production.
# Builds in an isolated temp dir to avoid pnpm virtual store path pollution in build traces.
set -e

BUILDDIR=$(mktemp -d)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Building in isolated dir: $BUILDDIR"

cp -r "$SCRIPT_DIR/." "$BUILDDIR/"
rm -rf "$BUILDDIR/node_modules" "$BUILDDIR/.next" "$BUILDDIR/.vercel/output" "$BUILDDIR/package-lock.json"

cd "$BUILDDIR"
npm install
vercel pull --yes --environment production
vercel build --prod
vercel deploy --prebuilt --prod

echo "Deploy complete. Cleaning up $BUILDDIR"
rm -rf "$BUILDDIR"
