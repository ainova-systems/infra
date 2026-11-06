---
description: Project profile keys the infra-platform pack reads, with their defaults
---

# Infrastructure profile keys: platform (schema)

> Keys infra-platform reads from `infra-project-profile.md`.

## Container engine

- container_engine: rootless-docker  <!-- engine the platform layer installs: rootless-docker | rootful-docker | podman; rootful needs a decision record naming the authority it grants -->
- engine_cleanup: none               <!-- the scheduled cleanup definition per daemon; none = no scheduled cleanup -->

## Runners

- runner_definitions: none           <!-- where runner desired state lives (definition files or manifest section), per host or class -->
- runner_labels: none                <!-- label=class map for every self-hosted runner label, e.g. build=cicd, preview=preview, production=production -->
- runner_command: none               <!-- operator command that registers, applies, stops or checks one runner, with <runner> and <mode> -->
- runner_limits: none                <!-- CPU and memory limit per runner or runner group, e.g. build=4cpu/8GiB -->
- runner_token_names: none           <!-- logical names of the one-time registration tokens, with <runner>; values never in the repository -->
