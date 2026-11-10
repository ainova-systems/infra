# dev_workstation

Per coding account: the account itself, its workspace and SSH login keys, Git identity, a pinned development
toolchain, GitHub CLI with a scope-token wrapper, Intelligence CLI with its update timer, and per-scope Git
credentials for any HTTPS forge.

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

Requirements: Ubuntu 26.04 (default for new hosts) or 24.04, x86_64, systemd (asserted). Per-account tasks run as that account through
`become_user`; the role installs `acl` so Ansible can hand its temporary files to an unprivileged user.
No collection beyond `ansible.builtin`.

## What it manages

| Area | Result | Pin |
|---|---|---|
| Accounts | One account per `dev_workstation_accounts` entry, home mode `home_mode` or `dev_workstation_home_mode` (0700 or 0750) | - |
| Workspace | Optional `workspace` inside the home, created by the account, mode `workspace_mode` (0750 default, or 0700); no repository is assumed or cloned | per account |
| SSH login keys | Optional `authorized_keys`: `~/.ssh/authorized_keys` holds exactly them (0600, `~/.ssh` 0700); without the key the file is never touched. Login also needs `host_base_ssh_extra_users` | per account |
| Git identity | `user.name`, `user.email` in the account's global Git config | per account |
| .NET | SDKs side by side under `dev_workstation_dotnet_root`, SHA-512 verified; `/usr/local/bin/dotnet` | `dev_workstation_dotnet_sdks` |
| .NET tools | Installed into each account's own `~/.dotnet/tools`; an account's `dotnet_tools` entry replaces the global entry of the same name for it and adds the others | `dev_workstation_dotnet_tools`, per-account `dotnet_tools` |
| Extra packages | Distribution packages by name (for example `ripgrep`, `unzip`, document converters); the version is the signed archive's | `dev_workstation_extra_packages` |
| npm tools | System-wide in the pinned Node.js prefix, root-owned, lifecycle scripts disabled; moved to the pin when another version is installed | `dev_workstation_npm_tools` |
| Node.js | NodeSource signed repository, key fingerprint verified, exact package, apt hold | `dev_workstation_node_package_version` |
| Corepack | Own versioned prefix under `dev_workstation_tools_dir`; `corepack`, `pnpm`, `pnpx` links in `/usr/local/bin` | `dev_workstation_corepack_version` |
| pnpm | Shim runs the repository's `packageManager`; fallback pre-fetched per account | `dev_workstation_pnpm_fallback_version` |
| GitHub CLI | Signed repository, key fingerprints verified, exact package, apt hold; no login | `dev_workstation_gh_version` |
| gh wrapper | `/usr/local/bin/gh` (root, 0755) hands gh the token of the account's gh scope ([GitHub CLI](#github-cli)) | `dev_workstation_gh_wrapper` |
| Intelligence CLI | System-wide npm package; never downgraded by apply | `dev_workstation_intelligence_version` |
| Update timer | `intelligence-cli-update.timer`; updates the CLI only, never touches a checkout; `pinned` or `channel` mode | `dev_workstation_intelligence_update_*` |
| Shared environment | `/etc/dev-workstation/toolchain.env` (systemd `EnvironmentFile` syntax) and `/etc/profile.d/dev-workstation-toolchain.sh`, plus the non-secret `dev_workstation_environment` | - |
| Credential scopes | Helper, preflight and per-account scope file (below) | - |

## GitHub CLI

With `dev_workstation_gh_wrapper` (default `true`) a root-owned wrapper ahead of `/usr/bin/gh` reads the token
the account stored for its gh scope (`agent-auth <scope>`) from the same `~/.config/git-credentials/<scope>.env`
the Git helper reads, under the same rules (regular, owner-only 0600, one `TOKEN` line or one legacy `GH_TOKEN`
line), and passes it to gh as `GH_TOKEN` (`GH_ENTERPRISE_TOKEN` and `GH_HOST` for another host) in gh's own
environment only. Nothing is exported to the shell or written; `~/.config/gh/hosts.yml` stays refused by the
preflight. A token already in the environment wins; without a usable file gh runs unauthenticated.

The gh scope is the account's `gh_scope`, or else its `github` scope on `github.com` whose URL sorts first (the
plain `https://github.com` scope when declared). A call on a repository whose owner another `github` scope of the
account covers (`https://<host>/<owner>`) gets that scope's token instead, as the Git helpers choose by URL: the
owner of `-R`/`--repo`, of an `api repos/<owner>/...` path, or of the current checkout's `origin`.
`GH_SCOPE=<scope>` names one of those scopes explicitly. An existing `/usr/local/bin/gh` this role did not write stops
the run: another tool's wrapper is retired deliberately. `false` removes the role's wrapper.

## Credential scopes

A coding account may need a different token per organization or per forge. Each scope routes one HTTPS
URL prefix to one token file; the default is `{name: default, url: https://github.com}`.

