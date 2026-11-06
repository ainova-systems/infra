# dev_workstation

Per coding account: the account itself, Git identity, a pinned development toolchain, GitHub CLI,
Intelligence CLI with its update timer, and per-scope Git credentials for any HTTPS forge.

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
| `dev_workstation_accounts` | `[]` (required) | List of `{name, git_name, git_email, credential_scopes}`; any other key is rejected; scopes as in [Credential scopes](#credential-scopes) |
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
