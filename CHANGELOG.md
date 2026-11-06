# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-06

First release: the `ainova.infra` collection.

### Added

- `host_base`: named admin account, key-only SSH through `devsec.hardening.ssh_hardening`, `ufw` default-deny inbound, unattended security updates, time sync.
- `container_engine`: pinned and held Docker Engine, rootful or rootless per account, log rotation, one scheduled prune timer per daemon.
- `github_actions_runner`: self-hosted runners as Compose containers, registered with a run-time token, deregistered on removal.
- `compose_host`: unprivileged deploy account, stack directories and private env-file location for pipeline-driven Compose stacks.
- `swarm_node`: Swarm init or join with cluster ports open to listed peers only.
- `host_health`: read-only uptime, memory, disk, failed units, container engine and backup freshness check.
- `dev_workstation`: per-account Git identity, pinned toolchain, Intelligence CLI and per-organization Git credentials.
- `agent_workstation`: per-account pinned coding-agent CLIs, terminal tools, shared browser and hidden-input credential helper.
- Role contract: `main` applies, `check` only reads; inputs asserted first; versions pinned; secrets `no_log`.
- Control container with pinned ansible-core 2.21.6, ansible-lint 26.11.0 and the `requirements.yml` collections.
- `scripts/validate.sh`: role layout, `latest` and Vault scans, syntax check of `tests/all-roles.yml`, ansible-lint.