| Key | Required | Meaning |
|---|---|---|
| `name` | yes | Lowercase kebab-case, at most 32 characters; names the token file and the `agent-auth` argument |
| `url` | yes | `https://<host>[/<path>...]` prefix, no user info, query or trailing slash; unique per account |
| `kind` | no | `github` or `generic`. Default: `github` when the host is `github.com`, otherwise `generic` |
| `username` | `generic` only | Username Git sends with the token. Default for `github`: `x-access-token` |
| `validate_url` | no | HTTPS endpoint `agent-auth` calls with the token as a Bearer header (`agent_workstation`); ignored here |

Any other key is rejected, so a credential cannot ride in on host variables. The username each forge
expects for token authentication over HTTPS:

| Forge, token | `username` |
|---|---|
| GitHub, any token | default `x-access-token` |
| Bitbucket Cloud, API token | the account's Bitbucket username (case sensitive; not the email), or the static `x-bitbucket-api-token-auth` |
| Bitbucket Cloud, repository, project or workspace access token | `x-token-auth` |
| Other forges | the username their documentation names for HTTPS token authentication |

Bitbucket Cloud app passwords stopped working on 2026-06-09; use an API token or an access token.

```yaml
dev_workstation_accounts:
  - name: coder
    git_name: Coder Agent
    git_email: coder@example.invalid
    credential_scopes:
      - {name: default, url: https://github.com}
      - {name: shared, url: https://github.com/example-org}
      - {name: bitbucket, url: https://bitbucket.org/example-org, username: x-token-auth}
```

| Piece | Path | Owner, mode |
|---|---|---|
| Helper | `/usr/local/bin/git-credential-scope <scope> <kind> <username>` | root, 0755 |
| Preflight | `/usr/local/libexec/dev-workstation/credential-preflight` | root, 0755 |
| Scope file | `~/.config/git/credential-scopes`, included from the account's global Git config | account, 0644 |
| Token file | `~/.config/git-credentials/<scope>.env`, exactly one line `TOKEN=<token>` | account, 0600; written by the owner, never by this role |

Token files written before 0.2.0 hold `GH_TOKEN=<token>`. That line is still read for a `github` scope, so
existing stores keep working; a file holding both lines, or a `GH_TOKEN` line for a `generic` scope, fails the
preflight. `agent-auth <scope>` rewrites a file with the `TOKEN` key.

Per scope the scope file sets `credential.<url>.helper` (reset, then the helper with the scope's kind and
username) and `credential.<url>.useHttpPath=true`. Sections are sorted so a prefix precedes the longer URLs
under it, so the longest matching prefix alone answers. Any Git client that uses the credential protocol picks
the right token, including a plain `git clone` by the Intelligence CLI. The GitHub CLI concerns `github`
scopes only; the role never logs it in, and Git needs no `gh` login on any forge.

The helper answers `get` over `https` only, with the scope's username and the token from the calling
account's own file for that scope. It ignores an inherited environment token, a missing file, a link, a
file that is not owner-only 0600 or that does not hold exactly one accepted line; Git then falls through to
its prompt. It prints no diagnostics. A scope file written by 0.1.0 (`helper = !<helper> <scope>`) is
answered as a `github` scope until the next apply rewrites it.

The preflight runs as the account before and after every apply and in the check. It fails on:

| Control | Fails when |
|---|---|
| No links | `~/.config`, `~/.config/git`, `~/.config/git-credentials`, `~/.gitconfig`, `~/.config/git/config`, the scope file or `~/.profile` is a symlink |
| Owner-only | Any of them is not owned by the account; `~/.config/git-credentials` is not 0700; a token file is not a regular 0600 file |
| One token per file | A token file does not hold exactly one `TOKEN=` line (or one legacy `GH_TOKEN=` line for a `github` scope); a non-`.env` entry sits in the token directory |
| No competing store | `~/.git-credentials`, `~/.config/git/credentials` or `~/.config/gh/hosts.yml` exists |
| No competing helper | Any `credential.*` setting comes from a file other than the scope file (system, global or included) |

An account carrying an earlier credential setup fails closed: remove the competing entry as that
account, then re-apply. The role never deletes account files.

## Variables

