---
description: Project profile keys the infra-release pack reads, with their defaults
---

# Infrastructure profile keys: release (schema)

> Keys infra-release reads from `infra-project-profile.md`.

- promotion_path: none               <!-- ordered classes a change moves through, e.g. preview > staging > production -->
- release_trigger: none              <!-- class=what deploys it: a branch push, a tag pattern or a manual approval -->
- release_gates: none                <!-- class=what must hold before it deploys: checks, approvals, rehearsals -->
- preview_lifecycle: none            <!-- create=..., reset=..., cleanup=... workflows or commands for preview instances; none = no previews -->
- preview_ttl: none                  <!-- how long an idle preview instance may live before cleanup; none = until its pull request closes -->
- preview_capacity: none             <!-- how many preview instances or suites may run at once, and what waits -->
