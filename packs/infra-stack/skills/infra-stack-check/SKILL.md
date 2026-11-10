---
name: infra-stack-check
description: "Read-only check that every environment's application stack meets the stack contract - deploy, check, rollback, health and secrets by reference - against its runtime's rules, and optionally reads live health. Use before a deploy, after a stack change, and to answer whether an environment is deployable."
argument-hint: "[class]"
---

# Check the stack contract

Read-only. A missing piece is a finding; never fill it in from this skill.

## Steps

1. For each class in profile `env_classes` (or the one named), read its runtime from profile `stack_runtimes` and the runtime's page in this skill's `references/runtimes/`. A runtime without a page is checked against the contract alone, with the runtime's rollout, rollback and secret mechanism stated in the project's decision records.
2. **Contract.** The class has, in the repository: a definition at profile `stack_dirs`, a deploy entrypoint at `stack_deploy`, a read-only check at `stack_check`, a rollback path at `stack_rollback`, a health check on every long-running service, and secrets delivered as `stack_secrets` states.
3. **Host-independence.** The definition names no host address, host path outside its own volume set, or credential value; host-specific values come from the environment or the runtime's secrets.
4. **Runtime rules.** Apply the runtime page's checklist (update order, rollback behaviour, secret mechanism, resource limits).
5. **Images.** Every image is pinned by version, and production-class images by digest before a guarded update.
6. **Live health** only when asked: run the class's `stack_check` and report its result verbatim.

## Verify

- One row per class: runtime, each contract item present or missing with its path, runtime-rule findings, and live health when it ran.

## Scope / hand-off

- Deploying: `infra-stack-deploy`. Promotion between classes: `infra-release-promote`. Missing profile values: `infra-init`.

## Constraints

- Never edit a stack, deploy or restart from this skill.
- Never print a secret value from a definition or environment; report the path.
