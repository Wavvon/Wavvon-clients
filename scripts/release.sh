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
# Every app-level manifest carrying a user-visible version. The desktop
# tauri.conf.json is the canonical one (auto-tag reads it); the rest are
# synced so package.json / Android versions stop drifting behind releases.
# Internal packages/* stay untouched — they're unpublished workspace libs.
VERSIONED_MANIFESTS=(
  "apps/desktop/src-tauri/tauri.conf.json"
  "apps/android/src-tauri/tauri.conf.json"
  "apps/desktop/package.json"
  "apps/web/package.json"
  "apps/android/package.json"
)

if ! command -v git-cliff >/dev/null 2>&1; then
  echo "git-cliff not found. Install with: cargo install git-cliff" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "node not found." >&2
  exit 1
fi

echo "==> Bumping version to $VERSION in app manifests"
for manifest in "${VERSIONED_MANIFESTS[@]}"; do
  node -e "
    const fs = require('fs');
    const path = '$ROOT/$manifest';
    const cfg = JSON.parse(fs.readFileSync(path, 'utf8'));
    cfg.version = '$VERSION';
    fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
  "
done

echo "==> Updating CHANGELOG.md"
# Full regeneration. NOT `--unreleased -o`: that combination overwrites the
# file with ONLY the unreleased section, dropping every previous release's
# notes (same bug bit the server repo's script).
(cd "$ROOT" && git-cliff --tag "v$VERSION" -o CHANGELOG.md)

echo "==> Committing on develop"
git -C "$ROOT" add CHANGELOG.md
for manifest in "${VERSIONED_MANIFESTS[@]}"; do
  git -C "$ROOT" add "$manifest"
done
git -C "$ROOT" commit -m "chore: release v$VERSION"

echo
echo "Done. Next steps:"
echo "  1. git push origin develop"
echo "  2. Open a PR: develop → main on GitHub"
echo "  3. Merge the PR — CI will tag v$VERSION and publish the release automatically"
