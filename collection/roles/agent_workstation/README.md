# agent_workstation

Per coding account: pinned coding-agent CLIs, terminal tools, a shared sandboxed Playwright browser,
and `agent-auth`, the hidden-input credential helper. Apply after `dev_workstation`, which owns the
accounts, Node, Git identity and the per-scope Git credential helpers this role's `agent-auth` feeds.

Supported: Ubuntu 26.04 (default for new hosts) or 24.04, x86_64 (asserted).

## What it installs

| Item | Where | Notes |
|---|---|---|
| Claude Code, Codex, Cursor Agent, OpenCode | `/opt/agent-workstation/tools/<tool>-<version>/` | `pinned` mode only ([Coding-agent CLIs](#coding-agent-clis)); linked per account in `~/.local/bin` through root-owned wrappers that disable self-update |
| Herdr | same | Linked per account; optional per-account `herdr.service` user unit and agent integrations |
| Fresh, lazygit, VS Code CLI (`code`) | same | Linked in `/usr/local/bin` |
| Playwright Core | `/opt/agent-workstation/playwright-<version>/` | Lockfile-pinned, `npm ci --ignore-scripts`, root-owned |
| Chrome | `/opt/google/chrome/` | Existing root-owned Chrome kept; otherwise the Chromium bound to the pinned Playwright |
| `agent-playwright` | `/usr/local/bin/` | `--check`, `--check-url <url>`, `--version`, or run a CommonJS script |
| `agent-auth` | `/usr/local/bin/` | Hidden-input token store per credential scope and per service token |
| Scope list | `/etc/agent-workstation/credential-scopes.json` | Non-secret: scope names, URL prefixes, kinds and usernames per account |
| Service token list | `/etc/agent-workstation/service-tokens.json` | Non-secret: service token names and variable names per account |

## Controls

| Control | How |
|---|---|
| Pinned, digest-verified downloads | `get_url` with `sha256:`; a failed digest leaves nothing installed |
| Never execute a download as root | Extraction (`tar`, `dpkg-deb -x`) and the `--version` probe run as `nobody`; deb maintainer scripts never run |
| Immutable installs | Versioned root-owned directories with a `.sha256` marker; a directory without a matching marker stops the run |
| Live sessions survive | New versions install beside old ones; wrappers and links switch; a running Herdr console is never restarted |
| Unprivileged accounts | Run fails if an account is root or can run `sudo`; no variable turns this off |
| No foreign or linked paths | Account directories, links and managed files are checked for type, owner and symlinks before writes; writes into a home run as that account |
| Browser sandbox kept | Chrome root-owned, nothing writable below it, AppArmor profile checked when AppArmor is on |
| Secrets | The role never handles a token. The owner types it into `agent-auth` inside the account |

There is no self-update timer: an upgrade is a pin change (version and `sha256` together) and a re-apply.
Old version directories are kept for running sessions; remove them by hand once unused.

## Coding-agent CLIs

| `agent_workstation_coding_cli_mode` | Who owns Claude Code, Codex, Cursor Agent, OpenCode | Herdr integrations |
|---|---|---|
| `pinned` (default) | This role, at the pins in `agent_workstation_tools`, for the ones in `agent_workstation_enabled_tools` | Each needs its CLI enabled here |
| `external` | Another role, such as `coding_agent_updates` (vendor channel on a timer); none of them may be enabled here | Each CLI is resolved on the account's Herdr `PATH` (`agent_workstation_herdr_path`) before its integration is installed, and again by the check |

In `external` mode apply the owning role first; an integration whose CLI does not resolve stops the run.

## agent-auth

Run inside the coding account, at an interactive terminal:

```text
agent-auth [SCOPE]          prompt for a token (hidden), validate it where the scope can be, store it
agent-auth service NAME     prompt for the service token NAME (hidden) and store it, unvalidated
agent-auth check [NAME]     check stored credentials (every scope and service token when omitted)
agent-auth list             list scopes (name, kind, username, URL), service tokens, and whether each is stored
agent-auth remove NAME      delete the stored credential of scope or service token NAME
```

The token lands in `~/.config/git-credentials/<scope>.env` as `TOKEN=<token>`, mode 0600, directory
0700: the file the `dev_workstation` Git credential helper for that scope reads and sends with the scope's
username. It is never an argument, never piped, never echoed, never logged, and `agent-auth` refuses to run
as root.

| Scope kind | Validation before storing |
|---|---|
| `github` | GitHub API with the token as a Bearer header: `https://api.github.com/user` for `github.com`, `https://<host>/api/v3/user` for another host; or the scope's `validate_url` |
| `generic` | None: stored after the hidden prompt with no API call, unless the scope declares `validate_url` (called with a Bearer header) |

Redirects are refused so a token is never forwarded. A stored `generic` token is confirmed by Git use, for
example `git ls-remote <repository-url>` inside the account, which reaches the token only through the
credential helper. A file written before 0.2.0 with `GH_TOKEN=<token>` still reads for a `github` scope;
storing the token again rewrites it with `TOKEN`. `SCOPE` defaults to `default`, or to the only scope.

A service token is for a service that is not a Git forge, such as a work tracker. `agent-auth service <name>`
stores it as `<env_name>=<token>` in `~/.config/service-tokens/<name>.env` (0600, directory 0700): an environment
file a tool or a user unit (`EnvironmentFile=`) loads for itself. It is never exported to every shell and never
validated. The names come from `agent_workstation_service_tokens` (every account) and an account's own
`service_tokens`; a name is never a scope name or a verb.

## Variables

| Variable | Default | Meaning |
|---|---|---|
| `agent_workstation_accounts` | `[]` (required) | List of `{name, credential_scopes?, workspace?, service_tokens?}`, no other key; accounts must exist |
| `agent_workstation_coding_cli_mode` | `pinned` | `pinned` or `external` ([Coding-agent CLIs](#coding-agent-clis)) |
| `agent_workstation_service_tokens` | `[]` | `{name, env_name}` service tokens every account may store; an account's `service_tokens` add to them |
| `agent_workstation_default_credential_scopes` | `[{name: default, url: https://github.com}]` | Scopes for an account that declares none |
| `agent_workstation_enabled_tools` | all eight | Subset of `agent_workstation_tools` keys |
| `agent_workstation_tools` | current pins | Per tool `{version, sha256, version_check?, commit?}` |
| `agent_workstation_tool_sources` | upstream release URLs | Per tool `{url, format, strip, executable, commands, link, wrap}`; `{version}` / `{commit}` placeholders |
| `agent_workstation_wrapper_env` | self-update off | Environment exported by wrappers |
| `agent_workstation_root` | `/opt/agent-workstation` | Install root |
| `agent_workstation_stage_dir` | `/var/cache/agent-workstation` | Download staging |
| `agent_workstation_wrapper_dir` | `/usr/local/lib/agent-workstation/bin` | Wrappers |
| `agent_workstation_share_dir` | `/usr/local/share/agent-workstation` | Browser smoke test and guide |
| `agent_workstation_config_dir` | `/etc/agent-workstation` | Scope list |
| `agent_workstation_private_dirs` | tool config dirs | Created 0700 in each home |
| `agent_workstation_herdr_service` | `true` | Run `herdr server` as a user service (enables lingering) |
| `agent_workstation_herdr_working_directory` | `%h` | Service working directory of an account without a workspace. Herdr starts in the account's `workspace`, or else in its `dev_workstation_accounts` entry's `workspace` |
| `agent_workstation_herdr_path` | `~/.local/bin`, `~/.dotnet/tools`, system | Service `PATH` |
| `agent_workstation_herdr_rootless_docker` | `true` | Export `DOCKER_HOST` for the account's rootless engine |
| `agent_workstation_herdr_integrations` | `[claude, codex, cursor, opencode]` | Integrations installed when not current; their CLIs come from this role (`pinned`) or the account's `PATH` (`external`); set `[]` when Herdr is disabled |
| `agent_workstation_herdr_config` | onboarding off, resume agents | Written only when absent |
| `agent_workstation_fresh_defaults` | `{}` | Fresh preferences added under existing ones; the account's values win |
| `agent_workstation_browser` | `true` | Install and check the shared browser |
| `agent_workstation_node_executable` / `_npm_executable` | `/usr/bin/node` / `/usr/bin/npm` | Provided by `dev_workstation` |
| `agent_workstation_playwright_version` / `_integrity` | `1.63.0` / lockfile `sha512-` | Shared Playwright Core pin |
| `agent_workstation_chrome_dir` | `/opt/google/chrome` | Where Playwright's `chrome` channel looks |
| `agent_workstation_browser_check_timeout` | `60s` | Per-account launch check limit |
| `agent_workstation_browser_packages` | Chromium runtime libraries and fonts | Signed OS packages |
| `agent_workstation_auth_command` | `/usr/local/bin/agent-auth` | Helper path |

`credential_scopes` entries are `{name, url, kind?, username?, validate_url?}`, the contract and forge
usernames of [dev_workstation](../dev_workstation/README.md#credential-scopes); any other key is rejected.
Names are lowercase kebab-case and may not be `check`, `list`, `remove`, `help`, `credential` or `service`. Define the
list once per project and pass the same value to `dev_workstation` and this role, so the helper and the
store agree.

## Usage

```yaml
- hosts: dev
  become: true
  roles:
    - role: ainova.infra.dev_workstation
    - role: ainova.infra.agent_workstation
      vars:
        agent_workstation_accounts: "{{ coding_accounts }}"
```

Check (read-only; fails on any failed control):

```yaml
- ansible.builtin.include_role:
    name: ainova.infra.agent_workstation
    tasks_from: check
```

The check also lists `account/scope` and `account/service-token` pairs with nothing stored. That is the
owner's step, reported apart from installed configuration, and does not fail the check.

## Moving a pin

Change `version` and `sha256` in `agent_workstation_tools` together, from the publisher's release digest
or the signed package index. Cursor publishes no independent digest: record the digest of the HTTPS
download at pin time. `--check --diff` shows the tools that would install; the apply installs them beside
the old version and switches links.

## Requirements

`dev_workstation` applied first (accounts, Node). `acl` is installed so tasks can run as the
unprivileged account. Network access to the tool sources at apply time.
