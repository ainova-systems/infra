# compose_host

Prepares a host for Compose stacks that a pipeline deploys: an unprivileged deploy account, one directory per
stack and a private env-file location in each. The role deploys no stack, writes no Compose file and never reads
or writes an env file's content. Stack deployment belongs to the pipeline.

## Requirements

| Requirement | Source |
|---|---|
| Ubuntu 24.04, x86_64, systemd | asserted |
| Docker Engine | `container_engine`; the docker group is asserted when `compose_host_deploy_docker_access` is set |
| `become: true`, gathered facts | the calling play |

## Variables

| Variable | Default | Meaning |
|---|---|---|
| `compose_host_deploy_user` | `""` (required) | Deploy account; never `root`, never `host_base_admin_user` |
| `compose_host_deploy_home` | `/home/<user>` | Home directory |
| `compose_host_deploy_shell` | `/bin/bash` | Login shell |
| `compose_host_deploy_keys` | `[]` | Public keys allowed to log in as the account; managed exclusively, empty removes SSH login |
| `compose_host_deploy_docker_access` | `false` | docker group membership; root-equivalent on a rootful daemon |
| `compose_host_root` | `/srv/stacks` | Root-owned 0755 parent of the stack directories |
| `compose_host_stack_dirs` | `[]` | Stack names, `[a-z0-9-]` |
| `compose_host_private_dir` | `private` | Private directory inside each stack directory |
| `compose_host_env_file` | `.env` | Env-file name inside the private directory |
| `compose_host_forbidden_groups` | `[sudo, admin, wheel, root, adm, lxd]` | Groups the account must never hold |

```yaml
compose_host_deploy_user: deploy
compose_host_stack_dirs: [app, monitoring]
```

## Layout

| Path | Owner | Mode |
|---|---|---|
| `<root>` | root | 0755 |
| `<root>/<stack>` | deploy account | 0750 |
| `<root>/<stack>/<private dir>` | deploy account | 0700 |
| `<root>/<stack>/<private dir>/<env file>` | deploy account | 0600, written by the pipeline |

## Behaviour

| Step | Rule |
|---|---|
| Account | Created with a locked password; supplementary groups are exact: `docker` when granted, none otherwise |
| SSH keys | `authorized_keys` holds exactly `compose_host_deploy_keys`; an empty list removes it |
| Privilege | Apply and check assert no sudo rule, no group from `compose_host_forbidden_groups`, docker membership as declared |
| Env files | An existing env file is kept a regular 0600 file owned by the account; a link stops the run; content is never touched |
| Removal | A stack name dropped from the list leaves its directory and data in place; delete it by hand after the pipeline has removed the stack |
| Check mode | Supported; steps that need a not-yet-created account are reported skipped |

Docker group membership lets the account control a rootful daemon, which is equal to root on the host. Leave
it off when the pipeline deploys through a runner that already holds the socket.

## Check

`tasks_from: check` asserts the account (home, shell, locked password), the exact key set, no privilege beyond the
declaration, the stack root and every stack directory, private directory and env file with the modes above.
