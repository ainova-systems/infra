---
description: Always-on infrastructure discipline - desired state, secret placement, environment classes, idempotency and decision records
---

# Infrastructure Discipline

The repository holds desired state; the live system is observed state. Every infrastructure change moves the first and then proves the second.

- **Desired state is reviewed source.** Hosts, platforms, stacks, releases and agent slots are declared in the project's own files (paths in the profile). A change made only on a live system is drift with no review and no record: fix the source and re-apply instead.
- **Observed state is a dated snapshot, never a copy of the desired state.** Record what a read-only check actually returned, with the date; keep it apart from the manifest so drift stays visible.
- **Check, change, check.** Run the read-only check before and after every change. A check that contradicts direct observation is a defect in the check, fixed before anything else.
- **Idempotent and fail-closed.** Every setup step is safe to repeat, validates its inputs and stops on the first unexpected state rather than guessing.
- **Pin, verify, review.** Versions, images and digests are pinned in every place a project records them, from a commit-addressed source; a drifting value is investigated, never copied into the pin.
- **Environment classes are trust boundaries.** `dev`, `cicd`, `preview`, `staging` and `production` each state who may deploy, the highest autonomy tier allowed, the required checks and whether rollback is rehearsed; the project's generated environments rule is the source for its classes.
- **Secrets never pass through the repository.** Credentials live in the owning account's native credential store or a private env file readable only by that account, outside tracked source, populated interactively; the git-ignored operator env file holds addresses, administrator logins and opaque provider IDs only; manifests and documents name secrets by logical reference. Never put a secret in a command argument, a log, a manifest, a commit or a chat.
- **Provisioning, authentication and project setup are separate acts.** Provisioning installs ready-to-use non-secret configuration; authentication only stores credentials; cloning, building or deploying a project needs its own explicit request.
- **A deviation is a decision record.** Every material choice, and every departure from the controls above, gets a record in the project's decisions directory before or with the change.
- **Never weaken a control to pass a check.** Firewalls, TLS verification, authentication, audit logging and isolation stay on; a genuinely wrong control changes through its own reviewed decision.
