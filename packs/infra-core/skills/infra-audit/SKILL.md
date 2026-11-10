---
name: infra-audit
description: "Read-only cross-layer audit of a repository's infrastructure state against its profile: profile and installed packs agree, every environment meets its contract, no secret in tracked source, decisions cover deviations. Use before committing an infrastructure change and to answer what is missing."
---

# Audit infrastructure state

Read-only. Reports; never edits a file, a host or a pin.

## Steps

1. Read `infra-project-profile.md` and `infra-environments.md`. Missing either is the first finding: run `infra-init`.
2. **Profile vs packs.** `infra_layers` equals the installed infra packs; every class named anywhere in the profile is in `env_classes` or is a slot class.
3. **Contracts per layer**, only for installed layers:
   - host: every manifest matched by `host_manifests` has a check command, an observed-state file and a recovery path (`infra-host-check` defines each).
   - stack: every class in `env_classes` has deploy, check, rollback and health from `stack_deploy`, `stack_check`, `stack_rollback` (`infra-stack-check` runs the detailed pass).
   - release: every class after the first in `promotion_path` has a gate in `release_gates` and a trigger in `release_trigger`.
   - operator: every slot in `slot_classes` has an account in `slot_accounts`, and no release slot shares an account with a development slot.
4. **Secrets.** Search tracked files for credential-looking values and for env files that are not git-ignored; check every class has a store in `secret_stores`. Report paths only, never values.
5. **Decisions.** Every deviation the generated rule or a manifest notes cites a record in profile `infra_decisions_dir` that exists.
6. **Validation.** Run profile `infra_validate` when set.

## Verify

- Each finding names the file, the key or contract it breaks, and the minimal fix; a clean run states which layers were checked and which were skipped because their pack is not installed.

## Scope / hand-off

- Generating or repairing the profile and rule: `infra-init`.
- Live host state: `infra-host-check`; live stack health: `infra-stack-check`; slot isolation on the hosts: `infra-operator-check`.

## Constraints

- Never edit, commit or push.
- Never print a secret value; a path and the kind of value are enough.
- A check that could not run is a finding, never a pass.
