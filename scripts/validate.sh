#!/usr/bin/env bash
# Validate the collection:
# - every role has README.md, defaults/main.yml, tasks/main.yml, tasks/check.yml and meta/main.yml.
# - tests/all-roles.yml imports every role twice (apply and check) and names no role that is absent.
# - every conditional (that, when, failed_when, changed_when, until) is a string.
# - no `latest` versions or image tags and no Ansible Vault payloads in tracked content.
# - requirements.yml installs, tests/all-roles.yml passes `ansible-playbook --syntax-check`,
#   tests/local-probes.yml runs the check probes on the control node, tests/check-mode-probes.yml runs
#   role tasks under --check, and ansible-lint passes.
# Needs ansible-core and ansible-lint (or the control container). Scratch goes to .tmp/validate.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH="$ROOT/.tmp/validate"
COLLECTIONS="$SCRATCH/collections"

errors=0
fail() { echo "FAIL: $1" >&2; errors=$((errors + 1)); }

for tool in ansible-playbook ansible-galaxy ansible-lint; do
    command -v "$tool" >/dev/null || { echo "FAIL: $tool not found; run inside the control container (container/README.md)" >&2; exit 1; }
done

cd "$ROOT"

roles=()
for dir in roles/*/; do
    [ -d "$dir" ] || continue
    role="$(basename "$dir")"
    roles+=("$role")
    for required in README.md defaults/main.yml tasks/main.yml tasks/check.yml meta/main.yml; do
        [ -f "$dir$required" ] || fail "role '$role' lacks $required"
    done
    case "$role" in *[!a-z0-9_]*) fail "role '$role' is not snake_case" ;; esac
done
[ "${#roles[@]}" -gt 0 ] || fail "no roles under roles/"

for role in "${roles[@]}"; do
    count="$(grep -cE "^[[:space:]]+name: ainova\.infra\.${role}[[:space:]]*$" tests/all-roles.yml || true)"
    [ "$count" -eq 2 ] || fail "tests/all-roles.yml imports '$role' $count time(s), expected 2 (apply and check)"
done
while read -r listed; do
    [ -d "roles/$listed" ] || fail "tests/all-roles.yml imports '$listed', which has no roles/$listed"
done < <(grep -oE 'ainova\.infra\.[a-z0-9_]+' tests/all-roles.yml | sed 's/^ainova\.infra\.//' | sort -u)

if grep -rnE 'state:[[:space:]]*latest|version:[[:space:]]*["'\'']?latest|:latest(["'\''[:space:]]|$)' roles/ requirements.yml container/ 2>/dev/null; then
    fail "a 'latest' version, state or tag is present; pin it"
fi
# shellcheck disable=SC2016 # literal Vault header, not an expansion
if grep -rlE '^\$ANSIBLE_VAULT;' --exclude-dir=.git --exclude-dir=.tmp --exclude-dir=.ansible . 2>/dev/null; then
    fail "an Ansible Vault payload is tracked; secrets reach a run through env or vars_prompt only"
fi

# shellcheck disable=SC2046 # word splitting of the file list is intended
python3 scripts/check-conditionals.py $(find roles tests -name '*.yml' -not -path 'tests/roles/*' | sort) ||
    fail "a conditional is not a string (quote it or use a folded scalar)"

if [ "$errors" -gt 0 ]; then
    echo "$errors structural failure(s); skipping Ansible checks" >&2
    exit 1
fi

# The collection under its FQCN, next to the pinned dependencies.
mkdir -p "$COLLECTIONS/ansible_collections/ainova"
ln -sfn "$ROOT" "$COLLECTIONS/ansible_collections/ainova/infra"
ansible-galaxy collection install -r requirements.yml -p "$COLLECTIONS" >/dev/null
export ANSIBLE_COLLECTIONS_PATH="$COLLECTIONS"
export ANSIBLE_LOCAL_TEMP="$SCRATCH/ansible-tmp"

echo "syntax-check tests/all-roles.yml"
ansible-playbook --syntax-check -i tests/inventory.yml tests/all-roles.yml

echo "local probes tests/local-probes.yml"
ANSIBLE_ROLES_PATH="$ROOT/tests/roles" ansible-playbook -i localhost, tests/local-probes.yml >/dev/null

echo "check-mode probes tests/check-mode-probes.yml"
ansible-playbook -i localhost, --check tests/check-mode-probes.yml >/dev/null

echo "ansible-lint"
ansible-lint

echo "OK: ${#roles[@]} role(s) valid"
