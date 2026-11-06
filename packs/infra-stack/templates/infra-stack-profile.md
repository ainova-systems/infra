---
description: Project profile keys the infra-stack pack reads, with their defaults
---

# Infrastructure profile keys: stack (schema)

> Keys infra-stack reads from `infra-project-profile.md`. Every key is a `class=value` map over
> profile `env_classes`; a project may run different runtimes per class.

- stack_runtimes: none               <!-- class=runtime, runtime from: compose, swarm, k3s; e.g. staging=compose, production=swarm -->
- stack_dirs: none                   <!-- class=path of the stack definition in the repository -->
- stack_deploy: none                 <!-- class=deploy entrypoint: a command or a CI workflow and job -->
- stack_check: none                  <!-- class=read-only health check: command, endpoint or workflow -->
- stack_rollback: none               <!-- class=rollback path: command, workflow, or the runtime's own rollback -->
- stack_secrets: none                <!-- class=how the stack receives secrets: runtime secrets, env file outside source, forge environment -->
