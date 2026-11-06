# github_actions_runner

Self-hosted GitHub Actions runners as containers: one Compose project per instance, a pinned image, per-instance
labels and CPU/memory limits, one data volume per instance. A runner registers once, from a short-lived token
given at run time; the token is never written to the host, the definition or the repository.

Forge-specific by nature: registration uses the GitHub runner's `config.sh`. Everything else (Compose, volumes,
limits, guards) is plain Docker.

## Requirements

| Requirement | Source |
|---|---|
| Ubuntu 26.04 (default) or 24.04, x86_64, systemd | asserted |
| Rootful Docker Engine, Compose plugin >= 2.18, root-owned socket | `container_engine` with `container_engine_mode: rootful`; asserted |
| `community.docker` collection | collection `requirements.yml` |
| `become: true`, gathered facts | the calling play |

Rootless daemons are out of scope: a rootless socket's group is not the group inside the daemon's namespace, and
the guard against it is asserted rather than worked around.

## Variables

| Variable | Default | Meaning |
|---|---|---|
| `github_actions_runner_scope_url` | `""` (required) | Repository (`https://<host>/<owner>/<repo>`) or organization URL |
| `github_actions_runner_group` | `""` | Organization runner group; empty is the default group |
| `github_actions_runner_image` | `""` (required) | Image pinned by digest: `<registry>/<repo>[:<tag>]@sha256:<digest>` |
| `github_actions_runner_instances` | `[]` | Instances; keys below |
| `github_actions_runner_common_labels` | `[]` | Labels added to every instance (a per-host routing label) |
| `github_actions_runner_base_dir` | `/etc/github-actions-runner` | Root-owned 0700 directory, one `<name>/compose.yml` (0600) per instance |
| `github_actions_runner_docker_socket` | `/var/run/docker.sock` | Socket mounted into runners; its group is read on the host |
| `github_actions_runner_data_path` | `/home/runner/actions-runner` | Runner directory in the image; the data volume mounts here |
| `github_actions_runner_identity_env` | `{url: GITHUB_REPOSITORY_URL, name: RUNNER_NAME, labels: RUNNER_LABELS}` | Variable names the image entrypoint reads |
| `github_actions_runner_extra_env` | `{}` | Extra non-secret container environment; secret-looking keys are refused |
| `github_actions_runner_memory_reserve_mb` | `4096` | Host memory kept free when every runner peaks |
| `github_actions_runner_registration_token_env` | `GITHUB_ACTIONS_RUNNER_REGISTRATION_TOKEN` | Controller variable carrying a registration token |
| `github_actions_runner_removal_token_env` | `GITHUB_ACTIONS_RUNNER_REMOVAL_TOKEN` | Controller variable carrying a removal token |
| `github_actions_runner_token_prompt` | `true` | Hidden prompt when a needed token variable is empty; `false` fails instead |
| `github_actions_runner_replace_registration` | `false` | Pass `--replace`: take over a live registration with the same name |
| `github_actions_runner_log_max_size` / `_log_max_file` | `10m` / `3` | Container log rotation |
| `github_actions_runner_wait_timeout` | `60` | Seconds to wait for a started container |

Instance keys (no others are accepted):

| Key | Default | Meaning |
|---|---|---|
| `name` | required | Runner and container name, `[a-z0-9-]`, unique within the scope |
| `labels` | required | Custom labels; the runner adds `self-hosted`, OS and architecture |
| `cpus` | required | CPU limit |
| `memory` | required | Memory limit in MiB (>= 1024); swap disabled |
| `state` | `present` | `present` registered and running, `stopped` registered and stopped, `absent` removed |
| `volume` | `<name>-data` | Data volume holding `.runner`, `.credentials` and the work directory |
| `adopt` | `false` | Accept an existing volume this role did not create (migration) |
| `deregister` | `true` | On `absent`, remove the forge registration first |
| `purge` | `false` | On `absent`, also delete the volume and definition |

```yaml
github_actions_runner_scope_url: https://github.com/example-org/example-repo
github_actions_runner_image: ghcr.io/example-org/runner:1.0.0@sha256:<64 hex>
github_actions_runner_common_labels: [vm-example-01]
github_actions_runner_instances:
  - {name: example-build-01, labels: [build], cpus: 4, memory: 8192}
  - {name: example-build-02, labels: [build], cpus: 4, memory: 8192}
```

## Behaviour

| Step | Rule |
|---|---|
| Inputs | Asserted first: scope URL, digest pin, names, labels, limits, states; total CPUs within the host's vCPUs, total memory plus reserve within host memory |
| Ownership | A container of the same name not created by this role, or an existing volume without a definition, stops the run; `adopt: true` takes a volume over deliberately |
| Stored registration | `.runner` and `.credentials` in the volume mean registered. A partial pair (outside removal), or a `.runner` naming another runner or scope, stops the run; `absent` with `purge: true` clears a partial pair |
| Registration | Only for a volume with no stored registration. `config.sh` runs in a throwaway container; the token goes module payload, then stdin, then `ACTIONS_RUNNER_INPUT_TOKEN` inside that container. Never an argument, a file, the container definition or the host environment. All token tasks are `no_log` |
| Restart, redeploy | Use the stored registration; no token needed |
| Busy runner | A running `Runner.Worker` blocks any change that would recreate, stop or remove the container; apply again when idle |
| `stopped` | Registered, container stopped, volume kept |
| `absent` | Stop, deregister with a removal token (unless `deregister: false`), remove the container. The volume and definition stay unless `purge: true` |
| Check mode | Supported; registration and deregistration are skipped and reported |

Labels and the runner group are applied at registration. Changing `labels` later changes the container
environment only; relabel through the forge API, or deregister and register again.

Tokens are created at the forge for the scope (repository or organization settings, or its REST API:
`.../actions/runners/registration-token` and `.../actions/runners/remove-token`). Both expire within an hour.
One registration token serves every new instance of a run.

```bash
GITHUB_ACTIONS_RUNNER_REGISTRATION_TOKEN=... ansible-playbook site.yml --limit <host> --tags github_actions_runner
```

Prefer the hidden prompt or an environment variable set only for that command; never put a token in inventory,
`host_vars`, a vault file or an `.env` file tracked by Git.

## Image contract

The image must:

- run as an unprivileged user and keep the GitHub runner (`config.sh`, `run.sh`) in `github_actions_runner_data_path`,
  so an empty named volume is populated from the image on first mount;
- provide `/bin/sh`;
- start the listener from a stored `.runner`/`.credentials` with no token present.

The role passes the scope URL, runner name and labels in `github_actions_runner_identity_env` for images that log them.

## Check

`tasks_from: check` asserts, per instance: the definition exists, is root-owned 0600 and matches the rendered
template; the volume exists and holds a registration; the container is this role's, running (or stopped for
`stopped`), on the pinned image, unprivileged, with the declared CPU and memory, no swap, the socket's group and
its own volume. For `absent`: no container, no stored registration, and with `purge` no volume or definition.

Not asserted from the host: online status at the forge, registered labels, job acceptance.
