# Control container

One pinned toolchain for every machine that runs the playbooks: an operator workstation without a native
Ansible, CI, or a dev host applying changes to other hosts.

| Component | Version | Source |
|---|---|---|
| Base image | `python:3.12.16-slim` by digest | `container/Dockerfile` |
| ansible-core | 2.21.6 | build argument |
| ansible-lint | 26.11.0 | build argument |
| boto3 / botocore | 1.43.125 | build argument, for `host_health` backup freshness |
| Collections | exact pins | `requirements.yml` |

## Build

From the repository root, because the build copies `requirements.yml`:

```bash
docker build -f container/Dockerfile -t infra-ansible:0.4.3 .
```

Tag the image with the collection version it was built from. A pin change is a new image.

## Run

The entrypoint is `ansible-playbook`; arguments pass through. Mount the project checkout at `/work`, the SSH
agent socket for keys, and the project's `known_hosts`. Host key checking stays on.

```bash
docker run --rm -it \
  -v "$PWD:/work" \
  -v "$SSH_AUTH_SOCK:/ssh-agent" -e SSH_AUTH_SOCK=/ssh-agent \
  -v "$HOME/.ssh/known_hosts:/home/ansible/.ssh/known_hosts:ro" \
  --env-file .env \
  infra-ansible:0.4.3 check.yml --limit <host>
```

- Private keys never enter the image or the mount: the agent socket signs.
- `.env` holds addresses only; secrets are exported for the one run that needs them or prompted.
- Collections the project installs into its own `.ansible/` take precedence over the ones baked into the image.
- Validate the collection itself with `--entrypoint scripts/validate.sh`, mounting this repository at `/work`.
