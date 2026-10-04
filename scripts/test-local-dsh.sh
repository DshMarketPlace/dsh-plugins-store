#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ "$(dsh --version)" != "0.2.0-rc.2" ]]; then
  echo 'This smoke test targets DSH 0.2.0-rc.2.' >&2
  exit 1
fi

# Each run owns a fresh home; never install into the user's normal profile.
test_home=$(mktemp -d "${TMPDIR:-/tmp}/dshmarketplace-test.XXXXXX")
export DSH_HOME="$test_home"
export DSHM_NO_TELEMETRY=1
echo "Isolated DSH home: $DSH_HOME"

npm ci --ignore-scripts --no-audit --no-fund
npm pack --pack-destination "$test_home"
package_version=$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')
dsh --profile marketplace-test --from-default-profile web --dump-config > /dev/null
# DSH creates a one-package pnpm workspace; pnpm 9 requires an explicit -w.
dsh plugin --profile marketplace-test add -w "$test_home/dshmarketplace-plugin-$package_version.tgz"
echo 'Open the local URL printed below; skip API key setup to test the store.'
echo 'Settings → Built-in plugins → Plugin marketplace. Ctrl+C stops the server.'
exec dsh --profile marketplace-test --no-open --host 127.0.0.1 --port 0
