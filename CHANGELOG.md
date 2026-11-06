# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-11-07

### Added

- Ansible engine reference: how a skill runs the wrapper end to end with no command typed by the owner.
- Profile key `host_trust`: records a new host's SSH key after an out-of-band fingerprint check.

## [0.2.0] - 2026-11-06

### Added

- `@ainova-systems/infra-host`: profile key `host_engine` (`ansible` or `none`), read by `infra-host-check`, `infra-host-install`, `infra-host-upgrade` and `infra-host-refresh`.
- `@ainova-systems/infra-host`: Ansible engine reference in `infra-host-install` `references/engines/ansible.md`: always limited, check-and-diff before apply, tags for partial runs, serial rollout for staging and production, pinned versions, run-time secrets with `no_log`, read-only check play, no remote-access changes to the control node.

## [0.1.0] - 2026-11-06

First release: six layer packs.

### Added

- `@ainova-systems/infra-core`: the `infra-discipline` rule, `infra-init` (profile and generated environments rule), `infra-audit`, and the profile and environments templates.
- `@ainova-systems/infra-host`: `infra-host-create`, `infra-host-check`, `infra-host-install`, `infra-host-refresh`, `infra-host-upgrade`, with a provider-neutral host control contract.
- `@ainova-systems/infra-platform`: `infra-runner-change`.
- `@ainova-systems/infra-stack`: `infra-stack-check` and `infra-stack-deploy`, with Compose, Swarm and k3s runtime references selected per environment class.
- `@ainova-systems/infra-release`: `infra-release-promote` and `infra-preview`.
- `@ainova-systems/infra-operator`: `infra-operator-slot` and `infra-operator-check`.
- Registry `index.yaml`, `scripts/validate-pack.sh` and its CI workflow.
- `docs/design.md` accepted, with the draft's open questions resolved.
