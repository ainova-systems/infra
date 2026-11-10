# 0001 - One repository and one version for the CLI, the collection and the packs

Date: 2026-11-10
Status: accepted

## Context

Host management was split three ways: the `ainova.infra` collection (`infra-ansible`), the tool-neutral skills
(`intelligence-infra-packs`), and in every project a wrapper script, an inventory, apply and check playbooks, an
operator connect command and validation code of its own. The project copies drifted: a fix one project received (a
diagnosis of dropped SSH, a refusal of the control node) the other did not, and a firewall source taken from one
operator's env file passed every check while it locked out a second network. The owner runs more and more hosts
across many repositories and needs one way to run all of them.

## Decision

1. One repository, `ainova-systems/infra` (the renamed `infra-ansible`), holds the CLI (`cli/`), the collection
   (`collection/`) and the packs (`packs/`, imported with their history; `intelligence-infra-packs` is archived).
2. One tag `vX.Y.Z` versions all three. The release checks that `cli/package.json` and `collection/galaxy.yml` carry
   the tag's version; the packs take the tag as their version through `index.yaml`.
3. A change that crosses parts - a role's check interface and the playbook the CLI generates for it, a command and
   the skill that runs it - is one pull request and one release.

## Consequences

- No compatibility matrix between the CLI, the roles and the skills: a project locks one version.
- A wording fix in a skill is a patch release of everything, including an npm publish of an unchanged CLI.
- The collection stays a standard collection: it installs from `collection/` of a tag without the CLI.
- Forking is one repository.
