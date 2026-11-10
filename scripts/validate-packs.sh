#!/usr/bin/env bash
# Validate every pack under packs/:
# - every rule, agent, skill and template name carries the infra- prefix.
# - rules and agents have description frontmatter; agents have tier + access.
# - each skill folder has SKILL.md whose name matches the folder, a description,
#   and the Verify, Scope / hand-off and Constraints sections.
# - index.yaml and the packs on disk agree in both directions.
# - every backticked infra-* name an artifact cites resolves to a real artifact.
# - profile keys: every key a schema defines is read by some artifact, and every
#   snake_case key an artifact cites in backticks is defined by some schema.
# Zero dependencies: bash + awk + grep + sed.

set -euo pipefail

PACK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKS_DIR="$PACK_ROOT/packs"
PREFIX="infra-"

errors=0
fail() { echo "FAIL: $1" >&2; errors=$((errors + 1)); }

has_frontmatter_key() {
    awk -v key="$2" '
        NR == 1 && $0 != "---" { exit 1 }
        NR > 1 && $0 == "---" { exit found ? 0 : 1 }
        $0 ~ "^" key ":" { found = 1 }
    ' "$1"
}

[ -d "$PACKS_DIR" ] || { echo "FAIL: packs/ directory not found at $PACK_ROOT" >&2; exit 1; }

names=""
pack_count=0
for pack_dir in "$PACKS_DIR"/*/; do
    [ -d "$pack_dir" ] || continue
    pack="$(basename "$pack_dir")"
    pack_count=$((pack_count + 1))
    echo "pack '$pack'"
    case "$pack" in "$PREFIX"*) ;; *) fail "pack folder '$pack' lacks the $PREFIX prefix" ;; esac

    for f in "$pack_dir"rules/*.md; do
        [ -e "$f" ] || break
        base="$(basename "$f" .md)"
        names="$names $base"
        case "$base" in "$PREFIX"*) ;; *) fail "[$pack] rule '$base' lacks the $PREFIX prefix" ;; esac
        has_frontmatter_key "$f" description || fail "[$pack] rule '$base' missing description frontmatter"
    done

    for f in "$pack_dir"agents/*.md; do
        [ -e "$f" ] || break
        base="$(basename "$f" .md)"
        names="$names $base"
        case "$base" in "$PREFIX"*) ;; *) fail "[$pack] agent '$base' lacks the $PREFIX prefix" ;; esac
        for key in description tier access; do
            has_frontmatter_key "$f" "$key" || fail "[$pack] agent '$base' missing $key frontmatter"
        done
    done

    for d in "$pack_dir"skills/*/; do
        [ -d "$d" ] || break
        name="$(basename "$d")"
        names="$names $name"
        case "$name" in "$PREFIX"*) ;; *) fail "[$pack] skill '$name' lacks the $PREFIX prefix" ;; esac
        if [ ! -f "$d/SKILL.md" ]; then
            fail "[$pack] skill '$name' missing SKILL.md"
            continue
        fi
        has_frontmatter_key "$d/SKILL.md" description || fail "[$pack] skill '$name' missing description frontmatter"
        fm_name="$(grep -m1 '^name:' "$d/SKILL.md" | sed 's/^name:[[:space:]]*//' | tr -d '"' || true)"
        [ "$fm_name" = "$name" ] || fail "[$pack] skill '$name' frontmatter name is '$fm_name' (must match folder)"
        for section in "## Verify" "## Scope / hand-off" "## Constraints"; do
            grep -q "^$section" "$d/SKILL.md" || fail "[$pack] skill '$name' missing section '$section'"
        done
    done

    for f in "$pack_dir"templates/*.md; do
        [ -e "$f" ] || break
        base="$(basename "$f" .md)"
        names="$names $base"
        case "$base" in "$PREFIX"*) ;; *) fail "[$pack] template '$base' lacks the $PREFIX prefix" ;; esac
        has_frontmatter_key "$f" description || fail "[$pack] template '$base' missing description frontmatter"
    done
done
[ "$pack_count" -gt 0 ] || fail "no packs found under packs/"

# Registry index: a pack missing from it ships to nobody; an entry pointing nowhere fails at install.
INDEX_FILE="$PACK_ROOT/index.yaml"
if [ ! -f "$INDEX_FILE" ]; then
    fail "index.yaml not found"
else
    declared=" $(awk '$1 == "path:" { p = $2; gsub(/"/, "", p); printf "%s ", p }' "$INDEX_FILE")"
    for p in $declared; do
        [ -d "$PACK_ROOT/$p" ] || fail "[index.yaml] path '$p' does not exist"
    done
    for pack_dir in "$PACKS_DIR"/*/; do
        pack="$(basename "$pack_dir")"
        case "$declared" in *" packs/$pack "*) ;; *) fail "[index.yaml] pack '$pack' is not declared" ;; esac
    done
fi

# Artifacts that cite other artifacts: SKILL.md files and rules.
artifact_files="$(find "$PACKS_DIR" \( -path '*/skills/*/SKILL.md' -o -path '*/rules/*.md' \) -type f | sort)"

# Every backticked infra-* name resolves.
cited="$(echo "$artifact_files" | xargs grep -ohE '`infra-[a-z0-9-]+`' | tr -d '`' | sort -u)"
for ref in $cited; do
    case " $names " in *" $ref "*) ;; *) fail "reference \`$ref\` names no artifact in this repository" ;; esac
done

# Profile keys: defined in templates/*-profile.md as '- key: default' lines.
schema_files="$(find "$PACKS_DIR" -path '*/templates/*-profile.md' -type f | sort)"
defined="$(echo "$schema_files" | xargs grep -hE '^- [a-z][a-z0-9_]*:' | sed -E 's/^- ([a-z0-9_]+):.*/\1/' | sort -u)"
used="$(echo "$artifact_files" | xargs grep -ohE '`[a-z][a-z0-9]*(_[a-z0-9]+)+`' | tr -d '`' | sort -u)"
for key in $used; do
    echo "$defined" | grep -qx "$key" || fail "artifact cites \`$key\`, which no profile schema defines"
done
for key in $defined; do
    echo "$used" | grep -qx "$key" || fail "profile key '$key' is defined but no skill or rule reads it"
done

if [ "$errors" -gt 0 ]; then
    echo "$errors error(s)" >&2
    exit 1
fi
echo "OK: $pack_count pack(s) valid"
