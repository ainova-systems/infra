# dev_workstation

Per coding account: the account itself, Git identity, a pinned development toolchain, GitHub CLI,
Intelligence CLI with its update timer, and per-organization Git credential scopes.

Boundary: provisioning installs ready-to-use non-secret configuration only. It never clones a
repository, never runs `intelligence sync` or any project command, and never stores a token. Storing
a token is the owner's step, inside the account (`agent-auth <scope>` from `agent_workstation`).

## Usage

```yaml
# site.yml
- hosts: dev
  become: true
  roles:
    - ainova.infra.dev_workstation

# check.yml
- hosts: dev
  become: true
  tasks:
    - ansible.builtin.include_role:
        name: ainova.infra.dev_workstation
        tasks_from: check
```

Requirements: Ubuntu 24.04, x86_64, systemd (asserted). Per-account tasks run as that account through
`become_user`; the role installs `acl` so Ansible can hand its temporary files to an unprivileged user.
No collection beyond `ansible.builtin`.

## What it manages

| Area | Result | Pin |
|---|---|---|
| Accounts | One account per `dev_workstation_accounts` entry, home mode `dev_workstation_home_mode` | - |
| Git identity | `user.name`, `user.email` in the account's global Git config | per account |
| .NET | SDKs side by side under `dev_workstation_dotnet_root`, SHA-512 verified; `/usr/local/bin/dotnet` | `dev_workstation_dotnet_sdks` |
| .NET tools | Installed into each account's own `~/.dotnet/tools` | `dev_workstation_dotnet_tools` |
| Node.js | NodeSource signed repository, key fingerprint verified, exact package, apt hold | `dev_workstation_node_package_version` |
| Corepack | Own versioned prefix under `dev_workstation_tools_dir`; `corepack`, `pnpm`, `pnpx` links in `/usr/local/bin` | `dev_workstation_corepack_version` |
| pnpm | Shim runs the repository's `packageManager`; fallback pre-fetched per account | `dev_workstation_pnpm_fallback_version` |
| GitHub CLI | Signed repository, key fingerprints verified, exact package, apt hold; no login | `dev_workstation_gh_version` |
| Intelligence CLI | System-wide npm package; never downgraded by apply | `dev_workstation_intelligence_version` |
| Update timer | `intelligence-cli-update.timer`; updates the CLI only, never touches a checkout | `dev_workstation_intelligence_update_version` |
| Shared environment | `/etc/dev-workstation/toolchain.env` (systemd `EnvironmentFile` syntax) and `/etc/profile.d/dev-workstation-toolchain.sh` | - |
| Credential scopes | Helper, preflight and per-account scope file (below) | - |

## Per-organization Git credentials

A coding account may need a different token per organization. Each scope is `{name, url}`; the
default is `{name: default, url: https://github.com}`.

| Piece | Path | Owner, mode |
|---|---|---|
| Helper | `/usr/local/bin/git-credential-scope <scope>` | root, 0755 |
| Preflight | `/usr/local/libexec/dev-workstation/credential-preflight` | root, 0755 |
| Scope file | `~/.config/git/credential-scopes`, included from the account's global Git config | account, 0644 |
| Token file | `~/.config/git-credentials/<scope>.env`, one line `GH_TOKEN=<token>` | account, 0600; written by the owner, never by this role |

Per scope the scope file sets `credential.<url>.helper` (reset, then the helper) and
`credential.<url>.useHttpPath=true`. Sections are sorted so a prefix precedes the longer URLs under it,
so the longest matching prefix alone answers. Any Git client that uses the credential protocol picks the
right token, including a plain `git clone` by the Intelligence CLI.

The helper answers `get` over `https` only, from the calling account's own token file for that scope.
It ignores an inherited `GH_TOKEN`, a missing file, a link, or a file that is not owner-only 0600; Git
then falls through to its prompt. It prints no diagnostics.

The preflight runs as the account before and after every apply and in the check. It fails on:

