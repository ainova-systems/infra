# @ainova-systems/infra

The `infra` command: every host a project owns, from its `infra.yaml`. It reads the manifest and the lock, installs
the pinned Ansible toolchain, generates the inventory, `ansible.cfg` and the apply and check playbooks for one host
per run, and runs them. It also checks that the project conforms, connects the operator to the coding accounts of a
dev host, and edits the manifest when hosts come and go.

```bash
npm install -g @ainova-systems/infra
infra help
```

Node.js 24 or later. Ansible runs on Linux: on Linux the CLI starts its runner directly, on Windows inside WSL
(`wsl.exe`, the default distribution or `INFRA_WSL_DISTRO`). The Linux side needs `bash`, `git`, `python3` with
`venv`, and `ssh`. Nothing is installed into the project: the toolchain lives in `~/.cache/infra` on the Linux side.

## The manifest

```yaml
contract: 1                        # the manifest contract; another contract is refused
project: shop                      # lowercase kebab-case
source:
  url: https://github.com/ainova-systems/infra.git   # default; a fork changes the URL only
  version: "^0.5.0"                # ^, ~, >= or exact; infra update locks the newest tag inside it
ansible: ansible                   # group_vars/, host_vars/, the project's own roles/ and playbooks
env:
  file: .env                       # the Git-ignored operator env file (default .env)
  example: .env.example            # its committed example (default <file>.example)
  values: [BACKUP_S3_ENDPOINT]     # further non-secret operator values, read as infra_env.<NAME>
classes:                           # roles every host of a class runs unless it lists its own
  staging: { roles: [host_base, container_engine, compose_host, github_actions_runner] }
hosts:
  shop-staging-01:
    class: staging                 # dev, cicd, preview, staging or production: one per host
    provider: hetzner
    status: active                 # planned, active or retired
    groups: [backups]              # further inventory groups, for group_vars
    secrets:                       # typed without echo, or taken from the environment; every run by default
      - { name: BACKUP_S3_SECRET, runs: [check] }  # check, plan, apply, run
    observed: docs/hosts/shop-staging-01.md   # default <ansible>/observed/<id>.md
  shop-dev-01:
    class: dev
    status: planned
    roles: [host_base, dev_workstation, container_engine, agent_workstation, my_role]
    before: [{ role: my_role, tasks_from: preflight }]               # pre_tasks, tags [always] by default
    after: [{ role: my_role, tasks_from: postflight, tags: [my_role] }]
connect:
  shop1: { host: shop-dev-01, account: coder, direct: true }   # direct: the account takes the operator key
  shop2: { host: shop-dev-01, account: helper }                # else: the admin, then sudo -iu helper
```

A role name resolves to the project's `roles/<name>` when it exists, else to `ainova.infra.<name>`; a qualified name
(`ns.collection.role`) passes unchanged. Unknown keys, a duplicate, a class used as a group or a host without roles
are refused, with every problem listed at once.

## The operator env file

It holds where hosts are and how to reach them, nothing else the CLI reads:

| Name | Meaning |
|---|---|
| `INFRA_<HOST>_ADDRESS` | address of the host (`<HOST>` is the id in upper case, `-` as `_`) |
| `INFRA_<HOST>_PORT` | its SSH port, default 22 |
| `INFRA_<HOST>_ADMIN_USER`, `INFRA_ADMIN_USER` | the admin a run connects as, default `host_base_admin_user` |
| `INFRA_SSH_IDENTITY_FILE` | the admin key: loaded from stdin into a per-run ssh-agent, handed to the operator's ssh |
| `INFRA_<NAME>` | a value `env.values` declares, exposed as `infra_env.<NAME>` |

Any other `INFRA_*` name, and any name that looks like a secret, is refused; names without the prefix are ignored,
so the file can be shared with other tools. Policy - firewall sources, accounts, keys - is reviewed desired state in
the variables, never per operator.

## Commands

