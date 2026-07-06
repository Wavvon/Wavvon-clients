#!/usr/bin/env bash
# Prepare a release commit on develop. Merging to main triggers the rest.
# Usage: scripts/release.sh 0.3.0          (stable)
#        scripts/release.sh 0.3.0-beta.1   (pre-release)
set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>  (e.g. 0.3.0 or 0.3.0-beta.1)" >&2
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
TAURI_CONF="$ROOT/apps/desktop/src-tauri/tauri.conf.json"

if ! command -v git-cliff >/dev/null 2>&1; then
  echo "git-cliff not found. Install with: cargo install git-cliff" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "node not found." >&2
  exit 1
fi

echo "==> Bumping version to $VERSION in tauri.conf.json"
node -e "
  const fs = require('fs');
  const cfg = JSON.parse(fs.readFileSync('$TAURI_CONF', 'utf8'));
  cfg.version = '$VERSION';
  fs.writeFileSync('$TAURI_CONF', JSON.stringify(cfg, null, 2) + '\n');
"

echo "==> Updating CHANGELOG.md"
# Full regeneration. NOT `--unreleased -o`: that combination overwrites the
# file with ONLY the unreleased section, dropping every previous release's
# notes (same bug bit the server repo's script).
(cd "$ROOT" && git-cliff --tag "v$VERSION" -o CHANGELOG.md)

echo "==> Committing on develop"
git -C "$ROOT" add apps/desktop/src-tauri/tauri.conf.json CHANGELOG.md
git -C "$ROOT" commit -m "chore: release v$VERSION"

echo
echo "Done. Next steps:"
echo "  1. git push origin develop"
echo "  2. Open a PR: develop → main on GitHub"
echo "  3. Merge the PR — CI will tag v$VERSION and publish the release automatically"
