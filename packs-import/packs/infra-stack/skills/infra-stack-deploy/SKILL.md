---
name: infra-stack-deploy
description: "Deploys one environment's stack through the project's own deploy entrypoint with a check before and after and the rollback path ready, never by hand on the host. Use when an environment needs a deploy outside its normal pipeline, or to drive a failed one to a known state."
argument-hint: "<class> [revision]"
---

# Deploy a stack

The project's entrypoint deploys; this skill makes sure it runs against a checked contract and ends in a known state.

## Steps

1. **Authority.** Read the class row in the project's `infra-environments.md`: who may deploy and the highest autonomy tier. A class that only the pipeline or the owner deploys is triggered through that pipeline, with owner approval when the row says so. Production-class deploys are never started from an unattended run.
2. **Contract.** Run `infra-stack-check` for the class; a missing deploy, check or rollback is a stop.
3. **Before-state.** Run the class's profile `stack_check` and record the running revision; that revision is the rollback target.
4. **Deploy** through profile `stack_deploy` only: the pipeline job or the command it names, with the revision pinned (tag or digest), never a mutable reference.
5. **After-state.** Run `stack_check` again. A failed or rolled-back update is a failed deploy even when the old replicas are healthy again.
6. **On failure** take the class's profile `stack_rollback` path to the recorded revision, re-check, and report both runs. Diagnose from logs the runtime keeps; fix in the repository.

## Verify

- The after-state check passes on the intended revision, or the rollback restored the recorded revision and the report says the deploy failed.

## Scope / hand-off

- Promotion and release gates: `infra-release-promote`. Preview environments: `infra-preview`.

## Constraints

- Never run runtime commands by hand on a shared host to deploy, and never edit a definition on the host.
- Never deploy a mutable image reference to a staging- or production-class environment.
- Never initialise or reconfigure a cluster on a shared daemon; rehearsals use a disposable one.
