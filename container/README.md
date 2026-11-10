# Control container

The collection's pinned toolchain as an image, for CI or a machine without Python. The infra CLI does not need it:
it builds the same toolchain in a virtualenv on the Linux side.

| Component | Version | Source |
|---|---|---|
| Base image | `python:3.12.16-slim` by digest | `container/Dockerfile` |
| ansible-core, boto3 / botocore | exact pins | `collection/requirements.txt` (the AWS SDK for `host_health` backup freshness) |
| ansible-lint | exact pin | `collection/requirements-lint.txt` |
| Collections | exact pins | `collection/requirements.yml` |

## Build

From the repository root, because the build copies the `collection/` pin files:

```bash
docker build -f container/Dockerfile -t ainova-infra:<version> .
```

Tag the image with the repository version it was built from. A pin change is a new image.

## Run

The entrypoint is `ansible-playbook`; arguments pass through. Mount the playbooks at `/work`, the SSH agent socket
for keys, and `known_hosts`. Host key checking stays on.

```bash
docker run --rm -it \
  -v "$PWD:/work" \
  -v "$SSH_AUTH_SOCK:/ssh-agent" -e SSH_AUTH_SOCK=/ssh-agent \
  -v "$HOME/.ssh/known_hosts:/home/ansible/.ssh/known_hosts:ro" \
  ainova-infra:<version> -i inventory.yml check.yml --limit <host>
```

- Private keys never enter the image or the mount: the agent socket signs.
- Secrets are exported for the one run that needs them or prompted, never baked in or mounted as files.
- Validate the collection with `--entrypoint collection/scripts/validate.sh`, mounting this repository at `/work`.
