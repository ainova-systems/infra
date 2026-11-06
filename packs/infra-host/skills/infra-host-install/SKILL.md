---
name: infra-host-install
description: "Deploys or re-deploys one host by running the project's setup command, diagnosing failures in the repository rather than on the host, and driving the check to green. Use for first install, repair and after a pin change."
argument-hint: "<host-id> [phase]"
---

# Install a host

The installer is idempotent and re-runnable. Every fix belongs in the repository: a host-only change is drift with no review and no record.

## Steps

1. Resolve the host and profile `host_setup`. A partial run names one of profile `host_setup_phases`.
2. **Break glass.** Before any phase that can change remote access, firewall, accounts or boot access, confirm the out-of-band path in profile `host_break_glass` for the host's provider works. If it does not, stop.
3. **Preconditions.** Confirm the bootstrap preconditions the installer enforces, so a failure costs seconds rather than a half-run.
4. **Before-state.** Run `infra-host-check` and keep its output.
5. **Configuration first.** Provisioning installs every non-secret setting each account needs: Git identity, forge and credential-helper settings, tools. Hand the owner only authentication, through profile `host_secret_setup` or a native login. Never ask the owner to run configuration commands, and never clone, build or prepare a project as part of provisioning or login.
6. **Run** the setup command in the background with output to a log under the repository's ignored scratch directory: it installs packages and pulls images and outlives a foreground timeout.
7. **On failure,** read the log to the actual error line and diagnose before editing:
   - a broken-pipe exit from a reader that stops early is a script defect; make the reader consume its input.
   - a checksum mismatch is a supply-chain signal: never paste the observed digest; find what changed and prefer a commit-addressed source.
   - reproduce the failing command on the host before changing the script.
8. Repeat from step 6 until the installer exits `0`.
9. **After remote-access hardening,** open a second session as the named administrator and confirm login and non-interactive privilege elevation while the first stays open; only then change the connection user in profile `operator_env`.
10. Run `infra-host-check` until it passes, then `infra-host-refresh`.

## Verify

- Installer exit `0`, `infra-host-check` green, profile `infra_validate` green; the report lists every script defect found and fixed.

## Scope / hand-off

- Recording the new observed state: `infra-host-refresh`. Moving a version: `infra-host-upgrade`.

## Constraints

- Never patch the target by hand to make a run pass.
- Never accept a token as a command argument, print one, or write one into a log or the repository.
- Never weaken a firewall, TLS verification, authentication or audit control to get past a failure.
