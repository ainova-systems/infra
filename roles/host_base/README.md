# host_base

Baseline every host gets first: a named admin account with authorized public keys, key-only SSH through
`devsec.hardening.ssh_hardening`, a `ufw` firewall that denies inbound by default with explicit allows,
unattended security updates and time sync through `systemd-timesyncd`.

Supported: Ubuntu 24.04 (`meta/main.yml`, asserted before any change). Requires `become: true`.

## Entry points

| Tasks | Effect |
|---|---|
| `main` | Applies the baseline. Idempotent; asserts inputs and platform first. |
| `check` | Read-only. Probes account, keys, sudoers, `sshd -T`, `ufw status`, APT periodic settings and `timedatectl`; one assert lists every failed control. |

## Variables

| Variable | Default | Meaning |
|---|---|---|
| `host_base_admin_user` | `""` (required) | Named admin account; never `root`. |
| `host_base_admin_keys` | `[]` (required) | Public keys, `<type> <body>`; a private key fails the assert. |
| `host_base_admin_keys_exclusive` | `true` | `authorized_keys` holds exactly the declared keys. |
| `host_base_admin_shell` | `/bin/bash` | Login shell. |
| `host_base_admin_sudo_nopasswd` | `true` | Passwordless sudo through `/etc/sudoers.d/host-base-admin` (validated with `visudo`). The account has no password. |
| `host_base_ssh_port` | `22` | SSH port, opened in the firewall. |
| `host_base_ssh_allow_from` | `[any]` | Sources allowed to reach SSH: `any` or addresses/CIDRs; an empty entry stops the run. |
| `host_base_ssh_extra_users` | `[]` | Accounts besides the admin in `AllowUsers`. |
| `host_base_ssh_allow_tcp_forwarding` | `"no"` | Passed to `ssh_hardening`. |
| `host_base_ssh_allow_agent_forwarding` | `false` | Passed to `ssh_hardening`. |
| `host_base_firewall_allow` | `[]` | Inbound allows, each `{port, proto: tcp\|udp, from: any\|<CIDR>}`; an empty `from` stops the run. |
| `host_base_firewall_remove` | `[]` | Allows to delete, same shape. |
| `host_base_firewall_logging` | `low` | `ufw` logging level. |
| `host_base_auto_updates` | `true` | Security-origin unattended upgrades. |
| `host_base_auto_reboot` | `false` | Reboot automatically when an update needs it. |
| `host_base_auto_reboot_time` | `"03:00"` | Reboot time when enabled. |
| `host_base_ntp_servers` | `[]` | Time servers; empty keeps the distribution defaults. |
| `host_base_allow_control_node` | `false` | Allow applying to the machine running Ansible. |
| `host_base_supported_os` | Ubuntu 24.04 | Platforms the role asserts. |

Other `ssh_*` variables of `ssh_hardening` may be set in inventory; the ones listed above are passed by
this role and win.

## Safety

- Keys are authorized before SSH is hardened, and firewall allows are written before the inbound deny is
  enabled, so a run never locks out its own connection.
- The first run may connect as the provider's initial account; root login is disabled afterwards, so later
  runs connect as `host_base_admin_user`.
- The role refuses a local connection or a target whose machine ID equals the control node's: remote-access
  and firewall changes are applied from another machine.
- `ufw` keeps a rule until it is deleted; retire an allow through `host_base_firewall_remove`, then drop it
  from both lists once applied.
- Time sync assumes `systemd-timesyncd`; installing it replaces another NTP daemon, so review a host that
  runs one before the first apply.

## Example

```yaml
host_base_admin_user: operator
host_base_admin_keys:
  - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyBodyOnly
host_base_firewall_allow:
  - {port: 443, proto: tcp, from: any}
```
