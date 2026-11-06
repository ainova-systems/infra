# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-06

### Added

- Ubuntu 26.04 LTS support in every role; it is the default for new hosts, and 24.04 LTS stays supported.
- `host_base_releases`: per-release sudo provider and time daemon (26.04 `sudo-rs` and `chrony`, 24.04 `sudo` and `systemd-timesyncd`); a release without an entry stops the run.
- `swarm_node_python_docker_packages`: per-release `python3-docker` pin (26.04 `7.1.0`, 24.04 `5.0.3`).
- `container_engine` stops rootless mode early when unprivileged user namespaces are restricted and the distribution `rootlesskit` AppArmor profile is missing.
- Credential scopes work on any HTTPS forge: optional `kind` (`github` or `generic`) and `username` per scope, shared by `dev_workstation` and `agent_workstation`.
- Repository rulesets in `.github/rulesets/` protecting `main` and the `v*` release tags.

### Changed

- Token files hold `TOKEN=<token>`; `GH_TOKEN=<token>` files from 0.1.0 still work for `github` scopes, and a file holding both is refused.
- The Git credential helper sends the scope's username (`x-access-token` by default for `github` scopes).
- `agent-auth` validates `github` scopes against the GitHub API (also on GitHub Enterprise hosts) and stores `generic` scopes without an API call unless they declare `validate_url`.
- `agent-auth list` prints each scope's kind and username.
- `dev_workstation` accepts `validate_url` in a scope so both roles take the same list; scope entries with any other unknown key are refused by both roles.
- `host_base_ntp_servers` with `chrony` adds servers beside the distribution's NTS pools.

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