| Variable | Default | Meaning |
|---|---|---|
| `dev_workstation_accounts` | `[]` (required) | List of `{name, git_name, git_email}` plus optional `credential_scopes` ([Credential scopes](#credential-scopes)), `home_mode`, `workspace`, `workspace_mode`, `authorized_keys`, `dotnet_tools`, `gh_scope`; any other key is rejected |
| `dev_workstation_default_credential_scopes` | `[{name: default, url: https://github.com}]` | Scopes for accounts that declare none |
| `dev_workstation_account_shell` | `/bin/bash` | Shell for created accounts |
| `dev_workstation_home_mode` | `0750` | Enforced home mode, `0700` or `0750`; an account's `home_mode` wins |
| `dev_workstation_packages` | build prerequisites | Distribution packages |
| `dev_workstation_extra_packages` | `[]` | Further distribution packages, by name |
| `dev_workstation_environment` | `{}` | Non-secret `NAME: value` pairs for login shells and services reading the toolchain file; secret-looking, role-owned, loader and shell names are refused, values are plain text |
| `dev_workstation_npm_tools` | `[]` | `{name, version}` system-wide npm tools at exact versions, `--ignore-scripts` |
| `dev_workstation_dotnet_root` | `/usr/share/dotnet` | .NET root |
| `dev_workstation_dotnet_sdks` | 8.0.427, 10.0.403 | `{version, sha512}` list, ascending |
| `dev_workstation_dotnet_download_url` | official build URL | `{version}` is substituted |
| `dev_workstation_dotnet_tools` | `[]` | `{name, version}` per-account global tools; merged by name with an account's `dotnet_tools` |
| `dev_workstation_node_major` | `26` | NodeSource channel |
| `dev_workstation_node_package_version` | `26.13.0-1nodesource1` | Exact package |
| `dev_workstation_node_key_url`, `_key_fingerprints` | NodeSource key | Accepted primary-key fingerprints |
| `dev_workstation_corepack_version` | `0.36.0` | Exact Corepack |
| `dev_workstation_pnpm_fallback_version` | `9.15.9` | pnpm for repositories without `packageManager` |
| `dev_workstation_gh_version` | `2.102.0` | Exact GitHub CLI |
| `dev_workstation_gh_key_url`, `_key_fingerprints` | GitHub CLI key | Accepted primary-key fingerprints |
| `dev_workstation_gh_wrapper`, `_gh_wrapper_path` | `true`, `/usr/local/bin/gh` | [GitHub CLI](#github-cli) wrapper |
| `dev_workstation_intelligence_package` | `@ainova-systems/intelligence` | npm package |
| `dev_workstation_intelligence_version` | `0.24.0` | Minimum installed version |
| `dev_workstation_intelligence_update_enabled` | `true` | Timer on or off |
| `dev_workstation_intelligence_update_mode` | `pinned` | `pinned`: the timer installs `_update_version` on `_update_on_calendar`. `channel`: it installs the dist-tag `_update_channel` every `_update_interval_hours` |
| `dev_workstation_intelligence_update_version` | the pin | `pinned` mode: version or dist-tag the timer installs |
| `dev_workstation_intelligence_update_on_calendar` | `weekly` | `pinned` mode: systemd `OnCalendar` |
| `dev_workstation_intelligence_update_channel` | `latest` | `channel` mode: npm dist-tag followed |
| `dev_workstation_intelligence_update_interval_hours` | `4` | `channel` mode: hours between runs, a divisor of 24 |
| `dev_workstation_intelligence_update_randomized_delay` | `1h` | systemd `RandomizedDelaySec` |
| `dev_workstation_state_dir`, `_tools_dir`, `_config_dir`, `_libexec_dir`, `_credential_helper` | under `/var/lib`, `/opt`, `/etc`, `/usr/local` | Role-owned paths |

In `pinned` mode the update timer installs `dev_workstation_intelligence_update_version`; left at the pin it
repairs drift. `channel` mode is a deliberate update channel for agent tooling: the host follows every release
of the dist-tag on a fixed schedule, while the apply still installs `dev_workstation_intelligence_version` as
the minimum and never downgrades. A project choosing it records that decision in its own decisions.

## Check

`tasks/check.yml` is read-only and fails on the first failed control: no other package source names a
repository of the role with another keyring; managed files (including the gh wrapper) match the role and are
root-owned; signing keys match the pinned fingerprints; extra packages are installed; npm tools are at their
pins; Node.js and GitHub CLI are the pinned held packages; Corepack, the SDK set and the Intelligence CLI meet
the pins; every shared .NET framework has its base runtime; the update timer is in the declared state; and per
account: home mode, workspace (owned, mode, inside the home, no link), exactly the declared authorized keys,
preflight clean, scope file current, Git identity and helper routing per scope, `dotnet`, offline `pnpm`, the
account's .NET tools, the system Intelligence CLI and the gh wrapper resolve.

Another file in `/etc/apt/sources.list.d` (or `/etc/apt/sources.list`) that names the NodeSource or GitHub CLI
repository with another keyring stops the apply before any apt call and fails the check, naming the file: apt
refuses conflicting `Signed-By` values. The role never deletes it.

Token presence is reported per scope as `stored` or `pending owner authentication` and never fails the
check: it is credential state, not installed configuration.

## Not in this role

Coding-agent CLIs, terminal tools, the browser and the `agent-auth` helper are `agent_workstation` (or
`coding_agent_updates` for channel-updated CLIs). Project-specific tools are declared through
`dev_workstation_extra_packages` and `dev_workstation_npm_tools`, never written into the role.
