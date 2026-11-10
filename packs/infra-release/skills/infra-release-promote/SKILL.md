---
name: infra-release-promote
description: "Moves one revision to the next class of the project's promotion path through its trigger, after every gate of that class holds, and confirms the result. Use to promote to staging or production, and to answer what blocks a promotion."
argument-hint: "<revision> <target-class>"
---

# Promote a revision

Promotion is the project's trigger firing on a checked revision. This skill checks the gates and fires the trigger; the pipeline deploys.

## Steps

1. **Path.** The target class follows the revision's current class in profile `promotion_path`; skipping a class is refused.
2. **Gates.** Every item of the target's profile `release_gates` holds for this exact revision: checks green on it, approvals given, rehearsals run. A gate earned on an earlier revision does not count.
3. **Rollback ready.** `infra-stack-check` for the target class passes, and its running revision is recorded as the rollback target.
4. **Approval.** A production-class promotion needs the owner's explicit approval in this session, after the gates are reported; never inferred from an earlier one.
5. **Trigger.** Fire the target's profile `release_trigger` (push the branch, create the tag, approve the deployment) with the revision pinned.
6. **Confirm.** Follow the pipeline to its end, then run the target's profile `stack_check`. A failed or rolled-back deploy is reported as a failed promotion with the restored revision.

## Verify

- The target class runs the promoted revision and its check passes, or the report names the failed gate or the rollback that restored the previous revision.

## Scope / hand-off

- Versioning, changelog and tagging conventions: the project's release skill (for example `git-create-release` in the core dev pack), which this skill's trigger may call.
- Deploying outside the pipeline: `infra-stack-deploy`.

## Constraints

- Never promote past a failing or stale gate.
- Never fire a production-class trigger from an unattended run.
- Never retag or move a published release reference to change what a class deploys.
