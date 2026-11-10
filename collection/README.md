# ainova.infra

Generic, provider-neutral Ansible roles for the hosts an AI-first team runs: baseline and hardening, container
engine, self-hosted CI runners, Compose and Swarm hosts, developer and coding-agent workstations, channel-updated
coding-agent CLIs, and a read-only health floor. Shipped as the collection `ainova.infra`.

The collection carries behaviour; each project carries its state. A project's own repository holds the variables
of every host and pins this repository by tag. Two projects using the same roles share no inventory and know
nothing of each other. The [infra CLI](../cli/README.md) is the usual way to run it: it generates the inventory
and the apply and check playbooks from the project's `infra.yaml`, and installs this collection at the locked
version. The collection also works without the CLI.

Built and maintained by [Ainova Systems](https://www.ainovasystems.com). The operating rules these roles implement
are the [infra packs](../packs/README.md) in this repository.

## Roles

| Role | Responsibility | Key variables |
|---|---|---|
| `host_base` | Named admin account and public keys, key-only SSH (`devsec.hardening.ssh_hardening`), `ufw` default-deny inbound with explicit allows, unattended security updates, time sync, hostname, extra distribution packages | `host_base_admin_user`, `host_base_admin_keys`, `host_base_firewall_allow`, `host_base_hostname`, `host_base_extra_packages` |
| `container_engine` | Docker Engine pinned and held, `rootful` or `rootless` per account, log rotation, one scheduled prune timer per daemon, login-shell `DOCKER_HOST` for rootless accounts | `container_engine_mode`, `container_engine_version`, `container_engine_rootless_accounts`, `container_engine_cleanup` |
| `github_actions_runner` | Self-hosted runners as Compose containers on the rootful daemon or one account's rootless daemon, with labels and CPU/memory limits changed in place; registers only when unregistered, token supplied at run time and never stored; adopts registered volumes; deregisters on `state: absent` | `github_actions_runner_daemon`, `github_actions_runner_scope_url`, `github_actions_runner_image`, `github_actions_runner_instances` |
| `compose_host` | Host ready for pipeline-driven Compose stacks: unprivileged deploy account, stack directories, private env-file location | `compose_host_deploy_user`, `compose_host_stack_dirs` |
| `swarm_node` | Initialize or join a Swarm as manager or worker; cluster ports open to listed peers only | `swarm_node_role`, `swarm_node_peers`, `swarm_node_advertise_addr` |
| `host_health` | Check-only: uptime, memory, disk, failed units, container engine up, optional backup freshness under an S3-compatible prefix | `host_health_min_free_disk_pct`, `host_health_min_free_mem_pct`, `host_health_backup` |
| `role_checks` | Runs each listed role's read-only check and reports every failed control in one run | `role_checks_roles`, `role_checks_only` |
| `dev_workstation` | Per coding account: workspace, SSH login keys, Git identity, pinned toolchain and tools, forge CLI with a scope-token wrapper, Intelligence CLI with a pinned or channel update timer, per-scope Git credentials for any HTTPS forge | `dev_workstation_accounts`, `dev_workstation_extra_packages`, `dev_workstation_npm_tools` |
| `agent_workstation` | Per account: pinned (or externally owned) coding-agent CLIs, terminal tools, Herdr, shared browser for automation, hidden-input credential and service-token helper | `agent_workstation_accounts`, `agent_workstation_tools`, `agent_workstation_coding_cli_mode` |
| `coding_agent_updates` | Coding-agent CLIs on a vendor release channel for listed accounts, updated on a timer without restarting sessions; digest or signed-repository verified, unpacked and tested as `nobody` | `coding_agent_updates_accounts`, `coding_agent_updates_channel`, `coding_agent_updates_interval_hours` |

Each role documents every variable in `defaults/main.yml` and its own `README.md`. A forge-specific role carries
the forge in its name; every other name is forge-neutral.

## Role contract

| Rule | Meaning |
|---|---|
| Two entry points | `tasks/main.yml` applies; `tasks/check.yml` only reads (`assert`, `stat`, read-only modules, `command` with `changed_when: false` and `check_mode: false`) and fails the host on any failed control. |
| Fail-closed | Inputs and the supported platform are asserted before the first change; an unexpected state stops the run instead of being guessed around. |
| Idempotent | A second apply reports no change. |
| Pinned | Package, tool and image versions are pinned in `defaults/main.yml`; no `latest`, no `state: latest`. Images by tag and digest where the registry provides one. The one declared exception is an update channel a project opts into (`coding_agent_updates`, the Intelligence CLI's `channel` mode): the channel is the input, every download is still verified, and the project records that choice in its decisions. |
| Prefixed | Every variable starts with the role name. |
| Secrets | Every task touching one is `no_log: true`. |
| Platform | Supported OS declared in `meta/main.yml` (Ubuntu 26.04 LTS, the default for new hosts, and 24.04 LTS) and asserted; a pin that differs per release is a map keyed by release with an assert that the running release has an entry; no provider logic. |

## Consuming the collection

Through the CLI, a project names the roles of each host in `infra.yaml` and the CLI generates the plays below. Without
it, a project pins this repository by tag next to the exact versions of the dependencies in
[requirements.yml](requirements.yml), in its own `requirements.yml`:

```yaml
collections:
  - name: git+https://github.com/ainova-systems/infra.git#/collection,v0.5.0
  - name: devsec.hardening
    version: 11.0.0
  - name: community.docker
    version: 5.4.0
  - name: community.general
    version: 14.0.0
  - name: ansible.posix
    version: 2.2.2
  - name: amazon.aws
    version: 12.1.0
```

Install into a Git-ignored path of the project, never globally, with the Python toolchain of
[requirements.txt](requirements.txt):

```bash
ansible-galaxy collection install -r requirements.yml -p .ansible/collections
```

A fork switches only the URL to its own repository and keeps the tag discipline. Moving to a new release is a
reviewed change of the version, read against [CHANGELOG.md](../CHANGELOG.md).

A check playbook runs every role's read-only check through `role_checks`, so one run lists every failed control:

```yaml
- name: Check hosts
  hosts: all
  become: true
  roles:
    - role: ainova.infra.role_checks
      vars:
        role_checks_roles: [ainova.infra.host_health, ainova.infra.host_base, ainova.infra.container_engine]
```

Every run names its targets with `--limit`; an apply is shown as `--check --diff` first. On a host the roles never
applied, the dry run covers `host_base` (admin account, SSH, firewall) completely and stops at the first role that
adds a package source (`dev_workstation`, `container_engine`): its key and package lists exist only after an
apply. Once a host has had one apply, the dry run covers every role. Staging and production
plays use `serial: 1` and `max_fail_percentage: 0`. Remote-access and firewall roles are applied from another
machine, never to the control node itself; `host_base` refuses that by default.

## Control container

[container/](../container/README.md) builds the same pinned toolchain ([requirements.txt](requirements.txt),
[requirements-lint.txt](requirements-lint.txt), the collections from [requirements.yml](requirements.yml)) as an
image, for CI or a machine without Python. Its entrypoint is `ansible-playbook`.

## Secrets

- No secret in Git, ever, including Ansible Vault payloads (`scripts/validate.sh` rejects them).
- A secret reaches a run only through the environment of that run, `lookup('env', NAME)` inside a role, or
  `vars_prompt`; the CLI prompts for a host's declared secrets without echo.
- On the host it lands in a `0600` file owned by the consuming account, or in a Swarm secret.
- Inventory and variable files name a secret by its environment variable, never by value. Addresses live in the
  project's Git-ignored operator env file, which is not a credential channel, and a project's variables never
  read it: the CLI hands connection values to the generated inventory and declared values as `infra_env`.

## Per-scope Git credentials

A coding account often needs more than one Git token: one for its project organization, one for shared
repositories such as these collections, sometimes one on another forge. `dev_workstation` configures one
credential scope per HTTPS URL prefix, on any forge:

```ini
[credential "https://<forge>/<organization>"]
    helper = !<helper> <scope> <kind> <username>
    useHttpPath = true
```

`useHttpPath` makes Git match the full repository path, so the most specific prefix wins and each scope gets its
own token. The helper answers with the scope's username and the `TOKEN` line of
`~/.config/git-credentials/<scope>.env` (`0600`, owned by the account). A scope is `{name, url}` plus an optional
`username` and `kind` (`github` for a `github.com` URL, `generic` otherwise); a `github` scope defaults its username
to `x-access-token`, every other scope names its own. The default scope `{name: default, url: https://github.com}`
covers everything else. Every tool that clones with plain `git`, including the Intelligence CLI fetching package
registries, picks the right token with no configuration of its own. The account owner stores each token once with
`agent-auth <scope>`, which reads it with hidden input and never echoes or logs it. The scope shape and the
username each forge expects are in the [dev_workstation README](roles/dev_workstation/README.md#credential-scopes).

## Validate

```bash
bash collection/scripts/validate.sh
```

Checks role layout, that [tests/all-roles.yml](tests/all-roles.yml) imports every role in both entry points, no
`latest` pins and no Vault payloads, then installs `requirements.yml` into `.tmp/validate`, runs
`ansible-playbook --syntax-check` against [tests/inventory.yml](tests/inventory.yml) (a target never contacted)
and `ansible-lint` with the production profile.

## Versioning

One version for the whole repository on `vX.Y.Z` tags, history in [CHANGELOG.md](../CHANGELOG.md). Pre-1.0,
breaking changes bump the minor. Contributing: [CONTRIBUTING.md](../CONTRIBUTING.md).

## License

MIT. Copyright 2026 Ainova Systems. See [LICENSE](../LICENSE).

---

Created by **[Dmitrij Zykovic](https://www.linkedin.com/in/dmitrijz/)**, Fractional CTO at [Ainova Systems](https://www.ainovasystems.com).