| Command | Does |
|---|---|
| `infra init [--project <name>] [--ansible <dir>]` | creates `infra.yaml`, the Ansible directory and `.env.example` |
| `infra update [--ref <tag\|branch\|commit>]` | locks the newest release tag the range accepts, or one ref (testing) |
| `infra validate [--ansible]` | conformance (below); `--ansible` adds `ansible-playbook --syntax-check` of every generated and project playbook |
| `infra status` | project, locked source, hosts and targets (never an address) |
| `infra check <host> [--role <r>]...` | read-only: `host_health` and every role's check through `role_checks`, all failures in one report |
| `infra plan <host> [--role <r>]...` | the apply as `--check --diff` |
| `infra apply <host> [--role <r>]... [--yes] [--first-apply]` | the apply; asks first unless `--yes`, refuses without a terminal and without `--yes` |
| `infra run <playbook> <host>` | one of the project's own playbooks, top level of its Ansible directory |
| `infra trust <host> SHA256:<fp>` | records the host key only when it matches a fingerprint read out of band, for Ansible and the operator's ssh |
| `infra ssh <host> [-- <command>]` | the admin account |
| `infra connect <target> [connect\|shell\|files\|git\|agents\|repos\|updates\|check\|web <port>\|code]` | the coding account of a dev host; `web` tunnels a loopback port, `code` opens VS Code Remote SSH (direct targets) |
| `infra link`, `infra unlink [<project>]` | makes the project's targets work from any directory |
| `infra setup` | links the project and keeps a marked `dev` function (`dev <target>` is `infra connect <target>`) in both PowerShell profiles on Windows; replaces the per-repository installers' blocks, never an unmanaged `dev` |
| `infra host add <id> --class <c> [--provider <p>] [--role <r>]...` | declares a planned host: manifest entry, `host_vars/<id>.yml`, its address name in the example |
| `infra host retire <id>`, `infra host remove <id>` | keeps the record of a host that no longer runs; removes one never built or retired |
| `infra render <host> --out <dir>` | writes the generated files for inspection |

Arguments after `--` go to `ansible-playbook`, except `--limit` and `--inventory`, which the CLI owns. A role list
(`--role`) becomes `--tags` for an apply and `role_checks_only` for a check.

## Run guards

- One host per run, always with `--limit`; a retired host is refused.
- A planned host is applied only with `--first-apply`; the host then becomes `status: active` in the manifest.
- `host_base` is never applied to the machine running Ansible (machine-id comparison, tagged `host_base`).
- Host keys are strict: a host never reached is recorded with `infra trust` and a fingerprint confirmed out of band.
- A host with `github_actions_runner` gets short-lived registration and removal tokens from the operator's `gh` for
  the project's origin repository, through the environment of that run only.
- Declared host secrets are typed without echo, or taken from the environment; they reach the run through its
  environment (on Windows `WSLENV`), never a command line, a file or a log.

## Conformance (`infra validate`)

- The manifest parses, and the lock names the manifest's source and a version its range accepts.
- No file the CLI generates is kept in the project (`site.yml`, `check.yml`, `inventory.yml`, `ansible.cfg`,
  `run.sh`, `requirements.yml`, `requirements.txt`).
- Every host has `host_vars`, every active host a dated observed-state file, and no `host_vars` or `group_vars` entry
  belongs to nothing.
- No variable file or project playbook reads the environment (`lookup('env', ...)`): a value the operator supplies is
  declared in `env.values` and read as `infra_env.<NAME>`. No variable sets connection values or `host_status`, or
  uses `playbook_dir` or `inventory_dir` (`infra_project_root` is the project root).
- The env example exists and both env files keep the contract; the live file is ignored by Git.
- A direct connect target's account declares `authorized_keys`.

## Variables the CLI sets

| Variable | Value |
|---|---|
| `infra_project`, `infra_project_root` | the project name and its root as the Linux side sees it |
| `infra_env` | the declared `env.values` that are set |
| `infra_class`, `infra_provider`, `host_status` | per host, from the manifest |
| `ansible_host`, `ansible_port`, `ansible_user` | per host, from the operator env file |

## Environment

| Variable | Effect |
|---|---|
| `INFRA_SOURCE_DIR` | runs a local checkout of the source instead of the lock (development; the CLI warns) |
| `INFRA_CACHE` | the Linux-side cache, default `~/.cache/infra` |
| `INFRA_WSL_DISTRO`, `INFRA_WSL_MOUNT_ROOT` | the WSL distribution, and its drive mount root (default `/mnt`) |
| `INFRA_CONFIG_DIR` | where `infra link` records projects (default `%APPDATA%\infra` or `~/.config/infra`) |