| Control | Fails when |
|---|---|
| No links | `~/.config`, `~/.config/git`, `~/.config/git-credentials`, `~/.gitconfig`, `~/.config/git/config`, the scope file or `~/.profile` is a symlink |
| Owner-only | Any of them is not owned by the account; `~/.config/git-credentials` is not 0700; a token file is not a regular 0600 file |
| One token per file | A token file does not hold exactly one `GH_TOKEN=` line; a non-`.env` entry sits in the token directory |
| No competing store | `~/.git-credentials`, `~/.config/git/credentials` or `~/.config/gh/hosts.yml` exists |
| No competing helper | Any `credential.*` setting comes from a file other than the scope file (system, global or included) |

An account carrying an earlier credential setup fails closed: remove the competing entry as that
account, then re-apply. The role never deletes account files.

## Variables

| Variable | Default | Meaning |
|---|---|---|
| `dev_workstation_accounts` | `[]` (required) | List of `{name, git_name, git_email, credential_scopes}`; any other key is rejected |
| `dev_workstation_default_credential_scopes` | `[{name: default, url: https://github.com}]` | Scopes for accounts that declare none |
| `dev_workstation_account_shell` | `/bin/bash` | Shell for created accounts |
| `dev_workstation_home_mode` | `0750` | Enforced home mode |
| `dev_workstation_packages` | build prerequisites | Distribution packages |
| `dev_workstation_dotnet_root` | `/usr/share/dotnet` | .NET root |
| `dev_workstation_dotnet_sdks` | 8.0.427, 10.0.403 | `{version, sha512}` list, ascending |
| `dev_workstation_dotnet_download_url` | official build URL | `{version}` is substituted |
| `dev_workstation_dotnet_tools` | `[]` | `{name, version}` per-account global tools |
| `dev_workstation_node_major` | `26` | NodeSource channel |
| `dev_workstation_node_package_version` | `26.13.0-1nodesource1` | Exact package |
| `dev_workstation_node_key_url`, `_key_fingerprints` | NodeSource key | Accepted primary-key fingerprints |
| `dev_workstation_corepack_version` | `0.36.0` | Exact Corepack |
| `dev_workstation_pnpm_fallback_version` | `9.15.9` | pnpm for repositories without `packageManager` |
| `dev_workstation_gh_version` | `2.102.0` | Exact GitHub CLI |
| `dev_workstation_gh_key_url`, `_key_fingerprints` | GitHub CLI key | Accepted primary-key fingerprints |
| `dev_workstation_intelligence_package` | `@ainova-systems/intelligence` | npm package |
| `dev_workstation_intelligence_version` | `0.24.0` | Minimum installed version |
| `dev_workstation_intelligence_update_enabled` | `true` | Timer on or off |
| `dev_workstation_intelligence_update_version` | the pin | Version or dist-tag the timer installs |
| `dev_workstation_intelligence_update_on_calendar` | `weekly` | systemd `OnCalendar` |
| `dev_workstation_intelligence_update_randomized_delay` | `1h` | systemd `RandomizedDelaySec` |
| `dev_workstation_state_dir`, `_tools_dir`, `_config_dir`, `_libexec_dir`, `_credential_helper` | under `/var/lib`, `/opt`, `/etc`, `/usr/local` | Role-owned paths |

The update timer installs `dev_workstation_intelligence_update_version`. Left at the pin it repairs
drift; a project that wants hosts to follow new releases sets a dist-tag there and records that choice
in its own decisions.

## Check

`tasks/check.yml` is read-only and fails on the first failed control: managed files match the role and
are root-owned; signing keys match the pinned fingerprints; Node.js and GitHub CLI are the pinned held
packages; Corepack, the SDK set and the Intelligence CLI meet the pins; every shared .NET framework has
its base runtime; the update timer is in the declared state; and per account: home private, preflight
clean, scope file current, Git identity and helper routing per scope, `dotnet`, offline `pnpm`, declared
.NET tools and the system Intelligence CLI resolve.

Token presence is reported per scope as `stored` or `pending owner authentication` and never fails the
check: it is credential state, not installed configuration.

## Not in this role

Coding-agent CLIs, terminal tools, the browser and the `agent-auth` helper are `agent_workstation`.
Project-specific tools (document converters, API test runners) belong to the project's own roles.
