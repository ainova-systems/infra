# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.1] - 2026-11-10

### Added

- `infra setup`: links the project and keeps the operator's `dev` shortcut for `infra connect` in both PowerShell
  profiles, replacing the per-repository installers' blocks.
- Host secrets name the runs that need them (`{ name, runs: [check] }`); a plain name still means every run.

## [0.5.0] - 2026-11-10

One repository and one version for the CLI, the collection and the packs (decisions 0001-0005). The repository was
renamed from `infra-ansible`; the packs moved in from `intelligence-infra-packs` with their history.

### Added

- `@ainova-systems/infra`, the `infra` CLI: `infra.yaml` manifest and `infra.lock`; the pinned toolchain from the
  locked source; generated inventory, `ansible.cfg` and per-host apply and check playbooks with their guards;
  `check`, `plan`, `apply`, `run`, `trust`, `ssh`, `connect`, `validate`, `status`, `update`, `host add|retire|remove`,
  `link`, `render`; a runner for Linux and WSL; npm release through trusted publishing.
- `host_base` check: reports the sources the firewall dropped SSH from in the last 24 hours, so a network missing
  from `host_base_ssh_allow_from` shows by name instead of as a client timeout.
- Packs: the `infra` engine reference (`infra-host-install` `references/engines/infra.md`); `host_engine: infra`.

### Changed

- The collection lives in `collection/`, with its Python toolchain pinned in `collection/requirements.txt` and
  `requirements-lint.txt`, which the control container installs. Consumers install it from
  `git+https://github.com/ainova-systems/infra.git#/collection,vX.Y.Z`, or through the CLI.

### Removed

- Packs: the Ansible engine reference (`references/engines/ansible.md`); projects run the CLI instead of a wrapper.

## [0.4.4] - 2026-11-07

### Fixed

- `dev_workstation`: the gh wrapper hands gh the token of the scope that covers the repository's owner, as the Git helpers choose by URL, instead of always the account's gh scope; `GH_SCOPE` names a scope explicitly.

## [0.4.3] - 2026-11-07

### Added

- `host_base_extra_admins`: further admin accounts, one per person, each with its keys, passwordless sudo and `AllowUsers`; the check asserts every one and the exact sudo grant.
- `host_base` refuses a run that connects as an account it does not declare, which would lose its own sudo and SSH.

## [0.4.2] - 2026-11-07

### Fixed

- `host_base`: on a host where `ssh.socket` is required by `ssh.service` (Ubuntu since 23.04), the SSH hardening no longer stops sshd and leaves it unable to start; the socket is disabled and the service enabled first.
- `host_base`: `--check --diff` no longer fails on a host whose admin account the run creates; it reports the keys the apply installs.

### Changed

- README: on a host the roles never applied, `--check` stops at the first role that adds a package source; `host_base` is covered completely.

### Added

- `tests/check-mode-probes.yml`: validation runs role tasks under `--check`.
- `host_base` check: fails when sshd would not start after a reboot (no SSH unit enabled, or the service requires a masked socket).

## [0.4.1] - 2026-11-07

### Fixed

- `agent_workstation`, `swarm_node`: three conditionals that parsed as mappings and failed when the check ran are strings again.

### Added

- `scripts/check-conditionals.py`: validation fails on any conditional that is not a string.

## [0.4.0] - 2026-11-07

### Added

- `coding_agent_updates`: coding-agent CLIs on a vendor release channel (`stable` or `latest`), updated on a timer for listed accounts without restarting running sessions.
- `github_actions_runner_daemon: rootless`: runners in the rootless daemon of `github_actions_runner_account`, with the socket group resolved inside the daemon's namespace and `br_netfilter` persisted.
- `github_actions_runner`: `adopt: true` replaces an idle foreign container that mounts the instance's volume, so registered runners move over without a new registration.
- `github_actions_runner`: per-instance `image` and `env`.
- `github_actions_runner`: CPU and memory limits change in place on a running container; lowering a limit waits for an idle runner.
- `host_base_hostname`: static hostname and its `/etc/hosts` line, set and checked.
- `host_base_extra_packages`: further distribution packages, installed and checked.
- `dev_workstation_accounts`: per-account `home_mode`, `workspace`, `workspace_mode`, `authorized_keys`, `dotnet_tools` and `gh_scope`.
- `dev_workstation_extra_packages`, `dev_workstation_npm_tools` (exact versions, lifecycle scripts disabled) and the non-secret `dev_workstation_environment`.
- `dev_workstation_intelligence_update_mode: channel`: the Intelligence CLI follows an npm dist-tag every `dev_workstation_intelligence_update_interval_hours`.
- `dev_workstation_gh_wrapper`: `gh` authenticates with the account's gh scope token, without a login file or a global token variable.
- `container_engine_rootless_login_env`: login shells of the rootless accounts export `DOCKER_HOST` and `XDG_RUNTIME_DIR`.
- `agent_workstation_coding_cli_mode: external`: another role owns the coding-agent CLIs, and Herdr integrations resolve them on the account's `PATH`.
- `agent_workstation_service_tokens` and `agent-auth service <name>`: hidden-input tokens for services that are not Git forges.
- `agent_workstation`: Herdr starts in the account's workspace.
- `container_engine`, `dev_workstation`: another package source naming a repository of the role with a different keyring stops the run, named in the message.
- `tests/local-probes.yml`: runs the new probes and checks the new derivations and rendered scripts on the control node.

### Changed

- `host_base_ssh_allow_tcp_forwarding` is a boolean, default `false`; `"yes"` and `"no"` still work, and the check reads it from `sshd -T`.
- `github_actions_runner`: containers carry the label `infra.identity`; a runner created by 0.3.x is recreated once, when idle.
- `github_actions_runner`: the check also asserts the mounted socket.
- `agent_workstation`: account entries with unknown keys are refused; `service` is a reserved scope name; `.config/service-tokens` joins the private directories.
- `dev_workstation`: home modes are `0700` or `0750`; `dev_workstation_dotnet_tools` entries are `{name, version}` only.

## [0.3.1] - 2026-11-07

### Fixed

- `container_engine`: the check reads rootless daemons without the role's own helper, so a host the role has not applied yet no longer reports every daemon as down.
- `container_engine`, `host_base`: an empty failure list no longer renders as `None`, which reported a false failure on every passing host and blocked an apply whose packages matched the pin.

## [0.3.0] - 2026-11-07

### Added

- `role_checks`: runs each listed role's check and reports every failed control in one run instead of stopping at the first.
- `tests/local-probes.yml`: runs check probe commands on the control node during validation.

### Fixed

- `host_health`: the disk probe no longer combines `df -P` with `--output`, which GNU df refuses, so free disk is read on every host.

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

## Packs history (`intelligence-infra-packs`)

The packs were versioned in their own repository until 0.5.0.

### [0.2.1] - 2026-11-07

### Added

- Ansible engine reference: how a skill runs the wrapper end to end with no command typed by the owner.
- Profile key `host_trust`: records a new host's SSH key after an out-of-band fingerprint check.

### [0.2.0] - 2026-11-06

### Added

- `@ainova-systems/infra-host`: profile key `host_engine` (`ansible` or `none`), read by `infra-host-check`, `infra-host-install`, `infra-host-upgrade` and `infra-host-refresh`.
- `@ainova-systems/infra-host`: Ansible engine reference in `infra-host-install` `references/engines/ansible.md`: always limited, check-and-diff before apply, tags for partial runs, serial rollout for staging and production, pinned versions, run-time secrets with `no_log`, read-only check play, no remote-access changes to the control node.

### [0.1.0] - 2026-11-06

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
