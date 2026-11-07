# coding_agent_updates

Coding-agent CLIs (Claude Code, Codex, Cursor Agent, OpenCode) that follow a vendor release channel on a
timer, for listed accounts, without restarting a running session. The alternative to the pinned CLIs of
`agent_workstation`: a project that accepts channel updates for its coding agents uses this role, and
`agent_workstation_coding_cli_mode: external` there.

Supported: Ubuntu 26.04 (default for new hosts) or 24.04, x86_64, systemd (asserted). Requires `become: true`.
Apply after `dev_workstation` (accounts) and before `agent_workstation` (its Herdr integrations resolve these
CLIs on the account's `PATH`).

## Entry points

| Tasks | Effect |
|---|---|
| `main` | Installs the updater, its service and timer, one wrapper per command and the account links; runs the first update when none succeeded yet. Idempotent; asserts inputs, platform and unprivileged accounts first. |
| `check` | Read-only. Managed files root-owned and equal to the role's templates, timer enabled and active, last run successful with no failed CLI, a current selection per CLI, each account's links on the wrappers and each command runnable as the account; one assert lists every failed control. |

## How an update runs

`coding-agent-updates.timer` starts `coding-agent-updates.service` every `coding_agent_updates_interval_hours`
at the full hour (and after downtime). The updater (`coding_agent_updates_command`) takes a lock, then per CLI:

| Kind | Version source | Authenticity |
|---|---|---|
| `github` (Codex, OpenCode) | The repository's latest full release (never a prerelease or draft) | The release asset's published `sha256` digest |
| `apt` (Claude Code) | The candidate of the vendor's signed apt repository for `coding_agent_updates_channel` | Signed repository metadata; the key is trusted only at its pinned fingerprint |
| `cursor` (Cursor Agent) | The version the vendor installer names | HTTPS only: the vendor publishes no digest. The digest of what was fetched is recorded |

| Control | How |
|---|---|
| No download runs as root | Archives are unpacked and debs extracted as `nobody` (maintainer scripts never run); the `--version` smoke test runs as `nobody` |
| Running sessions survive | A new version lands beside the old one under `coding_agent_updates_root`; only `current/<tool>` switches |
| One update path | Wrappers export `coding_agent_updates_wrapper_env`, which turns the vendor self-updaters off |
| System apt untouched | The apt-kind CLI uses the updater's own source list and package lists under `coding_agent_updates_state_dir`; nothing is added to `/etc/apt/sources.list.d` |
| One failure stays local | A failed CLI keeps its previous selection; the run reports the count in `failed-components` and fails |
| No credentials, no repositories | The updater reads no token and touches no checkout |

Old version directories stay for running sessions; remove them by hand once no session uses them.

## Variables

| Variable | Default | Meaning |
|---|---|---|
| `coding_agent_updates_accounts` | `[]` (required) | Accounts whose `~/.local/bin` links to the wrappers; they must exist and hold no sudo rights |
| `coding_agent_updates_tools` | `[claude_code, codex, cursor_agent, opencode]` | CLIs kept current: keys of `coding_agent_updates_sources` |
| `coding_agent_updates_channel` | `stable` | `stable` or `latest` (selects the Claude Code repository channel; see the table above for the others) |
| `coding_agent_updates_interval_hours` | `4` | A divisor of 24 |
| `coding_agent_updates_randomized_delay` | `"0"` | systemd `RandomizedDelaySec` |
| `coding_agent_updates_sources` | the four vendors | Per CLI `{kind, ..., executable, commands}`; keys per kind in `defaults/main.yml`, any other key is refused |
| `coding_agent_updates_claude_repo_url`, `_key_url`, `_key_fingerprint` | vendor repository and release key | Signed apt source of the `apt` kind |
| `coding_agent_updates_wrapper_env` | self-update off | Exported by every wrapper |
| `coding_agent_updates_root`, `_state_dir`, `_wrapper_dir`, `_command` | under `/opt`, `/var/lib`, `/usr/local` | Role-owned paths |
| `coding_agent_updates_timeout` | `30min` | Longest run |

The role refuses to run while `agent_workstation_enabled_tools` (when defined) enables one of the same CLIs:
two roles never own one command.

## Example

```yaml
coding_agent_updates_accounts: [coder]
coding_agent_updates_channel: stable
coding_agent_updates_interval_hours: 4
agent_workstation_coding_cli_mode: external
agent_workstation_enabled_tools: [herdr, fresh, lazygit, vscode_cli]
```

A channel is a deliberate update policy, not a floating pin: record it in the project's decisions.
