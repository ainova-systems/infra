---
name: infra-host-check
description: "Runs the project's read-only readiness, installation and security check for one host and interprets every line. Use before and after any host change, and to answer what state a host is in."
argument-hint: "<host-id>"
---

# Check a host

Read-only. Never changes the target, and never edits a pin or a control to make a line pass.

## Steps

1. Resolve the host: valid ids are the directories matched by profile `host_manifests`. With no argument, list them and ask.
2. Read profile `host_check`, and the engine page in `infra-host-install`'s `references/engines/` when profile `host_engine` is not `none`. When it is `none`, or the manifest declares no check, stop and report that the host has no audit yet; never improvise one.
3. Run the command from the repository root. Connection values come from profile `operator_env`; a missing name fails closed and is reported by name.
4. Read every line, not only the exit code:
   - `FAIL` in readiness or security: blocking, and the only cause of a nonzero exit.
   - `MISSING`: not installed yet. Expected on a clean host; next is `infra-host-install`.
   - `AUTH_REQUIRED`: configuration is installed and the owner must authenticate inside that account. Report the exact helper from profile `host_secret_setup` or the native login. A configuration-only pass never makes repository operations or builds ready.
   - `DRIFT`: installed version differs from the pin. Find which side is wrong; never edit the pin to match the host.
   - `ACCEPTED`: a deviation closed by a decision record. Report it once; do not ask the owner to reconfirm it each run.
5. Report failing controls by their exact names, each with what would fix it.

## Verify

- The command's own exit code is the gate: `0` means every mandatory control passed. The report lists every non-`PASS` line with its meaning.

## Scope / hand-off

- Installing or repairing: `infra-host-install`. Recording what was found: `infra-host-refresh`. Moving a pin: `infra-host-upgrade`.

## Constraints

- Never mutate the target, a pin, or a control from this skill.
- A control that contradicts direct observation is a defect in the check: report it and fix the check through a normal change. A false pass is worse than a missing check.
