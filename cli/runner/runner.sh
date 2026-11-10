#!/usr/bin/env bash
# The Linux half of the infra CLI. The CLI starts it directly on Linux and through wsl.exe on Windows,
# passing every value in the environment (WSLENV on Windows), never a secret on a command line:
#
#   INFRA_MODE           playbook | syntax | trust
#   INFRA_CACHE          cache root (default ${XDG_CACHE_HOME:-$HOME/.cache}/infra)
#   INFRA_SOURCE_URL     the infra repository, and INFRA_SOURCE_COMMIT the locked commit, or
#   INFRA_SOURCE_DIR     a local checkout instead (development; the CLI warns)
#   INFRA_BUNDLE         directory with the generated ansible.cfg, inventory.yml and playbooks
#   INFRA_ANSIBLE_DIR    the project's Ansible directory (group_vars/, host_vars/, roles/, playbooks)
#   INFRA_PLAYBOOK       a playbook in the bundle, or a path under INFRA_ANSIBLE_DIR (playbook mode)
#   INFRA_SSH_IDENTITY_FILE  admin key loaded from stdin into a per-run ssh-agent when none runs
#   INFRA_TRUST_ADDRESS, INFRA_TRUST_PORT, INFRA_TRUST_FINGERPRINT  (trust mode)
#
# Arguments are passed to ansible-playbook unchanged. The toolchain is pinned by the locked source:
# a virtualenv per collection/requirements.txt, dependency collections per collection/requirements.yml,
# and ainova.infra linked from the source's collection/ directory. Nothing is written to the project.
set -euo pipefail

die() { printf 'infra runner: %s\n' "$*" >&2; exit 2; }
note() { printf 'infra runner: %s\n' "$*" >&2; }

mode=${INFRA_MODE:-}
cache=${INFRA_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/infra}
mkdir -p "$cache"
chmod 700 "$cache"

hash12() { sha256sum "$1" | cut -c1-12; }

# First contact: record a host key only when it matches a fingerprint confirmed out of band.
if [ "$mode" = trust ]; then
  addr=${INFRA_TRUST_ADDRESS:-}; port=${INFRA_TRUST_PORT:-22}; want=${INFRA_TRUST_FINGERPRINT:-}
  [ -n "$addr" ] || die 'no address to trust'
  [[ $want =~ ^SHA256:[A-Za-z0-9+/]{43}$ ]] || die 'fingerprint must be SHA256:<43 characters>'
  line=$(ssh-keyscan -p "$port" -t ed25519 "$addr" 2>/dev/null | grep -v '^#' | head -n 1 || true)
  [ -n "$line" ] || die "no ed25519 host key from $addr:$port"
  got=$(printf '%s\n' "$line" | ssh-keygen -lf - | awk '{print $2}')
  [ "$got" = "$want" ] || die "host key of $addr is $got, not $want; not trusted"
  known="$HOME/.ssh/known_hosts"
  lookup=$addr; [ "$port" = 22 ] || lookup="[$addr]:$port"
  if ssh-keygen -F "$lookup" -f "$known" >/dev/null 2>&1; then
    note "$lookup already has an entry in $known"
  else
    mkdir -p "$HOME/.ssh"; chmod 700 "$HOME/.ssh"
    printf '%s\n' "$line" >> "$known"
    note "trusted $lookup $got in $known"
  fi
  # The CLI records the same line for the workstation's own ssh (Windows).
  printf 'INFRA_KNOWN_HOST %s\n' "$line"
  exit 0
fi

case $mode in playbook|syntax) ;; *) die "unknown INFRA_MODE '$mode'";; esac
[ -d "${INFRA_BUNDLE:-}" ] || die 'INFRA_BUNDLE is not a directory'
[ -d "${INFRA_ANSIBLE_DIR:-}" ] || die 'INFRA_ANSIBLE_DIR is not a directory'

# The locked source: a local checkout in development, else the exact commit, fetched once.
if [ -n "${INFRA_SOURCE_DIR:-}" ]; then
  source_dir=$INFRA_SOURCE_DIR
  [ -f "$source_dir/collection/galaxy.yml" ] || die "INFRA_SOURCE_DIR $source_dir holds no collection/galaxy.yml"
  source_key=dev-$(printf '%s' "$source_dir" | sha256sum | cut -c1-12)
