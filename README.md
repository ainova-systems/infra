# infra-ansible

Generic, provider-neutral Ansible roles for the hosts an AI-first team runs: baseline and hardening, container
engine, self-hosted CI runners, Compose and Swarm hosts, developer and coding-agent workstations, and a read-only
health floor. Shipped as the collection `ainova.infra`.

The collection carries behaviour; each project carries its state. A project's own repository holds the inventory,
the variables of every host and the playbooks that map hosts to roles, and pins this collection by tag. Two
projects using the same roles share no inventory and know nothing of each other.

Built and maintained by [Ainova Systems](https://www.ainovasystems.com). The operating rules these roles implement
are documented as tool-neutral knowledge in [intelligence-infra-packs](https://github.com/ainova-systems/intelligence-infra-packs).

## Roles

| Role | Responsibility | Key variables |
|---|---|---|
| `host_base` | Named admin account and public keys, key-only SSH (`devsec.hardening.ssh_hardening`), `ufw` default-deny inbound with explicit allows, unattended security updates, time sync | `host_base_admin_user`, `host_base_admin_keys`, `host_base_firewall_allow` |
| `container_engine` | Docker Engine pinned and held, `rootful` or `rootless` per account, log rotation, one scheduled prune timer per daemon | `container_engine_mode`, `container_engine_version`, `container_engine_rootless_accounts`, `container_engine_cleanup` |
| `github_actions_runner` | Self-hosted runners as Compose containers with labels and CPU/memory limits; registers only when unregistered, token supplied at run time and never stored; deregisters on `state: absent` | `github_actions_runner_scope_url`, `github_actions_runner_image`, `github_actions_runner_instances` |
| `compose_host` | Host ready for pipeline-driven Compose stacks: unprivileged deploy account, stack directories, private env-file location | `compose_host_deploy_user`, `compose_host_stack_dirs` |
| `swarm_node` | Initialize or join a Swarm as manager or worker; cluster ports open to listed peers only | `swarm_node_role`, `swarm_node_peers`, `swarm_node_advertise_addr` |
| `host_health` | Check-only: uptime, memory, disk, failed units, container engine up, optional backup freshness under an S3-compatible prefix | `host_health_min_free_disk_pct`, `host_health_min_free_mem_pct`, `host_health_backup` |
| `role_checks` | Runs each listed role's read-only check and reports every failed control in one run | `role_checks_roles`, `role_checks_only` |
| `dev_workstation` | Per coding account: Git identity, pinned toolchain, forge CLI, Intelligence CLI with update timer, per-scope Git credentials for any HTTPS forge | `dev_workstation_accounts` |
| `agent_workstation` | Per account: pinned coding-agent CLIs, terminal tools, shared browser for automation, hidden-input credential helper | `agent_workstation_accounts`, `agent_workstation_tools` |

Each role documents every variable in `defaults/main.yml` and its own `README.md`. A forge-specific role carries
the forge in its name; every other name is forge-neutral.

## Role contract

| Rule | Meaning |
|---|---|
| Two entry points | `tasks/main.yml` applies; `tasks/check.yml` only reads (`assert`, `stat`, read-only modules, `command` with `changed_when: false` and `check_mode: false`) and fails the host on any failed control. |
| Fail-closed | Inputs and the supported platform are asserted before the first change; an unexpected state stops the run instead of being guessed around. |
| Idempotent | A second apply reports no change. |
| Pinned | Package, tool and image versions are pinned in `defaults/main.yml`; no `latest`, no `state: latest`. Images by tag and digest where the registry provides one. |
| Prefixed | Every variable starts with the role name. |
| Secrets | Every task touching one is `no_log: true`. |
| Platform | Supported OS declared in `meta/main.yml` (Ubuntu 26.04 LTS, the default for new hosts, and 24.04 LTS) and asserted; a pin that differs per release is a map keyed by release with an assert that the running release has an entry; no provider logic. |

## Consuming the collection

The project pins this collection by tag next to the exact versions of its dependencies, in its own
`requirements.yml`:

```yaml
collections:
  - name: https://github.com/ainova-systems/infra-ansible.git
    type: git
    version: v0.3.0
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

Install into a Git-ignored path of the project, never globally:

```bash
ansible-galaxy collection install -r requirements.yml -p .ansible/collections
```

A fork switches only the `name` URL to its own repository and keeps the tag discipline. Moving to a new release is
a reviewed change of `version`, read against [CHANGELOG.md](CHANGELOG.md).

A project's apply playbook maps groups to roles; its check playbook imports each role with `tasks_from: check`:

```yaml
- name: Check hosts
  hosts: all
  become: true
  tasks:
    - name: Check baseline
      ansible.builtin.import_role:
        name: ainova.infra.host_base
        tasks_from: check
    - name: Check health
      ansible.builtin.import_role:
        name: ainova.infra.host_health
```

Every run names its targets with `--limit`; an apply is shown as `--check --diff` first. Staging and production
plays use `serial: 1` and `max_fail_percentage: 0`. Remote-access and firewall roles are applied from another
machine, never to the control node itself; `host_base` refuses that by default.

## Control container

[container/](container/README.md) builds one pinned toolchain (ansible-core, ansible-lint, the AWS SDK, the
collections from [requirements.yml](requirements.yml)) for machines without a native Ansible. Its entrypoint is
`ansible-playbook`.

## Secrets

- No secret in Git, ever, including Ansible Vault payloads (`scripts/validate.sh` rejects them).
- A secret reaches a run only through the environment of that run, `lookup('env', NAME)`, or `vars_prompt`.
- On the host it lands in a `0600` file owned by the consuming account, or in a Swarm secret.
- Inventory and variable files name a secret by its environment variable, never by value. Addresses live in the
  project's Git-ignored `.env`, which is not a credential channel.

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
bash scripts/validate.sh
```

Checks role layout, that [tests/all-roles.yml](tests/all-roles.yml) imports every role in both entry points, no
`latest` pins and no Vault payloads, then installs `requirements.yml` into `.tmp/validate`, runs
`ansible-playbook --syntax-check` against [tests/inventory.yml](tests/inventory.yml) (a target never contacted)
and `ansible-lint` with the production profile.

## Versioning

Semantic versioning on `vX.Y.Z` tags, history in [CHANGELOG.md](CHANGELOG.md). Pre-1.0, breaking changes bump the
minor. Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. Copyright 2026 Ainova Systems. See [LICENSE](LICENSE).

---

Created by **[Dmitrij Zykovic](https://www.linkedin.com/in/dmitrijz/)**, Fractional CTO at [Ainova Systems](https://www.ainovasystems.com).
