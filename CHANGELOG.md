# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