else
  url=${INFRA_SOURCE_URL:-}; commit=${INFRA_SOURCE_COMMIT:-}
  [[ $url =~ ^https://[^[:space:]]+$ ]] || die 'INFRA_SOURCE_URL must be an https URL'
  [[ $commit =~ ^[0-9a-f]{40}$ ]] || die 'INFRA_SOURCE_COMMIT must be a 40-character commit'
  source_dir=$cache/source/$commit
  if [ ! -f "$source_dir/.complete" ]; then
    command -v git >/dev/null 2>&1 || die 'git is required to fetch the locked source'
    rm -rf "$source_dir.partial"
    mkdir -p "$source_dir.partial"
    git -C "$source_dir.partial" init -q
    git -C "$source_dir.partial" fetch -q --depth 1 "$url" "$commit"
    git -C "$source_dir.partial" -c advice.detachedHead=false checkout -q FETCH_HEAD
    got=$(git -C "$source_dir.partial" rev-parse HEAD)
    [ "$got" = "$commit" ] || die "fetched $got, not the locked $commit"
    touch "$source_dir.partial/.complete"
    rm -rf "$source_dir"
    mv "$source_dir.partial" "$source_dir"
  fi
  source_key=$commit
fi
collection=$source_dir/collection

# Pinned Python toolchain, one virtualenv per requirements content.
requirements=$collection/requirements.txt
[ -f "$requirements" ] || die "the source has no collection/requirements.txt"
venv=$cache/venv-$(hash12 "$requirements")
if [ ! -f "$venv/.complete" ]; then
  command -v python3 >/dev/null 2>&1 || die 'python3 is required for the Ansible toolchain'
  rm -rf "$venv"
  python3 -m venv "$venv" 2>/dev/null || die 'python3 cannot create a virtualenv; install the python3-venv package'
  note "installing the pinned toolchain into $venv"
  "$venv/bin/python" -m pip install --quiet --disable-pip-version-check -r "$requirements"
  touch "$venv/.complete"
fi

# Dependency collections, one directory per requirements.yml; ainova.infra linked from the source.
deps=$cache/collections/deps-$(hash12 "$collection/requirements.yml")
if [ ! -d "$deps/ansible_collections" ]; then
  rm -rf "$deps.partial"
  mkdir -p "$(dirname "$deps")"
  "$venv/bin/ansible-galaxy" collection install -r "$collection/requirements.yml" -p "$deps.partial" >/dev/null
  mv "$deps.partial" "$deps"
fi
own=$cache/collections/ainova-$source_key
mkdir -p "$own/ansible_collections/ainova"
ln -sfn "$collection" "$own/ansible_collections/ainova/infra"
export ANSIBLE_COLLECTIONS_PATH="$own:$deps"

# One private run directory per invocation: the generated files, and the project's variables linked in.
run=$(mktemp -d "$cache/run.XXXXXXXX")
# shellcheck disable=SC2329 # invoked by the EXIT trap
cleanup() {
  rm -rf "$run"
  [ -n "${agent_started:-}" ] && ssh-agent -k >/dev/null 2>&1 || true
}
trap cleanup EXIT
cp -R "$INFRA_BUNDLE/." "$run/"
for dir in group_vars host_vars; do
  [ -d "$INFRA_ANSIBLE_DIR/$dir" ] && ln -s "$INFRA_ANSIBLE_DIR/$dir" "$run/$dir"
done
chmod 700 "$run"
# Named explicitly: Ansible ignores an ansible.cfg in a world-writable directory.
export ANSIBLE_CONFIG=$run/ansible.cfg
export ANSIBLE_LOCAL_TEMP=$run/.ansible-tmp
cd "$run"

if [ "$mode" = syntax ]; then
  status=0
  for playbook in "$run"/*.yml; do
    case $(basename "$playbook") in inventory.yml) continue;; esac
    note "syntax-check $(basename "$playbook")"
    "$venv/bin/ansible-playbook" --syntax-check "$playbook" >/dev/null || status=1
  done
  while IFS= read -r playbook; do
    [ -n "$playbook" ] || continue
    note "syntax-check $playbook"
    "$venv/bin/ansible-playbook" --syntax-check "$INFRA_ANSIBLE_DIR/$playbook" >/dev/null || status=1
  done < "$run/project-playbooks.txt"
  exit "$status"
fi

playbook=${INFRA_PLAYBOOK:-}
case $playbook in
  '') die 'INFRA_PLAYBOOK is not set';;
  bundle:*) playbook=$run/${playbook#bundle:};;
  *) playbook=$INFRA_ANSIBLE_DIR/$playbook;;
esac
[ -f "$playbook" ] || die "missing playbook $playbook"

# Lets the generated site playbook refuse to apply host_base to the machine running Ansible.
[ -r /etc/machine-id ] || die '/etc/machine-id is not readable; run from Linux or WSL'
INFRA_CONTROL_MACHINE_ID=$(cat /etc/machine-id)
export INFRA_CONTROL_MACHINE_ID

if [ -z "${SSH_AUTH_SOCK:-}" ] && [ -n "${INFRA_SSH_IDENTITY_FILE:-}" ]; then
  key=$INFRA_SSH_IDENTITY_FILE
  [ -r "$key" ] || die "INFRA_SSH_IDENTITY_FILE $key is not readable"
  eval "$(ssh-agent -s)" >/dev/null
  agent_started=1
  # From stdin: a key on a Windows drive has open permissions that ssh refuses for a file path.
  SSH_ASKPASS=/bin/false SSH_ASKPASS_REQUIRE=force ssh-add -q - < "$key" || die "could not load $key into the run's ssh-agent"
fi

status=0
"$venv/bin/ansible-playbook" "$playbook" "$@" || status=$?
exit "$status"
