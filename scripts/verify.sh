#!/usr/bin/env bash
# Every gate of this repository, cheapest first; CI runs the same commands (.github/workflows/ci.yml).
#   bash scripts/verify.sh            CLI, packs and collection
#   bash scripts/verify.sh cli packs  only the named parts
# The collection gate needs ansible-core and ansible-lint (collection/requirements*.txt) or the control container.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
parts=("$@")
[ ${#parts[@]} -gt 0 ] || parts=(packs cli collection)

for part in "${parts[@]}"; do
  case $part in
    packs)
      echo "== packs"
      bash "$root/scripts/validate-packs.sh"
      ;;
    cli)
      echo "== cli"
      (cd "$root/cli" && npm ci --no-audit --no-fund && npm run typecheck && npm test && npm run test:pack)
      if command -v shellcheck >/dev/null 2>&1; then shellcheck "$root/cli/runner/runner.sh"; else echo "skipped shellcheck: not installed"; fi
      ;;
    collection)
      echo "== collection"
      bash "$root/collection/scripts/validate.sh"
      ;;
    *)
      echo "unknown part '$part' (packs, cli, collection)" >&2
      exit 2
      ;;
  esac
done
echo "OK: ${parts[*]}"
