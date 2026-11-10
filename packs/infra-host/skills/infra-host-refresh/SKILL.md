---
name: infra-host-refresh
description: "Re-reads a live host and rewrites its observed-state file and observed manifest fields so recorded state matches reality. Use after an install, an upgrade, or any host change."
argument-hint: "<host-id>"
---

# Refresh recorded host state

The observed-state file is a dated snapshot of what was found; the manifest stays desired state. Keeping them apart is what makes drift visible.

## Steps

1. Resolve the host. Unreachable means stop and say so; never refresh from memory or from the previous file.
2. Run `infra-host-check` first; a refresh of a failing host says so in the same edit.
3. Collect observed state read-only in one round trip, through the engine's check play when profile `host_engine` is not `none` (rules in `infra-host-install`'s `references/engines/`): OS and kernel, install dates, resolved version of every pinned component, held packages, accounts and groups, firewall, listeners, user services.
4. Rewrite the file profile `host_observed_state` names: date, host table, toolchain with versions, security posture, restart behaviour, known gaps, and the decision records that accepted each open risk.
5. Keep addresses, login names and provider instance ids out of it; they belong in profile `operator_env`.
6. Update only the manifest fields profile `host_observed_fields` lists. Pins and policy change through `infra-host-upgrade` or a deliberate edit.
7. When observation contradicts a document, fix the document in the same change.

## Verify

- Profile `infra_validate` passes, and every version in the observed-state file came from this run's output.

## Scope / hand-off

- Fixing what the refresh found: `infra-host-install` or `infra-host-upgrade`.

## Constraints

- Never write a desired-state field from observation.
- Never record a value the run did not observe.
