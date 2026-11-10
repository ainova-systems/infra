---
name: infra-operator-slot
description: "Adds, removes or moves an agent-runtime slot within its slot class - checkout, runtime manifest pool, account and resource budget - keeping slot classes as trust boundaries. Use when the runtime needs more or fewer slots, or a new class such as a release slot."
argument-hint: "<add|remove> <slot> <class>"
---

# Change an agent-runtime slot

Which phases a slot runs belongs to the runtime's phase skills; where it runs and with which rights belongs here.

## Steps

1. **State.** Read profile `operator_manifest`, `slot_classes`, `slot_accounts`, `slot_credentials` and `slot_resource_budget`, and run `infra-operator-check` as the before-state.
2. **Class.** The slot joins exactly one class from profile `slot_classes`. A new class is a decision record first: name its account, the credentials it may hold, and why no existing class fits.
3. **Release class.** A release slot runs as its own account, distinct from every development and clarification account, with its own credential store; it holds deploy credentials and no autonomous code-writing phase is routed to it.
4. **Budget.** Adding a slot keeps the host within profile `slot_resource_budget`: memory per concurrent suite times allowed suites, plus runners and services on the same host. Raise the budget only with the owner's acceptance.
5. **Checkout.** The slot's checkout follows profile `slot_checkout_pattern` and is created by the project's own worktree or clone procedure on an explicit request; provisioning the account does not create it.
6. **Manifest.** Add or remove the slot in the runtime's pool for its class in profile `operator_manifest`, and in every list the runtime's configuration keeps alongside it. Pool limits that must equal the slot count change in the same edit.
7. **Host side.** When the account or its credential store changes, hand off to the host owner of profile `operator_host` (`infra-host-install` on that host's repository); authentication stays an owner step inside the account.
8. Re-run `infra-operator-check` and the runtime's own manifest validation.

## Verify

- `infra-operator-check` passes; the manifest's pools list exactly the slots of profile `slot_classes`; the runtime validates its manifest.

## Scope / hand-off

- Phase behaviour and routing: the runtime's phase skills (the operator pack in the dev packs).
- Accounts, services and credential stores on the host: `infra-host-install` in the repository that owns the host.

## Constraints

- Never give a development or clarification slot deploy credentials.
- Never let a release slot share an account, credential store or checkout with another class.
- Never remove a slot that holds unpushed work; the runtime moves it first.
