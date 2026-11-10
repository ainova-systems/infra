---
name: infra-host-create
description: "Brings a new host trust domain into the repository: manifest, required documents, inventory entries and decision record, modelled on an existing host. Use when adding a host that no existing manifest covers."
argument-hint: "<new-host-id> [provider]"
---

# Create a host

One host directory equals one trust domain. A workload that shares a host or an identity with an existing manifest extends that manifest instead.

## Steps

1. **Inputs before files.** Kebab-case id, provider, environment class (one of `env_classes`), purpose, data classification, and what the host must not reach. Ask rather than guess: these become the trust boundary.
2. **Model.** Read the manifest profile `host_model` names for the new host end to end. Read the provider's control answers at profile `host_provider_docs`; a provider with none yet gets one first, answering every row of this skill's `references/host-controls.md`, before any host on it is accepted.
3. **Directory.** Create the directory profile `host_manifests` implies, with the manifest and every file in `host_required_files`. The directory name equals the manifest id.
4. **Manifest.** Copy the model's shape, not its values. Set the lowest autonomy tier the environment class allows; raising it needs a risk review and a decision record. Secrets appear only as logical references.
5. **Inventory.** Add the entries in profile `host_inventory` and keep every cross-reference bidirectional.
6. **Operator values.** New connection names go into the example of profile `operator_env` with a comment and no value.
7. **Automation.** With profile `host_engine` `infra`, `infra host add` declares the host (manifest entry, its variables file, its address name in the env example) and the roles it lists are its whole setup; fill the variables from the model. Otherwise, when the host needs its own setup domain, follow the contract the model's setup command uses (profile `host_setup`): an operator entrypoint that reads allow-listed names from the operator env file, copies the target installer and runs it, without Git or a repository copy on the target.
8. **Decision.** Write the record for the new trust domain in profile `infra_decisions_dir`, numbered or named the way that directory already is, and index it where the directory indexes records.
9. **Environments.** Re-run `infra-init` so the environments rule lists the host's class.

## Verify

- Profile `infra_validate` passes, including links and manifest schema; `infra-host-check` runs against the new manifest even before the host exists, every installable line reporting `MISSING`.

## Scope / hand-off

- Provisioning the machine and running setup: `infra-host-install`.

## Constraints

- Never copy the model's values: addresses, ids, keys and accounts are per host.
- Never raise an autonomy tier or broaden network reach without a decision record and owner approval.
- Never commit secrets, addresses or provider instance ids.
