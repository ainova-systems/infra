# container_engine

Docker Engine from the signed upstream apt repository at pinned versions, as a system daemon (`rootful`)
or with no system daemon at all (`rootless`), plus one rootless daemon per listed account in either mode.
Every daemon gets log rotation and its own scheduled cleanup timer.

Supported: Ubuntu 24.04 on x86_64 or aarch64 (`meta/main.yml`, asserted before any change). Requires `become: true`.

## Entry points

| Tasks | Effect |
|---|---|
| `main` | Installs and configures. Idempotent; asserts inputs, platform, the installed version and every rootless account first. |
| `check` | Read-only. Package versions and holds, system daemon state and log rotation, per-account socket, unit, rootless security option, Compose, socket isolation and sudo rights, cleanup timers; one assert lists every failed control. |

## Variables

| Variable | Default | Meaning |
|---|---|---|
| `container_engine_mode` | `rootful` | `rootful`: system daemon. `rootless`: system units masked, an active system daemon fails the run. |
| `container_engine_rootless_accounts` | `[]` | Accounts with their own daemon. Required in `rootless` mode. |
| `container_engine_version` | `29.7.2` | `docker-ce`, `docker-ce-cli`, `docker-ce-rootless-extras`. |
| `container_engine_epoch` | `5` | Debian epoch of the engine packages. |
| `container_engine_containerd_version` | `2.3.3` | `containerd.io`. |
| `container_engine_compose_version` | `5.4.0` | `docker-compose-plugin`. |
| `container_engine_allow_upgrade` | `false` | Allow moving an installed engine to the pin. |
| `container_engine_apt_repo_url` | upstream Ubuntu repository | Package source. |
| `container_engine_apt_key_url` | upstream key | Signing key download. |
| `container_engine_apt_key_fingerprint` | upstream primary key | Asserted before the key is trusted. |
| `container_engine_log_driver` | `json-file` | Log driver of every daemon. |
| `container_engine_log_max_size` | `10m` | Rotation size. |
| `container_engine_log_max_file` | `3` | Rotated files kept. |
| `container_engine_daemon_options` | `{}` | Extra `daemon.json` keys for every daemon. |
| `container_engine_cleanup_defaults` | see `defaults/main.yml` | Prune policy baseline. |
| `container_engine_cleanup` | `{}` | Keys overriding the baseline. |

## Safety

- An installed engine at another version fails the run; moving it is an explicit pin change with
  `container_engine_allow_upgrade` for that run, because an upgrade restarts every container.
- The signing key is downloaded to a candidate file and trusted only when its primary fingerprint matches.
- Packages are installed at the exact resolved version and held.
- Rootless mode masks `docker.service`, `docker.socket` and `containerd.service` before installing, so package
  hooks never start a privileged daemon, and it refuses to stop one that is already active.
- A rootless account must exist, hold no sudo rights and own subordinate UID and GID ranges of at least 65536.
  The role never creates accounts and never adds anyone to the `docker` group, which is root-equivalent.
- A daemon configuration change restarts that daemon, which stops its containers.

## Cleanup policy

One `container-engine-cleanup-<account>.timer` per daemon (`root` for the system daemon) runs
`/usr/local/libexec/container-engine-cleanup --apply` as that account against its own socket. Run the script
without arguments (`--plan`) to preview. It holds a lock so runs never overlap and:

- prunes stopped containers, unused images and networks older than `prune_until`;
- prunes only unused anonymous volumes; named volumes are never pruned;
- prunes build cache down to `build_cache_reserved`, and the cache inside `docker-container` builders down to
  `buildkit_keep_storage_mb`;
- keeps anything labelled `keep_label` and stopped containers carrying a `protected_container_labels` label,
  so a role that runs long-lived services labels them instead of losing their configuration.

## Example

```yaml
container_engine_mode: rootless
container_engine_rootless_accounts: [developer]
container_engine_cleanup:
  on_calendar: "*-*-* 04:00:00"
```
