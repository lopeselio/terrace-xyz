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
npx -y vercel@63.1.2 pull --yes --environment production
npx -y vercel@63.1.2 build --prod
# Uploads sometimes stall ("fetch failed"); retry a few times.
for attempt in 1 2 3 4 5; do
  if npx -y vercel@63.1.2 deploy --prebuilt --prod; then break; fi
  echo "upload attempt $attempt failed, retrying" >&2
  sleep 4
done

echo "Deploy complete. Cleaning up $BUILDDIR"
rm -rf "$BUILDDIR"
