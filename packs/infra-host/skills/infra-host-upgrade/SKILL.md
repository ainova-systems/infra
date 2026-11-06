---
name: infra-host-upgrade
description: "Moves a pinned runtime, engine, image or tool version for one host, updating every place the project records the pin so the installer and the check cannot disagree."
argument-hint: "<host-id> <component> <new-version>"
---

# Upgrade a pinned version

An upgrade is a deliberate decision, never a reaction to a `DRIFT` line or a failed checksum.

## Steps

1. Confirm the new version exists upstream before editing: the package index on the target for a package pin, a dereferenced tag (`git ls-remote <repo> refs/tags/<tag>^{}`) for a Git-pinned runtime, the registry digest for an image.
2. Find every location profile `host_pin_locations` lists for this host, plus any further place a search of the repository finds the old version. Missing one makes the installer and the check disagree silently.
3. For a digest pin, derive the digest from a commit-addressed URL and record how; never copy one observed from a rolling URL.
4. Keep version, tag and commit consistent, and verify the tag dereferences to the recorded commit.
5. Write a decision record when the upgrade changes a control, a supply source or a trust assumption; a patch bump within the same source needs none.
6. Apply with `infra-host-install`, then `infra-host-check`, then `infra-host-refresh`.

## Verify

- `infra-host-check` reports the component as passing, not `DRIFT`; every pin location names the same version; profile `infra_validate` passes; the upgrade and its documentation land in one commit.

## Scope / hand-off

- Applying the change: `infra-host-install`. Recording it: `infra-host-refresh`.

## Constraints

- Never change a pin to match an observed host.
- Never take a digest from a rolling source.
