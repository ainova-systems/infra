---
name: infra-operator-check
description: "Read-only check that the agent runtime's slots keep their trust boundaries: every slot in exactly one class, accounts and credentials per class, release isolated, resource budget enforced, and the runtime manifest agreeing with the profile. Use before and after a slot change, and to answer whether a slot may hold a credential."
---

# Check agent-runtime slots

Read-only. Reports; changes nothing on the host or in the manifest.

## Steps

1. **Manifest vs profile.** Every slot in the pools of profile `operator_manifest` appears in exactly one class of `slot_classes`, and every slot there appears in the manifest.
2. **Accounts.** Each class runs as its account in profile `slot_accounts`. A release account is shared with no other class.
3. **Credentials.** Each class's credential names match profile `slot_credentials`; deploy credentials appear only under release. When the host is reachable, compare against the credential names present in each account's store, names only.
4. **Budget.** The mechanism in profile `slot_resource_budget` is wired into every phase that runs suites (for example a queue variable on each test-running operation), and host memory covers the worst case.
5. **Runtime.** The service in profile `operator_service` is the one the manifest describes; run the runtime's own validation when it has one.

## Verify

- Each finding names the slot, the class, and the item that breaks; a clean run lists the classes and slots it checked.

## Scope / hand-off

- Fixing a finding: `infra-operator-slot`, or `infra-host-install` for the account side.

## Constraints

- Never print a credential value; names only.
- A check that could not reach the host is reported as unchecked, never as passed.
