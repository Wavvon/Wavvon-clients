#!/bin/sh
# Verify the vendored copies of @voxply/i18n and @voxply/utils under
# voxply-web/ are byte-identical to their canonical sources in Voxply-web.
# Usage: scripts/check-vendored.sh [path-to-Voxply-web-checkout]   (default: ../web)
set -e
WEB="${1:-../web}"
if [ ! -d "$WEB/i18n" ] || [ ! -d "$WEB/utils" ]; then
  echo "check-vendored: Voxply-web checkout not found at '$WEB'" >&2
  exit 2
fi
fail=0
for pkg in i18n utils; do
  diff -rq --exclude=node_modules "$WEB/$pkg" "voxply-web/$pkg" || fail=1
done
if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "Vendored packages have drifted from Voxply-web. Re-sync with:" >&2
  echo "  cp -r <web>/i18n/. voxply-web/i18n/ && cp -r <web>/utils/. voxply-web/utils/" >&2
  exit 1
fi
echo "Vendored i18n and utils match Voxply-web."
