---
name: infra-init
description: "Sets up a repository to use the installed infrastructure packs: writes the infrastructure profile and generates the project environments rule from it. Use after adding or removing an infra pack, or when the profile changes."
---

# Initialize the infrastructure packs

Generates project rules from the profile; never copies scripts, stacks, workflows or other dependencies into the repository. Idempotent: existing profile values and owner edits are kept, gaps are filled. Does not commit.

## Steps

1. **Installed packs.** List the installed infra packs from `intelligence.yaml` (packages named `@ainova-systems/infra-*`, or sources under `packs/infra-*`). For each, find its schema `templates/infra-*-profile.md` under `.intelligence/packages/@ainova-systems/<pack>/templates/`, else `packs/<pack>/templates/`. A missing schema is a stop that names the pack.
2. **Target.** Resolve profile `infra_rules_dir`; `auto` is the first project-owned entry under `sources.rules` in `intelligence.yaml`. Never write into `.intelligence/` or `packs/`.
3. **Profile.** Gap-fill `infra-project-profile.md` in that directory with every key of every installed schema. Detect each value from the repository using the schema comments as hints: manifests, deployment directories, CI workflow runner labels, operator configuration, existing decision records. Ask once for what stays ambiguous; leave the rest at its default and list it. Set `infra_layers` to exactly the installed layers.
4. **Selections.** Every layer in `infra_layers` has its pack installed, and every installed infra pack is a layer in `infra_layers`. Every class in `stack_runtimes`, `secret_stores`, `slot_classes` and `runner_labels` is listed in `env_classes` or is a slot class. A mismatch is reported with the line that fixes it, not resolved by guessing.
5. **Environments rule.** Write or gap-fill `infra-environments.md` in the same directory, following infra-core's `templates/infra-environments.md`: one row per class in `env_classes`, sections only for installed layers, class defaults only after the owner confirms them. Cite paths and commands the repository already has; a value the repository does not have stays `none` with a note.
6. **Secrets.** For every class, the Secrets column names a store from `secret_stores` and the logical names the class uses. A value that looks like a credential in any file this skill read is reported by path, never echoed, and never written into the profile or rule.
7. **Sync.** When `intelligence.yaml` is present, run `intelligence sync` once after the last write, then profile `infra_validate` when set.
8. **Report.** Keys filled, keys left at default, mismatches from step 4, confirmed class defaults, and any credential-looking value found by path.

## Verify

- `infra-project-profile.md` and `infra-environments.md` exist in the resolved rules directory; `infra_layers` equals the installed infra packs; every class in the rule appears in `env_classes`; the sync and profile `infra_validate` passed when they applied.

## Scope / hand-off

- Installing or removing a pack: the Intelligence CLI (`intelligence package add`).
- Host, runner, stack, release and slot changes: `infra-host-create`, `infra-runner-change`, `infra-stack-deploy`, `infra-release-promote`, `infra-operator-slot`.
- Cross-layer consistency after the fact: `infra-audit`.

## Constraints

- Never overwrite an explicit profile value or an owner-edited line of the environments rule.
- Never write a secret value anywhere; logical names only.
- Never copy a pack's scripts, references or examples into the repository as project files.
- Never commit or push.
