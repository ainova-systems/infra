# Control container: pinned ansible-core, ansible-lint, the AWS SDK for the backup check, and the
# collections from requirements.yml. Build from the repository root (the build needs requirements.yml):
#   docker build -f container/Dockerfile -t infra-ansible:<version> .
# Base image pinned by tag and digest, recorded 2026-11-06.
FROM python:3.12.16-slim@sha256:4840d514c583a4d3d8cad3940e68dee6f0f6f3635c12fcd0a3d74c21a5b93a54

# ansible-core 2.21 is the newest line that runs on Python 3.12.
ARG ANSIBLE_CORE_VERSION=2.21.6
ARG ANSIBLE_LINT_VERSION=26.11.0
ARG BOTO3_VERSION=1.43.125
ARG BOTOCORE_VERSION=1.43.125

# OS packages come from the Debian release the base digest fixes: SSH client and git for
# git-sourced collections; no compilers, no shells beyond the image default.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssh-client git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
        "ansible-core==${ANSIBLE_CORE_VERSION}" \
        "ansible-lint==${ANSIBLE_LINT_VERSION}" \
        "boto3==${BOTO3_VERSION}" \
        "botocore==${BOTOCORE_VERSION}"

COPY requirements.yml /opt/infra-ansible/requirements.yml
RUN ansible-galaxy collection install -r /opt/infra-ansible/requirements.yml -p /usr/share/ansible/collections

# Unprivileged runtime user; the project checkout is mounted at /work.
RUN useradd --create-home --uid 1000 --shell /usr/sbin/nologin ansible
USER ansible
WORKDIR /work
ENV ANSIBLE_HOST_KEY_CHECKING=True \
    ANSIBLE_FORCE_COLOR=1

ENTRYPOINT ["ansible-playbook"]
CMD ["--version"]
