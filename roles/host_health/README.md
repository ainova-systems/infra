# host_health

Read-only health floor for any host: uptime, available memory, free disk, failed systemd units, the
container engine up, and optionally the age of the newest backup object under an S3-compatible prefix.
It changes nothing; `main` and `check` run the same probes.

Supported: Ubuntu 24.04 (`meta/main.yml`, asserted first). Requires `become: true` for the rootless probes.
The backup control runs on the control node and needs `boto3`/`botocore` there (the control container has them).

## Entry points

| Tasks | Effect |
|---|---|
| `main` | Same as `check`. |
| `check` | Probes, then one assert listing every failed control; the success message reports the measured values. |

## Variables

| Variable | Default | Meaning |
|---|---|---|
| `host_health_min_free_disk_pct` | `15` | Floor of free disk per path. |
| `host_health_disk_paths` | `[/]` | Mount points checked. |
| `host_health_min_free_mem_pct` | `10` | Floor of `MemAvailable` / `MemTotal`. |
| `host_health_ignored_failed_units` | `[]` | Failed units tolerated, exact names. |
| `host_health_fail_on_reboot_required` | `false` | Fail while `/var/run/reboot-required` exists. |
| `host_health_container_engine_mode` | `container_engine_mode` or `none` | `rootful`: `docker.service` active. `rootless`/`none`: no system daemon required. |
| `host_health_container_engine_rootless_accounts` | `container_engine_rootless_accounts` or `[]` | Accounts whose rootless daemon must answer `docker version`. |
| `host_health_backup` | `{}` | Omitted skips the control. Keys: `endpoint_url`, `bucket`, `prefix`, `max_age_hours`, `access_key_env`, `secret_key_env`, optional `region` (default `us-east-1`). |
| `host_health_backup_inspect_keys` | `3` | Newest-by-name keys whose modification time is read. |
| `host_health_supported_os` | Ubuntu 24.04 | Platforms the role asserts. |

## Backup freshness

- Credentials are never variables: `access_key_env` and `secret_key_env` name environment variables of the run,
  read with `lookup('env', ...)`. Use read-only keys scoped to the bucket. Every S3 task is `no_log`.
- The role lists keys under `prefix`, reads the modification time of the last `host_health_backup_inspect_keys`
  keys by name and fails when the newest of them is older than `max_age_hours`, when nothing is listed, or when
  listing fails. Backups named with a sortable timestamp are measured exactly; other naming can only produce a
  false failure, never a false pass.

## Example

```yaml
host_health_min_free_disk_pct: 20
host_health_backup:
  endpoint_url: https://s3.example.invalid
  bucket: backups
  prefix: host-01/
  max_age_hours: 26
  access_key_env: BACKUP_READ_ACCESS_KEY
  secret_key_env: BACKUP_READ_SECRET_KEY
```
