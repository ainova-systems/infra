# Control container: the collection's pinned toolchain (collection/requirements.txt and
# requirements-lint.txt) and the collections from collection/requirements.yml. Build from the repository root:
#   docker build -f container/Dockerfile -t ainova-infra:<version> .
# Base image pinned by tag and digest, recorded 2026-11-06.
FROM python:3.12.16-slim@sha256:4840d514c583a4d3d8cad3940e68dee6f0f6f3635c12fcd0a3d74c21a5b93a54

# OS packages come from the Debian release the base digest fixes: SSH client and git for
# git-sourced collections; no compilers, no shells beyond the image default.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssh-client git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ansible-core 2.21 is the newest line that runs on Python 3.12.
COPY collection/requirements.txt collection/requirements-lint.txt /opt/ainova-infra/
RUN pip install --no-cache-dir -r /opt/ainova-infra/requirements.txt -r /opt/ainova-infra/requirements-lint.txt

COPY collection/requirements.yml /opt/ainova-infra/requirements.yml
RUN ansible-galaxy collection install -r /opt/ainova-infra/requirements.yml -p /usr/share/ansible/collections

# Unprivileged runtime user; the project checkout is mounted at /work.
RUN useradd --create-home --uid 1000 --shell /usr/sbin/nologin ansible
USER ansible
WORKDIR /work
ENV ANSIBLE_HOST_KEY_CHECKING=True \
    ANSIBLE_FORCE_COLOR=1

ENTRYPOINT ["ansible-playbook"]
CMD ["--version"]
