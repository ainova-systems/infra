# 0003 - The operator env file holds connection values only

Date: 2026-11-10
Status: accepted

## Context

The operator env file is Git-ignored and differs per workstation. A project read a firewall source range from it,
so the firewall a host received depended on which operator applied it: the first apply came from a workstation on
one VPN range and dropped SSH from the second range the same VPN hands out. Every check stayed green because the
host matched the desired state, which was that operator's belief.

## Decision

1. The CLI reads only `INFRA_*` names from the env file: per host `INFRA_<HOST>_ADDRESS`, `_PORT`, `_ADMIN_USER`,
   plus `INFRA_ADMIN_USER`, `INFRA_SSH_IDENTITY_FILE` and the names `env.values` declares. Any other `INFRA_*` name,
   and any name that looks like a secret, is refused; other names are ignored.
2. A project's variables and playbooks never read the environment. Connection values reach Ansible through the
   generated inventory, declared values as `infra_env.<NAME>`. `infra validate` refuses an environment lookup in a
   variable file or project playbook.
3. Run-time secrets are declared per host and typed without echo, or taken from the environment of the run.

## Consequences

- Policy - firewall sources, accounts, keys - is reviewed desired state; two operators apply the same host the same.
- Renaming a project's env names to the `INFRA_*` form is part of moving it to the CLI.
