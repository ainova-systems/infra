# Pack catalog

Intelligence packs for operating hosts, versioned with the CLI and the collection of this repository: a project
adds this repository as a registry (`intelligence registry add https://github.com/ainova-systems/infra.git`) and
the packs at the same version as its `infra.lock`.

| Pack | Artifact | Kind | Purpose |
|---|---|---|---|
| infra-core | `infra-discipline` | rule | Desired vs observed state, secret placement, environment classes, decisions |
| infra-core | `infra-init` | skill | Write the infrastructure profile and generate the environments rule |
| infra-core | `infra-audit` | skill | Read-only cross-layer audit against the profile |
| infra-core | `infra-core-profile` | template | Core profile keys |
| infra-core | `infra-environments` | template | Shape of the generated environments rule and class defaults |
| infra-host | `infra-host-create` | skill | New host trust domain; host control contract in `references/host-controls.md` |
| infra-host | `infra-host-check` | skill | Run and interpret the read-only host check |
| infra-host | `infra-host-install` | skill | Run setup, diagnose in the repository, drive the check green; the infra CLI's rules in `references/engines/infra.md` |
| infra-host | `infra-host-refresh` | skill | Rewrite the observed-state record from the live host |
| infra-host | `infra-host-upgrade` | skill | Move a pin in every place it is recorded |
| infra-host | `infra-host-profile` | template | Host profile keys, including `host_engine` |
| infra-platform | `infra-runner-change` | skill | Add, resize, relabel, stop or remove a self-hosted runner |
| infra-platform | `infra-platform-profile` | template | Platform profile keys |
| infra-stack | `infra-stack-check` | skill | Stack contract per class; runtime rules in `references/runtimes/` |
| infra-stack | `infra-stack-deploy` | skill | Deploy through the project entrypoint with check and rollback |
| infra-stack | `infra-stack-profile` | template | Stack profile keys |
| infra-release | `infra-release-promote` | skill | Promote one revision behind its gates |
| infra-release | `infra-preview` | skill | Preview lifecycle, capacity and orphan cleanup |
| infra-release | `infra-release-profile` | template | Release profile keys |
| infra-operator | `infra-operator-slot` | skill | Add or remove an agent-runtime slot within its class |
| infra-operator | `infra-operator-check` | skill | Read-only slot trust-boundary check |
| infra-operator | `infra-operator-profile` | template | Operator profile keys |
