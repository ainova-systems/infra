# 0002 - A project manifest and lock; the CLI generates what every project shares

Date: 2026-11-10
Status: accepted

## Context

Every project kept an inventory, an `ansible.cfg`, an apply playbook and a check playbook that differed only in host
names and role lists, and the check playbook restated the apply playbook's conditions by hand. A project also
pinned the collection and its toolchain in its own `requirements.yml` and `requirements.txt`.

## Decision

1. A project declares its hosts in `infra.yaml`: class, provider, status, roles (or its class's roles), extra groups,
   hooks around the roles, declared run-time secrets, the observed-state path, and the operator's connect targets.
   Host settings stay Ansible variables in the project's `group_vars/` and `host_vars/`: the manifest never holds a
   value Ansible can hold.
2. `infra.lock` records the source URL, tag and commit; only `infra update` writes it. A run fetches that commit and
   installs the toolchain and dependency collections pinned inside it.
3. Per run the CLI generates the inventory (classes and groups as groups, connection values from the operator env
   file), `ansible.cfg`, and one host's apply and check playbooks from the same role list, into a private run
   directory outside the project. The project keeps none of these files; `infra validate` refuses them.
4. The guards are generated too: one host per run, a planned host only on its first apply, `host_base` never against
   the control node, strict host keys.

## Consequences

- Apply and check cannot disagree on a host's roles.
- A guard fixed here reaches every project on its next `infra update`.
- A project needing a play shape the manifest cannot express keeps it as its own playbook (`infra run`).
- `infra_project_root` replaces `playbook_dir`-relative paths, since the generated playbooks live elsewhere.
